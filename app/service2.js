/* ============================================================
   Service module part 2 - stock, replacement / return pump, reports, service dashboard
   ============================================================ */
'use strict';

/* ============================================================
   STOCK  (ledger = signed quantities per location / spare / bucket)
   ============================================================ */
function stockBal(spareId, locType, locId, bucket) {
  var t = 0;
  DB.all('stock_txn').forEach(function (x) { if (x.spare_id == spareId && x.loc_type === locType && x.loc_id == locId && (!bucket || x.bucket === bucket)) t += x.qty; });
  return Math.round(t * 1000) / 1000;
}
function locName(type, id) { return type === 'SC' ? scName(id) : userName(id); }
var PLUS_TYPES = ['Opening', 'Receipt', 'Transfer-In', 'Return-Good', 'Return-Damaged'], MINUS_TYPES = ['Issue-Out', 'Consume'];
var TXN_TYPES = ['Opening', 'Receipt', 'Issue-Out', 'Transfer-In', 'Return-Good', 'Return-Damaged', 'Adjust', 'Consume'];
function signedQty(type, qty) { var n = +qty || 0; return PLUS_TYPES.indexOf(type) >= 0 ? Math.abs(n) : MINUS_TYPES.indexOf(type) >= 0 ? -Math.abs(n) : n; }   /* Adjust keeps the sign typed */
/* locations the signed-in user may see: HO all; manager = own center + its engineers; engineer = self */
function stockLocsVisible() {
  var u = APP.user, r = ROLE();
  if (r === 'ENGINEER') return function (t, i) { return t === 'ENG' && i == u.id; };
  if (r === 'MANAGER' && u.rec.sc_id) { var engs = {}; DB.all('app_user').forEach(function (e) { if (e.role === 'ENGINEER' && e.sc_id == u.rec.sc_id) engs[e.user_id] = 1; }); return function (t, i) { return (t === 'SC' && i == u.rec.sc_id) || (t === 'ENG' && engs[i]); }; }
  return function () { return true; };
}
function stockRows() {
  var vis = stockLocsVisible(), m = {};
  DB.all('stock_txn').forEach(function (x) {
    if (!vis(x.loc_type, x.loc_id)) return;
    var k = x.loc_type + '|' + x.loc_id + '|' + x.spare_id, r = m[k];
    if (!r) r = m[k] = { loc_type: x.loc_type, loc_id: x.loc_id, spare_id: x.spare_id, good: 0, damaged: 0 };
    if (x.bucket === 'DAMAGED') r.damaged += x.qty; else r.good += x.qty;
  });
  return Object.keys(m).map(function (k) { var r = m[k], s = DB.get('spare_master', r.spare_id) || {}; r.spare = s; r.val = r.good * (s.rate || 0); return r; });
}
ROUTES['k/stock'] = function () {
  var rows = stockRows(), low = rows.filter(function (r) { return r.good <= (r.spare.min_stock || 0); });
  return {
    title: ROLE() === 'ENGINEER' ? 'My Stock' : 'Stock Availability', crumb: 'Home › Stock › <b>Availability</b>', sub: 'Good and damaged spares at each service center store and engineer van — updated by every approved job card',
    actions: isStaff() ? '<button class="btn pri" onclick="location.hash=\'#/k/txns\'">' + ICO.plus + ' Stock entry</button>' : '',
    body: stripCards([{ l: 'Stock lines', v: inr(rows.length) }, { l: 'Good units', v: inr(sum(rows, function (r) { return r.good; })), c: 'ok' }, { l: 'Damaged units', v: inr(sum(rows, function (r) { return r.damaged; })), c: 'dang' },
      { l: 'At / below min stock', v: inr(low.length), c: 'warn' }, { l: 'Stock value ₹', v: inr(sum(rows, function (r) { return Math.max(0, r.val); })) }]) + '<div id="stkGrid"></div>',
    after: function () {
      mountGrid('#stkGrid', {
        title: 'Stock_availability', rows: rows, sortI: 0, sortD: 'asc', pageSize: 50, searchPlaceholder: 'Search spare, location…',
        search: function (r) { return [r.spare.spare_name, r.spare.spare_code, locName(r.loc_type, r.loc_id)].join(' '); },
        filters: [{ label: 'Location type', get: function (r) { return r.loc_type === 'SC' ? 'Service center store' : 'Engineer'; } }, { label: 'Location', get: function (r) { return locName(r.loc_type, r.loc_id); } },
          { label: 'Category', get: function (r) { return r.spare.category; } }, { label: 'Level', get: function (r) { return r.good <= 0 ? 'Out of stock' : r.good <= (r.spare.min_stock || 0) ? 'Low' : 'OK'; }, opts: ['OK', 'Low', 'Out of stock'] }],
        cols: [
          { h: 'Location', val: function (r) { return locName(r.loc_type, r.loc_id); }, cell: function (r) { return (r.loc_type === 'SC' ? tag('Store', 'pur') : tag('Engineer', 'info')) + ' ' + esc(locName(r.loc_type, r.loc_id)); } },
          { h: 'Spare code', val: function (r) { return r.spare.spare_code; }, cls: 'mono' }, { h: 'Spare', val: function (r) { return r.spare.spare_name; } },
          { h: 'Category', val: function (r) { return r.spare.category; }, cell: function (r) { return catTag(r.spare.category); } },
          { h: 'Good', val: function (r) { return r.good; }, cls: 'n', cell: function (r) { return '<b' + (r.good < 0 ? ' style="color:var(--dang)"' : '') + '>' + r.good + '</b>'; } },
          { h: 'Damaged', val: function (r) { return r.damaged; }, cls: 'n' }, { h: 'Min stock', val: function (r) { return r.spare.min_stock || 0; }, cls: 'n' },
          { h: 'Value ₹', val: function (r) { return r.val; }, cls: 'n', cell: function (r) { return inr(r.val, 2); } },
          { h: 'Level', val: function (r) { return r.good <= 0 ? 'Out of stock' : r.good <= (r.spare.min_stock || 0) ? 'Low' : 'OK'; }, cell: function (r) { return r.good <= 0 ? tag('Out of stock', 'dang') : r.good <= (r.spare.min_stock || 0) ? tag('Low', 'warn') : tag('OK', 'ok'); } }
        ],
        totals: function (data, i) { return i === 4 ? '<b>' + inr(sum(data, function (r) { return r.good; })) + '</b>' : i === 5 ? '<b>' + inr(sum(data, function (r) { return r.damaged; })) + '</b>' : i === 7 ? '<b>' + inr(sum(data, function (r) { return Math.max(0, r.val); }), 2) + '</b>' : i === 0 ? '<b>Total</b>' : null; }
      });
    }
  };
};
ROUTES['k/engineer'] = function (a, q) {
  var rows = stockRows().filter(function (r) { return r.loc_type === 'ENG'; }), engs = uniq(rows.map(function (r) { return r.loc_id; })), sp = uniq(rows.map(function (r) { return r.spare_id; }));
  var cardsH = engs.map(function (id) {
    var mine = rows.filter(function (r) { return r.loc_id === id; }), e = DB.get('app_user', id) || {};
    return '<div class="kpi"><div class="kl">' + esc(userName(id)) + '</div><div class="krow"><div><div class="kv">' + inr(sum(mine, function (r) { return r.good; })) + '<small style="font-size:12px;color:var(--ink3);font-weight:600"> units</small></div><div class="ks">' + esc(scName(e.sc_id)) + ' · ₹ ' + inr(sum(mine, function (r) { return Math.max(0, r.val); })) + '</div></div><div class="kqty"><i>Lines</i><span>' + mine.length + '</span></div></div></div>';
  }).join('');
  var head = '<tr><th>Spare</th>' + engs.map(function (id) { return '<th class="n">' + esc(shortName(userName(id), 14)) + '</th>'; }).join('') + '<th class="n">Total</th></tr>';
  var body = sp.map(function (sid) {
    var s = DB.get('spare_master', sid) || {}, tot = 0;
    return '<tr><td><b>' + esc(s.spare_name) + '</b> <span class="hint">' + esc(s.spare_code) + '</span></td>' + engs.map(function (id) {
      var r = rows.filter(function (x) { return x.loc_id === id && x.spare_id === sid; })[0], g = r ? r.good : 0; tot += g;
      return '<td class="n" style="' + (g <= 0 ? 'color:var(--ink4)' : '') + '">' + (r ? g : '–') + '</td>';
    }).join('') + '<td class="n"><b>' + tot + '</b></td></tr>';
  }).join('');
  return {
    title: 'Engineer-wise Stock', crumb: 'Home › Stock › <b>Engineer-wise</b>', sub: 'Good stock carried by each field engineer',
    actions: '<button class="btn" onclick="engStockXl()">' + ICO.xls + ' Export Excel</button>',
    body: '<div class="kpis">' + (cardsH || '<div class="empty">No engineer stock yet</div>') + '</div><div class="card"><h3>Spare × engineer matrix <span class="sm2">good units</span></h3><div class="tscroll"><table class="dt" id="engMatrix"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div></div>'
  };
};
function engStockXl() {
  var rows = [];
  $$('#engMatrix tr').forEach(function (tr) { rows.push($$('th,td', tr).map(function (c) { var t = c.textContent.trim(); return /^\d+(\.\d+)?$/.test(t) ? +t : t; })); });
  XL.download('Engineer_wise_stock_' + today() + '.xlsx', [{ name: 'Engineer stock', rows: rows }]);
}

/* ---- stock ledger & entry ---- */
function locOptions(selected) {
  var h = '<optgroup label="Service center stores">' + DB.all('service_center').filter(function (s) { return s.is_active == 1; }).map(function (s) { return '<option value="SC:' + s.sc_id + '"' + (selected === 'SC:' + s.sc_id ? ' selected' : '') + '>' + esc(s.sc_name) + '</option>'; }).join('') + '</optgroup>';
  h += '<optgroup label="Engineers">' + engineerOpts().map(function (e) { return '<option value="ENG:' + e.v + '"' + (selected === 'ENG:' + e.v ? ' selected' : '') + '>' + esc(e.l) + '</option>'; }).join('') + '</optgroup>';
  return h;
}
defEntity({
  key: 'stocktxn', table: 'stock_txn', title: 'Stock Entry', plural: 'Stock Ledger & Entry', refLabel: function (r) { return nameOf('spare_master', r.spare_id, 'spare_code') + ' ' + r.qty + ' @ ' + locName(r.loc_type, r.loc_id); },
  rows: function () { var v = stockLocsVisible(); return DB.all('stock_txn').filter(function (t) { return v(t.loc_type, t.loc_id); }); },
  sub: function (rows) { return inr(rows.length) + ' ledger rows · Receipts, issues, transfers and returns are entered here; job card approval posts consumption automatically'; },
  perm: function () { return { add: 1, edit: 1, del: 1, imp: isHO() }; },
  canEdit: function (t) { return t.ref_type !== 'jobcard' && t.ref_type !== 'transfer'; }, canDel: function (t) { return t.ref_type !== 'jobcard'; },
  guard: function (t) {
    if (t.qty > 0) { var after = stockBal(t.spare_id, t.loc_type, t.loc_id, t.bucket) - t.qty; if (after < 0) return 'Removing this entry would make the stock at ' + esc(locName(t.loc_type, t.loc_id)) + ' negative (stock already used or moved out). Reverse the later movements first.'; }
    return null;
  },
  beforeDelete: function (t) { if (t.ref_type === 'transfer') DB.where('stock_txn', function (x) { return x.ref_type === 'transfer' && x.ref_no === t.ref_no && x.txn_id !== t.txn_id; }).forEach(function (x) { DB.del('stock_txn', x.txn_id, true); }); },
  openForm: function (row) { stockForm(row); },
  filters: [{ label: 'Type', get: function (t) { return t.txn_type; }, opts: TXN_TYPES }, { label: 'Location', get: function (t) { return locName(t.loc_type, t.loc_id); } }, { label: 'Bucket', get: function (t) { return t.bucket; }, opts: ['GOOD', 'DAMAGED'] }, { label: 'Spare', get: function (t) { return nameOf('spare_master', t.spare_id, 'spare_name'); } }],
  searchPh: 'Search spare, location, reference…', search: function (t) { return [nameOf('spare_master', t.spare_id, 'spare_name'), nameOf('spare_master', t.spare_id, 'spare_code'), locName(t.loc_type, t.loc_id), t.ref_no, t.remarks].join(' '); },
  sortI: 0, sortD: 'desc',
  cols: [
    { h: 'Date', val: function (t) { return t.txn_date + String(t.txn_id).padStart(6, '0'); }, cell: function (t) { return dmy(t.txn_date); } },
    { h: 'Spare', val: function (t) { return nameOf('spare_master', t.spare_id, 'spare_name'); }, cell: function (t) { return '<b>' + esc(nameOf('spare_master', t.spare_id, 'spare_name')) + '</b> <span class="hint">' + esc(nameOf('spare_master', t.spare_id, 'spare_code')) + '</span>'; } },
    { h: 'Location', val: function (t) { return locName(t.loc_type, t.loc_id); }, cell: function (t) { return (t.loc_type === 'SC' ? tag('Store', 'pur') : tag('Engineer', 'info')) + ' ' + esc(locName(t.loc_type, t.loc_id)); } },
    { h: 'Bucket', val: function (t) { return t.bucket; }, cell: function (t) { return t.bucket === 'GOOD' ? tag('Good', 'ok') : tag('Damaged', 'dang'); } },
    { h: 'Type', val: function (t) { return t.txn_type; } },
    { h: 'Qty', val: function (t) { return t.qty; }, cls: 'n', cell: function (t) { return '<b style="color:var(--' + (t.qty < 0 ? 'dang' : 'ok') + ')">' + (t.qty > 0 ? '+' : '') + t.qty + '</b>'; } },
    { h: 'Reference', val: function (t) { return t.ref_no || ''; }, cell: function (t) { return t.ref_type === 'jobcard' ? '<a href="#/s/jobcards">' + esc(t.ref_no) + '</a>' : esc(t.ref_no || ''); } },
    { h: 'Remarks', val: function (t) { return t.remarks || ''; }, cls: 'mu el' }
  ],
  imp: {
    cols: [
      { h: 'Date', k: 'txn_date', type: 'date', sample: '2026-10-01' },
      { h: 'Spare Code', k: 'spare_id', req: 1, lk: { t: 'spare_master', f: ['spare_code'] }, sample: 'SP-MOT-001' },
      { h: 'Location Type', k: 'loc_type', req: 1, enumv: ['SC', 'ENG'], upper: 1, sample: 'ENG', note: 'SC = service center store, ENG = engineer' },
      { h: 'Location', k: 'loc_code', req: 1, sample: 'eng.jaipur1', note: 'Service center code (SC) or engineer user name (ENG)' },
      { h: 'Bucket', k: 'bucket', enumv: ['GOOD', 'DAMAGED'], upper: 1, sample: 'GOOD' },
      { h: 'Txn Type', k: 'txn_type', enumv: TXN_TYPES, sample: 'Opening' },
      { h: 'Qty', k: 'qty', type: 'num', req: 1, sample: 5 }, { h: 'Remarks', k: 'remarks', sample: 'Opening stock' }
    ],
    check: function (o) {
      var loc = o.loc_type === 'SC' ? DB.find('service_center', function (s) { return String(s.sc_code).toLowerCase() === String(o.loc_code).toLowerCase() || String(s.sc_name).toLowerCase() === String(o.loc_code).toLowerCase(); }) : DB.find('app_user', function (u) { return u.role === 'ENGINEER' && u.username.toLowerCase() === String(o.loc_code).toLowerCase(); });
      if (!loc) return 'Location "' + o.loc_code + '" not found for type ' + o.loc_type;
      o._loc = loc; return null;
    },
    make: function (o, raw) {
      var loc = raw._loc, type = o.txn_type || 'Opening';
      return { txn_date: o.txn_date || today(), spare_id: o.spare_id, loc_type: o.loc_type, loc_id: o.loc_type === 'SC' ? loc.sc_id : loc.user_id, bucket: o.bucket || 'GOOD', txn_type: type, qty: signedQty(type, o.qty), ref_type: 'import', ref_no: Import.fileName, remarks: o.remarks || null, created_by: myName(), created_on: nowIso() };
    }
  }
});
ROUTES['k/txns'] = function () { var p = entityScreen('stocktxn'); p.crumb = 'Home › Stock › <b>Ledger</b>'; return p; };

function stockForm(row) {
  var isEdit = !!row, d = row || { txn_date: today(), txn_type: 'Receipt', bucket: 'GOOD', qty: 1 };
  var body = '<div class="frm c3"><div class="f"><label>Date <span class="rq">*</span></label><input id="sf_date" type="date" max="' + today() + '" value="' + esc(d.txn_date) + '"></div>' +
    '<div class="f"><label>Transaction type <span class="rq">*</span></label><select id="sf_type">' + TXN_TYPES.filter(function (t) { return t !== 'Consume' || isEdit; }).map(function (t) { return '<option' + (d.txn_type === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '<option value="Transfer">Transfer (location → location)</option></select></div>' +
    '<div class="f"><label>Bucket</label><select id="sf_bucket"><option' + (d.bucket === 'GOOD' ? ' selected' : '') + '>GOOD</option><option' + (d.bucket === 'DAMAGED' ? ' selected' : '') + '>DAMAGED</option></select></div>' +
    '<div class="f full"><label>Spare <span class="rq">*</span></label><select id="sf_spare"><option value="">— select —</option>' + DB.all('spare_master').map(function (s) { return '<option value="' + s.spare_id + '"' + (d.spare_id == s.spare_id ? ' selected' : '') + '>' + esc(s.spare_name + ' (' + s.spare_code + ')') + '</option>'; }).join('') + '</select></div>' +
    '<div class="f" id="sf_fromw" style="display:none"><label>From location <span class="rq">*</span></label><select id="sf_from"><option value="">— select —</option>' + locOptions('') + '</select></div>' +
    '<div class="f"><label id="sf_tolbl">Location <span class="rq">*</span></label><select id="sf_to"><option value="">— select —</option>' + locOptions(row ? row.loc_type + ':' + row.loc_id : '') + '</select></div>' +
    '<div class="f"><label>Quantity <span class="rq">*</span></label><input id="sf_qty" type="number" step="any" value="' + esc(d.txn_type === 'Adjust' ? d.qty : Math.abs(d.qty)) + '"><div class="hint" id="sf_sign"></div></div>' +
    '<div class="f full"><label>Remarks</label><input id="sf_rem" value="' + esc(d.remarks || '') + '"></div></div>';
  modal(isEdit ? 'Edit stock entry' : 'New stock entry', body, '<button class="btn" onclick="closeModal()">Cancel</button>' + (isEdit ? '<button class="btn dang-o" onclick="closeModal();deleteEntity(\'stocktxn\',DB.get(\'stock_txn\',' + row.txn_id + '))">' + ICO.trash + ' Delete</button>' : '') + '<button class="btn pri" onclick="stockSave(' + (isEdit ? row.txn_id : 'null') + ')">' + ICO.save + ' ' + (isEdit ? 'Update' : 'Save') + '</button>', 'wide sticky');
  var tp = $('#sf_type'), upd = function () {
    var t = tp.value; $('#sf_fromw').style.display = t === 'Transfer' ? '' : 'none'; $('#sf_tolbl').innerHTML = (t === 'Transfer' ? 'To location' : 'Location') + ' <span class="rq">*</span>';
    $('#sf_sign').textContent = t === 'Transfer' ? 'Reduces the source and adds to the destination' : t === 'Adjust' ? 'Enter a negative number to reduce' : (PLUS_TYPES.indexOf(t) >= 0 ? 'Adds to the location' : 'Removes from the location');
  };
  tp.addEventListener('change', upd); upd();
}
function stockSave(id) {
  var g = function (x) { return document.getElementById(x).value; }, type = g('sf_type'), spare = +g('sf_spare'), qty = parseFloat(g('sf_qty'));
  if (!g('sf_date')) return toast('Date is required', 'err'); if (g('sf_date') > today()) return toast('Date cannot be in the future', 'err');
  if (!spare) return toast('Select the spare', 'err'); if (!g('sf_to')) return toast('Select the location', 'err');
  if (isNaN(qty) || qty === 0) return toast('Enter the quantity', 'err');
  var to = g('sf_to').split(':'), base = { txn_date: g('sf_date'), spare_id: spare, bucket: g('sf_bucket'), remarks: g('sf_rem').trim() || null, created_by: myName() };
  if (type === 'Transfer') {
    if (!g('sf_from')) return toast('Select the source location', 'err');
    var fr = g('sf_from').split(':'); if (g('sf_from') === g('sf_to')) return toast('Source and destination are the same', 'err');
    var haveFr = stockBal(spare, fr[0], +fr[1], base.bucket); if (Math.abs(qty) > haveFr) return toast('Not enough stock at ' + locName(fr[0], +fr[1]) + ' — available ' + haveFr + ' (' + base.bucket + ')', 'err');
    if (qty < 0) return toast('Transfer quantity must be positive', 'err');
    var ref = 'TRF/' + today().replace(/-/g, '') + '/' + (DB.d.seq.stock_txn + 1);
    var o1 = { txn_type: 'Issue-Out', loc_type: fr[0], loc_id: +fr[1], qty: -Math.abs(qty), ref_type: 'transfer', ref_no: ref }, o2 = { txn_type: 'Transfer-In', loc_type: to[0], loc_id: +to[1], qty: Math.abs(qty), ref_type: 'transfer', ref_no: ref };
    DB.add('stock_txn', Object.assign({}, base, o1)); DB.add('stock_txn', Object.assign({}, base, o2));
    DB.save(); closeModal(); route(true); return toast('Transferred ' + Math.abs(qty) + ' — ' + locName(fr[0], +fr[1]) + ' → ' + locName(to[0], +to[1]), 'ok');
  }
  var v = Object.assign({}, base, { txn_type: type, loc_type: to[0], loc_id: +to[1], qty: signedQty(type, qty) });
  if (v.qty < 0) {   /* never let a location go below zero */
    var prev = id ? DB.get('stock_txn', id) : null, have = stockBal(spare, v.loc_type, v.loc_id, v.bucket) - (prev && prev.spare_id == spare && prev.loc_type === v.loc_type && prev.loc_id == v.loc_id && prev.bucket === v.bucket ? prev.qty : 0);
    if (have + v.qty < 0) return toast('Not enough stock at ' + locName(v.loc_type, v.loc_id) + ' — available ' + have + ' (' + v.bucket + ')', 'err');
  }
  if (id) DB.upd('stock_txn', id, v); else DB.add('stock_txn', v);
  DB.save(); closeModal(); route(true); toast('Stock entry saved', 'ok');
}

/* ---- parts consumption report ---- */
ROUTES['k/consume'] = function () {
  var rows = [], jcs = Q.jobcards(), okJ = {}; jcs.forEach(function (j) { okJ[j.jobcard_no] = j; });
  DB.where('stock_txn', function (t) { return t.txn_type === 'Consume' && okJ[t.ref_no]; }).forEach(function (t) {
    var j = okJ[t.ref_no], it = (t.jitem_id && DB.get('jobcard_item', t.jitem_id)) || DB.find('jobcard_item', function (i) { return i.jobcard_id === j.jobcard_id && i.item_type === 'Spare' && i.item_id === t.spare_id; }) || {}, s = DB.get('spare_master', t.spare_id) || {};
    rows.push({ t: t, j: j, s: s, it: it, qty: -t.qty, rate: it.rate || s.rate || 0 });
  });
  return {
    title: 'Parts Consumption', crumb: 'Home › Stock › <b>Consumption</b>', sub: 'Spares consumed on approved job cards — with warranty vs chargeable split',
    body: stripCards([{ l: 'Units consumed', v: inr(sum(rows, function (r) { return r.qty; })) }, { l: 'Value ₹', v: inr(sum(rows, function (r) { return r.qty * r.rate; })) }, { l: 'Under warranty ₹', v: inr(sum(rows.filter(function (r) { return r.it.warranty == 1; }), function (r) { return r.qty * r.rate; })), c: 'ok' }, { l: 'Chargeable ₹', v: inr(sum(rows.filter(function (r) { return r.it.warranty != 1; }), function (r) { return r.qty * r.rate; })), c: 'warn' }]) + '<div id="conGrid"></div>',
    after: function () {
      mountGrid('#conGrid', {
        title: 'Parts_consumption', rows: rows, sortI: 0, sortD: 'desc', pageSize: 50,
        filters: [{ label: 'Spare', get: function (r) { return r.s.spare_name; } }, { label: 'Engineer', get: function (r) { return userName(r.j.engineer_id); } }, { label: 'Service center', get: function (r) { return scName(r.j.sc_id); } }, { label: 'Warranty', get: function (r) { return r.it.warranty == 1 ? 'Warranty' : 'Chargeable'; } }, { label: 'Month', get: function (r) { return ymKey(r.t.txn_date); } }],
        search: function (r) { return [r.j.jobcard_no, r.s.spare_name, r.s.spare_code, nameOf('complaint', r.j.complaint_id, 'customer_name')].join(' '); },
        cols: [
          { h: 'Date', val: function (r) { return r.t.txn_date; }, cell: function (r) { return dmy(r.t.txn_date); } },
          { h: 'Job card', val: function (r) { return r.j.jobcard_no; }, cell: function (r) { return '<a href="#/s/jobcard/' + r.j.jobcard_id + '">' + esc(r.j.jobcard_no) + '</a>'; } },
          { h: 'Customer', val: function (r) { return nameOf('complaint', r.j.complaint_id, 'customer_name'); } },
          { h: 'Spare', val: function (r) { return r.s.spare_name; } }, { h: 'Component serial', val: function (r) { return r.it.serial_no || ''; }, cls: 'mono' },
          { h: 'Consumed from', val: function (r) { return locName(r.t.loc_type, r.t.loc_id); } }, { h: 'Qty', val: function (r) { return r.qty; }, cls: 'n' },
          { h: 'Rate ₹', val: function (r) { return r.rate; }, cls: 'n', cell: function (r) { return inr(r.rate, 2); } }, { h: 'Value ₹', val: function (r) { return r.qty * r.rate; }, cls: 'n', cell: function (r) { return inr(r.qty * r.rate, 2); } },
          { h: 'Basis', val: function (r) { return r.it.warranty == 1 ? 'Warranty' : 'Chargeable'; }, cell: function (r) { return r.it.warranty == 1 ? tag('Warranty', 'ok') : tag('Chargeable', 'warn'); } }
        ],
        totals: function (data, i) { return i === 6 ? '<b>' + inr(sum(data, function (r) { return r.qty; })) + '</b>' : i === 8 ? '<b>' + inr(sum(data, function (r) { return r.qty * r.rate; }), 2) + '</b>' : i === 0 ? '<b>Total</b>' : null; }
      });
    }
  };
};

/* ============================================================
   REPLACEMENT / RETURN PUMP  (service side)
   ============================================================ */
var REPL_TYPES = ['Invoice', 'Delivery Challan', 'Credit Note'], RP = { row: null, lines: [] };
function replLines(r) { return DB.where('replacement_item', function (i) { return i.repl_id === r.repl_id; }).sort(function (x, y) { return x.line_no - y.line_no; }); }
function replTransferred(it) { var w = it.new_serial_no ? wBySerial(it.new_serial_no) : null; return !!(w && w.replaced_from_serial === it.old_serial_no); }
/** move the balance warranty of old serial to new serial (no header created) */
function warrantyTransfer(oldSn, newSn, note) {
  var ow = wBySerial(oldSn), ns = serialCheck(newSn);
  if (!ow) return 'Old serial ' + oldSn + ' is not registered';
  var s = wStatus(ow); if (s.k !== 'active' && s.k !== 'expiring') return 'Old serial ' + oldSn + ' is not in warranty (' + s.txt.toLowerCase() + ')';
  if (ns.lvl !== 'ok') return ns.msg; if (ns.st.category !== ow.category) return 'New serial must be a ' + catLabel(ow.category).toLowerCase();
  var days = daysBetween(today(), ow.end_date);
  ow.status = 'Replaced'; var os = DB.get('sticker', ow.sticker_id); if (os) os.status = 'Replaced';
  DB.add('warranty', { warranty_no: DB.nextNo('WARRANTY', 'WR/{fy}/{n:5}'), install_id: ow.install_id, serial_no: ns.st.serial_no, sticker_id: ns.st.sticker_id, category: ow.category, model_id: ns.st.model_id, customer_id: ow.customer_id, dealer_id: ow.dealer_id, start_date: today(), warranty_months: Math.max(1, Math.round(days / 30.44)), extended_months: 0, end_date: ow.end_date, status: 'Active', replaced_from_serial: ow.serial_no, registered_by: 'HO', registered_on: nowIso(), whatsapp_sent: 1, remarks: note || ('Balance warranty carried from ' + ow.serial_no) }, true);
  ns.st.status = 'Registered';
  return days;
}
function warrantyUntransfer(it) {
  var ow = wBySerial(it.old_serial_no), nw = wBySerial(it.new_serial_no);
  if (nw && nw.replaced_from_serial === it.old_serial_no) { var ns = DB.get('sticker', nw.sticker_id); if (ns) ns.status = 'Printed'; DB.del('warranty', nw.warranty_id, true); if (ow) { ow.status = 'Active'; var os = DB.get('sticker', ow.sticker_id); if (os) os.status = 'Registered'; } }
}
defEntity({
  key: 'servrepl', table: 'replacement', title: 'Replacement', plural: 'Replacement / Return Pump', refLabel: function (r) { return r.repl_no; },
  rows: function () { return Q.repl(); },
  sub: function (rows) { return inr(rows.length) + ' replacements · net value ₹ ' + inr(sum(rows, function (r) { return sum(replLines(r), function (i) { return i.net_value; }); })) + ' · credit notes ₹ ' + inr(sum(rows, function (r) { return r.cn_amount; })); },
  perm: function () { return { add: 1, edit: 1, del: 1, imp: isHO() }; },
  openForm: function (row) { replForm(row); },
  cascade: [{ table: 'replacement_item', fk: 'repl_id', label: 'lines' }],
  beforeDelete: function (r) { replLines(r).forEach(function (i) { warrantyUntransfer(i); }); },
  guard: function (r) { var bad = replLines(r).filter(function (i) { var nw = i.new_serial_no && wBySerial(i.new_serial_no); return nw && nw.replaced_from_serial === i.old_serial_no && DB.where('complaint_item', function (ci) { return ci.serial_no === nw.serial_no; }).length; }); return bad.length ? 'the new serial ' + bad[0].new_serial_no + ' already has service calls, so the replacement cannot be undone.' : null; },
  filters: [{ label: 'Source', get: function (r) { return r.source; }, opts: ['Dealer', 'Service'] }, { label: 'Type', get: function (r) { return r.replacement_type || ''; }, opts: REPL_TYPES }, { label: 'Status', get: function (r) { return r.status; }, opts: ['Open', 'Received', 'Closed', 'Cancelled'] }, { label: 'Dealer', get: function (r) { return dealerName(r.dealer_id) || '—'; } }],
  searchPh: 'Search replacement no, serial, dealer, call…', search: function (r) { return [r.repl_no, dealerName(r.dealer_id), nameOf('complaint', r.complaint_id, 'complaint_no'), r.lr_no, r.cn_no, replLines(r).map(function (i) { return i.old_serial_no + ' ' + i.new_serial_no; }).join(' ')].join(' '); },
  sortI: 1, sortD: 'desc',
  cols: [
    { h: 'Replacement No', val: function (r) { return r.repl_no; }, cell: function (r) { return '<b>' + esc(r.repl_no) + '</b>'; } },
    { h: 'Date', val: function (r) { return r.repl_date; }, cell: function (r) { return dmy(r.repl_date); } },
    { h: 'Source', val: function (r) { return r.source; }, cell: function (r) { return r.source === 'Service' ? tag('Service', 'info') : tag('Dealer', 'pur'); } },
    { h: 'Call', val: function (r) { return nameOf('complaint', r.complaint_id, 'complaint_no'); }, cell: function (r) { return r.complaint_id ? '<a href="#/s/call/' + r.complaint_id + '">' + esc(nameOf('complaint', r.complaint_id, 'complaint_no')) + '</a>' : '—'; } },
    { h: 'Dealer', val: function (r) { return dealerName(r.dealer_id); } },
    { h: 'Old → New serial', val: function (r) { return replLines(r).map(function (i) { return i.old_serial_no + ' → ' + i.new_serial_no; }).join(', '); }, cell: function (r) { return replLines(r).map(function (i) { return '<span class="mono" style="font-size:11.5px">' + esc(i.old_serial_no || '—') + ' → <b>' + esc(i.new_serial_no || '—') + '</b></span>'; }).join('<br>'); } },
    { h: 'Type', val: function (r) { return r.replacement_type || ''; } },
    { h: 'Net value ₹', val: function (r) { return sum(replLines(r), function (i) { return i.net_value; }); }, cls: 'n', cell: function (r) { return inr(sum(replLines(r), function (i) { return i.net_value; }), 2); } },
    { h: 'CN', val: function (r) { return r.cn_no || ''; }, cell: function (r) { return r.cn_no ? esc(r.cn_no) + ' · ₹ ' + inr(r.cn_amount, 2) : '—'; } },
    { h: 'Status', val: function (r) { return r.status; }, cell: function (r) { return statusTag(r.status); } }
  ],
  imp: {
    key: 'repl_no',
    cols: [
      { h: 'Replacement Date', k: 'repl_date', type: 'date', req: 1, sample: '2026-10-30' },
      { h: 'Dealer Code', k: 'dealer_id', lk: { t: 'dealer', f: ['dealer_code', 'firm_name'] }, sample: '1001' },
      { h: 'Call No', k: 'complaint_id', lk: { t: 'complaint', f: ['complaint_no'] }, sample: '' },
      { h: 'Old Serial No', k: 'old_serial_no', req: 1, sample: '2610PU20001' }, { h: 'New Serial No', k: 'new_serial_no', req: 1, sample: '2610PU20009' },
      { h: 'Replacement Type', k: 'replacement_type', enumv: REPL_TYPES, sample: 'Invoice' }, { h: 'Net Value', k: 'net_value', type: 'num', sample: 0 }, { h: 'Reason', k: 'reason', sample: 'Pump jammed' }
    ],
    check: function (o) {
      var ow = wBySerial(o.old_serial_no); if (!ow) return 'Old serial ' + o.old_serial_no + ' is not registered';
      var s = wStatus(ow); if (s.k !== 'active' && s.k !== 'expiring') return 'Old serial is not in warranty (' + s.txt.toLowerCase() + ')';
      var ns = serialCheck(o.new_serial_no); if (ns.lvl !== 'ok') return 'New serial: ' + ns.msg;
      if (ns.st.category !== ow.category) return 'New serial must be a ' + catLabel(ow.category).toLowerCase(); return null;
    },
    make: function (o) {
      var ow = wBySerial(o.old_serial_no), ns = stickerBySerial(o.new_serial_no), days = warrantyTransfer(o.old_serial_no, o.new_serial_no);
      var h = { repl_no: DB.nextNo('REPL', 'REP/{n}/{fy}'), repl_date: o.repl_date, source: o.complaint_id ? 'Service' : 'Dealer', complaint_id: o.complaint_id || null, dealer_id: o.dealer_id || ow.dealer_id || null, voucher_type: 'With Serial No', receipt_date: o.repl_date, replacement_type: o.replacement_type || 'Invoice', make_sales_invoice: 0, no_of_articles: 1, reason: o.reason || null, status: 'Closed', cn_no: null, cn_amount: o.replacement_type === 'Credit Note' ? (o.net_value || 0) : null, created_by: myName(), created_on: nowIso() };
      h._line = { category: ow.category, invoice_item: modelName(ns.model_id), received_item: modelName(ow.model_id), old_serial_no: ow.serial_no, new_serial_no: ns.serial_no, qty: 1, net_value: o.net_value || 0, location: 'Greater Noida HO', warranty_days_left: days, charges: 0 };
      return h;
    },
    after: function (made) { made.forEach(function (h) { var l = h._line; delete h._line; l.repl_id = h.repl_id; l.line_no = 1; DB.add('replacement_item', l, true); }); }
  }
});
ROUTES['s/replacements'] = function () { var p = entityScreen('servrepl'); p.crumb = 'Home › Service › <b>Replacement / Return Pump</b>'; return p; };

function replForm(row, pre) {
  pre = pre || {};
  var isEdit = !!row, c = row ? DB.get('complaint', row.complaint_id) : (pre.call ? DB.get('complaint', pre.call) : null);
  RP = { row: row, lines: [] };
  if (row) replLines(row).forEach(function (i) { RP.lines.push({ cat: i.category, old: i.old_serial_no || '', nw: i.new_serial_no || '', qty: i.qty, val: i.net_value || 0, loc: i.location || '', chg: i.charges || 0, invoice_item: i.invoice_item, received_item: i.received_item, days: i.warranty_days_left, done: replTransferred(i), id: i.ritem_id }); });
  else {
    var first = c ? callItems(c).filter(function (i) { return i.serial_no; })[0] : null;
    RP.lines.push({ cat: first ? first.category : 'PUMP', old: first ? first.serial_no : '', nw: '', qty: 1, val: 0, loc: 'Greater Noida HO', chg: 0, done: false });
  }
  var d = row || { repl_date: today(), source: c ? 'Service' : 'Dealer', voucher_type: 'With Serial No', replacement_type: 'Invoice', receipt_date: today(), status: 'Open', dealer_id: c ? c.dealer_id : '' };
  var calls = Q.complaints().filter(function (x) { return callOpen(x) || (row && x.complaint_id === row.complaint_id); });
  var body = '<div class="sec-h">1 · Replacement header</div><div class="frm c3">' +
    '<div class="f"><label>Replacement date <span class="rq">*</span></label><input id="rf_date" type="date" max="' + today() + '" value="' + esc(d.repl_date) + '"></div>' +
    '<div class="f"><label>Source</label><select id="rf_src"><option' + (d.source === 'Dealer' ? ' selected' : '') + '>Dealer</option><option' + (d.source === 'Service' ? ' selected' : '') + '>Service</option></select></div>' +
    '<div class="f"><label>Status</label><select id="rf_status">' + ['Open', 'Received', 'Closed', 'Cancelled'].map(function (s) { return '<option' + (d.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' +
    '<div class="f"><label>Service call</label><select id="rf_call"><option value="">— none —</option>' + calls.map(function (x) { return '<option value="' + x.complaint_id + '"' + (c && c.complaint_id === x.complaint_id ? ' selected' : '') + '>' + esc(x.complaint_no + ' — ' + x.customer_name) + '</option>'; }).join('') + '</select></div>' +
    '<div class="f"><label>Dealer</label><select id="rf_dealer"><option value="">— none —</option>' + DB.all('dealer').filter(function (x) { return x.status === 'Approved'; }).map(function (x) { return '<option value="' + x.dealer_id + '"' + (d.dealer_id == x.dealer_id ? ' selected' : '') + '>' + esc(x.firm_name) + '</option>'; }).join('') + '</select></div>' +
    '<div class="f"><label>Voucher type</label><select id="rf_vt"><option' + (d.voucher_type === 'With Serial No' ? ' selected' : '') + '>With Serial No</option><option' + (d.voucher_type === 'Without Serial No' ? ' selected' : '') + '>Without Serial No</option></select></div>' +
    '<div class="f"><label>Dealer invoice no</label><input id="rf_inv" value="' + esc(d.dealer_invoice_no || '') + '"></div><div class="f"><label>Dealer invoice date</label><input id="rf_invd" type="date" value="' + esc(d.dealer_invoice_date || '') + '"></div>' +
    '<div class="f"><label>Receipt date</label><input id="rf_recd" type="date" value="' + esc(d.receipt_date || '') + '"></div>' +
    '<div class="f"><label>Transporter</label><input id="rf_tr" value="' + esc(d.transporter || '') + '"></div><div class="f"><label>LR no</label><input id="rf_lr" value="' + esc(d.lr_no || '') + '"></div><div class="f"><label>LR date</label><input id="rf_lrd" type="date" value="' + esc(d.lr_date || '') + '"></div>' +
    '<div class="f"><label>Replacement type</label><select id="rf_type">' + REPL_TYPES.map(function (s) { return '<option' + (d.replacement_type === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' +
    '<div class="f chk"><label class="cb"><input type="checkbox" id="rf_inv_chk"' + (d.make_sales_invoice == 1 ? ' checked' : '') + '> Make sales invoice</label></div>' +
    '<div class="f"><label>Credit note no</label><input id="rf_cn" value="' + esc(d.cn_no || '') + '"></div><div class="f"><label>Credit note amount ₹</label><input id="rf_cna" type="number" step="any" value="' + esc(d.cn_amount == null ? '' : d.cn_amount) + '"><div class="hint">Blank = total of net values when type is Credit Note</div></div>' +
    '<div class="f full"><label>Reason</label><input id="rf_reason" value="' + esc(d.reason || '') + '"></div></div>' +
    '<div class="sec-h">2 · Pumps / components <span class="sm2">old (faulty) serial → new serial. In-warranty balance moves to the new serial automatically.</span></div><div id="rf_lines"></div>' +
    '<button class="btn sm" style="margin-top:6px" onclick="rpAdd()">' + ICO.plus + ' Add line</button>';
  modal(isEdit ? 'Edit replacement — ' + esc(row.repl_no) : 'New replacement / return pump', body,
    '<button class="btn" onclick="closeModal()">Cancel</button>' + (isEdit ? '<button class="btn dang-o" onclick="closeModal();deleteEntity(\'servrepl\',DB.get(\'replacement\',' + row.repl_id + '))">' + ICO.trash + ' Delete</button>' : '') + '<button class="btn pri" onclick="rpSave()">' + ICO.save + ' ' + (isEdit ? 'Update' : 'Save replacement') + '</button>', 'wide sticky');
  $('#rf_call').addEventListener('change', function () { var cc = DB.get('complaint', this.value); if (cc && cc.dealer_id) $('#rf_dealer').value = cc.dealer_id; if (cc) $('#rf_src').value = 'Service'; });
  rpPaint();
}
function rpAdd() { RP.lines.push({ cat: 'PUMP', old: '', nw: '', qty: 1, val: 0, loc: 'Greater Noida HO', chg: 0, done: false }); rpPaint(); }
function rpPaint() {
  var oldL = DB.all('warranty').filter(function (w) { var s = wStatus(w); return s.k === 'active' || s.k === 'expiring'; }), newL = DB.all('sticker').filter(function (s) { return s.status === 'Generated' || s.status === 'Printed'; }).slice(0, 250);
  var h = '<datalist id="dl_rp_old">' + oldL.slice(0, 300).map(function (w) { return '<option value="' + esc(w.serial_no) + '">' + esc(catLabel(w.category) + ' · ' + custName(w.customer_id)) + '</option>'; }).join('') + '</datalist><datalist id="dl_rp_new">' + newL.map(function (s) { return '<option value="' + esc(s.serial_no) + '">' + esc(catLabel(s.category) + ' · ' + modelName(s.model_id)) + '</option>'; }).join('') + '</datalist>' +
    '<table class="dt"><thead><tr><th style="width:110px">Component</th><th style="width:170px">Old serial (faulty)</th><th style="width:170px">New serial</th><th>Check</th><th class="n" style="width:56px">Qty</th><th class="n" style="width:100px">Net value ₹</th><th style="width:130px">Location</th><th style="width:34px"></th></tr></thead><tbody>';
  RP.lines.forEach(function (l, i) {
    h += '<tr><td><select data-i="' + i + '" data-f="cat"' + (l.done ? ' disabled' : '') + '>' + CAT_OPTS.map(function (o) { return '<option value="' + o.v + '"' + (l.cat === o.v ? ' selected' : '') + '>' + o.l + '</option>'; }).join('') + '</select></td>' +
      '<td><input class="mono" list="dl_rp_old" data-i="' + i + '" data-f="old" value="' + esc(l.old) + '"' + (l.done ? ' readonly' : '') + ' autocomplete="off"></td><td><input class="mono" list="dl_rp_new" data-i="' + i + '" data-f="nw" value="' + esc(l.nw) + '"' + (l.done ? ' readonly' : '') + ' autocomplete="off"></td>' +
      '<td id="rpchk' + i + '" style="font-size:11.5px"></td><td class="n"><input type="number" min="1" style="width:48px" data-i="' + i + '" data-f="qty" value="' + esc(l.qty) + '"></td><td class="n"><input type="number" min="0" step="any" style="width:90px;text-align:right" data-i="' + i + '" data-f="val" value="' + esc(l.val) + '"></td>' +
      '<td><input data-i="' + i + '" data-f="loc" value="' + esc(l.loc) + '"></td><td><button class="ract del" onclick="RP.lines.splice(' + i + ',1);if(!RP.lines.length)rpAdd();else rpPaint()">' + ICO.trash + '</button></td></tr>';
  });
  $('#rf_lines').innerHTML = h + '</tbody></table>';
  $$('#rf_lines [data-f]').forEach(function (e) { var ev = e.tagName === 'SELECT' ? 'change' : 'input'; e.addEventListener(ev, function () { var i = +this.dataset.i; RP.lines[i][this.dataset.f] = this.value; rpCheck(i); }); });
  RP.lines.forEach(function (l, i) { rpCheck(i); });
}
function rpCheck(i) {
  var l = RP.lines[i], box = document.getElementById('rpchk' + i); if (!box) return;
  if (l.done) { box.innerHTML = '<span class="tag ok">Warranty transferred</span>' + (l.days != null ? ' <span class="hint">' + l.days + ' d carried</span>' : ''); return; }
  var m = '', ow = l.old ? wBySerial(l.old) : null, ns = l.nw ? serialCheck(l.nw) : null, ok = true;
  if (l.old) {
    if (!stickerBySerial(l.old)) { m += '<div style="color:var(--dang)">✗ old serial not in register</div>'; ok = false; }
    else if (!ow) { m += '<div style="color:var(--warn)">• old serial not registered (no warranty to carry)</div>'; ok = false; }
    else { var s = wStatus(ow); if (s.k === 'active' || s.k === 'expiring') m += '<div style="color:var(--ok)">✓ in warranty · ' + s.days + ' d balance · ' + esc(custName(ow.customer_id)) + '</div>'; else { m += '<div style="color:var(--dang)">✗ warranty ' + s.txt.toLowerCase() + '</div>'; ok = false; } }
  } else ok = false;
  if (l.nw) {
    if (ns.lvl !== 'ok') { m += '<div style="color:var(--dang)">✗ ' + esc(ns.msg) + '</div>'; ok = false; }
    else if (ow && ns.st.category !== ow.category) { m += '<div style="color:var(--dang)">✗ new serial is a ' + esc(catLabel(ns.st.category).toLowerCase()) + '</div>'; ok = false; }
    else m += '<div style="color:var(--ok)">✓ new serial ' + esc(ns.m ? ns.m.model_name : '') + ' available</div>';
  } else ok = false;
  l.canTransfer = ok; box.innerHTML = m;
}
function rpSave() {
  var g = function (x) { var e = document.getElementById(x); return e ? e.value.trim() : ''; }, row = RP.row;
  if (!g('rf_date')) return toast('Replacement date is required', 'err'); if (g('rf_date') > today()) return toast('Date cannot be in the future', 'err');
  var vwt = g('rf_vt') === 'With Serial No';
  /* "Without Serial No" vouchers carry quantity + value only, so lines with no serial are valid there */
  var lines = RP.lines.filter(function (l) { return vwt ? (l.old || l.nw) : true; });
  if (!lines.length) return toast('Add at least one pump / component line', 'err');
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i]; if (!(+l.qty >= 1)) return toast('Line ' + (i + 1) + ': quantity must be at least 1', 'err');
    if (vwt && (!l.old || !l.nw)) return toast('Line ' + (i + 1) + ': both serial numbers are required for “With Serial No”', 'err');
    if (l.old && l.old === l.nw) return toast('Line ' + (i + 1) + ': old and new serial are the same', 'err');
    if (l.old && !stickerBySerial(l.old)) return toast('Line ' + (i + 1) + ': old serial is not in the sticker register', 'err');
    if (l.nw && lines.some(function (o, j) { return j !== i && o.nw === l.nw; })) return toast('Line ' + (i + 1) + ': new serial ' + l.nw + ' is used on another line', 'err');
    if (!(+l.val >= 0) || !(+l.chg >= 0)) return toast('Line ' + (i + 1) + ': value cannot be negative', 'err');
    if (l.nw && !l.done && serialCheck(l.nw).lvl !== 'ok') return toast('Line ' + (i + 1) + ': ' + serialCheck(l.nw).msg, 'err');
  }
  var typ = g('rf_type'), total = sum(lines, function (l) { return +l.val || 0; });
  var h = { repl_date: g('rf_date'), source: g('rf_src'), complaint_id: g('rf_call') ? +g('rf_call') : null, dealer_id: g('rf_dealer') ? +g('rf_dealer') : null, voucher_type: g('rf_vt'), dealer_invoice_no: g('rf_inv') || null, dealer_invoice_date: g('rf_invd') || null, receipt_date: g('rf_recd') || null, transporter: g('rf_tr') || null, lr_no: g('rf_lr') || null, lr_date: g('rf_lrd') || null, replacement_type: typ, make_sales_invoice: $('#rf_inv_chk').checked ? 1 : 0, no_of_articles: lines.length, reason: g('rf_reason') || null, status: g('rf_status'), cn_no: g('rf_cn') || null, cn_amount: g('rf_cna') !== '' ? +g('rf_cna') : (typ === 'Credit Note' ? total : null) };
  var rep;
  if (row) { DB.upd('replacement', row.repl_id, h); rep = row; }
  else { h.repl_no = DB.nextNo('REPL', 'REP/{n}/{fy}'); h.created_by = myName(); rep = DB.add('replacement', h); }
  var moved = 0, errs = [];
  /* rebuild lines, keeping the transfer state of lines already done */
  replLines(rep).forEach(function (it) { var keep = lines.filter(function (l) { return l.id === it.ritem_id; })[0]; if (!keep) { warrantyUntransfer(it); } DB.del('replacement_item', it.ritem_id, true); });
  lines.forEach(function (l, n) {
    var oldM = l.old && wBySerial(l.old) ? modelName(wBySerial(l.old).model_id) : (l.old && stickerBySerial(l.old) ? modelName(stickerBySerial(l.old).model_id) : ''), newM = l.nw && stickerBySerial(l.nw) ? modelName(stickerBySerial(l.nw).model_id) : (l.invoice_item || catLabel(l.cat)), days = l.days;
    if (!oldM) oldM = l.received_item || catLabel(l.cat);
    if (!l.done && l.canTransfer) { var r = warrantyTransfer(l.old, l.nw); if (typeof r === 'number') { days = r; moved++; l.done = true; } else errs.push(r); }
    else if (!l.done && l.old && wBySerial(l.old)) days = Math.max(0, daysBetween(today(), wBySerial(l.old).end_date));
    DB.add('replacement_item', { repl_id: rep.repl_id, line_no: n + 1, category: l.cat, invoice_item: newM, received_item: oldM, old_serial_no: l.old || null, new_serial_no: l.nw || null, qty: +l.qty, net_value: +l.val || 0, location: l.loc || null, warranty_days_left: days != null ? days : null, charges: +l.chg || 0 }, true);
  });
  if (lines.every(function (l) { return l.done; }) && !row && rep.status === 'Open') rep.status = 'Closed';
  if (moved) { var cu = lines.filter(function (l) { return l.done; })[0], w0 = cu && wBySerial(cu.nw); if (w0) { var cust = DB.get('customer', w0.customer_id); if (cust) notify({ channel: 'WhatsApp', to: cust.mobile, tpl: 'REPLACEMENT', msg: MSG.replacement(rep, DB.find('replacement_item', function (x) { return x.repl_id === rep.repl_id && x.new_serial_no === cu.nw; })), refType: 'replacement', refNo: rep.repl_no }); } }
  DB.log(row ? 'Modified' : 'Created', 'replacement', rep.repl_no, moved + ' warranty transfer(s)');
  DB.save(); closeModal(); route(true); toast('Replacement ' + rep.repl_no + ' saved' + (moved ? ' — balance warranty moved to ' + moved + ' new serial(s)' : '') + (errs.length ? ' · not transferred: ' + errs[0] : ''), errs.length ? 'err' : 'ok');
}

/* ============================================================
   REPORTS
   ============================================================ */
function repFilterBar(q, base, withSc) {
  return '<div class="card"><div class="cbody" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end"><div class="f"><label style="font-size:10.5px;font-weight:700;color:var(--ink3)">FROM</label><br><input type="date" id="rp_from" value="' + esc(q.from || '') + '"></div>' +
    '<div class="f"><label style="font-size:10.5px;font-weight:700;color:var(--ink3)">TO</label><br><input type="date" id="rp_to" value="' + esc(q.to || '') + '"></div>' +
    '<div class="f"><label style="font-size:10.5px;font-weight:700;color:var(--ink3)">STATE</label><br><select id="rp_state"><option value="">All</option>' + stateOpts().map(function (s) { return '<option value="' + s.v + '"' + (q.state === s.v ? ' selected' : '') + '>' + esc(s.l) + '</option>'; }).join('') + '</select></div>' +
    (withSc ? '<div class="f"><label style="font-size:10.5px;font-weight:700;color:var(--ink3)">SERVICE CENTER</label><br><select id="rp_sc"><option value="">All</option>' + DB.all('service_center').map(function (s) { return '<option value="' + s.sc_id + '"' + (q.sc == s.sc_id ? ' selected' : '') + '>' + esc(s.sc_name) + '</option>'; }).join('') + '</select></div>' : '') +
    '<button class="btn pri" onclick="repApply(\'' + base + '\')">Apply</button><button class="btn" onclick="location.hash=\'' + base + '\'">Clear</button></div></div>';
}
function repApply(base) {
  var p = []; [['from', 'rp_from'], ['to', 'rp_to'], ['state', 'rp_state'], ['sc', 'rp_sc']].forEach(function (x) { var e = document.getElementById(x[1]); if (e && e.value) p.push(x[0] + '=' + encodeURIComponent(e.value)); });
  location.hash = base + (p.length ? '?' + p.join('&') : '');
}
function repCalls(q) { return Q.complaints().filter(function (c) { return (!q.from || c.call_date >= q.from) && (!q.to || c.call_date <= q.to) && (!q.state || c.state_code === q.state) && (!q.sc || c.sc_id == q.sc); }); }
function matrixTable(id, head, rows) {
  return '<div class="tscroll"><table class="dt" id="' + id + '"><thead><tr>' + head.map(function (h, i) { return '<th class="' + (i ? 'n' : '') + '">' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
    rows.map(function (r, ri) { var last = r.total; return '<tr' + (last ? ' style="background:var(--bg);font-weight:700"' : '') + '>' + r.cells.map(function (c, i) { return '<td class="' + (i ? 'n' : '') + '">' + (c === 0 && i ? '<span style="color:var(--ink4)">–</span>' : esc(c)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
}
function matrixXl(id, name) {
  var rows = []; $$('#' + id + ' tr').forEach(function (tr) { rows.push($$('th,td', tr).map(function (c) { var t = c.textContent.trim().replace(/^–$/, '0'); return /^-?\d+(\.\d+)?$/.test(t) ? +t : t; })); });
  XL.download(name + '_' + today() + '.xlsx', [{ name: name.slice(0, 28), rows: rows }]);
}
ROUTES['s/summary'] = function (a, q) {
  var calls = repCalls(q), types = DB.all('call_type'), engs = engineerOpts(), sts = CALL_STATUS;
  var head1 = ['Call type'].concat(sts, ['Total', 'Overdue']);
  var rows1 = types.map(function (t) {
    var cs = calls.filter(function (c) { return c.calltype_id === t.calltype_id; }); return { cells: [t.call_type + ' (' + t.valid_days + 'd)'].concat(sts.map(function (s) { return cs.filter(function (c) { return c.status === s; }).length; }), [cs.length, cs.filter(callOverdue).length]) };
  });
  rows1.push({ total: 1, cells: ['Total'].concat(sts.map(function (s) { return calls.filter(function (c) { return c.status === s; }).length; }), [calls.length, calls.filter(callOverdue).length]) });
  var head2 = ['Engineer'].concat(sts, ['Total', 'Overdue', 'Avg days to resolve']);
  var emps = engs.map(function (e) { return { id: e.v, l: e.l }; }).concat([{ id: null, l: 'Unassigned' }]);
  var rows2 = emps.map(function (e) {
    var cs = calls.filter(function (c) { return (c.engineer_id || null) === e.id; }), done = cs.filter(function (c) { return c.closed_on && c.status !== 'Cancelled'; });
    return { cells: [e.l].concat(sts.map(function (s) { return cs.filter(function (c) { return c.status === s; }).length; }), [cs.length, cs.filter(callOverdue).length, done.length ? Math.round(sum(done, function (c) { return daysBetween(c.call_date, c.closed_on); }) / done.length * 10) / 10 : 0]) };
  }).filter(function (r) { return r.cells[sts.length + 1] > 0; });
  var rows3 = DB.all('service_center').map(function (s) { var cs = calls.filter(function (c) { return c.sc_id === s.sc_id; }); return { cells: [s.sc_name].concat(sts.map(function (st) { return cs.filter(function (c) { return c.status === st; }).length; }), [cs.length, cs.filter(callOverdue).length]) }; }).filter(function (r) { return r.cells[sts.length + 1] > 0; });
  return {
    title: 'Call Summary Report', crumb: 'Home › Service › <b>Call Summary</b>', sub: inr(calls.length) + ' calls in the selection · status-wise by call type, employee and service center',
    body: repFilterBar(q, '#/s/summary', true) +
      '<div class="card"><h3>Status-wise · by call type<span style="margin-left:auto"><button class="btn sm" onclick="matrixXl(\'mx1\',\'Call_summary_by_type\')">' + ICO.xls + ' Export Excel</button></span></h3>' + matrixTable('mx1', head1, rows1) + '</div>' +
      '<div class="card"><h3>Employee-wise (engineer)<span style="margin-left:auto"><button class="btn sm" onclick="matrixXl(\'mx2\',\'Call_summary_by_engineer\')">' + ICO.xls + ' Export Excel</button></span></h3>' + matrixTable('mx2', head2, rows2) + '</div>' +
      '<div class="card"><h3>Service center-wise<span style="margin-left:auto"><button class="btn sm" onclick="matrixXl(\'mx3\',\'Call_summary_by_center\')">' + ICO.xls + ' Export Excel</button></span></h3>' + matrixTable('mx3', ['Service center'].concat(sts, ['Total', 'Overdue']), rows3) + '</div>'
  };
};

ROUTES['s/jcreport'] = function (a, q) {
  var rows = [];
  Q.jobcards().forEach(function (j) {
    var c = DB.get('complaint', j.complaint_id) || {};
    var its = DB.where('jobcard_item', function (i) { return i.jobcard_id === j.jobcard_id; });
    its.forEach(function (i) { rows.push({ j: j, c: c, i: i }); });
    if (!its.length) rows.push({ j: j, c: c, i: { particulars: '(no lines)', qty: 0, rate: 0, amount: 0, item_type: '' } });
  });
  return {
    title: 'Job Card Detail Report', crumb: 'Home › Service › <b>Job Card Report</b>', sub: 'Every spare and labour line with component serial tracking — filter and export to Excel',
    body: stripCards([{ l: 'Lines', v: inr(rows.length) }, { l: 'Spares ₹', v: inr(sum(rows.filter(function (r) { return r.i.item_type === 'Spare'; }), function (r) { return r.i.amount; })) }, { l: 'Labour ₹', v: inr(sum(rows.filter(function (r) { return r.i.item_type === 'Labour'; }), function (r) { return r.i.amount; })) },
      { l: 'Under warranty ₹', v: inr(sum(rows.filter(function (r) { return r.i.warranty == 1; }), function (r) { return r.i.amount; })), c: 'ok' }]) + '<div id="jcrGrid"></div>',
    after: function () {
      mountGrid('#jcrGrid', {
        title: 'Job_card_detail', rows: rows, sortI: 1, sortD: 'desc', pageSize: 50,
        filters: [{ label: 'Job card status', get: function (r) { return r.j.status; } }, { label: 'Item type', get: function (r) { return r.i.item_type; }, opts: ['Spare', 'Labour'] }, { label: 'Basis', get: function (r) { return r.i.warranty == 1 ? 'Warranty' : 'Chargeable'; } }, { label: 'Engineer', get: function (r) { return userName(r.j.engineer_id); } }, { label: 'Service center', get: function (r) { return scName(r.j.sc_id); } }, { label: 'Component', get: function (r) { return r.i.category || ''; } }],
        search: function (r) { return [r.j.jobcard_no, r.c.complaint_no, r.c.customer_name, r.i.particulars, r.i.serial_no, r.i.item_code].join(' '); },
        cols: [
          { h: 'Job card', val: function (r) { return r.j.jobcard_no; }, cell: function (r) { return '<a href="#/s/jobcard/' + r.j.jobcard_id + '"><b>' + esc(r.j.jobcard_no) + '</b></a>'; } },
          { h: 'Date', val: function (r) { return r.j.jobcard_date; }, cell: function (r) { return dmy(r.j.jobcard_date); } }, { h: 'Call', val: function (r) { return r.c.complaint_no || ''; } }, { h: 'Customer', val: function (r) { return r.c.customer_name || ''; } },
          { h: 'Type', val: function (r) { return r.i.item_type || ''; } }, { h: 'Code', val: function (r) { return r.i.item_code || ''; }, cls: 'mono' }, { h: 'Particulars', val: function (r) { return r.i.particulars; } },
          { h: 'Component serial', val: function (r) { return r.i.serial_no || ''; }, cls: 'mono' }, { h: 'Qty', val: function (r) { return r.i.qty || 0; }, cls: 'n' },
          { h: 'Rate ₹', val: function (r) { return r.i.rate || 0; }, cls: 'n', cell: function (r) { return inr(r.i.rate, 2); } }, { h: 'Amount ₹', val: function (r) { return r.i.amount || 0; }, cls: 'n', cell: function (r) { return inr(r.i.amount, 2); } },
          { h: 'Basis', val: function (r) { return r.i.warranty == 1 ? 'Warranty' : 'Chargeable'; }, cell: function (r) { return r.i.item_type ? (r.i.warranty == 1 ? tag('Warranty', 'ok') : tag('Chargeable', 'warn')) : ''; } },
          { h: 'Status', val: function (r) { return r.j.status; }, cell: function (r) { return statusTag(r.j.status); } }
        ],
        totals: function (data, i) { return i === 10 ? '<b>' + inr(sum(data, function (r) { return r.i.amount; }), 2) + '</b>' : i === 0 ? '<b>Total</b>' : null; }
      });
    }
  };
};

ROUTES['s/replreport'] = function () {
  var rows = [];
  Q.repl().forEach(function (r) { replLines(r).forEach(function (i) { rows.push({ r: r, i: i }); }); });
  var eff = function (x) { return x.r.replacement_type === 'Credit Note' ? -(x.i.net_value || 0) : (x.i.net_value || 0); };
  return {
    title: 'Replacement Report (CN effect)', crumb: 'Home › Service › <b>Replacement Report</b>', sub: 'Replacement lines with invoice / credit-note effect on the dealer account',
    body: stripCards([{ l: 'Lines', v: inr(rows.length) }, { l: 'Invoiced ₹', v: inr(sum(rows.filter(function (x) { return x.r.replacement_type !== 'Credit Note'; }), function (x) { return x.i.net_value; })) },
      { l: 'Credit notes ₹', v: inr(sum(rows.filter(function (x) { return x.r.replacement_type === 'Credit Note'; }), function (x) { return x.i.net_value; })), c: 'dang' }, { l: 'Net effect ₹', v: inr(sum(rows, eff)) }, { l: 'Warranty days carried', v: inr(sum(rows, function (x) { return x.i.warranty_days_left; })) }]) + '<div id="rrGrid"></div>',
    after: function () {
      mountGrid('#rrGrid', {
        title: 'Replacement_report', rows: rows, sortI: 1, sortD: 'desc', pageSize: 50,
        filters: [{ label: 'Type', get: function (x) { return x.r.replacement_type || ''; }, opts: REPL_TYPES }, { label: 'Dealer', get: function (x) { return dealerName(x.r.dealer_id) || '—'; } }, { label: 'Component', get: function (x) { return x.i.category || ''; } }, { label: 'Source', get: function (x) { return x.r.source; } }],
        search: function (x) { return [x.r.repl_no, x.i.old_serial_no, x.i.new_serial_no, dealerName(x.r.dealer_id)].join(' '); },
        cols: [
          { h: 'Replacement', val: function (x) { return x.r.repl_no; }, cell: function (x) { return '<b>' + esc(x.r.repl_no) + '</b>'; } }, { h: 'Date', val: function (x) { return x.r.repl_date; }, cell: function (x) { return dmy(x.r.repl_date); } },
          { h: 'Dealer', val: function (x) { return dealerName(x.r.dealer_id); } }, { h: 'Component', val: function (x) { return x.i.category || ''; }, cell: function (x) { return catTag(x.i.category); } },
          { h: 'Received item', val: function (x) { return x.i.received_item || ''; } }, { h: 'Old serial', val: function (x) { return x.i.old_serial_no || ''; }, cls: 'mono' },
          { h: 'Invoiced item', val: function (x) { return x.i.invoice_item || ''; } }, { h: 'New serial', val: function (x) { return x.i.new_serial_no || ''; }, cls: 'mono' },
          { h: 'Qty', val: function (x) { return x.i.qty; }, cls: 'n' }, { h: 'Type', val: function (x) { return x.r.replacement_type || ''; } },
          { h: 'Net value ₹', val: function (x) { return x.i.net_value || 0; }, cls: 'n', cell: function (x) { return inr(x.i.net_value, 2); } },
          { h: 'Effect ₹', val: eff, cls: 'n', cell: function (x) { var e = eff(x); return '<b style="color:var(--' + (e < 0 ? 'dang' : 'ink') + ')">' + inr(e, 2) + '</b>'; } },
          { h: 'Warranty days', val: function (x) { return x.i.warranty_days_left || 0; }, cls: 'n' }, { h: 'CN no', val: function (x) { return x.r.cn_no || ''; } }
        ],
        totals: function (data, i) { return i === 10 ? '<b>' + inr(sum(data, function (x) { return x.i.net_value; }), 2) + '</b>' : i === 11 ? '<b>' + inr(sum(data, eff), 2) + '</b>' : i === 0 ? '<b>Total</b>' : null; }
      });
    }
  };
};

ROUTES['s/claims'] = function () {
  var jcs = Q.jobcards().filter(function (j) { return (j.status === 'Approved' || j.status === 'Closed') && j.warranty_amount > 0; });
  var byM = groupBy(jcs, function (j) { return ymKey(j.jobcard_date); }), months = Object.keys(byM).sort();
  var repl = Q.repl(), replVal = sum(repl, function (r) { return sum(replLines(r), function (i) { return i.net_value; }); });
  var cat = {}; jcs.forEach(function (j) { DB.where('jobcard_item', function (i) { return i.jobcard_id === j.jobcard_id && i.warranty == 1; }).forEach(function (i) { var k = catLabel(i.category) || 'Common'; cat[k] = (cat[k] || 0) + i.amount + (i.amount * (i.gst_pct || 0) / 100); }); });
  return {
    title: 'Warranty Claim Summary', crumb: 'Home › Service › <b>Warranty Claims</b>', sub: 'Cost borne by the company on approved in-warranty job cards',
    body: stripCards([{ l: 'Claim job cards', v: jcs.length }, { l: 'Warranty cost ₹', v: inr(sum(jcs, function (j) { return j.warranty_amount; })), c: 'dang' }, { l: 'Spares ₹', v: inr(sum(jcs, function (j) { return j.subtotal_spares; })) }, { l: 'Labour ₹', v: inr(sum(jcs, function (j) { return j.subtotal_labour; })) }, { l: 'Replacement value ₹', v: inr(replVal) }]) +
      '<div class="grid2"><div class="card" style="margin:0"><h3>Month-wise warranty cost</h3><div class="cbody">' + barChart(months.map(function (m) { return { l: ymLbl(m), v: sum(byM[m], function (j) { return j.warranty_amount; }) }; }), { h: 220 }) + '</div></div>' +
      '<div class="card" style="margin:0"><h3>By component</h3><div class="cbody">' + (Object.keys(cat).length ? barList(Object.keys(cat).map(function (k) { return { l: k, v: Math.round(cat[k]) }; }), { fmt: function (v) { return '₹ ' + inr(v); } }) : '<div class="muted">No claims yet</div>') + '</div></div></div><div id="clGrid"></div>',
    after: function () {
      mountGrid('#clGrid', {
        title: 'Warranty_claims', rows: jcs, sortI: 1, sortD: 'desc',
        filters: [{ label: 'Month', get: function (j) { return ymKey(j.jobcard_date); } }, { label: 'Service center', get: function (j) { return scName(j.sc_id); } }],
        cols: [
          { h: 'Job card', val: function (j) { return j.jobcard_no; }, cell: function (j) { return '<a href="#/s/jobcard/' + j.jobcard_id + '"><b>' + esc(j.jobcard_no) + '</b></a>'; } }, { h: 'Date', val: function (j) { return j.jobcard_date; }, cell: function (j) { return dmy(j.jobcard_date); } },
          { h: 'Customer', val: function (j) { return nameOf('complaint', j.complaint_id, 'customer_name'); } },
          { h: 'Serials', val: function (j) { return uniq(DB.where('jobcard_item', function (i) { return i.jobcard_id === j.jobcard_id && i.warranty == 1; }).map(function (i) { return i.serial_no; })).join(', '); }, cls: 'mono' },
          { h: 'Spares ₹', val: function (j) { return j.subtotal_spares || 0; }, cls: 'n', cell: function (j) { return inr(j.subtotal_spares, 2); } }, { h: 'Labour ₹', val: function (j) { return j.subtotal_labour || 0; }, cls: 'n', cell: function (j) { return inr(j.subtotal_labour, 2); } },
          { h: 'Warranty claim ₹', val: function (j) { return j.warranty_amount || 0; }, cls: 'n', cell: function (j) { return '<b>' + inr(j.warranty_amount, 2) + '</b>'; } }, { h: 'Customer pays ₹', val: function (j) { return j.customer_payable || 0; }, cls: 'n', cell: function (j) { return inr(j.customer_payable, 2); } },
          { h: 'Status', val: function (j) { return j.status; }, cell: function (j) { return statusTag(j.status); } }
        ],
        totals: function (data, i) { return (i >= 4 && i <= 7) ? '<b>' + inr(sum(data, function (j) { return [0, 0, 0, 0, j.subtotal_spares, j.subtotal_labour, j.warranty_amount, j.customer_payable][i]; }), 2) + '</b>' : i === 0 ? '<b>Total</b>' : null; }
      });
    }
  };
};

/* ============================================================
   SERVICE DASHBOARD  (call-type and project wise)
   ============================================================ */
ROUTES['s/dashboard'] = function (a, q) {
  var calls = Q.complaints(), open = calls.filter(callOpen), mon = ymKey(today());
  var done = calls.filter(function (c) { return c.closed_on && (c.status === 'Resolved' || c.status === 'Closed'); });
  var tat = done.length ? Math.round(sum(done, function (c) { return daysBetween(c.call_date, c.closed_on); }) / done.length * 10) / 10 : 0;
  var pend = Q.jobcards().filter(function (j) { return j.status === 'In Approval'; });
  var wcost = sum(Q.jobcards().filter(function (j) { return j.status === 'Approved' || j.status === 'Closed'; }), function (j) { return j.warranty_amount; });
  var stCol = { 'New': '#2E6FD9', 'Assigned': '#7B5AC4', 'Visited': '#00B7C7', 'In Approval': '#E8A317', 'Approved': '#12A150', 'Resolved': '#009694', 'Closed': '#78909C', 'Cancelled': '#DC3545' };
  var types = DB.all('call_type'), projs = DB.all('project').concat([{ project_id: null, project_name: 'No project' }]);
  var months = []; for (var m = 5; m >= 0; m--) { months.push(ymKey(addMonths(today().slice(0, 8) + '01', -m))); }
  var age = [{ l: '0-3 days', f: function (d) { return d <= 3; } }, { l: '4-7 days', f: function (d) { return d > 3 && d <= 7; } }, { l: '8-15 days', f: function (d) { return d > 7 && d <= 15; } }, { l: 'Over 15 days', f: function (d) { return d > 15; } }];
  var faults = {}; DB.all('jobcard_fault').forEach(function (f) { faults[f.fault_name] = (faults[f.fault_name] || 0) + 1; });
  var att = open.filter(function (c) { return callOverdue(c) || c.status === 'New'; }).sort(function (x, y) { return String(x.due_date).localeCompare(y.due_date); }).slice(0, 7);
  return {
    title: 'Service Dashboard', crumb: 'Home › Service › <b>Dashboard</b>', sub: 'Call-type and project-wise view of every service call',
    body: '<div class="kpis">' +
      counter({ label: 'Open calls', value: inr(open.length), sub: inr(open.filter(function (c) { return c.status === 'New'; }).length) + ' not yet assigned', go: '#/s/calls', cls: '' }) +
      counter({ label: 'Overdue (past valid days)', value: inr(open.filter(callOverdue).length), sub: 'need escalation', go: '#/s/calls', cls: 'r' }) +
      counter({ label: 'Resolved / closed this month', value: inr(calls.filter(function (c) { return c.closed_on && ymKey(c.closed_on) === mon && (c.status === 'Resolved' || c.status === 'Closed'); }).length), sub: 'avg ' + tat + ' days to resolve', cls: 'b' }) +
      counter({ label: 'Job cards awaiting approval', value: inr(pend.length), sub: '₹ ' + inr(sum(pend, function (j) { return j.grand_total; })), go: '#/s/approvals', cls: 'a' }) +
      counter({ label: 'Warranty cost (approved)', value: '₹ ' + cr(wcost, 2), sub: 'borne by company', go: '#/s/claims', cls: '' }) + '</div>' +
      '<div class="grid2"><div class="card" style="margin:0"><h3>Calls by status</h3><div class="cbody">' + donut(CALL_STATUS.map(function (s) { return { l: s, v: calls.filter(function (c) { return c.status === s; }).length, c: stCol[s] }; }).filter(function (d) { return d.v; }), { center: String(calls.length), center2: 'calls' }) + '</div></div>' +
      '<div class="card" style="margin:0"><h3>Last 6 months · booked vs closed</h3><div class="cbody">' + barChart(months.map(function (k) { return { l: ymLbl(k), b: calls.filter(function (c) { return ymKey(c.call_date) === k; }).length, c: calls.filter(function (c) { return c.closed_on && ymKey(c.closed_on) === k && (c.status === 'Resolved' || c.status === 'Closed'); }).length }; }), { h: 210, series: [{ key: 'b', color: '#009694', label: 'Booked' }, { key: 'c', color: '#FFAB40', label: 'Resolved / closed' }] }) + '</div></div></div>' +
      '<div class="card" style="margin-top:16px"><h3>Call type × project <span class="sm2">open + closed calls</span><span style="margin-left:auto"><button class="btn sm" onclick="matrixXl(\'mxTP\',\'Call_type_project\')">' + ICO.xls + ' Export Excel</button></span></h3>' +
      matrixTable('mxTP', ['Call type'].concat(projs.map(function (p) { return p.project_name; }), ['Total']), types.map(function (t) { var cs = calls.filter(function (c) { return c.calltype_id === t.calltype_id; }); return { cells: [t.call_type].concat(projs.map(function (p) { return cs.filter(function (c) { return (c.project_id || null) === p.project_id; }).length; }), [cs.length]) }; })) + '</div>' +
      '<div class="grid3"><div class="card" style="margin:0"><h3>Open calls by age</h3><div class="cbody">' + barList(age.map(function (b) { return { l: b.l, v: open.filter(function (c) { return b.f(daysBetween(c.call_date, today())); }).length }; }), { fmt: function (v) { return v + ' calls'; } }) + '</div></div>' +
      '<div class="card" style="margin:0"><h3>Open calls by service center</h3><div class="cbody">' + barList(DB.all('service_center').map(function (s) { return { l: s.sc_name, v: open.filter(function (c) { return c.sc_id === s.sc_id; }).length }; }).concat([{ l: 'Unassigned', v: open.filter(function (c) { return !c.sc_id; }).length, c: '#DC3545' }]).filter(function (x) { return x.v; }), { fmt: function (v) { return v + ' calls'; } }) + '</div></div>' +
      '<div class="card" style="margin:0"><h3>Top faults found</h3><div class="cbody">' + (Object.keys(faults).length ? barList(Object.keys(faults).map(function (k) { return { l: k, v: faults[k] }; }).sort(function (x, y) { return y.v - x.v; }).slice(0, 6), { fmt: function (v) { return v + '×'; } }) : '<div class="muted">No faults recorded</div>') + '</div></div></div>' +
      '<div class="card" style="margin-top:16px"><h3>Needs attention <span class="sm2">overdue or unassigned</span></h3>' + (att.length ? '<table class="dt"><thead><tr><th>Call</th><th>Customer</th><th>Place</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>' +
        att.map(function (c) { return '<tr class="clk" onclick="location.hash=\'#/s/call/' + c.complaint_id + '\'"><td><b>' + esc(c.complaint_no) + '</b></td><td>' + esc(c.customer_name) + '</td><td>' + esc(c.village || c.district || '') + ', ' + esc(stateShort(c.state_code)) + '</td><td style="color:var(--' + (callOverdue(c) ? 'dang' : 'ink') + ')">' + dmy(c.due_date) + '</td><td>' + statusTag(c.status) + '</td><td>' + (c.status === 'New' ? '<span class="tag warn">Assign</span>' : '<span class="tag dang">Overdue</span>') + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="empty" style="padding:24px">Nothing needs attention</div>') + '</div>'
  };
};
