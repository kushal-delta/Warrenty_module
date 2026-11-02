/* ============================================================
   Service module - calls, visits, reminders, job cards, approvals
   ============================================================ */
'use strict';

var CALL_STATUS = ['New', 'Assigned', 'Visited', 'In Approval', 'Approved', 'Resolved', 'Closed', 'Cancelled'];
var CALL_OPEN = ['New', 'Assigned', 'Visited', 'In Approval', 'Approved'];
var PRIORITY = ['Low', 'Medium', 'High', 'Urgent'];
var CALL_SOURCE = ['Customer', 'Dealer', 'Toll Free', 'WhatsApp', 'Marketing', 'HO'];
var VISIT_OUTCOME = ['Resolved at site', 'Spares required', 'Job card required', 'Replacement required', 'Customer not available'];

/* ---------- small helpers ---------- */
function callOpen(c) { return CALL_OPEN.indexOf(c.status) >= 0; }
function callOverdue(c) { return callOpen(c) && c.due_date && c.due_date < today(); }
function callItems(c) { return DB.where('complaint_item', function (x) { return x.complaint_id === c.complaint_id; }); }
function engineerOpts(scId) {
  return DB.all('app_user').filter(function (u) { return u.role === 'ENGINEER' && u.is_active == 1 && (!scId || u.sc_id == scId); })
    .map(function (u) { return { v: u.user_id, l: (u.first_name + ' ' + (u.last_name || '')).trim() }; });
}
function scForState(code) { return DB.find('service_center', function (s) { return s.is_active == 1 && s.state_code === code; }) || DB.find('service_center', function (s) { return s.is_active == 1; }); }
function lineWarranty(sn) {
  var w = wBySerial(sn);
  if (!w) return stickerBySerial(sn) ? { k: 'unreg', txt: 'Not registered', cls: 'mut' } : (sn ? { k: 'unk', txt: 'Unknown serial', cls: 'dang' } : { k: 'none', txt: 'No serial', cls: 'mut' });
  var s = wStatus(w);
  if (s.k === 'active' || s.k === 'expiring') return { k: 'in', txt: 'In warranty', cls: 'ok', end: w.end_date, w: w, days: s.days };
  return { k: 'out', txt: s.k === 'replaced' ? 'Replaced' : 'Out of warranty', cls: 'dang', end: w.end_date, w: w };
}
function overallWarranty(lines) {
  var st = lines.map(function (l) { return lineWarranty(l.sn).k; });
  if (!st.length) return 'Not Registered';
  var inn = st.filter(function (k) { return k === 'in'; }).length;
  if (inn === st.length) return 'In Warranty';
  if (inn > 0) return 'Partial';
  return st.some(function (k) { return k === 'out'; }) ? 'Out of Warranty' : 'Not Registered';
}
function wTag(s) { return '<span class="tag ' + ({ 'In Warranty': 'ok', 'Partial': 'warn', 'Out of Warranty': 'dang', 'Not Registered': 'mut' }[s] || 'mut') + '">' + esc(s || '—') + '</span>'; }
function callCompLabel(c) {
  return callItems(c).map(function (i) { return catLabel(i.category) + (i.serial_no ? ' ' + i.serial_no : ''); }).join(', ');
}

/* ---------- photos ---------- */
function photoPicker(id) { return '<div class="f full"><label>Photos (optional)</label><input type="file" id="' + id + '" accept="image/*" multiple><div class="hint">Photos from the site — compressed before saving</div></div>'; }
function compressImage(file, maxPx, cb) {
  var rd = new FileReader();
  rd.onload = function () {
    var img = new Image();
    img.onload = function () {
      var r = Math.min(1, maxPx / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = Math.round(img.width * r); cv.height = Math.round(img.height * r);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      cb(cv.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = function () { cb(null); };
    img.src = rd.result;
  };
  rd.onerror = function () { cb(null); };
  rd.readAsDataURL(file);
}
function savePhotos(inputId, refType, refId, done) {
  var inp = document.getElementById(inputId), files = inp && inp.files ? Array.prototype.slice.call(inp.files) : [];
  if (!files.length) { if (done) done(0); return; }
  var left = files.length, n = 0;
  files.forEach(function (f) {
    compressImage(f, 900, function (data) {
      if (data) { DB.add('attachment', { ref_type: refType, ref_id: refId, file_name: f.name, mime: 'image/jpeg', size_kb: Math.round(data.length * 0.75 / 1024), data_url: data, caption: '', uploaded_by: myName(), uploaded_on: nowIso() }, true); n++; }
      if (--left === 0) { DB.save(); if (done) done(n); }
    });
  });
}
function photosOf(refType, refId) { return DB.where('attachment', function (a) { return a.ref_type === refType && a.ref_id === refId; }); }
function galleryHtml(refType, refId, canDel) {
  var ph = photosOf(refType, refId);
  if (!ph.length) return '';
  return '<div class="gallery">' + ph.map(function (a) {
    return '<div class="ph"><img src="' + a.data_url + '" onclick="viewPhoto(' + a.att_id + ')" title="' + esc(a.file_name) + '">' + (canDel ? '<span class="px" title="Delete photo" onclick="delPhoto(' + a.att_id + ')">&times;</span>' : '') + '</div>';
  }).join('') + '</div>';
}
function viewPhoto(id) { var a = DB.get('attachment', id); if (a) modal(esc(a.file_name), '<img src="' + a.data_url + '" style="max-width:100%;display:block;margin:0 auto">', null, ''); }
function delPhoto(id) { confirmDo('Delete photo?', 'The photo will be removed.', 'Delete', function () { DB.del('attachment', id, true); DB.save(); route(true); }, true); }

/* ============================================================
   SERVICE CALLS  (complaint + faulty components)
   ============================================================ */
var CF = { row: null, lines: [], cust: null, instId: null };

defEntity({
  key: 'complaint', table: 'complaint', title: 'Service Call', plural: 'Service Calls', refLabel: function (r) { return r.complaint_no; },
  rows: function () { return Q.complaints(); },
  sub: function (rows) { var o = rows.filter(callOverdue).length; return inr(rows.length) + ' calls · ' + inr(rows.filter(callOpen).length) + ' open' + (o ? ' · <b style="color:var(--dang)">' + o + ' overdue</b>' : ''); },
  kpis: function (rows) {
    var c = function (s) { return rows.filter(function (r) { return r.status === s; }).length; }, mon = ymKey(today());
    return stripCards([{ l: 'New / unassigned', v: c('New'), c: 'info' }, { l: 'Assigned', v: c('Assigned') }, { l: 'Visited / in approval', v: c('Visited') + c('In Approval') + c('Approved'), c: 'warn' },
      { l: 'Overdue (past valid days)', v: rows.filter(callOverdue).length, c: 'dang' }, { l: 'Resolved / closed', v: c('Resolved') + c('Closed'), c: 'ok' },
      { l: 'This month', v: rows.filter(function (r) { return ymKey(r.call_date) === mon; }).length }]);
  },
  perm: function () {
    var r = ROLE(), st = r === 'SUPER' || r === 'HO' || r === 'MANAGER';
    return { add: (r === 'ENGINEER') ? 0 : 1, edit: (r === 'ENGINEER') ? 0 : 1, del: (r === 'ENGINEER') ? 0 : 1, imp: (r === 'SUPER' || r === 'HO') };
  },
  canEdit: function (c) { return isStaff() || c.status === 'New'; },
  canDel: function (c) { return isHO() || (c.status === 'New' && (ROLE() === 'DEALER' || ROLE() === 'CUSTOMER' || ROLE() === 'MANAGER')); },
  cascade: [{ table: 'complaint_item', fk: 'complaint_id', label: 'component lines' }, { table: 'complaint_reminder', fk: 'complaint_id', label: 'reminders' }],
  beforeDelete: function (c) { DB.where('attachment', function (a) { return a.ref_type === 'complaint' && a.ref_id === c.complaint_id; }).forEach(function (a) { DB.del('attachment', a.att_id, true); }); },
  openForm: function (row) { complaintForm(row); },
  rowClass: function (c) { return callOverdue(c) ? 'overdue' : ''; },
  filters: [
    { label: 'Status', get: function (c) { return c.status; }, opts: CALL_STATUS },
    { label: 'Call type', get: function (c) { return nameOf('call_type', c.calltype_id, 'call_type'); } },
    { label: 'Warranty', get: function (c) { return c.warranty_status || ''; }, opts: ['In Warranty', 'Partial', 'Out of Warranty', 'Not Registered'] },
    { label: 'Due', get: function (c) { return callOverdue(c) ? 'Overdue' : 'On time'; }, opts: ['Overdue', 'On time'] },
    { label: 'State', get: function (c) { return stateName(c.state_code); } },
    { label: 'Service center', get: function (c) { return scName(c.sc_id) || 'Unassigned'; } },
    { label: 'Engineer', get: function (c) { return userName(c.engineer_id) || 'Unassigned'; } },
    { label: 'Priority', get: function (c) { return c.priority; }, opts: PRIORITY }
  ],
  searchPh: 'Search call no, customer, mobile, serial, village…',
  search: function (c) { return [c.complaint_no, c.customer_name, c.mobile, c.village, c.district, callCompLabel(c), c.complaint_text].join(' '); },
  sortI: 1, sortD: 'desc',
  cols: [
    { h: 'Call No', val: function (c) { return c.complaint_no; }, cell: function (c) { return '<a href="#/s/call/' + c.complaint_id + '"><b>' + esc(c.complaint_no) + '</b></a>'; } },
    { h: 'Date', val: function (c) { return c.call_date; }, cell: function (c) { return dmy(c.call_date); } },
    { h: 'Type', val: function (c) { return nameOf('call_type', c.calltype_id, 'call_type'); } },
    { h: 'Customer', val: function (c) { return c.customer_name; }, cell: function (c) { return '<b>' + esc(c.customer_name) + '</b><div class="hint" style="margin:0">' + esc(c.mobile) + '</div>'; } },
    { h: 'Place', val: function (c) { return (c.village || c.district || '') + ', ' + stateShort(c.state_code); } },
    { h: 'Faulty components', val: function (c) { return callCompLabel(c); }, cell: function (c) { return '<span style="font-size:11.5px">' + esc(shortName(callCompLabel(c), 54)) + '</span>'; } },
    { h: 'Warranty', val: function (c) { return c.warranty_status || ''; }, cell: function (c) { return wTag(c.warranty_status); } },
    { h: 'Assigned to', val: function (c) { return userName(c.engineer_id) || scName(c.sc_id) || ''; }, cell: function (c) { return c.engineer_id ? esc(userName(c.engineer_id)) + '<div class="hint" style="margin:0">' + esc(scName(c.sc_id)) + '</div>' : (c.sc_id ? '<span class="muted">' + esc(scName(c.sc_id)) + '</span>' : '<span class="tag warn">Unassigned</span>'); } },
    { h: 'Due', val: function (c) { return c.due_date || ''; }, cell: function (c) { return callOverdue(c) ? '<b style="color:var(--dang)">' + dmy(c.due_date) + '</b>' : dmy(c.due_date); } },
    { h: 'Priority', val: function (c) { return PRIORITY.indexOf(c.priority); }, cls: 'c', cell: function (c) { return '<span class="tag ' + ({ Low: 'mut', Medium: 'info', High: 'warn', Urgent: 'dang' }[c.priority] || 'mut') + '">' + esc(c.priority) + '</span>'; } },
    { h: 'Status', val: function (c) { return c.status; }, cell: function (c) { return statusTag(c.status); } }
  ],
  rowActions: function (c) {
    var a = [{ a: 'view', t: 'Open call', i: ICO.eye }];
    if (isStaff() && callOpen(c)) a.push({ a: 'assign', t: 'Assign service center / engineer', i: ICO.user });
    return a;
  },
  onAction: function (a, c) { if (a === 'view') location.hash = '#/s/call/' + c.complaint_id; else if (a === 'assign') assignCall(c); },
  onRow: function (c) { location.hash = '#/s/call/' + c.complaint_id; },
  imp: {
    key: 'complaint_no',
    cols: [
      { h: 'Call Date', k: 'call_date', type: 'date', req: 1, sample: '2026-10-29' },
      { h: 'Call Type', k: 'calltype_id', req: 1, lk: { t: 'call_type', f: ['call_type'] }, sample: 'Warranty Complaint' },
      { h: 'Customer Name', k: 'customer_name', req: 1, sample: 'Ramesh Patel' },
      { h: 'Mobile', k: 'mobile', req: 1, pattern: /^[6-9]\d{9}$/, patMsg: 'must be a 10-digit mobile', sample: '9000099001' },
      { h: 'Address', k: 'address', sample: 'Near Primary School' },
      { h: 'Village', k: 'village', sample: 'Rampur' }, { h: 'District', k: 'district', sample: 'Jaipur' },
      { h: 'State', k: 'state_code', req: 1, lk: { t: 'state_master', f: ['state_name', 'short_name', 'state_code'] }, sample: 'Rajasthan' },
      { h: 'Serial No', k: 'serial_no', alias: ['Serial'], sample: '2610PU20001', note: 'Faulty component serial (optional). Warranty is fetched automatically.' },
      { h: 'Complaint', k: 'complaint_text', req: 1, alias: ['Complaint Text', 'Fault'], sample: 'Pump not delivering water' },
      { h: 'Priority', k: 'priority', enumv: PRIORITY, sample: 'Medium' },
      { h: 'Source', k: 'source', enumv: CALL_SOURCE, sample: 'Toll Free' }
    ],
    check: function (o) { if (o.call_date > today()) return 'Call Date cannot be in the future'; return null; },
    make: function (o) {
      var ct = DB.get('call_type', o.calltype_id), w = o.serial_no ? wBySerial(o.serial_no) : null, cust = DB.find('customer', function (c) { return c.mobile === o.mobile; });
      var sn = o.serial_no, st = sn ? stickerBySerial(sn) : null, lines = sn ? [{ cat: st ? st.category : (w ? w.category : 'PUMP'), sn: sn }] : [];
      var sc = scForState(o.state_code);
      var c = { complaint_no: DB.nextNo('COMPLAINT', 'SC/{fy}/{n:4}'), call_date: o.call_date, calltype_id: o.calltype_id, priority: o.priority || 'Medium', source: o.source || 'Toll Free', status: 'New',
        install_id: w ? w.install_id : null, customer_id: cust ? cust.customer_id : (w ? w.customer_id : null), customer_name: o.customer_name, mobile: o.mobile, address: o.address, village: o.village, district: o.district, state_code: o.state_code,
        dealer_id: w ? w.dealer_id : null, warranty_status: overallWarranty(lines), complaint_text: o.complaint_text, sc_id: sc ? sc.sc_id : null, due_date: addDays(o.call_date, ct ? ct.valid_days : 3), created_by: myName(), created_on: nowIso() };
      c._lines = lines; return c;
    },
    after: function (made) {
      made.forEach(function (c) {
        (c._lines || []).forEach(function (l) { var w = wBySerial(l.sn); DB.add('complaint_item', { complaint_id: c.complaint_id, category: l.cat, serial_no: l.sn, model_id: w ? w.model_id : null, model_name: w ? modelName(w.model_id) : '', warranty_status: lineWarranty(l.sn).txt, warranty_end: w ? w.end_date : null, fault_reported: c.complaint_text }, true); });
        delete c._lines;
      });
    }
  }
});

ROUTES['s/calls'] = function (a, q) {
  if (a[0]) return ROUTES['s/call'](a, q);
  var p = entityScreen('complaint'), af = p.after;
  p.crumb = 'Home › Service › <b>Service Calls</b>';
  var r = ROLE(); if (r === 'ENGINEER') p.sub = 'Calls assigned to you · ' + p.sub;
  p.after = function () {
    af();
    if (q.new || q.sn) { var pre = { install: q.new ? +q.new : null, sn: q.sn }; history.replaceState(null, '', '#/s/calls'); setTimeout(function () { complaintForm(null, pre); }, 40); }
  };
  return p;
};

/* ---- complaint entry form ---- */
function complaintForm(row, pre) {
  pre = pre || {};
  var u = APP.user, isNew = !row, cust = null, inst = null;
  CF = { row: row || null, lines: [], instId: null };
  if (row) {
    cust = DB.get('customer', row.customer_id); CF.instId = row.install_id;
    callItems(row).forEach(function (ci) { CF.lines.push({ cat: ci.category, sn: ci.serial_no || '', fault: ci.fault_reported || '' }); });
  } else {
    if (u.kind === 'CUSTOMER') cust = u.rec;
    if (pre.install) { inst = DB.get('installation', pre.install); if (inst) { CF.instId = inst.install_id; cust = cust || DB.get('customer', inst.customer_id); if (!pre.sn) wByInstall(inst.install_id).filter(function (w) { return w.status !== 'Replaced'; }).forEach(function (w) { CF.lines.push({ cat: w.category, sn: w.serial_no, fault: '' }); }); } }
    if (pre.sn) { var w = wBySerial(pre.sn); if (w) { CF.lines.push({ cat: w.category, sn: w.serial_no, fault: '' }); if (!CF.instId) { CF.instId = w.install_id; cust = cust || DB.get('customer', w.customer_id); } } }
    if (!CF.lines.length) CF.lines.push({ cat: 'PUMP', sn: '', fault: '' });
  }
  var d = row || {};
  var cd = cust || {};
  var src = d.source || (u.kind === 'DEALER' ? 'Dealer' : u.kind === 'CUSTOMER' ? 'Customer' : 'Toll Free');
  var ctypes = DB.all('call_type').filter(function (c) { return c.is_active == 1 || c.calltype_id === d.calltype_id; });
  var staff = isStaff();
  var scSel = d.sc_id || (cd.state_code && scForState(cd.state_code) ? scForState(cd.state_code).sc_id : '');
  var dealerOpt = DB.all('dealer').filter(function (x) { return x.status === 'Approved'; });
  var lockCust = u.kind === 'CUSTOMER';
  var body = '<div class="sec-h">1 · Call details</div><div class="frm c3">' +
    '<div class="f"><label>Call date <span class="rq">*</span></label><input id="cf_date" type="date" max="' + today() + '" value="' + esc(d.call_date || today()) + '"></div>' +
    '<div class="f"><label>Call type <span class="rq">*</span></label><select id="cf_type">' + ctypes.map(function (c) { return '<option value="' + c.calltype_id + '"' + (d.calltype_id == c.calltype_id ? ' selected' : '') + '>' + esc(c.call_type) + ' (' + c.valid_days + ' days)</option>'; }).join('') + '</select><div class="hint" id="cf_due"></div></div>' +
    '<div class="f"><label>Priority</label><select id="cf_prio">' + PRIORITY.map(function (p) { return '<option' + ((d.priority || 'Medium') === p ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></div>' +
    '<div class="f"><label>Call source</label><select id="cf_src"' + (staff ? '' : ' disabled') + '>' + CALL_SOURCE.map(function (p) { return '<option' + (src === p ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></div>' +
    '<div class="f"><label>Project / scheme</label><select id="cf_proj"><option value="">—</option>' + DB.all('project').map(function (p) { return '<option value="' + p.project_id + '"' + (d.project_id == p.project_id ? ' selected' : '') + '>' + esc(p.project_name) + '</option>'; }).join('') + '</select></div>' +
    (u.kind === 'DEALER' ? '<div class="f"><label>Dealer</label><input readonly value="' + esc(u.name) + '"></div>' : '<div class="f"><label>Dealer</label><select id="cf_dealer"><option value="">— direct —</option>' + dealerOpt.map(function (x) { return '<option value="' + x.dealer_id + '"' + (d.dealer_id == x.dealer_id ? ' selected' : '') + '>' + esc(x.firm_name) + '</option>'; }).join('') + '</select></div>') +
    '</div><div class="sec-h">2 · Customer &amp; site</div><div class="frm c3">' +
    '<div class="f"><label>Mobile <span class="rq">*</span></label><input id="cf_mobile" type="tel" maxlength="10" value="' + esc(d.mobile || cd.mobile || '') + '"' + (lockCust ? ' readonly' : '') + ' autocomplete="off"><div class="hint" id="cf_mhint">Type the mobile — an existing customer loads automatically</div></div>' +
    '<div class="f"><label>Customer name <span class="rq">*</span></label><input id="cf_name" value="' + esc(d.customer_name || cd.customer_name || '') + '"></div>' +
    '<div class="f"><label>Village / area</label><input id="cf_village" value="' + esc(d.village || cd.village || '') + '"></div>' +
    '<div class="f full"><label>Address</label><input id="cf_addr" value="' + esc(d.address || cd.address || '') + '"></div>' +
    '<div class="f"><label>State <span class="rq">*</span></label><select id="cf_state"><option value="">— select —</option>' + stateOpts().map(function (s) { return '<option value="' + s.v + '"' + ((d.state_code || cd.state_code || '09') === s.v ? ' selected' : '') + '>' + esc(s.l) + '</option>'; }).join('') + '</select></div>' +
    '<div class="f"><label>District</label><input id="cf_district" list="dl_cf_dist" value="' + esc(d.district || cd.district || '') + '"><datalist id="dl_cf_dist"></datalist></div>' +
    '<div class="f"><label>Pincode</label><input id="cf_pin" maxlength="6" value="' + esc(d.pincode || cd.pincode || '') + '"></div></div>' +
    '<div id="cf_insts"></div>' +
    '<div class="sec-h">3 · Faulty components <span class="sm2">pump, motor and controller each have their own serial and warranty</span></div><div id="cf_lines"></div>' +
    '<div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" onclick="cfAddLine()">' + ICO.plus + ' Add component</button></div>' +
    '<div class="sec-h">4 · Complaint</div><div class="frm"><div class="f full"><label>Complaint / problem reported <span class="rq">*</span></label><textarea id="cf_text" rows="2">' + esc(d.complaint_text || '') + '</textarea></div>' +
    (isNew ? photoPicker('cf_photos') : '') + '</div>' +
    (staff ? '<div class="sec-h">5 · Assignment <span class="sm2">optional — can also be done later from the call</span></div><div class="frm c3">' +
      '<div class="f"><label>Service center</label><select id="cf_sc"><option value="">— unassigned —</option>' + DB.all('service_center').filter(function (s) { return s.is_active == 1 || s.sc_id === d.sc_id; }).map(function (s) { return '<option value="' + s.sc_id + '"' + (scSel == s.sc_id ? ' selected' : '') + '>' + esc(s.sc_name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="f"><label>Engineer</label><select id="cf_eng"></select></div></div>' : '');
  modal((isNew ? 'New service call' : 'Edit service call — ' + esc(row.complaint_no)), body,
    '<button class="btn" onclick="closeModal()">Cancel</button>' + (!isNew && isHO() ? '<button class="btn dang-o" onclick="closeModal();deleteEntity(\'complaint\',DB.get(\'complaint\',' + row.complaint_id + '))">' + ICO.trash + ' Delete</button>' : '') +
    '<button class="btn pri" onclick="cfSave()">' + ICO.save + ' ' + (isNew ? 'Register call' : 'Update call') + '</button>', 'wide sticky');
  CF.cust = cust;
  var stSel = $('#cf_state'), dl = $('#dl_cf_dist'), fill = function () { dl.innerHTML = districtList(stSel.value).map(function (x) { return '<option value="' + esc(x) + '">'; }).join(''); };
  fill(); stSel.addEventListener('change', fill);
  $('#cf_mobile').addEventListener('input', cfLookup);
  var cs = $('#cf_sc'); if (cs) { var fe = function () { var cur = row ? row.engineer_id : ''; $('#cf_eng').innerHTML = '<option value="">— unassigned —</option>' + engineerOpts(cs.value).map(function (e) { return '<option value="' + e.v + '"' + (cur == e.v ? ' selected' : '') + '>' + esc(e.l) + '</option>'; }).join(''); }; fe(); cs.addEventListener('change', function () { fe(); }); }
  $('#cf_type').addEventListener('change', cfDue); $('#cf_date').addEventListener('change', cfDue); cfDue();
  cfPaintLines(); cfInsts();
  if (cust && !row) cfLookup.call($('#cf_mobile'));
}
function cfDue() { var ct = DB.get('call_type', $('#cf_type').value), dt = $('#cf_date').value; $('#cf_due').textContent = ct && dt ? 'Due by ' + dmy(addDays(dt, ct.valid_days)) + ' (' + ct.valid_days + ' valid days)' : ''; }
function cfSerials() {
  var m = ($('#cf_mobile') || {}).value, out = [];
  var c = DB.find('customer', function (x) { return x.mobile === m; });
  if (c) wByCustomer(c.customer_id).forEach(function (w) { out.push(w); });
  return out;
}
function wByCustomer(id) { return DB.where('warranty', function (w) { return w.customer_id === id; }); }
function cfLookup() {
  var m = this.value.trim(), hint = $('#cf_mhint');
  if (!/^\d{10}$/.test(m)) { hint.textContent = 'Type the mobile — an existing customer loads automatically'; return; }
  var scoped = (ROLE() === 'DEALER' || ROLE() === 'CUSTOMER') ? Q.customers() : DB.all('customer'), c = scoped.filter(function (x) { return x.mobile === m; })[0];
  if (!c) { hint.innerHTML = '<span style="color:var(--info)">Not a registered customer — the call will be booked without warranty</span>'; return; }
  hint.innerHTML = '<span style="color:var(--ok)">✓ Registered customer — details loaded</span>';
  var set = function (id, v) { var e = document.getElementById(id); if (e && v != null && (!e.value || !CF.row)) e.value = v; };
  set('cf_name', c.customer_name); set('cf_addr', c.address); set('cf_village', c.village); set('cf_state', c.state_code); set('cf_district', c.district); set('cf_pin', c.pincode);
  $('#cf_state').dispatchEvent(new Event('change'));
  CF.cust = c; cfInsts();
  var sc = $('#cf_sc'); if (sc && !sc.value) { var s = scForState(c.state_code); if (s) { sc.value = s.sc_id; sc.dispatchEvent(new Event('change')); } }
}
function cfInsts() {
  var box = $('#cf_insts'), c = CF.cust; if (!box) return;
  if (!c) { box.innerHTML = ''; return; }
  var ins = Q.install().filter(function (i) { return i.customer_id === c.customer_id; });
  box.innerHTML = ins.length ? '<div class="hint" style="margin-top:10px">Registered pump sets of this customer — click one to load its components:</div><div class="chips">' +
    ins.map(function (i) { return '<span class="chip' + (CF.instId === i.install_id ? ' on' : '') + '" onclick="cfPickInst(' + i.install_id + ')">' + esc(i.install_no) + ' · ' + esc(i.village || i.district || '') + ' · ' + dmy(i.install_date) + '</span>'; }).join('') + '</div>' : '';
}
function cfPickInst(id) {
  CF.instId = id; CF.lines = wByInstall(id).filter(function (w) { return w.status !== 'Replaced'; }).map(function (w) { return { cat: w.category, sn: w.serial_no, fault: '' }; });
  if (!CF.lines.length) CF.lines.push({ cat: 'PUMP', sn: '', fault: '' });
  cfPaintLines(); cfInsts(); toast('Components loaded — remove the ones that are not faulty', 'ok');
}
function cfAddLine() { CF.lines.push({ cat: 'PUMP', sn: '', fault: '' }); cfPaintLines(); }
function cfDelLine(i) { CF.lines.splice(i, 1); if (!CF.lines.length) CF.lines.push({ cat: 'PUMP', sn: '', fault: '' }); cfPaintLines(); }
function cfPaintLines() {
  var sers = cfSerials();
  var h = '<datalist id="dl_cf_sn">' + sers.map(function (w) { return '<option value="' + esc(w.serial_no) + '">' + esc(catLabel(w.category) + ' · ' + modelName(w.model_id)) + '</option>'; }).join('') + '</datalist>' +
    '<datalist id="dl_cf_fault">' + uniq(DB.all('fault_master').map(function (f) { return f.fault_name; })).map(function (f) { return '<option value="' + esc(f) + '">'; }).join('') + '</datalist>' +
    '<table class="dt cflines"><thead><tr><th style="width:130px">Component</th><th style="width:190px">Serial no</th><th>Model &amp; warranty</th><th style="width:25%">Fault reported</th><th style="width:34px"></th></tr></thead><tbody>';
  CF.lines.forEach(function (l, i) {
    h += '<tr><td><select data-i="' + i + '" data-f="cat">' + CAT_OPTS.map(function (o) { return '<option value="' + o.v + '"' + (l.cat === o.v ? ' selected' : '') + '>' + o.l + '</option>'; }).join('') + '</select></td>' +
      '<td><input data-i="' + i + '" data-f="sn" class="mono" list="dl_cf_sn" value="' + esc(l.sn) + '" placeholder="Scan / type serial" autocomplete="off"></td>' +
      '<td id="cfinfo' + i + '"></td><td><input data-i="' + i + '" data-f="fault" list="dl_cf_fault" value="' + esc(l.fault) + '" placeholder="e.g. no discharge"></td>' +
      '<td><button class="ract del" title="Remove" onclick="cfDelLine(' + i + ')">' + ICO.trash + '</button></td></tr>';
  });
  $('#cf_lines').innerHTML = h + '</tbody></table>';
  $$('#cf_lines [data-f]').forEach(function (e) {
    e.addEventListener('input', function () { var i = +this.dataset.i; CF.lines[i][this.dataset.f] = this.value; if (this.dataset.f === 'sn') cfInfo(i, true); });
    e.addEventListener('change', function () { var i = +this.dataset.i; CF.lines[i][this.dataset.f] = this.value; if (this.dataset.f === 'sn') cfInfo(i, true); });
  });
  CF.lines.forEach(function (l, i) { cfInfo(i, false); });
}
function cfInfo(i, fillCat) {
  var l = CF.lines[i], box = document.getElementById('cfinfo' + i); if (!box) return;
  var sn = (l.sn || '').trim(), lw = lineWarranty(sn), st = sn ? stickerBySerial(sn) : null;
  if (st && fillCat && st.category !== l.cat) { l.cat = st.category; var sel = document.querySelector('#cf_lines select[data-i="' + i + '"]'); if (sel) sel.value = l.cat; }
  if (!sn) box.innerHTML = '<span class="muted">Enter the serial to fetch warranty</span>';
  else if (lw.k === 'unk') box.innerHTML = '<span class="tag dang">Unknown serial</span> <span class="hint">not in the sticker register</span>';
  else if (lw.k === 'unreg') box.innerHTML = esc(modelName(st.model_id)) + ' <span class="tag mut">Not registered</span>';
  else {
    var w = lw.w;
    box.innerHTML = esc(modelName(w.model_id)) + ' <span class="tag ' + lw.cls + '">' + lw.txt + '</span> <span class="hint">till ' + dmy(w.end_date) + (lw.k === 'in' ? ' · ' + lw.days + ' d left' : '') + '</span>';
    if (st && st.category !== l.cat) box.innerHTML += '<div style="color:var(--dang);font-size:11px">This serial is a ' + esc(catLabel(st.category).toLowerCase()) + '</div>';
  }
}
function cfSave() {
  var g = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; }, row = CF.row;
  var date = g('cf_date'), mobile = g('cf_mobile'), name = g('cf_name'), text = g('cf_text');
  if (!date) return toast('Call date is required', 'err');
  if (date > today()) return toast('Call date cannot be in the future', 'err');
  if (!g('cf_type')) return toast('Select the call type', 'err');
  if (!/^[6-9]\d{9}$/.test(mobile)) return toast('Enter a valid 10-digit mobile number', 'err');
  if (!name) return toast('Customer name is required', 'err');
  if (!g('cf_state')) return toast('Select the state', 'err');
  if (g('cf_pin') && !/^\d{6}$/.test(g('cf_pin'))) return toast('Pincode must be 6 digits', 'err');
  if (text.length < 3) return toast('Describe the problem reported', 'err');
  var lines = CF.lines.filter(function (l) { return l.sn.trim() || l.fault.trim(); });
  if (!lines.length) return toast('Add at least one faulty component (serial no or fault)', 'err');
  for (var i = 0; i < lines.length; i++) {
    var sn = lines[i].sn.trim(), st = sn ? stickerBySerial(sn) : null;
    if (sn && !st) return toast('Serial ' + sn + ' is not in the sticker register — correct it or clear it', 'err');
    if (st && st.category !== lines[i].cat) lines[i].cat = st.category;
    lines[i].sn = st ? st.serial_no : '';
  }
  var ct = DB.get('call_type', g('cf_type')), cust = DB.find('customer', function (x) { return x.mobile === mobile; });
  var firstW = null; lines.forEach(function (l) { if (!firstW && l.sn) firstW = wBySerial(l.sn); });
  var dealerId = APP.user.kind === 'DEALER' ? APP.user.id : (g('cf_dealer') ? +g('cf_dealer') : (firstW ? firstW.dealer_id : null));
  var v = {
    call_date: date, calltype_id: +g('cf_type'), project_id: g('cf_proj') ? +g('cf_proj') : null, priority: g('cf_prio') || 'Medium', source: g('cf_src') || 'Toll Free',
    install_id: CF.instId || (firstW ? firstW.install_id : null), customer_id: cust ? cust.customer_id : null, customer_name: name, mobile: mobile, address: g('cf_addr') || null, village: g('cf_village') || null,
    district: g('cf_district') || null, state_code: g('cf_state'), pincode: g('cf_pin') || null, dealer_id: dealerId || null, warranty_status: overallWarranty(lines), complaint_text: text, due_date: addDays(date, ct ? ct.valid_days : 3)
  };
  if (isStaff()) { v.sc_id = g('cf_sc') ? +g('cf_sc') : null; v.engineer_id = g('cf_eng') ? +g('cf_eng') : null; }
  else if (!row) { var sc = scForState(v.state_code); v.sc_id = sc ? sc.sc_id : null; }
  var c;
  if (row) {
    if (v.engineer_id && !row.engineer_id) { v.assigned_on = today(); if (row.status === 'New') v.status = 'Assigned'; }
    DB.upd('complaint', row.complaint_id, v); c = row;
    DB.where('complaint_item', function (x) { return x.complaint_id === row.complaint_id; }).forEach(function (x) { DB.del('complaint_item', x.citem_id, true); });
  } else {
    v.complaint_no = DB.nextNo('COMPLAINT', 'SC/{fy}/{n:4}'); v.status = v.engineer_id ? 'Assigned' : 'New'; v.assigned_on = v.engineer_id ? today() : null; v.created_by = myName();
    c = DB.add('complaint', v);
  }
  lines.forEach(function (l) {
    var w = l.sn ? wBySerial(l.sn) : null, lw = lineWarranty(l.sn);
    DB.add('complaint_item', { complaint_id: c.complaint_id, category: l.cat, serial_no: l.sn || null, model_id: w ? w.model_id : (l.sn ? stickerBySerial(l.sn).model_id : null), model_name: l.sn ? modelName((w || stickerBySerial(l.sn)).model_id) : '', warranty_status: lw.txt, warranty_end: w ? w.end_date : null, fault_reported: l.fault || null }, true);
  });
  var after = function () {
    if (!row) {
      c._sla = ct ? ct.valid_days : 3;
      notify({ channel: 'WhatsApp', to: c.mobile, tpl: 'COMPLAINT_BOOKED', msg: MSG.complaintBooked(c), refType: 'complaint', refNo: c.complaint_no });
      delete c._sla;
    }
    DB.save(); closeModal(); route(true); toast('Service call ' + c.complaint_no + (row ? ' updated' : ' registered'), 'ok');
    if (!row) location.hash = '#/s/call/' + c.complaint_id;
  };
  if (!row) savePhotos('cf_photos', 'complaint', c.complaint_id, function () { after(); }); else after();
}

/* ---- assign ---- */
function assignCall(c) {
  var scs = DB.all('service_center').filter(function (s) { return s.is_active == 1; });
  modal('Assign ' + esc(c.complaint_no), '<div class="note">Customer <b>' + esc(c.customer_name) + '</b> · ' + esc(c.village || c.district || '') + ', ' + esc(stateName(c.state_code)) + '. The customer gets a WhatsApp with the engineer details.</div>' +
    '<div class="frm"><div class="f"><label>Service center *</label><select id="as_sc">' + scs.map(function (s) { return '<option value="' + s.sc_id + '"' + ((c.sc_id || (scForState(c.state_code) || {}).sc_id) == s.sc_id ? ' selected' : '') + '>' + esc(s.sc_name) + ' — ' + esc(s.city || '') + '</option>'; }).join('') + '</select></div>' +
    '<div class="f"><label>Engineer *</label><select id="as_eng"></select></div>' +
    '<div class="f"><label>Visit due by</label><input id="as_due" type="date" value="' + esc(c.due_date || '') + '"></div></div>',
    '<button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" onclick="assignSave(' + c.complaint_id + ')">' + ICO.user + ' Assign</button>', 'narrow sticky');
  var sc = $('#as_sc'), fe = function () { $('#as_eng').innerHTML = engineerOpts(sc.value).map(function (e) { return '<option value="' + e.v + '"' + (c.engineer_id == e.v ? ' selected' : '') + '>' + esc(e.l) + '</option>'; }).join('') || '<option value="">No engineer in this center</option>'; };
  fe(); sc.addEventListener('change', fe);
}
function assignSave(id) {
  var c = DB.get('complaint', id), eng = DB.get('app_user', $('#as_eng').value), sc = DB.get('service_center', $('#as_sc').value);
  if (!eng || !sc) return toast('Select a service center and an engineer', 'err');
  var p = { sc_id: sc.sc_id, engineer_id: eng.user_id, assigned_on: today(), due_date: $('#as_due').value || c.due_date };
  if (c.status === 'New') p.status = 'Assigned';
  DB.upd('complaint', id, p);
  notify({ channel: 'WhatsApp', to: c.mobile, tpl: 'ENGINEER_ASSIGNED', msg: MSG.engineerAssigned(DB.get('complaint', id), eng, sc), refType: 'complaint', refNo: c.complaint_no });
  DB.save(); closeModal(); route(true); toast('Assigned to ' + userName(eng.user_id), 'ok');
}

/* ---- reminders ---- */
function addReminder(cid) {
  var c = DB.get('complaint', cid);
  modal('Reminder — ' + esc(c.complaint_no), '<div class="frm"><div class="f"><label>Remind on *</label><input id="rm_on" type="date" value="' + addDays(today(), 1) + '"></div><div class="f full"><label>Note *</label><textarea id="rm_note" rows="2" placeholder="e.g. Call customer to confirm visit"></textarea></div></div>',
    '<button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" onclick="reminderSave(' + cid + ')">' + ICO.save + ' Save reminder</button>', 'narrow sticky');
}
function reminderSave(cid) {
  var on = $('#rm_on').value, note = $('#rm_note').value.trim();
  if (!on || !note) return toast('Date and note are required', 'err');
  DB.add('complaint_reminder', { complaint_id: cid, remind_on: on, note: note, status: 'Pending', created_by: myName() });
  DB.save(); closeModal(); route(true); toast('Reminder added', 'ok');
}
defEntity({
  key: 'reminder', table: 'complaint_reminder', title: 'Reminder', plural: 'Call Reminders', refLabel: function (r) { return nameOf('complaint', r.complaint_id, 'complaint_no') + ' · ' + dmy(r.remind_on); },
  rows: function () { var ok = {}; Q.complaints().forEach(function (c) { ok[c.complaint_id] = 1; }); return DB.all('complaint_reminder').filter(function (r) { return ok[r.complaint_id]; }); },
  sub: function (rows) { var due = rows.filter(function (r) { return r.status === 'Pending' && r.remind_on <= today(); }).length; return inr(rows.length) + ' reminders · ' + (due ? '<b style="color:var(--dang)">' + due + ' due today / overdue</b>' : 'none due'); },
  fields: function () {
    return [{ k: 'complaint_id', l: 'Service call', type: 'select', req: 1, lk: 1, full: 1, opts: optsFrom('complaint', function (c) { return c.complaint_no + ' — ' + c.customer_name; }, function (c) { return callOpen(c); }) },
      { k: 'remind_on', l: 'Remind on', type: 'date', req: 1 }, { k: 'status', l: 'Status', type: 'select', req: 1, opts: ['Pending', 'Done'] }, { k: 'note', l: 'Note', type: 'area', req: 1, full: 1 }];
  },
  defaults: function () { return { remind_on: addDays(today(), 1), status: 'Pending' }; },
  before: function (v, row) { if (!row) v.created_by = myName(); if (v.status === 'Done' && !(row && row.done_on)) v.done_on = today(); if (v.status === 'Pending') v.done_on = null; return null; },
  filters: [{ label: 'Status', get: function (r) { return r.status; }, opts: ['Pending', 'Done'] }],
  searchPh: 'Search call no, customer, note…', search: function (r) { var c = DB.get('complaint', r.complaint_id) || {}; return [c.complaint_no, c.customer_name, r.note].join(' '); },
  sortI: 2, sortD: 'asc',
  cols: [
    { h: 'Call No', val: function (r) { return nameOf('complaint', r.complaint_id, 'complaint_no'); }, cell: function (r) { return '<a href="#/s/call/' + r.complaint_id + '"><b>' + esc(nameOf('complaint', r.complaint_id, 'complaint_no')) + '</b></a>'; } },
    { h: 'Customer', val: function (r) { return nameOf('complaint', r.complaint_id, 'customer_name'); } },
    { h: 'Remind on', val: function (r) { return r.remind_on; }, cell: function (r) { return (r.status === 'Pending' && r.remind_on <= today()) ? '<b style="color:var(--dang)">' + dmy(r.remind_on) + '</b>' : dmy(r.remind_on); } },
    { h: 'Note', val: function (r) { return r.note; }, cls: 'el' }, { h: 'Created by', val: function (r) { return r.created_by || ''; } },
    { h: 'Status', val: function (r) { return r.status; }, cell: function (r) { return r.status === 'Done' ? tag('Done', 'ok') : tag('Pending', 'warn'); } }
  ],
  rowActions: function (r) { return r.status === 'Pending' ? [{ a: 'done', t: 'Mark done', i: ICO.tick }] : []; },
  onAction: function (a, r) { if (a === 'done') { DB.upd('complaint_reminder', r.rem_id, { status: 'Done', done_on: today() }); DB.save(); route(true); toast('Reminder marked done', 'ok'); } },
  perm: function () { return { add: 1, edit: 1, del: 1, imp: 1 }; },
  imp: {
    cols: [
      { h: 'Call No', k: 'complaint_id', req: 1, lk: { t: 'complaint', f: ['complaint_no'] }, sample: 'SC/26-27/0001' },
      { h: 'Remind On', k: 'remind_on', type: 'date', req: 1, sample: '2026-11-02' },
      { h: 'Note', k: 'note', req: 1, sample: 'Call customer to confirm visit' },
      { h: 'Status', k: 'status', enumv: ['Pending', 'Done'], sample: 'Pending' }
    ],
    make: function (o) { return { complaint_id: o.complaint_id, remind_on: o.remind_on, note: o.note, status: o.status || 'Pending', created_by: myName(), done_on: o.status === 'Done' ? today() : null }; }
  }
});
ROUTES['s/reminders'] = function () { var p = entityScreen('reminder'); p.crumb = 'Home › Service › <b>Reminders</b>'; return p; };

/* ============================================================
   CALL DETAIL
   ============================================================ */
function callStepper(c) {
  var vis = DB.where('visit_report', function (v) { return v.complaint_id === c.complaint_id; }).length, jcs = DB.where('jobcard', function (j) { return j.complaint_id === c.complaint_id; });
  var idx = { 'New': 0, 'Assigned': 1, 'Visited': 2, 'In Approval': 3, 'Approved': 4, 'Resolved': 5, 'Closed': 6 }[c.status];
  var steps = ['Booked', 'Assigned', 'Visited', 'Job card sent', 'Approved', 'Resolved', 'Closed'];
  if (c.status === 'Cancelled') return '<div class="dangbox" style="margin-bottom:14px">This call was cancelled.</div>';
  return '<div class="stepper">' + steps.map(function (s, i) { return '<div class="st ' + (i < idx ? 'done' : i === idx ? 'cur' : '') + '" data-n="' + (i + 1) + '">' + s + '</div>'; }).join('') + '</div>';
}
ROUTES['s/call'] = function (a, q) {
  var c = DB.get('complaint', a[0]);
  if (!c || Q.complaints().indexOf(c) < 0) return { title: 'Service call', crumb: 'Home › Service › <a href="#/s/calls">Calls</a>', body: '<div class="card"><div class="empty">Service call not found, or you do not have access to it.</div></div>' };
  var items = callItems(c), visits = DB.where('visit_report', function (v) { return v.complaint_id === c.complaint_id; }), jcs = DB.where('jobcard', function (j) { return j.complaint_id === c.complaint_id; });
  var rems = DB.where('complaint_reminder', function (r) { return r.complaint_id === c.complaint_id; }), repls = DB.where('replacement', function (r) { return r.complaint_id === c.complaint_id; });
  var ct = DB.get('call_type', c.calltype_id) || {}, st = isStaff(), eng = ROLE() === 'ENGINEER', ho = isHO(), open = callOpen(c);
  var lastVisit = visits.slice().sort(function (x, y) { return String(y.visit_date).localeCompare(x.visit_date); })[0];
  var openJc = jcs.filter(function (j) { return j.status === 'Draft' || j.status === 'Rejected'; })[0];
  var act = '<button class="btn" onclick="goBack(\'#/s/calls\')">' + ICO.back + ' Back</button>';
  if (open && (st || eng)) act += '<button class="btn" onclick="visitForm(null,{call:' + c.complaint_id + '})">' + ICO.clip + ' Record visit</button>';
  if (open && st) act += '<button class="btn" onclick="assignCall(DB.get(\'complaint\',' + c.complaint_id + '))">' + ICO.user + ' ' + (c.engineer_id ? 'Re-assign' : 'Assign') + '</button>';
  if (open && (st || eng) && c.status !== 'In Approval') act += '<button class="btn ' + (c.status === 'Visited' ? 'pri' : '') + '" onclick="location.hash=\'#/s/jobcard/' + (openJc ? openJc.jobcard_id + '/edit' : 'new?call=' + c.complaint_id) + '\'">' + ICO.rep + ' ' + (openJc ? 'Continue job card' : 'Create job card') + '</button>';
  if (open && st) act += '<button class="btn" onclick="replForm(null,{call:' + c.complaint_id + '})">' + ICO.swap + ' Replacement / return pump</button>';
  if (open && st) act += '<button class="btn" onclick="addReminder(' + c.complaint_id + ')">' + ICO.clock + ' Reminder</button>';
  if ((c.status === 'Approved' || c.status === 'Visited' || c.status === 'Assigned') && (st || eng)) act += '<button class="btn acc" onclick="resolveCall(' + c.complaint_id + ')">' + ICO.tick + ' Resolve</button>';
  if (c.status === 'Resolved' && st) act += '<button class="btn pri" onclick="closeCall(' + c.complaint_id + ')">' + ICO.check + ' Close call</button>';
  if (open && (st || c.status === 'New')) act += '<button class="btn" onclick="cancelCall(' + c.complaint_id + ')">' + ICO.x + ' Cancel call</button>';
  if (st || c.status === 'New') act += '<button class="btn" onclick="openForm(\'complaint\',DB.get(\'complaint\',' + c.complaint_id + '))">' + ICO.edit + ' Edit</button>';
  if (ENT.complaint.canDel(c)) act += '<button class="btn dang-o" style="margin:0" onclick="deleteEntity(\'complaint\',DB.get(\'complaint\',' + c.complaint_id + '))">' + ICO.trash + ' Delete</button>';
  var overdue = callOverdue(c);
  /* timeline */
  var ev = [{ d: c.created_on || c.call_date, t: 'Call booked', s: 'by ' + (c.created_by || '—') + ' · source ' + (c.source || '—'), c: 'g' }];
  if (c.assigned_on) ev.push({ d: c.assigned_on, t: 'Assigned', s: userName(c.engineer_id) + ' · ' + scName(c.sc_id), c: 'g' });
  visits.forEach(function (v) { ev.push({ d: v.visit_date, t: 'Visit ' + (v.visit_no || ''), s: v.outcome + ' · ' + userName(v.engineer_id), c: 'a' }); });
  jcs.forEach(function (j) { ev.push({ d: j.jobcard_date, t: 'Job card ' + j.jobcard_no, s: j.status + ' · ₹ ' + inr(j.grand_total), c: j.status === 'Approved' || j.status === 'Closed' ? 'g' : 'a', go: '#/s/jobcard/' + j.jobcard_id }); });
  repls.forEach(function (r) { ev.push({ d: r.repl_date, t: 'Replacement ' + r.repl_no, s: r.status, c: 'a' }); });
  if (c.closed_on) ev.push({ d: c.closed_on, t: c.status === 'Closed' ? 'Closed' : 'Resolved', s: c.resolution || '', c: 'g' });
  var rank = { 'Call booked': 0, 'Assigned': 1, 'Visit': 2, 'Job card': 3, 'Replacement': 4, 'Resolved': 5, 'Closed': 5 };
  ev.forEach(function (e) { e.r = rank[String(e.t).split(' ')[0] === 'Call' ? 'Call booked' : String(e.t).split(' ')[0]] || 0; });
  ev.sort(function (x, y) { return String(x.d).slice(0, 10).localeCompare(String(y.d).slice(0, 10)) || x.r - y.r || String(x.d).localeCompare(String(y.d)); });   /* by day, then by step order */
  var cust = DB.get('customer', c.customer_id);
  return {
    title: esc(c.complaint_no) + ' &nbsp;' + statusTag(c.status), crumb: 'Home › Service › <a href="#/s/calls">Service Calls</a> › <b>' + esc(c.complaint_no) + '</b>',
    sub: esc(c.customer_name) + ' · ' + esc(c.mobile) + ' · ' + esc([c.village, c.district, stateName(c.state_code)].filter(Boolean).join(', ')),
    actions: act,
    body: callStepper(c) +
      '<div class="grid2" style="grid-template-columns:1.2fr 1fr">' +
      '<div class="card" style="margin:0"><h3>Call information</h3><div class="cbody"><dl class="dl"><dt>Call date</dt><dd>' + dmy(c.call_date) + '</dd><dt>Call type</dt><dd>' + esc(ct.call_type || '') + ' <span class="hint">(' + (ct.valid_days || '—') + ' valid days)</span></dd>' +
      '<dt>Due by</dt><dd style="' + (overdue ? 'color:var(--dang)' : '') + '">' + dmy(c.due_date) + (overdue ? ' — overdue by ' + daysBetween(c.due_date, today()) + ' days' : '') + '</dd><dt>Priority</dt><dd>' + esc(c.priority) + '</dd><dt>Source</dt><dd>' + esc(c.source || '') + '</dd>' +
      '<dt>Project</dt><dd>' + esc(nameOf('project', c.project_id, 'project_name') || '—') + '</dd><dt>Dealer</dt><dd>' + esc(dealerName(c.dealer_id) || 'Direct') + '</dd><dt>Overall warranty</dt><dd>' + wTag(c.warranty_status) + '</dd>' +
      '<dt>Problem reported</dt><dd style="font-weight:500">' + esc(c.complaint_text) + '</dd>' + (c.resolution ? '<dt>Resolution</dt><dd style="font-weight:500">' + esc(c.resolution) + '</dd>' : '') + '</dl></div></div>' +
      '<div class="card" style="margin:0"><h3>Assignment &amp; customer</h3><div class="cbody"><dl class="dl"><dt>Service center</dt><dd>' + esc(scName(c.sc_id) || 'Unassigned') + '</dd><dt>Engineer</dt><dd>' + esc(userName(c.engineer_id) || 'Unassigned') + '</dd>' +
      '<dt>Customer</dt><dd>' + (cust ? '<a href="#/w/customers/' + cust.customer_id + '">' + esc(c.customer_name) + '</a>' : esc(c.customer_name)) + '</dd><dt>Address</dt><dd style="font-weight:500">' + esc([c.address, c.village, c.district, stateName(c.state_code), c.pincode].filter(Boolean).join(', ')) + '</dd>' +
      '<dt>Installation</dt><dd>' + esc(nameOf('installation', c.install_id, 'install_no') || '—') + '</dd></dl></div></div></div>' +
      '<div class="card" style="margin-top:16px"><h3>Faulty components <span class="sm2">warranty checked per serial</span></h3><table class="dt"><thead><tr><th>Component</th><th>Serial</th><th>Model</th><th>Warranty</th><th>Valid till</th><th>Fault reported</th></tr></thead><tbody>' +
      (items.map(function (i) { var lw = lineWarranty(i.serial_no || ''); return '<tr><td>' + catTag(i.category) + '</td><td class="mono">' + (i.serial_no ? '<a href="#/w/search?sn=' + encodeURIComponent(i.serial_no) + '"><b>' + esc(i.serial_no) + '</b></a>' : '—') + '</td><td>' + esc(i.model_name || '') + '</td><td><span class="tag ' + lw.cls + '">' + esc(lw.txt) + '</span></td><td>' + dmy(i.warranty_end) + '</td><td>' + esc(i.fault_reported || '') + '</td></tr>'; }).join('') || '<tr><td colspan="6" class="muted">No components</td></tr>') + '</tbody></table></div>' +
      '<div class="grid2" style="grid-template-columns:1.3fr 1fr">' +
      '<div><div class="card"><h3>Visit reports <span class="sm2">' + visits.length + '</span></h3>' + (visits.length ? '<table class="dt"><thead><tr><th>Visit</th><th>Date</th><th>Engineer</th><th>Outcome</th><th>Findings</th><th></th></tr></thead><tbody>' +
        visits.map(function (v) { return '<tr><td><b>' + esc(v.visit_no || '') + '</b></td><td>' + dmy(v.visit_date) + '</td><td>' + esc(userName(v.engineer_id)) + '</td><td>' + esc(v.outcome) + '</td><td>' + esc(shortName(v.findings, 60)) + '</td><td><button class="ract" onclick="visitForm(DB.get(\'visit_report\',' + v.visit_id + '))">' + ICO.edit + '</button></td></tr>'; }).join('') + '</tbody></table>' : '<div class="empty" style="padding:22px">No visits recorded yet</div>') + '</div>' +
      '<div class="card"><h3>Job cards <span class="sm2">' + jcs.length + '</span></h3>' + (jcs.length ? '<table class="dt"><thead><tr><th>Job card</th><th>Date</th><th class="n">Total</th><th class="n">Warranty</th><th class="n">Customer pays</th><th>Status</th></tr></thead><tbody>' +
        jcs.map(function (j) { return '<tr class="clk" onclick="location.hash=\'#/s/jobcard/' + j.jobcard_id + '\'"><td><b>' + esc(j.jobcard_no) + '</b></td><td>' + dmy(j.jobcard_date) + '</td><td class="n">' + inr(j.grand_total, 2) + '</td><td class="n">' + inr(j.warranty_amount, 2) + '</td><td class="n">' + inr(j.customer_payable, 2) + '</td><td>' + statusTag(j.status) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="empty" style="padding:22px">No job card yet</div>') + '</div>' +
      (rems.length ? '<div class="card"><h3>Reminders</h3><table class="dt"><tbody>' + rems.map(function (r) { return '<tr><td>' + dmy(r.remind_on) + '</td><td>' + esc(r.note) + '</td><td>' + (r.status === 'Done' ? tag('Done', 'ok') : tag('Pending', 'warn')) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '') +
      (photosOf('complaint', c.complaint_id).length || photosOf('visit', 0).length ? '' : '') +
      '</div><div><div class="card"><h3>Activity</h3><div class="cbody"><div class="tl">' + ev.map(function (e) { return '<div class="ti ' + (e.c || '') + '"><b>' + (e.go ? '<a href="' + e.go + '">' + esc(e.t) + '</a>' : esc(e.t)) + '</b><span>' + dmy(String(e.d).slice(0, 10)) + ' · ' + esc(e.s) + '</span></div>'; }).join('') + '</div></div></div>' +
      '<div class="card"><h3>Photos <span class="sm2">call &amp; visits</span></h3><div class="cbody">' + (galleryHtml('complaint', c.complaint_id, st) + visits.map(function (v) { return galleryHtml('visit', v.visit_id, st); }).join('') || '<div class="muted">No photos</div>') + '</div></div>' +
      '</div></div>'
  };
};

/* ---- resolve / close / cancel ---- */
function resolveCall(id) {
  var c = DB.get('complaint', id);
  promptDo('Resolve ' + c.complaint_no, 'Resolution / action taken', c.resolution || '', 'Mark resolved', function (txt) {
    DB.upd('complaint', id, { status: 'Resolved', resolution: txt, closed_on: today() });
    var cc = DB.get('complaint', id); notify({ channel: 'WhatsApp', to: cc.mobile, tpl: 'CALL_RESOLVED', msg: MSG.resolved(cc), refType: 'complaint', refNo: cc.complaint_no });
    DB.save(); route(true); toast('Call marked resolved — customer informed', 'ok');
  }, true);
}
function closeCall(id) {
  confirmDo('Close this call?', 'The call will be closed after the customer confirmed the work. Closed calls are read-only.', 'Close call', function () { DB.upd('complaint', id, { status: 'Closed', closed_on: DB.get('complaint', id).closed_on || today() }); DB.save(); route(true); toast('Call closed', 'ok'); });
}
function cancelCall(id) {
  var jcs0 = DB.where('jobcard', function (j) { return j.complaint_id === id; });
  if (jcs0.some(function (j) { return j.status === 'Approved' || j.status === 'Closed'; })) return toast('Cannot cancel — a job card is already approved (stock used, customer informed). Resolve and close the call instead.', 'err');
  if (jcs0.some(function (j) { return j.status === 'In Approval'; })) return toast('Cannot cancel — a job card is waiting for approval. Reject or delete it first.', 'err');
  promptDo('Cancel call', 'Reason for cancelling', '', 'Cancel call', function (txt) { DB.upd('complaint', id, { status: 'Cancelled', resolution: 'Cancelled: ' + txt, closed_on: today() }); DB.save(); route(true); toast('Call cancelled', 'ok'); }, true);
}

/* ============================================================
   VISIT REPORTS
   ============================================================ */
defEntity({
  key: 'visit', table: 'visit_report', title: 'Visit Report', plural: 'Visit Reports', refLabel: function (r) { return r.visit_no || ('Visit #' + r.visit_id); },
  rows: function () { return Q.visits(); },
  sub: function (rows) { return inr(rows.length) + ' visits · travel ' + inr(sum(rows, function (r) { return r.travel_km; })) + ' km · expenses ₹ ' + inr(sum(rows, function (r) { return (r.travel_exp || 0) + (r.other_exp || 0); })); },
  openForm: function (row) { visitForm(row); },
  perm: function () { return { add: 1, edit: 1, del: (ROLE() === 'ENGINEER') ? 0 : 1, imp: isHO() }; },
  beforeDelete: function (v) { DB.where('attachment', function (a) { return a.ref_type === 'visit' && a.ref_id === v.visit_id; }).forEach(function (a) { DB.del('attachment', a.att_id, true); }); },
  filters: [{ label: 'Outcome', get: function (v) { return v.outcome; }, opts: VISIT_OUTCOME }, { label: 'Engineer', get: function (v) { return userName(v.engineer_id); } }],
  searchPh: 'Search visit, call no, customer, findings…', search: function (v) { var c = DB.get('complaint', v.complaint_id) || {}; return [v.visit_no, c.complaint_no, c.customer_name, v.findings, v.action_taken].join(' '); },
  sortI: 1, sortD: 'desc',
  cols: [
    { h: 'Visit No', val: function (v) { return v.visit_no || ''; }, cell: function (v) { return '<b>' + esc(v.visit_no || '') + '</b>'; } },
    { h: 'Date', val: function (v) { return v.visit_date; }, cell: function (v) { return dmy(v.visit_date); } },
    { h: 'Call', val: function (v) { return nameOf('complaint', v.complaint_id, 'complaint_no'); }, cell: function (v) { return '<a href="#/s/call/' + v.complaint_id + '">' + esc(nameOf('complaint', v.complaint_id, 'complaint_no')) + '</a>'; } },
    { h: 'Customer', val: function (v) { return nameOf('complaint', v.complaint_id, 'customer_name'); } },
    { h: 'Engineer', val: function (v) { return userName(v.engineer_id); } },
    { h: 'Time', val: function (v) { return (v.start_time || '') + ' – ' + (v.end_time || ''); } },
    { h: 'Km', val: function (v) { return v.travel_km || 0; }, cls: 'n' },
    { h: 'Expenses ₹', val: function (v) { return (v.travel_exp || 0) + (v.other_exp || 0); }, cls: 'n', cell: function (v) { return inr((v.travel_exp || 0) + (v.other_exp || 0), 2); } },
    { h: 'Outcome', val: function (v) { return v.outcome; }, cell: function (v) { return '<span class="tag ' + (v.outcome === 'Resolved at site' ? 'ok' : v.outcome === 'Customer not available' ? 'warn' : 'info') + '">' + esc(v.outcome) + '</span>'; } },
    { h: 'Rating', val: function (v) { return v.customer_rating || 0; }, cls: 'c', cell: function (v) { return v.customer_rating ? '★'.repeat(v.customer_rating) : '—'; } }
  ],
  onRow: function (v) { visitForm(v); },
  imp: {
    cols: [
      { h: 'Call No', k: 'complaint_id', req: 1, lk: { t: 'complaint', f: ['complaint_no'] }, sample: 'SC/26-27/0001' },
      { h: 'Engineer', k: 'engineer_id', req: 1, lk: { t: 'app_user', f: ['username'] }, sample: 'eng.jaipur1', note: 'Engineer user name' },
      { h: 'Visit Date', k: 'visit_date', type: 'date', req: 1, sample: '2026-10-30' },
      { h: 'Outcome', k: 'outcome', req: 1, enumv: VISIT_OUTCOME, sample: 'Job card required' },
      { h: 'Findings', k: 'findings', sample: 'Motor winding burnt' }, { h: 'Action Taken', k: 'action_taken', sample: 'Motor lifted, job card raised' },
      { h: 'Travel Km', k: 'travel_km', type: 'int', sample: 42 }, { h: 'Travel Expense', k: 'travel_exp', type: 'num', sample: 450 }
    ],
    make: function (o) { o.visit_no = DB.nextNo('VISIT', 'VR/{fy}/{n:4}'); return o; },
    after: function (made) { made.forEach(function (v) { visitEffects(v); }); }
  }
});
ROUTES['s/visits'] = function () { var p = entityScreen('visit'); p.crumb = 'Home › Service › <b>Visit Reports</b>'; return p; };

function visitEffects(v) {
  var c = DB.get('complaint', v.complaint_id); if (!c) return;
  var p = {};
  if (!c.engineer_id) { p.engineer_id = v.engineer_id; p.assigned_on = v.visit_date; if (!c.sc_id) { var e = DB.get('app_user', v.engineer_id); if (e && e.sc_id) p.sc_id = e.sc_id; } }
  if (c.status === 'New' || c.status === 'Assigned') p.status = 'Visited';
  if (Object.keys(p).length) DB.upd('complaint', c.complaint_id, p, true);
}
function visitForm(row, pre) {
  pre = pre || {};
  var u = APP.user, isEdit = !!row, calls = Q.complaints().filter(function (c) { return callOpen(c) || (row && c.complaint_id === row.complaint_id); });
  var cid = row ? row.complaint_id : pre.call, c0 = cid ? DB.get('complaint', cid) : null;
  var engLocked = ROLE() === 'ENGINEER';
  var d = row || { visit_date: today(), start_time: '10:00', end_time: '12:00', outcome: 'Job card required', engineer_id: engLocked ? u.id : (c0 ? c0.engineer_id : ''), from_location: '', to_location: c0 ? (c0.village || c0.district || '') : '' };
  var engs = engineerOpts();
  var body = '<div class="frm c3">' +
    '<div class="f full"><label>Service call <span class="rq">*</span></label><select id="vf_call"' + ((pre.call || isEdit) ? ' disabled' : '') + '>' + (cid ? '' : '<option value="">— select —</option>') + calls.map(function (c) { return '<option value="' + c.complaint_id + '"' + (cid == c.complaint_id ? ' selected' : '') + '>' + esc(c.complaint_no + ' — ' + c.customer_name + ' (' + (c.village || c.district || '') + ')') + '</option>'; }).join('') + '</select></div>' +
    '<div class="f"><label>Engineer <span class="rq">*</span></label><select id="vf_eng"' + (engLocked ? ' disabled' : '') + '><option value="">— select —</option>' + engs.map(function (e) { return '<option value="' + e.v + '"' + (d.engineer_id == e.v ? ' selected' : '') + '>' + esc(e.l) + '</option>'; }).join('') + '</select></div>' +
    '<div class="f"><label>Visit date <span class="rq">*</span></label><input id="vf_date" type="date" max="' + today() + '" value="' + esc(d.visit_date) + '"></div>' +
    '<div class="f"><label>Outcome <span class="rq">*</span></label><select id="vf_out">' + VISIT_OUTCOME.map(function (o) { return '<option' + (d.outcome === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></div>' +
    '<div class="f"><label>Start time</label><input id="vf_st" type="time" value="' + esc(d.start_time || '') + '"></div><div class="f"><label>End time</label><input id="vf_en" type="time" value="' + esc(d.end_time || '') + '"></div>' +
    '<div class="f"><label>Customer rating (1-5)</label><input id="vf_rate" type="number" min="1" max="5" value="' + esc(d.customer_rating || '') + '"></div>' +
    '<div class="f"><label>From</label><input id="vf_from" value="' + esc(d.from_location || '') + '" placeholder="Service center / home"></div><div class="f"><label>To (site)</label><input id="vf_to" value="' + esc(d.to_location || '') + '"></div>' +
    '<div class="f"><label>Travel (km)</label><input id="vf_km" type="number" min="0" value="' + esc(d.travel_km == null ? '' : d.travel_km) + '"></div>' +
    '<div class="f"><label>Travel expense (₹)</label><input id="vf_te" type="number" min="0" value="' + esc(d.travel_exp == null ? '' : d.travel_exp) + '"></div><div class="f"><label>Other expense (₹)</label><input id="vf_oe" type="number" min="0" value="' + esc(d.other_exp == null ? '' : d.other_exp) + '"></div>' +
    '<div class="f full"><label>Findings at site</label><textarea id="vf_find" rows="2">' + esc(d.findings || '') + '</textarea></div><div class="f full"><label>Action taken</label><textarea id="vf_act" rows="2">' + esc(d.action_taken || '') + '</textarea></div>' +
    photoPicker('vf_photos') + '</div>' + (isEdit ? '<div class="sec-h">Photos</div>' + (galleryHtml('visit', row.visit_id, true) || '<div class="muted">None</div>') : '');
  modal((isEdit ? 'Edit visit — ' + esc(row.visit_no || '') : 'New visit report'), body,
    '<button class="btn" onclick="closeModal()">Cancel</button>' + (isEdit && !engLocked ? '<button class="btn dang-o" onclick="closeModal();deleteEntity(\'visit\',DB.get(\'visit_report\',' + row.visit_id + '))">' + ICO.trash + ' Delete</button>' : '') +
    '<button class="btn pri" onclick="visitSave(' + (isEdit ? row.visit_id : 'null') + ')">' + ICO.save + ' ' + (isEdit ? 'Update' : 'Save visit') + '</button>', 'wide sticky');
}
function visitSave(id) {
  var g = function (x) { var e = document.getElementById(x); return e ? e.value.trim() : ''; }, n = function (x) { var s = g(x); return s === '' ? null : +s; };
  var cid = +g('vf_call'), eng = +g('vf_eng') || (ROLE() === 'ENGINEER' ? APP.user.id : 0);
  if (!cid) return toast('Select the service call', 'err');
  if (!eng) return toast('Select the engineer', 'err');
  if (!g('vf_date')) return toast('Visit date is required', 'err');
  if (g('vf_date') > today()) return toast('Visit date cannot be in the future', 'err');
  var cc = DB.get('complaint', cid); if (cc && g('vf_date') < cc.call_date) return toast('Visit date cannot be before the call date (' + dmy(cc.call_date) + ')', 'err');
  var rate = n('vf_rate'); if (rate != null && (rate < 1 || rate > 5)) return toast('Rating must be between 1 and 5', 'err');
  var v = { complaint_id: cid, engineer_id: eng, visit_date: g('vf_date'), start_time: g('vf_st') || null, end_time: g('vf_en') || null, from_location: g('vf_from') || null, to_location: g('vf_to') || null, travel_km: n('vf_km'), travel_exp: n('vf_te'), other_exp: n('vf_oe'), findings: g('vf_find') || null, action_taken: g('vf_act') || null, outcome: g('vf_out'), customer_rating: rate };
  var rec;
  if (id) { DB.upd('visit_report', id, v); rec = DB.get('visit_report', id); }
  else { v.visit_no = DB.nextNo('VISIT', 'VR/{fy}/{n:4}'); rec = DB.add('visit_report', v); visitEffects(rec); }
  savePhotos('vf_photos', 'visit', rec.visit_id, function () { DB.save(); closeModal(); route(true); toast('Visit ' + rec.visit_no + (id ? ' updated' : ' saved'), 'ok'); });
}
