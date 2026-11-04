/* ============================================================
   Job cards (repair estimate), multi-level approval, stock posting
   ============================================================ */
'use strict';

var JC = { row: null, call: null, hdr: {}, lines: [], faults: [] };

/* ---------- totals ---------- */
function jcTotals(lines, other) {
  var sp = 0, lb = 0, gst = 0, wAmt = 0;
  lines.forEach(function (l) {
    var amt = round2((+l.qty || 0) * (+l.rate || 0)), g = round2(amt * (+l.gst || 0) / 100);
    l._amt = amt; l._gst = g;
    if (l.type === 'Spare') sp += amt; else lb += amt;
    gst += g; if (l.warranty) wAmt += amt + g;
  });
  other = +other || 0;
  var grand = round2(sp + lb + gst + other), w = Math.min(round2(wAmt), grand);
  return { sp: round2(sp), lb: round2(lb), gst: round2(gst), other: other, grand: grand, warranty: w, payable: Math.max(0, round2(grand - w)) };
}

/* ---------- approval helpers ---------- */
function jcApprovals(j) { return DB.where('jobcard_approval', function (a) { return a.jobcard_id === j.jobcard_id; }).sort(function (x, y) { return (x.revision_no || 0) - (y.revision_no || 0) || x.level_no - y.level_no; }); }
function jcPending(j) { return jcApprovals(j).filter(function (a) { return a.status === 'Pending'; })[0] || null; }
function canActApproval(ap, j) {
  if (!ap || !APP.user) return false;
  var u = APP.user, r = ROLE();
  if (r === 'SUPER') return true;
  /* a named approver in the rule (e.g. the HO Head) is the only one who may act at that level */
  var named = ap.approver_id || ((DB.find('approval_rule', function (x) { return x.level_no === ap.level_no && x.is_active == 1; }) || {}).approver_user_id) || null;
  if (named) return named === u.id;
  var rl = String(ap.approver_role || '').toLowerCase();
  if (r === 'MANAGER') return /manager|centre|center/.test(rl) && (!u.rec.sc_id || u.rec.sc_id === j.sc_id);
  if (r === 'HO') return /\b(ho|head|director|admin)\b/.test(rl);
  return false;
}

/* ---------- job card list ---------- */
defEntity({
  key: 'jobcard', table: 'jobcard', title: 'Job Card', plural: 'Job Cards (Estimate)', refLabel: function (r) { return r.jobcard_no; },
  rows: function () { return Q.jobcards(); },
  sub: function (rows) { return inr(rows.length) + ' job cards · estimate value ₹ ' + inr(sum(rows, function (r) { return r.grand_total; })) + ' · company-borne (warranty) ₹ ' + inr(sum(rows, function (r) { return r.warranty_amount; })); },
  kpis: function (rows) {
    var c = function (s) { return rows.filter(function (r) { return r.status === s; }).length; };
    return stripCards([{ l: 'Draft', v: c('Draft') }, { l: 'In approval', v: c('In Approval'), c: 'warn' }, { l: 'Approved', v: c('Approved'), c: 'ok' }, { l: 'Rejected', v: c('Rejected'), c: 'dang' }, { l: 'Closed', v: c('Closed') },
      { l: 'Customer payable ₹', v: inr(sum(rows, function (r) { return r.customer_payable; })) }]);
  },
  perm: function () { return { add: 1, edit: 1, del: isHO() ? 1 : 0, imp: 0 }; },
  canEdit: function (j) { return j.status === 'Draft' || j.status === 'Rejected' || (isHO() && j.status === 'In Approval'); },
  openForm: function (row) { location.hash = row ? '#/s/jobcard/' + row.jobcard_id + '/edit' : '#/s/jobcard/new'; },
  cascade: [{ table: 'jobcard_item', fk: 'jobcard_id', label: 'lines' }, { table: 'jobcard_fault', fk: 'jobcard_id', label: 'fault details' }, { table: 'jobcard_approval', fk: 'jobcard_id', label: 'approval trail' }],
  beforeDelete: function (j) {
    unpostStock(j);
    DB.where('attachment', function (a) { return a.ref_type === 'jobcard' && a.ref_id === j.jobcard_id; }).forEach(function (a) { DB.del('attachment', a.att_id, true); });
  },
  afterDelete: function (j) {
    var c = DB.get('complaint', j.complaint_id);
    if (c && (c.status === 'In Approval' || c.status === 'Approved')) DB.upd('complaint', c.complaint_id, { status: DB.where('visit_report', function (v) { return v.complaint_id === c.complaint_id; }).length ? 'Visited' : (c.engineer_id ? 'Assigned' : 'New') }, true);
  },
  filters: [{ label: 'Status', get: function (j) { return j.status; }, opts: ['Draft', 'In Approval', 'Approved', 'Rejected', 'Closed'] }, { label: 'Service center', get: function (j) { return scName(j.sc_id); } }, { label: 'Engineer', get: function (j) { return userName(j.engineer_id); } }],
  searchPh: 'Search job card, call no, customer…', search: function (j) { var c = DB.get('complaint', j.complaint_id) || {}; return [j.jobcard_no, c.complaint_no, c.customer_name, c.mobile].join(' '); },
  sortI: 1, sortD: 'desc',
  cols: [
    { h: 'Job Card', val: function (j) { return j.jobcard_no; }, cell: function (j) { return '<a href="#/s/jobcard/' + j.jobcard_id + '"><b>' + esc(j.jobcard_no) + '</b></a>' + (j.revision_no ? ' <span class="hint">rev ' + j.revision_no + '</span>' : ''); } },
    { h: 'Date', val: function (j) { return j.jobcard_date; }, cell: function (j) { return dmy(j.jobcard_date); } },
    { h: 'Call', val: function (j) { return nameOf('complaint', j.complaint_id, 'complaint_no'); }, cell: function (j) { return '<a href="#/s/call/' + j.complaint_id + '">' + esc(nameOf('complaint', j.complaint_id, 'complaint_no')) + '</a>'; } },
    { h: 'Customer', val: function (j) { return nameOf('complaint', j.complaint_id, 'customer_name'); } },
    { h: 'Engineer', val: function (j) { return userName(j.engineer_id); } }, { h: 'Service center', val: function (j) { return scName(j.sc_id); } },
    { h: 'Total ₹', val: function (j) { return j.grand_total || 0; }, cls: 'n', cell: function (j) { return inr(j.grand_total, 2); } },
    { h: 'Warranty ₹', val: function (j) { return j.warranty_amount || 0; }, cls: 'n', cell: function (j) { return inr(j.warranty_amount, 2); } },
    { h: 'Customer pays ₹', val: function (j) { return j.customer_payable || 0; }, cls: 'n', cell: function (j) { return inr(j.customer_payable, 2); } },
    { h: 'Level', val: function (j) { return j.current_level || 0; }, cls: 'c', cell: function (j) { return j.status === 'In Approval' ? 'L' + j.current_level + ' of ' + j.levels_required : '—'; } },
    { h: 'Status', val: function (j) { return j.status; }, cell: function (j) { return statusTag(j.status); } }
  ],
  rowActions: function () { return [{ a: 'view', t: 'Open / print job card', i: ICO.eye }]; },
  onAction: function (a, j) { if (a === 'view') location.hash = '#/s/jobcard/' + j.jobcard_id; },
  onRow: function (j) { location.hash = '#/s/jobcard/' + j.jobcard_id; }
});

ROUTES['s/jobcards'] = function () { var p = entityScreen('jobcard'); p.crumb = 'Home › Service › <b>Job Cards</b>'; return p; };
ROUTES['s/jobcard'] = function (a, q) {
  var id = a[0];
  if (id === 'new') return jcEditor(null, q.call ? +q.call : null);
  var j = DB.get('jobcard', id);
  if (!j || Q.jobcards().indexOf(j) < 0) return { title: 'Job card', crumb: 'Home › Service › <a href="#/s/jobcards">Job Cards</a>', body: '<div class="card"><div class="empty">Job card not found, or you do not have access.</div></div>' };
  if (a[1] === 'edit') {
    if (!(j.status === 'Draft' || j.status === 'Rejected' || (isHO() && j.status === 'In Approval'))) { toast('Only draft, rejected or in-approval job cards can be edited — an approved job card has already moved stock', 'err'); location.replace('#/s/jobcard/' + id); return { title: '', body: '' }; }
    return jcEditor(j);
  }
  return jcView(j);
};

/* ============================================================
   EDITOR
   ============================================================ */
function jcLoad(row, callId) {
  JC = { row: row, call: null, hdr: {}, lines: [], faults: [] };
  var cid = row ? row.complaint_id : callId;
  JC.call = cid ? DB.get('complaint', cid) : null;
  if (row) {
    JC.hdr = { date: row.jobcard_date, sc_id: row.sc_id, engineer_id: row.engineer_id, notes: row.notes || '', other: row.other_charges || 0 };
    DB.where('jobcard_item', function (i) { return i.jobcard_id === row.jobcard_id; }).sort(function (x, y) { return x.line_no - y.line_no; }).forEach(function (i) {
      JC.lines.push({ type: i.item_type, item_id: i.item_id, code: i.item_code, name: i.particulars, cat: i.category, sn: i.serial_no || '', qty: i.qty, rate: i.rate, gst: i.gst_pct, warranty: i.warranty == 1, remarks: i.remarks || '' });
    });
    DB.where('jobcard_fault', function (f) { return f.jobcard_id === row.jobcard_id; }).forEach(function (f) { JC.faults.push({ fault_id: f.fault_id, category: f.category, name: f.fault_name, nature: f.nature || '' }); });
  } else {
    var c = JC.call, sc = c ? (c.sc_id || (scForState(c.state_code) || {}).sc_id) : null;
    JC.hdr = { date: today(), sc_id: sc || '', engineer_id: c ? c.engineer_id : (ROLE() === 'ENGINEER' ? APP.user.id : ''), notes: '', other: 0 };
    if (ROLE() === 'ENGINEER') { JC.hdr.engineer_id = APP.user.id; if (APP.user.rec.sc_id) JC.hdr.sc_id = APP.user.rec.sc_id; }
  }
}
function jcEditor(row, callId) {
  jcLoad(row, callId);
  var isEdit = !!row, c = JC.call;
  var calls = Q.complaints().filter(function (x) { return callOpen(x) && x.status !== 'In Approval'; });
  var sers = c ? callItems(c) : [];
  return {
    title: isEdit ? 'Edit Job Card — ' + esc(row.jobcard_no) : 'New Job Card (Estimate)', crumb: 'Home › Service › <a href="#/s/jobcards">Job Cards</a> › <b>' + (isEdit ? 'Edit' : 'New') + '</b>',
    sub: 'Spares and labour needed for the repair — warranty lines are borne by the company, the rest is charged to the customer',
    actions: '<button class="btn" onclick="goBack(\'#/s/jobcards\')">' + ICO.back + ' Cancel</button><button class="btn" onclick="jcSave(false)">' + ICO.save + ' Save draft</button><button class="btn pri" onclick="jcSave(true)">' + ICO.arrow + ' Save &amp; send for approval</button>',
    body: '<div class="card"><h3>1 · Job card header</h3><div class="cbody"><div class="frm c3">' +
      '<div class="f full"><label>Service call <span class="rq">*</span></label><select id="jc_call"' + (isEdit || callId ? ' disabled' : '') + '>' + (c ? '' : '<option value="">— select a call —</option>') +
      calls.concat(c && calls.indexOf(c) < 0 ? [c] : []).map(function (x) { return '<option value="' + x.complaint_id + '"' + (c && c.complaint_id === x.complaint_id ? ' selected' : '') + '>' + esc(x.complaint_no + ' — ' + x.customer_name + ' (' + (x.village || x.district || '') + ') · ' + x.warranty_status) + '</option>'; }).join('') + '</select></div>' +
      '<div class="f"><label>Job card date</label><input id="jc_date" type="date" max="' + today() + '" value="' + esc(JC.hdr.date) + '"></div>' +
      '<div class="f"><label>Service center <span class="rq">*</span></label><select id="jc_sc"><option value="">— select —</option>' + DB.all('service_center').filter(function (s) { return s.is_active == 1 || s.sc_id == JC.hdr.sc_id; }).map(function (s) { return '<option value="' + s.sc_id + '"' + (JC.hdr.sc_id == s.sc_id ? ' selected' : '') + '>' + esc(s.sc_name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="f"><label>Engineer</label><select id="jc_eng"></select></div>' +
      '<div class="f full"><label>Notes / remarks</label><input id="jc_notes" value="' + esc(JC.hdr.notes) + '"></div></div>' +
      '<div id="jc_callinfo"></div></div></div>' +
      '<div class="card"><h3>2 · Fault details <span class="sm2">what was found</span><span style="margin-left:auto"><select id="jc_addfault" style="font-size:12px"><option value="">+ Add fault…</option>' +
      DB.all('fault_master').filter(function (f) { return f.is_active == 1; }).map(function (f) { return '<option value="' + f.fault_id + '">' + esc(catLabel(f.category) + ' — ' + f.fault_name) + '</option>'; }).join('') + '</select></span></h3><div class="cbody" id="jc_faults"></div></div>' +
      '<div class="card"><h3>3 · Spares &amp; labour' +
      '<span style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><select id="jc_addspare" style="font-size:12px;max-width:260px"><option value="">+ Add spare…</option>' +
      DB.all('spare_master').filter(function (s) { return s.is_active == 1; }).map(function (s) { return '<option value="' + s.spare_id + '">' + esc(s.spare_name + ' (' + s.spare_code + ') — ₹' + inr(s.rate)) + '</option>'; }).join('') + '</select>' +
      '<select id="jc_addlab" style="font-size:12px;max-width:240px"><option value="">+ Add labour…</option>' +
      DB.all('labour_master').filter(function (s) { return s.is_active == 1; }).map(function (s) { return '<option value="' + s.labour_id + '">' + esc(s.labour_name + ' — ₹' + inr(s.rate)) + '</option>'; }).join('') + '</select>' +
      '<button class="btn sm" onclick="jcImportLines()">' + ICO.imp + ' Import lines (Excel)</button><button class="btn sm" onclick="jcLinesTemplate()">' + ICO.xls + ' Template</button></span></h3>' +
      '<div class="cbody" style="padding:0" id="jc_lines"></div></div>' +
      '<div class="grid2" style="grid-template-columns:1fr 360px"><div class="card" style="margin:0"><h3>Photos</h3><div class="cbody"><div class="frm">' + photoPicker('jc_photos', true) + '</div>' + (isEdit ? galleryHtml('jobcard', row.jobcard_id, true) : '') + '</div></div>' +
      '<div class="card" style="margin:0"><h3>Estimate summary</h3><div class="cbody" id="jc_totals"></div></div></div>',
    after: function () {
      var sc = $('#jc_sc'), eng = $('#jc_eng');
      var fe = function () { eng.innerHTML = '<option value="">— unassigned —</option>' + engineerOpts(sc.value).map(function (e) { return '<option value="' + e.v + '"' + (JC.hdr.engineer_id == e.v ? ' selected' : '') + '>' + esc(e.l) + '</option>'; }).join(''); };
      fe(); sc.addEventListener('change', fe);
      $('#jc_call').addEventListener('change', function () { JC.call = this.value ? DB.get('complaint', this.value) : null; if (JC.call) { var s = JC.call.sc_id || (scForState(JC.call.state_code) || {}).sc_id; if (s) { sc.value = s; fe(); } if (JC.call.engineer_id) eng.value = JC.call.engineer_id; } jcCallInfo(); jcPaintLines(); });
      $('#jc_addfault').addEventListener('change', function () { var f = DB.get('fault_master', this.value); if (f) JC.faults.push({ fault_id: f.fault_id, category: f.category, name: f.fault_name, nature: f.default_nature || '' }); this.value = ''; jcPaintFaults(); });
      $('#jc_addspare').addEventListener('change', function () { jcAddItem('Spare', this.value); this.value = ''; });
      $('#jc_addlab').addEventListener('change', function () { jcAddItem('Labour', this.value); this.value = ''; });
      jcCallInfo(); jcPaintFaults(); jcPaintLines();
    }
  };
}
function jcCallInfo() {
  var c = JC.call, box = $('#jc_callinfo'); if (!box) return;
  if (!c) { box.innerHTML = ''; return; }
  var its = callItems(c);
  box.innerHTML = '<div class="hint" style="margin-top:12px">Components on this call</div><table class="dt"><thead><tr><th>Component</th><th>Serial</th><th>Model</th><th>Warranty</th><th>Valid till</th><th>Fault reported</th></tr></thead><tbody>' +
    its.map(function (i) { var lw = lineWarranty(i.serial_no || ''); return '<tr><td>' + catTag(i.category) + '</td><td class="mono">' + esc(i.serial_no || '—') + '</td><td>' + esc(i.model_name || '') + '</td><td><span class="tag ' + lw.cls + '">' + esc(lw.txt) + '</span></td><td>' + dmy(i.warranty_end) + '</td><td>' + esc(i.fault_reported || '') + '</td></tr>'; }).join('') + '</tbody></table>';
}
function jcPaintFaults() {
  var h = JC.faults.length ? '<table class="dt"><thead><tr><th style="width:110px">Component</th><th style="width:28%">Fault</th><th>Nature / diagnosis</th><th style="width:34px"></th></tr></thead><tbody>' +
    JC.faults.map(function (f, i) { return '<tr><td>' + catTag(f.category) + '</td><td>' + esc(f.name) + '</td><td><input style="width:100%" data-fi="' + i + '" value="' + esc(f.nature) + '"></td><td><button class="ract del" onclick="JC.faults.splice(' + i + ',1);jcPaintFaults()">' + ICO.trash + '</button></td></tr>'; }).join('') + '</tbody></table>' : '<div class="muted">No fault added — pick from “Add fault”.</div>';
  $('#jc_faults').innerHTML = h;
  $$('#jc_faults [data-fi]').forEach(function (e) { e.addEventListener('input', function () { JC.faults[+this.dataset.fi].nature = this.value; }); });
}
function jcDefaultSerial(cat) {
  var its = JC.call ? callItems(JC.call) : [], m = its.filter(function (i) { return i.category === cat && i.serial_no; })[0] || its.filter(function (i) { return i.serial_no; })[0];
  return m ? m.serial_no : '';
}
function jcAddItem(type, id) {
  if (!id) return;
  var l;
  if (type === 'Spare') { var s = DB.get('spare_master', id); l = { type: 'Spare', item_id: s.spare_id, code: s.spare_code, name: s.spare_name, cat: s.category, qty: 1, rate: s.rate, gst: s.gst_pct, remarks: '' }; }
  else { var b = DB.get('labour_master', id); l = { type: 'Labour', item_id: b.labour_id, code: b.labour_code, name: b.labour_name, cat: b.category, qty: 1, rate: b.rate, gst: b.gst_pct, remarks: '' }; }
  l.sn = jcDefaultSerial(l.cat); l.warranty = l.sn ? lineWarranty(l.sn).k === 'in' : (JC.call ? /^In Warranty|Partial/.test(JC.call.warranty_status || '') : false);
  JC.lines.push(l); jcPaintLines();
}
function jcPaintLines() {
  var its = JC.call ? callItems(JC.call).filter(function (i) { return i.serial_no; }) : [];
  var eng = ($('#jc_eng') || {}).value || JC.hdr.engineer_id, scv = ($('#jc_sc') || {}).value || JC.hdr.sc_id;
  var h = '';
  if (!JC.lines.length) h = '<div class="empty" style="padding:26px">No lines yet — add spares and labour using the selectors above, or import from Excel.</div>';
  else {
    h = '<div class="tscroll"><table class="dt jclines"><thead><tr><th style="width:28px">#</th><th style="width:70px">Type</th><th>Particulars</th><th style="width:210px">Component serial</th><th class="n" style="width:70px">Qty</th><th class="n" style="width:100px">Rate ₹</th><th class="n" style="width:56px">GST %</th><th class="n" style="width:110px">Amount ₹</th><th class="c" style="width:76px">Warranty</th><th style="width:34px"></th></tr></thead><tbody>';
    JC.lines.forEach(function (l, i) {
      var chip = '';
      if (l.type === 'Spare' && l.item_id) { var e = eng ? stockBal(l.item_id, 'ENG', +eng, 'GOOD') : 0, s = scv ? stockBal(l.item_id, 'SC', +scv, 'GOOD') : 0; chip = '<div class="hint" style="margin:2px 0 0">' + (e + s >= l.qty ? '<span style="color:var(--ok)">✓ stock: ' : '<span style="color:var(--dang)">✗ stock: ') + 'engineer ' + e + ' · center ' + s + '</span></div>'; }
      h += '<tr><td>' + (i + 1) + '</td><td>' + (l.type === 'Spare' ? tag('Spare', 'info') : tag('Labour', 'acc')) + '</td><td><b>' + esc(l.name) + '</b> <span class="hint">' + esc(l.code || '') + '</span>' + chip + '</td>' +
        '<td><select data-i="' + i + '" data-f="sn"><option value="">— none —</option>' + its.map(function (it) { return '<option value="' + esc(it.serial_no) + '"' + (l.sn === it.serial_no ? ' selected' : '') + '>' + esc(catLabel(it.category) + ' · ' + it.serial_no) + '</option>'; }).join('') + '</select></td>' +
        '<td class="n"><input type="number" min="0" step="any" style="width:62px;text-align:right" data-i="' + i + '" data-f="qty" value="' + esc(l.qty) + '"></td>' +
        '<td class="n"><input type="number" min="0" step="any" style="width:90px;text-align:right" data-i="' + i + '" data-f="rate" value="' + esc(l.rate) + '"></td>' +
        '<td class="n">' + esc(l.gst) + '</td><td class="n" id="jcamt' + i + '"></td>' +
        '<td class="c"><input type="checkbox" data-i="' + i + '" data-f="warranty"' + (l.warranty ? ' checked' : '') + ' title="Tick when the company bears this line (in warranty)"></td>' +
        '<td><button class="ract del" title="Remove line" onclick="JC.lines.splice(' + i + ',1);jcPaintLines()">' + ICO.trash + '</button></td></tr>';
    });
    h += '</tbody></table></div>';
  }
  $('#jc_lines').innerHTML = h;
  $$('#jc_lines [data-f]').forEach(function (e) {
    var f = e.dataset.f, i = +e.dataset.i;
    e.addEventListener(f === 'warranty' || f === 'sn' ? 'change' : 'input', function () {
      var l = JC.lines[i];
      if (f === 'warranty') l.warranty = this.checked;
      else if (f === 'sn') { l.sn = this.value; l.warranty = l.sn ? lineWarranty(l.sn).k === 'in' : false; jcPaintLines(); return; }
      else l[f] = this.value;
      jcTotalsPaint();
    });
  });
  jcTotalsPaint();
}
function jcTotalsPaint() {
  var t = jcTotals(JC.lines, ($('#jc_other') || {}).value != null ? $('#jc_other').value : JC.hdr.other);
  JC.lines.forEach(function (l, i) { var e = document.getElementById('jcamt' + i); if (e) e.textContent = inr(l._amt, 2); });
  var box = $('#jc_totals'); if (!box) return;
  var keep = $('#jc_other') ? $('#jc_other').value : JC.hdr.other;
  var lev = DB.all('approval_rule').filter(function (r) { return r.is_active == 1 && r.amount_from <= t.grand; }).sort(function (x, y) { return x.level_no - y.level_no; });
  box.innerHTML = '<dl class="dl" style="grid-template-columns:1fr auto;text-align:right"><dt style="text-align:left">Spares</dt><dd>' + inr(t.sp, 2) + '</dd><dt style="text-align:left">Labour</dt><dd>' + inr(t.lb, 2) + '</dd><dt style="text-align:left">GST</dt><dd>' + inr(t.gst, 2) + '</dd>' +
    '<dt style="text-align:left">Other charges (transport etc.)</dt><dd><input id="jc_other" type="number" min="0" step="any" style="width:100px;text-align:right" value="' + esc(keep) + '"></dd>' +
    '<dt style="text-align:left;font-size:13px;color:var(--ink)"><b>Grand total</b></dt><dd style="font-size:16px">₹ ' + inr(t.grand, 2) + '</dd>' +
    '<dt style="text-align:left;color:var(--ok)">Borne by company (warranty)</dt><dd style="color:var(--ok)">− ' + inr(t.warranty, 2) + '</dd><dt style="text-align:left"><b>Customer payable</b></dt><dd style="font-size:15px;color:' + (t.payable ? 'var(--dang)' : 'var(--ok)') + '">₹ ' + inr(t.payable, 2) + '</dd></dl>' +
    '<div class="hint" style="margin-top:10px">Approval route for ₹ ' + inr(t.grand, 0) + ': ' + (lev.length ? lev.map(function (r) { return 'L' + r.level_no + ' ' + esc(r.role_name); }).join(' → ') : 'no rule — auto approved') + '</div>';
  $('#jc_other').addEventListener('input', function () { JC.hdr.other = this.value; var t2 = jcTotals(JC.lines, this.value); JC.lines.forEach(function (l, i) { var e = document.getElementById('jcamt' + i); if (e) e.textContent = inr(l._amt, 2); }); jcTotalsPaintKeep(); });
}
function jcTotalsPaintKeep() { var p = $('#jc_other'), pos = p.selectionStart, v = p.value; jcTotalsPaint(); var n = $('#jc_other'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { } }

/* ---------- Excel import of lines ---------- */
function jcLinesTemplate() {
  XL.download('JobCard_Lines_Import_Template.xlsx', [
    { name: 'Template', rows: [['Item Type *', 'Item Code *', 'Qty *', 'Rate', 'Component Serial', 'Warranty'], ['Spare', (DB.all('spare_master')[0] || {}).spare_code || 'SP-001', 1, '', '', 'Yes'], ['Labour', (DB.all('labour_master')[0] || {}).labour_code || 'LB-001', 1, '', '', 'Yes']] },
    { name: 'Instructions', widths: [26, 70], rows: [['Column', 'Notes'], ['Item Type', 'Spare or Labour'], ['Item Code', 'Spare code / Labour code from the masters'], ['Qty', 'Number'], ['Rate', 'Optional — blank uses the master rate'], ['Component Serial', 'Optional — serial of the component on this call'], ['Warranty', 'Yes / No — blank = decided from the serial warranty']] }]);
}
function jcImportLines() {
  var i = el('input', { type: 'file', accept: '.xlsx,.csv' });
  i.addEventListener('change', function () {
    var f = this.files[0]; if (!f) return;
    var rd = new FileReader(), done = function (sheets) {
      var sh = sheets[0], rows = sh ? sh.rows : [], hi = 0;
      var norm = function (s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z]/g, ''); };
      var head = (rows[hi] || []).map(norm), ix = function (names) { for (var k = 0; k < head.length; k++) if (names.indexOf(head[k]) >= 0) return k; return -1; };
      var iT = ix(['itemtype', 'type']), iC = ix(['itemcode', 'code']), iQ = ix(['qty', 'quantity']), iR = ix(['rate']), iS = ix(['componentserial', 'serial', 'serialno']), iW = ix(['warranty']);
      if (iT < 0 || iC < 0 || iQ < 0) return toast('Columns Item Type, Item Code and Qty are required', 'err');
      var add = 0, skip = [];
      for (var r = 1; r < rows.length; r++) {
        var row = rows[r] || []; if (!row.some(function (x) { return x != null && String(x).trim() !== ''; })) continue;
        var type = /lab/i.test(String(row[iT])) ? 'Labour' : 'Spare', code = String(row[iC] == null ? '' : row[iC]).trim().toLowerCase(), qty = parseFloat(row[iQ]);
        var m = type === 'Spare' ? DB.find('spare_master', function (s) { return String(s.spare_code).toLowerCase() === code; }) : DB.find('labour_master', function (s) { return String(s.labour_code).toLowerCase() === code; });
        if (!m || !(qty > 0)) { skip.push('Row ' + (r + 1) + ': ' + (!m ? 'item code "' + row[iC] + '" not found' : 'invalid qty')); continue; }
        var l = type === 'Spare' ? { type: 'Spare', item_id: m.spare_id, code: m.spare_code, name: m.spare_name, cat: m.category, qty: qty, rate: m.rate, gst: m.gst_pct, remarks: '' } : { type: 'Labour', item_id: m.labour_id, code: m.labour_code, name: m.labour_name, cat: m.category, qty: qty, rate: m.rate, gst: m.gst_pct, remarks: '' };
        if (iR >= 0 && row[iR] !== '' && row[iR] != null && !isNaN(parseFloat(row[iR]))) l.rate = parseFloat(row[iR]);
        l.sn = (iS >= 0 && row[iS]) ? String(row[iS]).trim() : jcDefaultSerial(l.cat);
        l.warranty = (iW >= 0 && row[iW] != null && String(row[iW]).trim() !== '') ? /^(y|yes|1|true)$/i.test(String(row[iW]).trim()) : (l.sn ? lineWarranty(l.sn).k === 'in' : false);
        JC.lines.push(l); add++;
      }
      jcPaintLines();
      toast('Imported ' + add + ' line(s)' + (skip.length ? ' · skipped ' + skip.length + ': ' + skip.slice(0, 2).join('; ') : ''), skip.length ? 'err' : 'ok');
    };
    if (/\.csv$/i.test(f.name)) { rd.onload = function () { done(XL.parseCsv(rd.result)); }; rd.readAsText(f); }
    else { rd.onload = function () { XL.read(rd.result).then(done).catch(function (e) { toast('Could not read the file: ' + e.message, 'err'); }); }; rd.readAsArrayBuffer(f); }
  });
  i.click();
}

/* ---------- save ---------- */
function jcSave(submit) {
  var cid = +($('#jc_call').value || 0), row = JC.row;
  if (!cid) return toast('Select the service call', 'err');
  var sc = +$('#jc_sc').value; if (!sc) return toast('Select the service center', 'err');
  var date = $('#jc_date').value || today(); if (date > today()) return toast('Job card date cannot be in the future', 'err');
  if (!JC.lines.length) return toast('Add at least one spare or labour line', 'err');
  if (!((row ? photosOf('jobcard', row.jobcard_id).length : 0) + pendCount('jc_photos'))) return toast('Attach at least one photo — photos are mandatory for a job card', 'err');
  for (var i = 0; i < JC.lines.length; i++) {
    var l = JC.lines[i]; if (!(+l.qty > 0)) return toast('Line ' + (i + 1) + ': quantity must be more than zero', 'err');
    if (!(+l.rate >= 0) || l.rate === '') return toast('Line ' + (i + 1) + ': rate is required', 'err');
  }
  var oth = parseFloat(($('#jc_other') || {}).value); if (oth < 0) return toast('Other charges cannot be negative', 'err');
  var cl = DB.get('complaint', cid); if (cl && date < cl.call_date) return toast('Job card date cannot be before the call date (' + dmy(cl.call_date) + ')', 'err');
  var t = jcTotals(JC.lines, ($('#jc_other') || {}).value);
  var v = { jobcard_date: date, complaint_id: cid, sc_id: sc, engineer_id: +$('#jc_eng').value || null, notes: $('#jc_notes').value.trim() || null, subtotal_spares: t.sp, subtotal_labour: t.lb, gst_amount: t.gst, other_charges: t.other, grand_total: t.grand, warranty_amount: t.warranty, customer_payable: t.payable };
  var j;
  if (row) { DB.upd('jobcard', row.jobcard_id, v); j = row; DB.where('jobcard_item', function (x) { return x.jobcard_id === j.jobcard_id; }).forEach(function (x) { DB.del('jobcard_item', x.jitem_id, true); }); DB.where('jobcard_fault', function (x) { return x.jobcard_id === j.jobcard_id; }).forEach(function (x) { DB.del('jobcard_fault', x.jfault_id, true); }); }
  else { v.jobcard_no = DB.nextNo('JOBCARD', 'JC/{fy}/{n:4}'); v.revision_no = 0; v.status = 'Draft'; v.stock_posted = 0; v.created_by = myName(); j = DB.add('jobcard', v); }
  JC.lines.forEach(function (l, i) {
    DB.add('jobcard_item', { jobcard_id: j.jobcard_id, line_no: i + 1, item_type: l.type, item_id: l.item_id, item_code: l.code, particulars: l.name, category: l.cat, serial_no: l.sn || null, qty: +l.qty, rate: +l.rate, gst_pct: +l.gst, amount: l._amt, warranty: l.warranty ? 1 : 0, remarks: l.remarks || null }, true);
  });
  JC.faults.forEach(function (f) { DB.add('jobcard_fault', { jobcard_id: j.jobcard_id, fault_id: f.fault_id, category: f.category, fault_name: f.name, nature: f.nature || null }, true); });
  var fin = function () {
    if (submit || (row && row.status === 'In Approval')) jcSubmit(j);
    DB.save(); toast(submit ? 'Job card ' + j.jobcard_no + ' sent for approval' : (j.status === 'In Approval' ? 'Job card ' + j.jobcard_no + ' changed — approval restarted on the new amount' : 'Job card ' + j.jobcard_no + ' saved as draft'), 'ok');
    location.hash = '#/s/jobcard/' + j.jobcard_id;
  };
  savePhotos('jc_photos', 'jobcard', j.jobcard_id, fin);
}

/* ---------- approval workflow ---------- */
function jcSubmit(j) {
  if (j.status === 'Rejected' || j.status === 'In Approval') j.revision_no = (j.revision_no || 0) + 1;
  /* earlier decisions stay in the trail; only the open (pending) steps are replaced */
  jcApprovals(j).filter(function (a) { return a.status === 'Pending'; }).forEach(function (a) { DB.del('jobcard_approval', a.appr_id, true); });
  var rules = DB.all('approval_rule').filter(function (r) { return r.is_active == 1 && r.amount_from <= j.grand_total; }).sort(function (x, y) { return x.level_no - y.level_no; });
  var c = DB.get('complaint', j.complaint_id);
  if (!rules.length) { finalizeJobcard(j); return; }
  rules.forEach(function (r) { DB.add('jobcard_approval', { jobcard_id: j.jobcard_id, level_no: r.level_no, approver_role: r.role_name, approver_id: r.approver_user_id || null, status: 'Pending', revision_no: j.revision_no || 0 }, true); });
  j.status = 'In Approval'; j.levels_required = rules.length; j.current_level = rules[0].level_no;
  if (c && callOpen(c)) DB.upd('complaint', c.complaint_id, { status: 'In Approval' }, true);
  DB.log('Submitted', 'jobcard', j.jobcard_no, 'for approval ₹' + inr(j.grand_total));
}
function jcDecide(jid, decision) {
  var j = DB.get('jobcard', jid), ap = jcPending(j);
  if (!ap || !canActApproval(ap, j)) return toast('This job card is not waiting for your approval', 'err');
  var run = function (remarks) {
    if (decision !== 'Rejected' && jcApprovals(j).filter(function (x) { return x.status === 'Pending'; }).length === 1) {
      var short = stockShortage(j); if (short) return toast(short, 'err');   /* last level: stock must exist before it is posted */
    }
    ap.status = decision; ap.approver_id = APP.user.id; ap.remarks = remarks || null; ap.acted_on = nowIso();
    if (decision === 'Rejected') {
      j.status = 'Rejected'; var c = DB.get('complaint', j.complaint_id);
      if (c && c.status === 'In Approval') DB.upd('complaint', c.complaint_id, { status: DB.where('visit_report', function (v) { return v.complaint_id === c.complaint_id; }).length ? 'Visited' : 'Assigned' }, true);
      DB.log('Rejected', 'jobcard', j.jobcard_no, remarks);
      DB.save(); route(true); toast('Job card rejected — returned to the engineer', 'ok'); return;
    }
    var nxt = jcPending(j);
    if (nxt) { j.current_level = nxt.level_no; DB.log('Approved L' + ap.level_no, 'jobcard', j.jobcard_no, ''); DB.save(); route(true); toast('Level ' + ap.level_no + ' approved — moved to level ' + nxt.level_no + ' (' + nxt.approver_role + ')', 'ok'); }
    else {
      finalizeJobcard(j); DB.save(); route(true); toast('Job card approved — stock posted and customer informed', 'ok');
    }
  };
  if (decision === 'Rejected') promptDo('Reject ' + j.jobcard_no, 'Reason for rejection (sent back to the engineer)', '', 'Reject', run, true);
  else promptDo('Approve ' + j.jobcard_no + ' (level ' + ap.level_no + ')', 'Remarks (optional)', '', 'Approve', run, false);
}
function finalizeJobcard(j) {
  j.status = 'Approved'; j.current_level = null;
  var c = DB.get('complaint', j.complaint_id);
  if (c && callOpen(c)) DB.upd('complaint', c.complaint_id, { status: 'Approved' }, true);
  postStock(j);
  DB.log('Approved', 'jobcard', j.jobcard_no, 'final');
  if (c) notify({ channel: 'WhatsApp', to: c.mobile, tpl: 'JOBCARD_APPROVED', msg: MSG.jobcardApproved(c, j), refType: 'jobcard', refNo: j.jobcard_no });
}
/* spares needed by a job card vs. what the engineer's van + the centre store hold */
function stockNeeds(j) {
  var need = {};
  DB.where('jobcard_item', function (i) { return i.jobcard_id === j.jobcard_id && i.item_type === 'Spare' && i.item_id; }).forEach(function (i) { need[i.item_id] = (need[i.item_id] || 0) + (+i.qty || 0); });
  return need;
}
function stockShortage(j) {
  var need = stockNeeds(j), msg = [];
  Object.keys(need).forEach(function (sid) {
    var e = j.engineer_id ? Math.max(0, stockBal(sid, 'ENG', j.engineer_id, 'GOOD')) : 0, c = Math.max(0, stockBal(sid, 'SC', j.sc_id, 'GOOD'));
    if (e + c < need[sid]) { var sp = DB.get('spare_master', +sid) || {}; msg.push((sp.spare_name || 'Spare') + ' — needs ' + need[sid] + ', available ' + (e + c)); }
  });
  return msg.length ? 'Cannot approve — not enough stock: ' + msg.join('; ') + '. Receive or transfer stock first (Stock → Stock Ledger & Entry).' : '';
}
function postStock(j) {
  if (j.stock_posted == 1) return;
  DB.where('jobcard_item', function (i) { return i.jobcard_id === j.jobcard_id && i.item_type === 'Spare' && i.item_id; }).forEach(function (i) {
    /* consume from the engineer's van first, the rest from the service-centre store */
    var fromEng = j.engineer_id ? Math.min(+i.qty, Math.max(0, stockBal(i.item_id, 'ENG', j.engineer_id, 'GOOD'))) : 0, fromSc = Math.round((+i.qty - fromEng) * 1000) / 1000;
    var post = function (lt, li, q) { DB.add('stock_txn', { txn_date: today(), spare_id: i.item_id, loc_type: lt, loc_id: li, bucket: 'GOOD', txn_type: 'Consume', qty: -q, ref_type: 'jobcard', ref_no: j.jobcard_no, remarks: 'Consumed on ' + j.jobcard_no, created_by: myName(), jitem_id: i.jitem_id }, true); };
    if (fromEng > 0) post('ENG', j.engineer_id, fromEng);
    if (fromSc > 0 || !j.engineer_id) post('SC', j.sc_id, j.engineer_id ? fromSc : +i.qty);
    if (i.warranty == 1) DB.add('stock_txn', { txn_date: today(), spare_id: i.item_id, loc_type: 'SC', loc_id: j.sc_id, bucket: 'DAMAGED', txn_type: 'Return-Damaged', qty: i.qty, ref_type: 'jobcard', ref_no: j.jobcard_no, remarks: 'Faulty part held for warranty claim', created_by: myName(), jitem_id: i.jitem_id }, true);
  });
  j.stock_posted = 1;
}
function unpostStock(j) {
  DB.where('stock_txn', function (t) { return t.ref_type === 'jobcard' && t.ref_no === j.jobcard_no; }).forEach(function (t) { DB.del('stock_txn', t.txn_id, true); });
  j.stock_posted = 0;
}

/* ============================================================
   VIEW / PRINT
   ============================================================ */
function jcView(j) {
  var c = DB.get('complaint', j.complaint_id) || {}, co = CO(), items = DB.where('jobcard_item', function (i) { return i.jobcard_id === j.jobcard_id; }).sort(function (x, y) { return x.line_no - y.line_no; });
  var faults = DB.where('jobcard_fault', function (f) { return f.jobcard_id === j.jobcard_id; }), aps = jcApprovals(j), pend = jcPending(j), mine = pend && canActApproval(pend, j);
  var editable = j.status === 'Draft' || j.status === 'Rejected';
  var act = '<button class="btn" onclick="goBack(\'#/s/jobcards\')">' + ICO.back + ' Back</button>';
  if (mine) act += '<button class="btn dang-o" style="margin:0" onclick="jcDecide(' + j.jobcard_id + ',\'Rejected\')">' + ICO.x + ' Reject</button><button class="btn pri" onclick="jcDecide(' + j.jobcard_id + ',\'Approved\')">' + ICO.tick + ' Approve (L' + pend.level_no + ')</button>';
  if (editable) act += '<button class="btn" onclick="location.hash=\'#/s/jobcard/' + j.jobcard_id + '/edit\'">' + ICO.edit + ' Edit</button><button class="btn pri" onclick="jcSubmitNow(' + j.jobcard_id + ')">' + ICO.arrow + ' ' + (j.status === 'Rejected' ? 'Revise &amp; resubmit' : 'Send for approval') + '</button>';
  if (j.status === 'Approved' && isStaff()) act += '<button class="btn" onclick="jcClose(' + j.jobcard_id + ')">' + ICO.check + ' Mark work done / close</button>';
  if (isHO() && j.status === 'In Approval') act += '<button class="btn" onclick="location.hash=\'#/s/jobcard/' + j.jobcard_id + '/edit\'">' + ICO.edit + ' Edit</button>';
  if (isHO()) act += '<button class="btn dang-o" style="margin:0" onclick="deleteEntity(\'jobcard\',DB.get(\'jobcard\',' + j.jobcard_id + '))">' + ICO.trash + ' Delete</button>';
  act += '<button class="btn" onclick="window.print()">' + ICO.prn + ' Print</button>';
  var photos = galleryHtml('jobcard', j.jobcard_id, false) + DB.where('visit_report', function (v) { return v.complaint_id === j.complaint_id; }).map(function (v) { return galleryHtml('visit', v.visit_id, false); }).join('');
  return {
    title: esc(j.jobcard_no) + ' &nbsp;' + statusTag(j.status), crumb: 'Home › Service › <a href="#/s/jobcards">Job Cards</a> › <b>' + esc(j.jobcard_no) + '</b>',
    sub: 'Call ' + esc(c.complaint_no || '') + ' · ' + esc(c.customer_name || '') + (j.status === 'In Approval' ? ' · waiting at level ' + j.current_level + ' of ' + j.levels_required + (pend ? ' (' + esc(pend.approver_role) + ')' : '') : ''),
    actions: act,
    body: '<div class="paper"><div class="lh"><img src="solartive-logo-sm.png" style="height:44px;width:auto"><div class="co"><h1 style="font-size:19px">' + esc(co.company_name) + '</h1><div class="adr">' + esc(co.address) + ', ' + esc(co.city) + ' - ' + esc(co.pincode) + ', ' + esc(co.state) + (co.gstin ? '<br>GSTIN: ' + esc(co.gstin) : '') + '</div></div>' +
      '<div class="rt"><b>' + esc(j.jobcard_no) + '</b>' + (j.revision_no ? ' (rev ' + j.revision_no + ')' : '') + '<br>Date: ' + dmy(j.jobcard_date) + '<br>' + esc(j.status) + '</div></div>' +
      '<div class="dt-title"><h2>Job Card — Repair Estimate</h2></div>' +
      '<div class="pmeta"><div><div class="hd">Customer</div><b>' + esc(c.customer_name) + '</b><br>' + esc(c.mobile) + '<br>' + esc([c.address, c.village, c.district, stateName(c.state_code), c.pincode].filter(Boolean).join(', ')) + '</div>' +
      '<div><div class="hd">Service call</div>Call no: <b>' + esc(c.complaint_no) + '</b> (' + dmy(c.call_date) + ')<br>Type: ' + esc(nameOf('call_type', c.calltype_id, 'call_type')) + '<br>Service center: ' + esc(scName(j.sc_id)) + '<br>Engineer: ' + esc(userName(j.engineer_id) || '—') + '</div></div>' +
      '<table class="ptab"><thead><tr><th>Component</th><th>Serial no</th><th>Model</th><th>Warranty</th><th>Valid till</th><th>Fault reported</th></tr></thead><tbody>' +
      callItems(c).map(function (i) { var lw = lineWarranty(i.serial_no || ''); return '<tr><td>' + esc(catLabel(i.category)) + '</td><td class="mono">' + esc(i.serial_no || '—') + '</td><td>' + esc(i.model_name || '') + '</td><td>' + esc(lw.txt) + '</td><td>' + dmy(i.warranty_end) + '</td><td>' + esc(i.fault_reported || '') + '</td></tr>'; }).join('') + '</tbody></table>' +
      (faults.length ? '<div class="ptc" style="margin-top:14px"><h4>Fault details</h4><ol>' + faults.map(function (f) { return '<li><b>' + esc(catLabel(f.category) + ' — ' + f.fault_name) + '</b>' + (f.nature ? ': ' + esc(f.nature) : '') + '</li>'; }).join('') + '</ol></div>' : '') +
      '<table class="ptab" style="margin-top:14px"><thead><tr><th>#</th><th>Particulars</th><th>Component serial</th><th class="n">Qty</th><th class="n">Rate</th><th class="n">GST %</th><th class="n">Amount</th><th class="c">Warranty</th></tr></thead><tbody>' +
      items.map(function (i) { return '<tr><td>' + i.line_no + '</td><td>' + esc(i.particulars) + ' <span style="color:#7A8896">(' + esc(i.item_type) + ' ' + esc(i.item_code || '') + ')</span></td><td class="mono">' + esc(i.serial_no || '') + '</td><td class="n">' + esc(i.qty) + '</td><td class="n">' + inr(i.rate, 2) + '</td><td class="n">' + esc(i.gst_pct) + '</td><td class="n">' + inr(i.amount, 2) + '</td><td class="c">' + (i.warranty == 1 ? 'Yes' : 'No') + '</td></tr>'; }).join('') +
      '</tbody><tfoot><tr><td colspan="6" class="n">Spares ' + inr(j.subtotal_spares, 2) + ' · Labour ' + inr(j.subtotal_labour, 2) + ' · GST ' + inr(j.gst_amount, 2) + (j.other_charges ? ' · Other ' + inr(j.other_charges, 2) : '') + '</td><td class="n"><b>' + inr(j.grand_total, 2) + '</b></td><td></td></tr>' +
      '<tr><td colspan="6" class="n">Borne by company under warranty</td><td class="n">− ' + inr(j.warranty_amount, 2) + '</td><td></td></tr><tr><td colspan="6" class="n"><b>Payable by customer</b></td><td class="n"><b>₹ ' + inr(j.customer_payable, 2) + '</b></td><td></td></tr></tfoot></table>' +
      (j.notes ? '<div class="ptc"><h4>Notes</h4>' + esc(j.notes) + '</div>' : '') +
      '<div class="ptc"><h4>Approval trail</h4>' + (aps.length ? '<table class="ptab"><thead><tr><th>Level</th><th>Approver role</th><th>Status</th><th>By</th><th>On</th><th>Remarks</th></tr></thead><tbody>' +
        aps.map(function (a) { return '<tr><td>L' + a.level_no + (a.revision_no ? ' <span class="hint">rev ' + a.revision_no + '</span>' : '') + '</td><td>' + esc(a.approver_role) + '</td><td>' + esc(a.status) + '</td><td>' + esc(a.status === 'Pending' ? '—' : userName(a.approver_id)) + '</td><td>' + (a.acted_on ? dmyT(a.acted_on) : '') + '</td><td>' + esc(a.remarks || '') + '</td></tr>'; }).join('') + '</tbody></table>' : 'Not yet submitted') + '</div>' +
      (photos ? '<div class="ptc"><h4>Photos</h4>' + photos + '</div>' : '') +
      '<div class="sign"><div><b>Engineer</b>' + esc(userName(j.engineer_id)) + '</div><div><b>Customer</b>' + esc(c.customer_name) + '</div></div>' +
      '<div class="pfoot"><span>' + esc(co.company_name) + (co.toll_free ? ' · ' + esc(co.toll_free) : '') + '</span><span>Computer generated job card</span></div></div>'
  };
}
function jcSubmitNow(id) {
  var j = DB.get('jobcard', id);
  if (!j.grand_total && !DB.where('jobcard_item', function (i) { return i.jobcard_id === id; }).length) return toast('Add lines before sending for approval', 'err');
  jcSubmit(j); DB.save(); route(true); toast('Sent for approval', 'ok');
}
function jcClose(id) {
  confirmDo('Mark work done?', 'The repair is complete and the job card will be closed. You can then resolve the service call.', 'Close job card', function () { DB.upd('jobcard', id, { status: 'Closed', closed_on: today() }); DB.save(); route(true); toast('Job card closed', 'ok'); });
}

/* ============================================================
   APPROVAL INBOX
   ============================================================ */
ROUTES['s/approvals'] = function (a, q) {
  var all = Q.jobcards().filter(function (j) { return j.status === 'In Approval'; });
  var mine = all.filter(function (j) { return canActApproval(jcPending(j), j); }), view = q.all ? all : mine;
  var done = Q.jobcards().filter(function (j) { return j.status === 'Approved' || j.status === 'Closed'; }), rej = Q.jobcards().filter(function (j) { return j.status === 'Rejected'; });
  return {
    title: 'Job Card Approvals', crumb: 'Home › Service › <b>Approvals</b>', sub: 'Multi-level approval by job card value — level rules are set in Masters › Approval Rules',
    actions: '<div class="seg"><a class="' + (q.all ? '' : 'on') + '" href="#/s/approvals">Waiting for me (' + mine.length + ')</a><a class="' + (q.all ? 'on' : '') + '" href="#/s/approvals?all=1">All pending (' + all.length + ')</a></div>',
    body: stripCards([{ l: 'Waiting for me', v: mine.length, c: 'warn' }, { l: 'All pending', v: all.length }, { l: 'Value pending ₹', v: inr(sum(all, function (j) { return j.grand_total; })) }, { l: 'Approved', v: done.length, c: 'ok' }, { l: 'Rejected', v: rej.length, c: 'dang' }]) +
      '<div id="apGrid"></div>',
    after: function () {
      mountGrid('#apGrid', {
        title: 'Job_card_approvals', rows: view, sortI: 1, sortD: 'asc', emptyText: q.all ? 'Nothing is pending approval' : 'Nothing is waiting for your approval right now',
        cols: [
          { h: 'Job Card', val: function (j) { return j.jobcard_no; }, cell: function (j) { return '<a href="#/s/jobcard/' + j.jobcard_id + '"><b>' + esc(j.jobcard_no) + '</b></a>'; } },
          { h: 'Date', val: function (j) { return j.jobcard_date; }, cell: function (j) { return dmy(j.jobcard_date); } },
          { h: 'Call', val: function (j) { return nameOf('complaint', j.complaint_id, 'complaint_no'); } }, { h: 'Customer', val: function (j) { return nameOf('complaint', j.complaint_id, 'customer_name'); } },
          { h: 'Engineer', val: function (j) { return userName(j.engineer_id); } }, { h: 'Service center', val: function (j) { return scName(j.sc_id); } },
          { h: 'Total ₹', val: function (j) { return j.grand_total || 0; }, cls: 'n', cell: function (j) { return inr(j.grand_total, 2); } },
          { h: 'Warranty ₹', val: function (j) { return j.warranty_amount || 0; }, cls: 'n', cell: function (j) { return inr(j.warranty_amount, 2); } },
          { h: 'At level', val: function (j) { return j.current_level; }, cell: function (j) { var p = jcPending(j); return 'L' + j.current_level + ' of ' + j.levels_required + (p ? '<div class="hint" style="margin:0">' + esc(p.approver_role) + '</div>' : ''); } }
        ],
        actions: function (j, i) { var p = jcPending(j), ok = canActApproval(p, j); return '<button class="ract" data-ra="view" data-ri="' + i + '" title="Open">' + ICO.eye + '</button>' + (ok ? '<button class="ract" data-ra="ok" data-ri="' + i + '" title="Approve" style="color:var(--ok)">' + ICO.tick + '</button><button class="ract del" data-ra="no" data-ri="' + i + '" title="Reject">' + ICO.x + '</button>' : ''); },
        onAction: function (act, j) { if (act === 'view') location.hash = '#/s/jobcard/' + j.jobcard_id; else if (act === 'ok') jcDecide(j.jobcard_id, 'Approved'); else if (act === 'no') jcDecide(j.jobcard_id, 'Rejected'); }
      });
    }
  };
};
