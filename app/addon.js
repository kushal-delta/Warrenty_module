/* ============================================================
   ADD-ON (v1.1)  -  Service Center login, mandatory job card photos,
   replacement PDF + out-of-warranty rule, Material Request -> HO approval
   -> Returnable / Non-Returnable Delivery Challan -> Fresh / Defective
   receipt against returnable challan, and the matching reports.
   Everything is saved in the same browser data set as the rest of the app.
   ============================================================ */
'use strict';

/* ---------------- schema additions ---------------- */
(function () {
  function col(str) {
    var comment = '', i = str.indexOf('|');
    if (i >= 0) { comment = str.slice(i + 1).trim(); str = str.slice(0, i); }
    var p = str.trim().split(/\s+/), c = { n: p[0], t: p[1], req: false, uq: false, fk: null, def: null, note: comment };
    for (var k = 2; k < p.length; k++) { var f = p[k]; if (f === '*') c.req = true; else if (f === 'u') c.uq = true; else if (f.charAt(0) === '>') c.fk = f.slice(1); else if (f.charAt(0) === '=') c.def = f.slice(1); }
    return c;
  }
  function T(name, group, pk, title, cols, note) {
    if (SCHEMA.by[name]) return;
    var t = { name: name, group: group, pk: pk, title: title, note: note || '', cols: [{ n: pk, t: 'pk', req: true, uq: false, fk: null, def: null, note: 'Primary key (auto number)' }] };
    cols.forEach(function (s) { t.cols.push(col(s)); });
    SCHEMA.tables.push(t); SCHEMA.by[name] = t;
  }
  function addCol(table, s) { var t = SCHEMA.by[table], c = col(s); if (t && !t.cols.some(function (x) { return x.n === c.n; })) t.cols.push(c); }

  addCol('service_center', 'password s40 | Service center login password (login = center code)');
  addCol('service_center', 'last_login dt');
  addCol('replacement', 'warranty_status s20 | In Warranty / Out of Warranty / Partial  (Without Serial No = Out of Warranty)');

  T('material_request', 'Stock', 'mr_id', 'Material Request (Service Center -> HO)', [
    'mr_no s30 * u', 'mr_date date *', 'req_from s10 * =SC | SC = service center request to the warehouse / WAREHOUSE = warehouse indent to HO', 'sc_id int >service_center.sc_id | Requesting service center (blank for a warehouse indent)', 'purpose s40 * | Stock replenishment / Job card requirement / Replacement / Breakdown',
    'complaint_id int >complaint.complaint_id', 'required_by date', 'priority s10 =Medium',
    'status s20 * =Draft | Draft / Pending Approval / Approved / Partly Approved / Rejected / Partly Issued / Issued / Closed',
    'requested_by s60', 'submitted_on dt', 'approved_by s60', 'approved_on dt', 'approval_remarks s250', 'remarks s250', 'created_on dt'
  ], 'Service center requests are approved by HO and issued by the warehouse; warehouse indents are approved and dispatched by HO and received into warehouse stock.');
  T('material_request_item', 'Stock', 'mritem_id', 'Material Request (Lines)', [
    'mr_id int * >material_request.mr_id', 'line_no int', 'spare_id int * >spare_master.spare_id', 'spare_code s30', 'particulars s120',
    'qty_req dec * | Requested by the service center', 'qty_appr dec | Approved by HO', 'qty_issued dec * =0 | Issued on delivery challans', 'remarks s150'
  ]);
  T('delivery_challan', 'Stock', 'dc_id', 'Delivery Challan (HO -> Service Center)', [
    'dc_no s30 * u', 'dc_date date *', 'challan_type s20 * | Returnable / Non-Returnable (warehouse -> service center) / Stock Transfer (HO -> warehouse)', 'mr_id int >material_request.mr_id',
    'issue_to s10 * =SC | SC / WAREHOUSE', 'sc_id int >service_center.sc_id', 'expected_return date | Returnable challans only', 'transporter s80', 'vehicle_no s20', 'lr_no s40',
    'status s20 * =Issued | Issued / Partly Returned / Returned / In Transit / Partly Received / Received / Closed / Cancelled', 'remarks s250', 'created_by s60', 'created_on dt'
  ], 'RDC / NRDC: warehouse -> service center (posts warehouse -> center stock). STN: HO -> warehouse (stock is posted when the warehouse books the GRN).');
  T('delivery_challan_item', 'Stock', 'dcitem_id', 'Delivery Challan (Lines)', [
    'dc_id int * >delivery_challan.dc_id', 'line_no int', 'mritem_id int >material_request_item.mritem_id', 'spare_id int * >spare_master.spare_id',
    'particulars s120', 'qty dec *', 'rate dec', 'amount dec', 'qty_fresh_ret dec * =0 | Received back as fresh (unused) stock', 'qty_def_ret dec * =0 | Received back as defective', 'qty_recd dec * =0 | Stock transfer: quantity received at the warehouse'
  ]);
  T('wh_grn', 'Stock', 'grn_id', 'Warehouse Goods Receipt (against HO stock transfer)', [
    'grn_no s30 * u', 'grn_date date *', 'dc_id int * >delivery_challan.dc_id', 'received_by s60', 'remarks s250', 'created_on dt'
  ], 'Booked in the warehouse login; adds the received quantity to warehouse good stock.');
  T('wh_grn_item', 'Stock', 'grnitem_id', 'Warehouse Goods Receipt (Lines)', [
    'grn_id int * >wh_grn.grn_id', 'dcitem_id int * >delivery_challan_item.dcitem_id', 'spare_id int * >spare_master.spare_id', 'qty_recd dec *', 'remarks s150'
  ]);
  T('dc_receipt', 'Stock', 'rcv_id', 'Fresh / Defective Receipt against Returnable Challan', [
    'rcv_no s30 * u', 'rcv_date date *', 'dc_id int * >delivery_challan.dc_id', 'sc_id int >service_center.sc_id',
    'received_through s80 | Courier / transporter / by hand', 'remarks s250', 'created_by s60', 'created_on dt'
  ], 'Booked in the warehouse / HO login. Fresh units go to warehouse good stock, defective units to warehouse damaged stock.');
  T('dc_receipt_item', 'Stock', 'rcvitem_id', 'Fresh / Defective Receipt (Lines)', [
    'rcv_id int * >dc_receipt.rcv_id', 'dcitem_id int * >delivery_challan_item.dcitem_id', 'spare_id int * >spare_master.spare_id',
    'qty_fresh dec * =0', 'qty_defective dec * =0', 'defect_serial s60 | Serial / tag of the defective part', 'remarks s150'
  ]);
})();

/* audit-log reference for the new documents */
(function () {
  var base = DB.refOf;
  DB.refOf = function (t, r) { if (r && (r.mr_no || r.dc_no || r.rcv_no || r.grn_no)) return String(r.mr_no || r.dc_no || r.rcv_no || r.grn_no); return base.call(DB, t, r); };
})();

/* ---------------- roles: Service Center login ---------------- */
ALL.push('SC'); ALL.push('WAREHOUSE');
function isWH() { return ROLE() === 'WAREHOUSE'; }
/* who may issue challans / book returns: the warehouse person (and HO admins) */
function canIssue() { return isWH() || ROLE() === 'SUPER'; }
function canDispatch() { return isHO(); }
function isWHReq(m) { return m && m.req_from === 'WAREHOUSE'; }
function partyOf(x) { return x && (x.req_from === 'WAREHOUSE' || x.issue_to === 'WAREHOUSE') ? 'Central Warehouse' : scName(x && x.sc_id); }
function isSC() { return ROLE() === 'SC'; }
isStaff = function () { return STAFF.indexOf(ROLE()) >= 0 || ROLE() === 'SC'; };
/* service center of the signed-in user (SC login, manager or engineer) */
function mySc() { var u = APP.user; if (!u) return null; if (u.kind === 'SC') return u.id; if ((u.role === 'MANAGER' || u.role === 'ENGINEER') && u.rec.sc_id) return u.rec.sc_id; return null; }

/* ---------------- data migration (runs on every load / restore) ---------------- */
var MAT_PURPOSE = ['Stock replenishment', 'Job card requirement', 'Replacement', 'Breakdown / urgent'];
var MR_STATUS = ['Draft', 'Pending Approval', 'Approved', 'Partly Approved', 'Rejected', 'Partly Issued', 'Issued', 'Closed'];
var DC_STATUS = ['Issued', 'Partly Returned', 'Returned', 'Closed', 'Cancelled'];
Object.assign(STATUS_TAG, { 'In Transit': 'warn', 'Partly Received': 'acc', 'Pending Approval': 'warn', 'Partly Approved': 'acc', 'Partly Issued': 'acc', 'Issued': 'info', 'Partly Returned': 'acc', 'Returned': 'ok' });

(function () {
  var base = DB.adopt;
  DB.adopt = function (o) {
    var d = base.call(DB, o);
    try { matMigrate(); } catch (e) { console.error('migration', e); }
    return d;
  };
})();
var WH_NAME = 'Ramesh Yadav';
function matMigrate() {
  var ch = false;
  if (!DB.find('app_user', function (u) { return u.role === 'WAREHOUSE'; })) { DB.add('app_user', { first_name: 'Ramesh', last_name: 'Yadav', username: 'store', password: 'store@123', phone: '9810090099', email: 'store@solartive.example', address: 'Central Warehouse, Greater Noida', role: 'WAREHOUSE', is_admin: 0, is_active: 1, form_rights: 'Service,Stock' }, true); ch = true; }
  DB.all('service_center').forEach(function (s) { if (!s.password) { s.password = 'sc@123'; ch = true; } });
  DB.all('replacement').forEach(function (r) { if (!r.warranty_status) { r.warranty_status = r.voucher_type === 'Without Serial No' ? 'Out of Warranty' : 'In Warranty'; ch = true; } });
  /* Demo documents are created once: the database keeps the tables but not this flag, so also skip when any already exist */
  if (!DB.d.mat_seeded && !DB.all('material_request').length && !DB.all('delivery_challan').length && !DB.all('stock_txn').some(function (t) { return t.loc_type === 'WH'; })) { matSeed(); DB.d.mat_seeded = 1; ch = true; }
  if (ch) { try { localStorage.setItem(DB.KEY, JSON.stringify(DB.d)); } catch (e) { } if (window.SYNC) setTimeout(function () { SYNC.push(); }, 0); }   /* also save the migrated rows to the PostgreSQL database */
}
function stkAdd(date, spareId, locType, locId, bucket, type, qty, refType, refNo, remarks, by) {
  if (!qty) return;
  DB.add('stock_txn', { txn_date: date, spare_id: spareId, loc_type: locType, loc_id: locId, bucket: bucket, txn_type: type, qty: qty, ref_type: refType, ref_no: refNo, remarks: remarks || null, created_by: by || myName(), created_on: nowIso() }, true);
}
/* demo documents so the new screens and reports have something to show */
function matSeed() {
  var sp = DB.all('spare_master').filter(function (s) { return s.is_active == 1; }), scs = DB.all('service_center').filter(function (s) { return s.is_active == 1; });
  if (!sp.length || !scs.length) return;
  var t0 = today(), d = function (n) { return addDays(t0, -n); }, HO_NAME = 'Neha Agarwal';
  sp.forEach(function (s) { stkAdd(d(90), s.spare_id, 'WH', 0, 'GOOD', 'Opening', 15, 'opening', 'WH-OPEN', 'Central warehouse opening stock', 'System'); });
  var S = function (i) { return sp[i % sp.length]; }, SC = function (i) { return scs[i % scs.length]; };
  function mr(day, sc, purpose, lines, status, apprDay, rem) {
    var m = DB.add('material_request', { mr_no: DB.nextNo(sc ? 'MR' : 'WIND', sc ? 'MR/{fy}/{n:4}' : 'WI/{fy}/{n:4}'), mr_date: d(day), req_from: sc ? 'SC' : 'WAREHOUSE', sc_id: sc ? sc.sc_id : null, purpose: purpose, priority: 'Medium', required_by: d(day - 7), status: status, requested_by: sc ? (sc.contact_person || sc.sc_name) : WH_NAME, submitted_on: d(day) + 'T10:00:00.000Z', remarks: rem || null, created_on: d(day) + 'T10:00:00.000Z' }, true);
    lines.forEach(function (l, i) { DB.add('material_request_item', { mr_id: m.mr_id, line_no: i + 1, spare_id: l[0].spare_id, spare_code: l[0].spare_code, particulars: l[0].spare_name, qty_req: l[1], qty_appr: status === 'Pending Approval' || status === 'Rejected' ? null : (l[2] == null ? l[1] : l[2]), qty_issued: 0 }, true); });
    if (apprDay != null) { m.approved_by = HO_NAME; m.approved_on = d(apprDay) + 'T11:30:00.000Z'; m.approval_remarks = status === 'Rejected' ? 'Stock already available at the center' : 'Approved'; }
    return m;
  }
  function dc(m, day, type, retDays) {
    var stn = type === 'Stock Transfer', pre = stn ? 'STN' : type === 'Returnable' ? 'RDC' : 'NRDC';
    var c = DB.add('delivery_challan', { dc_no: DB.nextNo(pre, pre + '/{fy}/{n:4}'), dc_date: d(day), challan_type: type, mr_id: m.mr_id, issue_to: stn ? 'WAREHOUSE' : 'SC', sc_id: m.sc_id, expected_return: type === 'Returnable' ? d(day - retDays) : null, transporter: 'Safexpress', vehicle_no: 'UP16 AT 4412', lr_no: 'SFX' + (700000 + m.mr_id * 37), status: stn ? 'In Transit' : 'Issued', created_by: stn ? HO_NAME : WH_NAME, created_on: d(day) + 'T12:00:00.000Z' }, true);
    mrLines(m).forEach(function (it, i) {
      var q = it.qty_appr || 0; if (!q) return; var s = DB.get('spare_master', it.spare_id);
      DB.add('delivery_challan_item', { dc_id: c.dc_id, line_no: i + 1, mritem_id: it.mritem_id, spare_id: it.spare_id, particulars: it.particulars, qty: q, rate: s.rate, amount: round2(q * s.rate), qty_fresh_ret: 0, qty_def_ret: 0, qty_recd: 0 }, true);
      it.qty_issued = q;
    });
    if (!stn) dcPostStock(c, WH_NAME);
    mrRefreshStatus(m);
    return c;
  }
  function grn(c, day) {
    var g = DB.add('wh_grn', { grn_no: DB.nextNo('GRN', 'GRN/{fy}/{n:4}'), grn_date: d(day), dc_id: c.dc_id, received_by: WH_NAME, remarks: 'Received in full', created_on: d(day) + 'T16:00:00.000Z' }, true);
    dcLines(c).forEach(function (it) { DB.add('wh_grn_item', { grn_id: g.grn_id, dcitem_id: it.dcitem_id, spare_id: it.spare_id, qty_recd: it.qty }, true); it.qty_recd = it.qty; });
    grnPostStock(g, WH_NAME); dcRefreshStatus(c);
  }
  /* warehouse indents to HO */
  var w1 = mr(45, null, 'Stock replenishment', sp.slice(0, 10).map(function (s) { return [s, 40]; }), 'Approved', 44, 'Monthly warehouse indent');
  grn(dc(w1, 42, 'Stock Transfer'), 38);
  var w2 = mr(6, null, 'Stock replenishment', [[S(2), 30], [S(5), 20, 15]], 'Partly Approved', 5);
  dc(w2, 3, 'Stock Transfer');
  mr(1, null, 'Breakdown / urgent', [[S(1), 15], [S(4), 10]], 'Pending Approval', null, 'Fast-moving spares running low');
  /* service center requests -> warehouse issue */
  var m1 = mr(24, SC(0), 'Job card requirement', [[S(0), 4], [S(1), 3], [S(2), 2]], 'Approved', 23);
  var c1 = dc(m1, 22, 'Returnable', 10);
  var l1 = dcLines(c1);
  var r1 = DB.add('dc_receipt', { rcv_no: DB.nextNo('DRN', 'DRN/{fy}/{n:4}'), rcv_date: d(6), dc_id: c1.dc_id, sc_id: c1.sc_id, received_through: 'Courier — DTDC', remarks: 'Old parts returned after repair', created_by: WH_NAME, created_on: d(6) + 'T15:00:00.000Z' }, true);
  [[l1[0], 1, 2, 'DEF-' + S(0).spare_code + '-01'], [l1[1], 0, 3, '']].forEach(function (x) {
    if (!x[0]) return;
    DB.add('dc_receipt_item', { rcv_id: r1.rcv_id, dcitem_id: x[0].dcitem_id, spare_id: x[0].spare_id, qty_fresh: x[1], qty_defective: x[2], defect_serial: x[3] || null }, true);
    x[0].qty_fresh_ret += x[1]; x[0].qty_def_ret += x[2];
  });
  rcvPostStock(r1, WH_NAME); dcRefreshStatus(c1);
  var m2 = mr(12, SC(1), 'Stock replenishment', [[S(3), 10], [S(4), 6, 4]], 'Partly Approved', 11);
  dc(m2, 10, 'Non-Returnable');
  var m3 = mr(9, SC(2), 'Replacement', [[S(5), 2], [S(1), 1]], 'Approved', 8);
  dc(m3, 7, 'Returnable', 14);
  mr(4, SC(2), 'Breakdown / urgent', [[S(2), 3], [S(6), 2]], 'Approved', 3);
  mr(2, SC(0), 'Stock replenishment', [[S(4), 8], [S(7), 5], [S(0), 2]], 'Pending Approval', null, 'Monthly replenishment');
  mr(1, SC(1), 'Job card requirement', [[S(6), 1]], 'Pending Approval', null);
  mr(15, SC(3), 'Stock replenishment', [[S(2), 12]], 'Rejected', 14);
}

/* ---------------- helpers ---------------- */
function mrLines(m) { return DB.where('material_request_item', function (i) { return i.mr_id === m.mr_id; }).sort(function (a, b) { return a.line_no - b.line_no; }); }
function dcLines(c) { return DB.where('delivery_challan_item', function (i) { return i.dc_id === c.dc_id; }).sort(function (a, b) { return a.line_no - b.line_no; }); }
function rcvLines(r) { return DB.where('dc_receipt_item', function (i) { return i.rcv_id === r.rcv_id; }); }
function dcPend(it) { return Math.max(0, round2((+it.qty || 0) - (+it.qty_fresh_ret || 0) - (+it.qty_def_ret || 0))); }
function dcPendTotal(c) { return c.challan_type === 'Returnable' && c.status !== 'Cancelled' ? sum(dcLines(c), dcPend) : 0; }
function spareLbl(id) { var s = DB.get('spare_master', id); return s ? s.spare_name + ' (' + s.spare_code + ')' : ''; }
function mrNo(id) { return nameOf('material_request', id, 'mr_no'); }

function mrRefreshStatus(m) {
  if (['Draft', 'Pending Approval', 'Rejected', 'Closed'].indexOf(m.status) >= 0) return;
  var ls = mrLines(m), appr = sum(ls, function (i) { return +i.qty_appr || 0; }), iss = sum(ls, function (i) { return +i.qty_issued || 0; });
  var partAppr = ls.some(function (i) { return (+i.qty_appr || 0) < (+i.qty_req || 0); });
  if (iss <= 0) m.status = partAppr ? 'Partly Approved' : 'Approved';
  else m.status = iss >= appr ? 'Issued' : 'Partly Issued';
}
function dcRefreshStatus(c) {
  if (c.status === 'Cancelled' || c.status === 'Closed') return;
  if (c.challan_type === 'Stock Transfer') { var tl = dcLines(c), rq = sum(tl, function (i) { return +i.qty_recd || 0; }), tq = sum(tl, function (i) { return +i.qty; }); c.status = rq <= 0 ? 'In Transit' : rq >= tq ? 'Received' : 'Partly Received'; return; }
  if (c.challan_type !== 'Returnable') { c.status = 'Issued'; return; }
  var ls = dcLines(c), ret = sum(ls, function (i) { return (+i.qty_fresh_ret || 0) + (+i.qty_def_ret || 0); }), pend = sum(ls, dcPend);
  c.status = ret <= 0 ? 'Issued' : pend > 0 ? 'Partly Returned' : 'Returned';
}
function dcPostStock(c, by) {
  dcLines(c).forEach(function (it) {
    stkAdd(c.dc_date, it.spare_id, 'WH', 0, 'GOOD', 'Issue-Out', -Math.abs(it.qty), 'challan', c.dc_no, 'Issued to ' + partyOf(c), by);
    stkAdd(c.dc_date, it.spare_id, 'SC', c.sc_id, 'GOOD', 'Receipt', Math.abs(it.qty), 'challan', c.dc_no, c.challan_type + ' challan from warehouse', by);
  });
}
function rcvPostStock(r, by) {
  var c = DB.get('delivery_challan', r.dc_id);
  rcvLines(r).forEach(function (it) {
    if (+it.qty_fresh) { stkAdd(r.rcv_date, it.spare_id, 'SC', c.sc_id, 'GOOD', 'Issue-Out', -it.qty_fresh, 'dc-return', r.rcv_no, 'Fresh stock returned to warehouse against ' + c.dc_no, by); stkAdd(r.rcv_date, it.spare_id, 'WH', 0, 'GOOD', 'Return-Good', +it.qty_fresh, 'dc-return', r.rcv_no, 'Fresh stock received from ' + partyOf(c), by); }
    if (+it.qty_defective) { stkAdd(r.rcv_date, it.spare_id, 'SC', c.sc_id, 'DAMAGED', 'Issue-Out', -it.qty_defective, 'dc-return', r.rcv_no, 'Defective part returned to warehouse against ' + c.dc_no, by); stkAdd(r.rcv_date, it.spare_id, 'WH', 0, 'DAMAGED', 'Return-Damaged', +it.qty_defective, 'dc-return', r.rcv_no, 'Defective received from ' + partyOf(c), by); }
  });
}
function grnLines(g) { return DB.where('wh_grn_item', function (i) { return i.grn_id === g.grn_id; }); }
function grnPostStock(g, by) {
  var c = DB.get('delivery_challan', g.dc_id);
  grnLines(g).forEach(function (it) { stkAdd(g.grn_date, it.spare_id, 'WH', 0, 'GOOD', 'Receipt', +it.qty_recd, 'grn', g.grn_no, 'Received from HO against ' + c.dc_no, by); });
}
function stnPend(it) { return Math.max(0, round2((+it.qty || 0) - (+it.qty_recd || 0))); }
function unpostRef(refNo) { DB.where('stock_txn', function (x) { return x.ref_no === refNo && (x.ref_type === 'challan' || x.ref_type === 'dc-return' || x.ref_type === 'grn'); }).forEach(function (x) { DB.del('stock_txn', x.txn_id, true); }); }

/* scoped lists */
Q.mr = function () { var s = mySc(), a = DB.all('material_request'); if (isWH()) return a.filter(function (r) { return isWHReq(r) || r.status !== 'Draft'; }); return s && !isHO() ? a.filter(function (r) { return r.sc_id == s; }) : a; };
Q.dc = function () { var s = mySc(), a = DB.all('delivery_challan').filter(function (c) { return c.challan_type !== 'Stock Transfer'; }); return s && !isHO() ? a.filter(function (r) { return r.sc_id == s; }) : a; };
Q.stn = function () { return DB.all('delivery_challan').filter(function (c) { return c.challan_type === 'Stock Transfer'; }); };
Q.rcv = function () { var ok = {}; Q.dc().forEach(function (c) { ok[c.dc_id] = 1; }); return DB.all('dc_receipt').filter(function (r) { return ok[r.dc_id]; }); };

/* letterhead logo is taken from the job card print (no second copy in the file) */
function docLogo() { var m = String(jcView).match(/data:image\/png;base64,[A-Za-z0-9+\/=]+/); return m ? m[0] : 'solartive-logo-sm.png'; }   /* folder version: logo file next to index.html */
function docHead(no, date, extra) {
  var co = CO(), lg = docLogo();
  return '<div class="lh">' + (lg ? '<img src="' + lg + '" style="height:44px;width:auto">' : '') + '<div class="co"><h1 style="font-size:19px">' + esc(co.company_name) + '</h1><div class="adr">' + esc(co.address || '') + ', ' + esc(co.city || '') + ' - ' + esc(co.pincode || '') + ', ' + esc(co.state || '') + (co.gstin ? '<br>GSTIN: ' + esc(co.gstin) : '') + '</div></div>' +
    '<div class="rt"><b>' + esc(no) + '</b><br>Date: ' + dmy(date) + (extra ? '<br>' + extra : '') + '</div></div>';
}

/* ============================================================
   1. MULTI-PHOTO PICKER (job card photos mandatory)
   ============================================================ */
var PEND = {};
photoPicker = function (id, req) {
  PEND[id] = [];
  return '<div class="f full"><label>Photos ' + (req ? '<span class="rq">*</span> <span style="text-transform:none;font-weight:600;color:var(--dang)">(mandatory — at least one)</span>' : '(optional)') + '</label>' +
    '<input type="file" id="' + id + '" accept="image/*" multiple onchange="pendAdd(\'' + id + '\')">' +
    '<div class="hint">Select several photos at once, or pick more files again — each pick is added to the list. Photos are compressed before saving.</div>' +
    '<div class="gallery" id="' + id + '_pv"></div></div>';
};
function pendAdd(id) {
  var inp = document.getElementById(id); if (!inp || !inp.files) return;
  Array.prototype.slice.call(inp.files).forEach(function (f) { PEND[id].push(f); });
  inp.value = ''; pendPaint(id);
}
function pendDel(id, i) { PEND[id].splice(i, 1); pendPaint(id); }
function pendPaint(id) {
  var box = document.getElementById(id + '_pv'); if (!box) return;
  box.innerHTML = '';
  (PEND[id] || []).forEach(function (f, i) {
    var d = el('div', { class: 'ph' }); d.title = f.name;
    var im = document.createElement('img'); im.src = URL.createObjectURL(f); d.appendChild(im);
    var x = document.createElement('span'); x.className = 'px'; x.innerHTML = '&times;'; x.title = 'Remove'; x.onclick = function () { pendDel(id, i); }; d.appendChild(x);
    box.appendChild(d);
  });
  if ((PEND[id] || []).length) box.insertAdjacentHTML('beforeend', '<div class="hint" style="align-self:center">' + PEND[id].length + ' new photo(s) will be saved</div>');
}
function pendCount(id) { return (PEND[id] || []).length; }
savePhotos = function (inputId, refType, refId, done) {
  var inp = document.getElementById(inputId), files = (PEND[inputId] && PEND[inputId].length) ? PEND[inputId].slice() : (inp && inp.files ? Array.prototype.slice.call(inp.files) : []);
  PEND[inputId] = [];
  if (!files.length) { if (done) done(0); return; }
  var left = files.length, n = 0;
  files.forEach(function (f) {
    compressImage(f, 900, function (data) {
      if (data) { DB.add('attachment', { ref_type: refType, ref_id: refId, file_name: f.name, mime: 'image/jpeg', size_kb: Math.round(data.length * 0.75 / 1024), data_url: data, caption: '', uploaded_by: myName(), uploaded_on: nowIso() }, true); n++; }
      if (--left === 0) { DB.save(); if (done) done(n); }
    });
  });
};
/* sending a job card for approval from the view also needs its photos */
(function () {
  var base = jcSubmitNow;
  jcSubmitNow = function (id) {
    if (!photosOf('jobcard', +id).length) { toast('Attach at least one photo before sending the job card for approval', 'err'); location.hash = '#/s/jobcard/' + id + '/edit'; return; }
    return base(id);
  };
})();

/* ============================================================
   2. REPLACEMENT: PDF mandatory + Without Serial No = Out of Warranty
   ============================================================ */
var PDFPEND = [];
function rpPdfBlock(row) {
  PDFPEND = [];
  var ex = row ? DB.where('attachment', function (a) { return a.ref_type === 'replacement' && a.ref_id === row.repl_id; }) : [];
  return '<div class="sec-h">3 · Documents (PDF) <span class="rq">*</span> <span class="sm2" style="text-transform:none;letter-spacing:0">at least one PDF is mandatory — dealer invoice, inspection / test report, LR copy…</span></div>' +
    '<div class="frm"><div class="f full"><input type="file" id="rf_pdf" accept="application/pdf,.pdf" multiple onchange="rpPdfAdd()"><div class="hint">Up to 2 MB per PDF. Several files can be attached.</div></div></div>' +
    '<div id="rf_pdfs" style="margin-top:8px">' + ex.map(function (a) { return pdfChip(a, true); }).join('') + '</div><div id="rf_pdfnew"></div>';
}
function pdfChip(a, canDel) {
  return '<span class="tag info" style="margin:0 6px 6px 0;padding:5px 9px;font-size:11.5px" id="pdfc' + a.att_id + '">' + ICO.clip + ' <a href="javascript:void(0)" onclick="viewPdf(' + a.att_id + ')" style="color:inherit">' + esc(a.file_name) + '</a> <span class="hint" style="margin:0">' + (a.size_kb || 0) + ' KB</span>' +
    (canDel ? ' <a href="javascript:void(0)" title="Remove" style="color:var(--dang);font-weight:800" onclick="pdfDel(' + a.att_id + ')">&times;</a>' : '') + '</span>';
}
function rpPdfAdd() {
  var inp = $('#rf_pdf'), files = Array.prototype.slice.call(inp.files || []); inp.value = '';
  files.forEach(function (f) {
    if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) return toast(f.name + ' is not a PDF', 'err');
    if (f.size > 2 * 1024 * 1024) return toast(f.name + ' is larger than 2 MB', 'err');
    var rd = new FileReader();
    rd.onload = function () { PDFPEND.push({ name: f.name, size: Math.round(f.size / 1024), data: rd.result }); rpPdfPaint(); };
    rd.readAsDataURL(f);
  });
}
function rpPdfPaint() {
  var b = $('#rf_pdfnew'); if (!b) return;
  b.innerHTML = PDFPEND.map(function (p, i) { return '<span class="tag ok" style="margin:0 6px 6px 0;padding:5px 9px;font-size:11.5px">' + ICO.clip + ' ' + esc(p.name) + ' <span class="hint" style="margin:0">' + p.size + ' KB · new</span> <a href="javascript:void(0)" style="color:var(--dang);font-weight:800" onclick="PDFPEND.splice(' + i + ',1);rpPdfPaint()">&times;</a></span>'; }).join('');
}
function pdfDel(id) { DB.del('attachment', id, true); var e = document.getElementById('pdfc' + id); if (e) e.remove(); toast('PDF removed — click Update to keep the change', 'ok'); }
function viewPdf(id) {
  var a = DB.get('attachment', id); if (!a) return;
  try {
    var bin = atob(a.data_url.split(',')[1]), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    var blob = new Blob([u8], { type: 'application/pdf' }), url = URL.createObjectURL(blob), w = window.open(url, '_blank');
    if (!w) dlBlob(blob, a.file_name);
  } catch (e) { toast('Could not open the PDF — ' + e.message, 'err'); }
}
function rpPdfCount(row) { return (row ? DB.where('attachment', function (a) { return a.ref_type === 'replacement' && a.ref_id === row.repl_id; }).length : 0) + PDFPEND.length; }
function rpSavePdfs(rep) {
  PDFPEND.forEach(function (p) { DB.add('attachment', { ref_type: 'replacement', ref_id: rep.repl_id, file_name: p.name, mime: 'application/pdf', size_kb: p.size, data_url: p.data, caption: 'Replacement document', uploaded_by: myName(), uploaded_on: nowIso() }, true); });
  PDFPEND = [];
}
function rpWs(lines, vwt) {
  if (!vwt) return 'Out of Warranty';
  var inW = lines.filter(function (l) { return l.done || l.canTransfer; }).length;
  return inW === lines.length ? 'In Warranty' : inW ? 'Partial' : 'Out of Warranty';
}
function rpVtChanged() {
  var vt = $('#rf_vt'); if (!vt) return;
  var wo = vt.value === 'Without Serial No', box = $('#rf_wsbox');
  if (box) box.innerHTML = wo ? '<div class="note w" style="margin:10px 0 0"><b>Without Serial No → Out of Warranty.</b> This replacement is treated as out of warranty: no balance warranty is carried to any new serial, and it is reported as an out-of-warranty replacement.</div>' : '';
  var ws = $('#rf_ws'); if (ws) ws.value = wo ? 'Out of Warranty' : 'In Warranty (checked per line)';
  if (typeof rpPaint === 'function' && $('#rf_lines')) rpPaint();
}
function wsTag(s) { return s === 'In Warranty' ? tag('In Warranty', 'ok') : s === 'Partial' ? tag('Partial', 'warn') : s === 'Out of Warranty' ? tag('Out of Warranty', 'dang') : tag(s || '—', 'mut'); }
(function () {
  var e = ENT.servrepl;
  e.cols.splice(6, 0, { h: 'Warranty', val: function (r) { return r.warranty_status || ''; }, cell: function (r) { return wsTag(r.warranty_status); } });
  e.cols.push({ h: 'PDF', val: function (r) { return DB.where('attachment', function (a) { return a.ref_type === 'replacement' && a.ref_id === r.repl_id; }).length; }, cls: 'c', cell: function (r) { var p = DB.where('attachment', function (a) { return a.ref_type === 'replacement' && a.ref_id === r.repl_id; }); return p.length ? '<a href="javascript:void(0)" onclick="event.stopPropagation();viewPdf(' + p[0].att_id + ')" title="Open PDF">' + ICO.clip + ' ' + p.length + '</a>' : '<span style="color:var(--dang)">missing</span>'; } });
  e.filters.push({ label: 'Warranty', get: function (r) { return r.warranty_status || ''; }, opts: ['In Warranty', 'Out of Warranty', 'Partial'] });
  var bd = e.beforeDelete;
  e.beforeDelete = function (r) { if (bd) bd(r); DB.where('attachment', function (a) { return a.ref_type === 'replacement' && a.ref_id === r.repl_id; }).forEach(function (a) { DB.del('attachment', a.att_id, true); }); };
})();

/* ============================================================
   3. SERVICE CENTER LOGIN
   ============================================================ */
(function () {
  var c = ENT.center;
  c.fields.push({ k: 'password', l: 'Login password', req: 1 });
  c.defaults = function () { return { is_active: 1, password: 'sc@123' }; };
  c.cols.splice(2, 0, { h: 'Login (code / password)', val: function (r) { return (r.sc_code || '') + ' / ' + (r.password || ''); }, cell: function (r) { return '<span class="mono" style="font-size:11.5px">' + esc(r.sc_code || '—') + '</span> <span class="hint" style="margin:0">/ ' + esc(r.password || '—') + '</span>'; } });
  c.note = 'Each service center signs in on the <b>Service Center</b> tab of the login page with its <b>center code</b> and the password set here. It sees only its own calls, job cards, stock, material requests and challans.';
})();

function scLoginForm() {
  var s = DB.find('service_center', function (x) { return x.is_active == 1; });
  return '<h2>Service center login</h2><div class="sub">Center code and password given by the head office</div>' +
    '<label>Center code</label><input id="lgU" type="text" value="' + esc(s ? s.sc_code : '') + '" autocomplete="off">' +
    '<label>Password</label><input id="lgP" type="password" value="' + esc(s ? s.password : '') + '">' +
    '<button class="btn-login" id="lgGo">Login</button>' +
    '<div class="lquick"><b>Demo</b>' + DB.where('service_center', function (x) { return x.is_active == 1; }).slice(0, 4).map(function (x) { return '<span class="chip" data-u="' + esc(x.sc_code) + '" data-p="' + esc(x.password) + '">' + esc(x.sc_name) + '</span>'; }).join('') + '</div>';
}
(function () {
  var baseShow = showLogin;
  showLogin = function () {
    baseShow();
    var t = $('.ltabs'); if (t && !$('[data-t="sc"]', t)) {
      var b = el('button', { 'data-t': 'sc' }); b.textContent = 'Service Center'; b.dataset.t = 'sc';
      t.insertBefore(b, t.children[1]);
      b.addEventListener('click', function () { LOGIN.tab = 'sc'; LOGIN.otp = null; paintLogin(); });
      t.children[0].textContent = 'HO / Staff';
    }
    paintLogin();
  };
  var basePaint = paintLogin;
  paintLogin = function () {
    if (LOGIN.tab !== 'sc') return basePaint();
    $$('.ltabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.t === 'sc'); });
    var f = $('#loginForm'); f.innerHTML = scLoginForm();
    $$('.chip', f).forEach(function (c) { c.addEventListener('click', function () { $('#lgU').value = this.dataset.u; $('#lgP').value = this.dataset.p; doLogin(); }); });
    $('#lgGo').addEventListener('click', doLogin);
    $$('#loginForm input').forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); }); });
  };
  var baseLogin = doLogin;
  doLogin = function () {
    if (LOGIN.tab !== 'sc') return baseLogin();
    var u = ($('#lgU').value || '').trim(), p = $('#lgP').value;
    var s = DB.find('service_center', function (x) { return String(x.sc_code || '').toLowerCase() === u.toLowerCase() && x.password === p; });
    if (!s) return toast('Wrong center code or password', 'err');
    if (s.is_active != 1) return toast('This service center is inactive', 'err');
    DB.upd('service_center', s.sc_id, { last_login: nowIso() }, true);
    enterApp(scUser(s));
  };
  var baseRestore = restoreSession;
  restoreSession = function () {
    var s = null; try { s = JSON.parse(sessionStorage.getItem('dws.session') || 'null'); } catch (e) { }
    if (s && s.kind === 'SC') { var r = DB.get('service_center', s.id); if (r && r.is_active == 1) { enterApp(scUser(r), true); return true; } return false; }
    return baseRestore();
  };
  var baseRole = roleLabel;
  roleLabel = function (u) { return u.role === 'SC' ? 'Service Center ' + (u.rec.sc_code || '') : u.role === 'WAREHOUSE' ? 'Warehouse / Store' : baseRole(u); };
  var baseLabel = labelFor;
  labelFor = function (item) { if (isSC() && item[0] === '#/k/stock') return 'My Center Stock'; if (isSC() && item[0] === '#/s/mr') return 'My Material Requests'; return baseLabel(item); };
  changePasswordSave = function () {
    var u = APP.user, tbl = u.kind === 'DEALER' ? 'dealer' : u.kind === 'SC' ? 'service_center' : 'app_user', rec = DB.get(tbl, u.id);
    if (!rec || u.kind === 'CUSTOMER') return;
    if ($('#cpO').value !== rec.password) return toast('Current password is wrong', 'err');
    if ($('#cpN').value.length < 3) return toast('New password is too short', 'err');
    if ($('#cpN').value !== $('#cpC').value) return toast('The two new passwords do not match', 'err');
    DB.upd(tbl, u.id, { password: $('#cpN').value }); DB.save(); closeModal(); toast('Password changed', 'ok');
  };
})();
function scUser(s) { return { kind: 'SC', id: s.sc_id, name: s.sc_name, role: 'SC', rec: s }; }

/* data scope for the service center login */
(function () {
  var bc = Q.complaints, bj = Q.jobcards;
  Q.complaints = function () { var u = Q.u(); if (u && u.kind === 'SC') return DB.all('complaint').filter(function (r) { return r.sc_id == u.id; }); return bc(); };
  Q.jobcards = function () { var u = Q.u(); if (u && u.kind === 'SC') return DB.all('jobcard').filter(function (j) { return j.sc_id == u.id; }); return bj(); };
  var bs = stockLocsVisible;
  stockLocsVisible = function () {
    var u = APP.user;
    if (u && u.kind === 'SC') { var engs = {}; DB.all('app_user').forEach(function (e) { if (e.role === 'ENGINEER' && e.sc_id == u.id) engs[e.user_id] = 1; }); return function (t, i) { return (t === 'SC' && i == u.id) || (t === 'ENG' && engs[i]); }; }
    return bs();
  };
  engineerOpts = (function (be) { return function (scId) { if (isSC()) scId = APP.user.id; return be(scId); }; })(engineerOpts);
  var bl = jcLoad;
  jcLoad = function (row, callId) { bl(row, callId); if (isSC() && !row) JC.hdr.sc_id = APP.user.id; };
  locOptions = (function (b) { return function (sel) { return '<optgroup label="Warehouse"><option value="WH:0"' + (sel === 'WH:0' ? ' selected' : '') + '>Central Warehouse</option></optgroup>' + b(sel); }; })(locOptions);
  locName = function (type, id) { return type === 'WH' ? 'Central Warehouse' : type === 'SC' ? scName(id) : userName(id); };
})();

/* ---------------- navigation ---------------- */
(function () {
  function addRole(hash, role) { NAV.forEach(function (g) { g.items.forEach(function (i) { if (i[0] === hash && i[2].indexOf(role) < 0) { i[2] = i[2].slice(); i[2].push(role); } }); }); }
  ['#/s/visits', '#/s/jobcards', '#/k/stock'].forEach(function (h) { addRole(h, 'SC'); });
  addRole('#/k/stock', 'WAREHOUSE'); addRole('#/k/txns', 'WAREHOUSE');
  NAV.forEach(function (g) { g.items.forEach(function (i) { if (i[0] === '#/s/calls') i[2] = ALL.filter(function (r) { return r !== 'WAREHOUSE'; }); }); });
  var svcIdx = 0; NAV.forEach(function (g, i) { if (g.g === 'Service') svcIdx = i; });
  NAV.splice(svcIdx + 1, 0, {
    g: 'Material (Service)', ico: ICO.cart, key: 'Service', items: [
      ['#/s/mr', 'Material Requests', ['SUPER', 'HO', 'MANAGER', 'SC', 'WAREHOUSE']],
      ['#/s/mrapproval', 'Material Request Approval', HO],
      ['#/s/challans', 'Delivery Challans (RDC / NRDC)', ['SUPER', 'HO', 'MANAGER', 'SC', 'WAREHOUSE']],
      ['#/s/dcreturn', 'Defective / Fresh Receipt', ['SUPER', 'HO', 'WAREHOUSE']],
      ['#/s/matreport', 'Material & Challan Reports', ['SUPER', 'HO', 'MANAGER', 'SC', 'WAREHOUSE']]
    ]
  });
})();

/* ============================================================
   4. MATERIAL REQUEST (service center -> HO approval)
   ============================================================ */
var MR = { row: null, lines: [] };
ROUTES['s/mr'] = function (a, q) {
  if (isWH() && !a[0]) return whMrList();
  if (a[0] === 'new') { setTimeout(function () { mrForm(null); }, 30); location.replace('#/s/mr'); return { title: '', body: '' }; }
  if (a[0]) return mrView(a[0]);
  var rows = Q.mr(), c = function (s) { return rows.filter(function (r) { return r.status === s; }).length; };
  var canAdd = isHO() || mySc() || isWH();
  return {
    title: isSC() ? 'My Material Requests' : 'Material Requests', crumb: 'Home › Material › <b>Material Requests</b>',
    sub: 'Service center requests (approved by HO, issued by the warehouse on RDC / NRDC) and warehouse indents to HO (approved and dispatched by HO, received into warehouse stock)',
    actions: canAdd ? '<button class="btn pri" onclick="mrForm(null)">' + ICO.plus + (isWH() ? ' New Indent to HO' : ' New Material Request') + '</button>' : '',
    body: stripCards([{ l: 'Total requests', v: inr(rows.length) }, { l: 'Draft', v: c('Draft') }, { l: 'Pending approval', v: c('Pending Approval'), c: 'warn', go: isHO() ? '#/s/mrapproval' : null },
      { l: 'Approved — to issue', v: c('Approved') + c('Partly Approved'), c: 'info' }, { l: 'Issued', v: c('Issued') + c('Partly Issued'), c: 'ok' }, { l: 'Rejected', v: c('Rejected'), c: 'dang' }]) + '<div id="mrGrid"></div>',
    after: function () { mrGrid('#mrGrid', rows); }
  };
};
function mrGrid(sel, rows, approvalMode) {
  mountGrid(sel, {
    title: 'Material_requests', rows: rows, sortI: 1, sortD: 'desc', searchPlaceholder: 'Search MR no, center, spare…',
    search: function (r) { return [r.mr_no, partyOf(r), r.purpose, isWHReq(r) ? 'warehouse indent' : 'service center request', mrLines(r).map(function (i) { return i.particulars + ' ' + i.spare_code; }).join(' ')].join(' '); },
    filters: [{ label: 'Status', get: function (r) { return r.status; }, opts: MR_STATUS }, { label: 'Request type', get: function (r) { return isWHReq(r) ? 'Warehouse indent → HO' : 'Service center → Warehouse'; } }, { label: 'Requested by', get: function (r) { return partyOf(r); } }, { label: 'Purpose', get: function (r) { return r.purpose; }, opts: MAT_PURPOSE }],
    cols: [
      { h: 'MR No', val: function (r) { return r.mr_no; }, cell: function (r) { return '<b>' + esc(r.mr_no) + '</b>'; } },
      { h: 'Date', val: function (r) { return r.mr_date; }, cell: function (r) { return dmy(r.mr_date); } },
      { h: 'Type', val: function (r) { return isWHReq(r) ? 'Indent to HO' : 'SC request'; }, cell: function (r) { return isWHReq(r) ? tag('Warehouse → HO', 'acc') : tag('SC → Warehouse', 'pur'); } },
      { h: 'Requested by', val: function (r) { return partyOf(r); } },
      { h: 'Purpose', val: function (r) { return r.purpose; } },
      { h: 'Items', val: function (r) { return mrLines(r).map(function (i) { return i.particulars + ' × ' + i.qty_req; }).join(', '); }, cell: function (r) { var l = mrLines(r); return esc(shortName(l.map(function (i) { return i.particulars + ' × ' + i.qty_req; }).join(', '), 60)); } },
      { h: 'Req qty', val: function (r) { return sum(mrLines(r), function (i) { return +i.qty_req; }); }, cls: 'n' },
      { h: 'Appr qty', val: function (r) { return sum(mrLines(r), function (i) { return +i.qty_appr || 0; }); }, cls: 'n' },
      { h: 'Issued', val: function (r) { return sum(mrLines(r), function (i) { return +i.qty_issued || 0; }); }, cls: 'n' },
      { h: 'Required by', val: function (r) { return r.required_by || ''; }, cell: function (r) { return r.required_by ? dmy(r.required_by) : '—'; } },
      { h: 'Status', val: function (r) { return r.status; }, cell: function (r) { return statusTag(r.status); } }
    ],
    actions: function (r, i) {
      var h = '<button class="ract" data-ra="view" data-ri="' + i + '" title="Open">' + ICO.eye + '</button>';
      if (isHO() && r.status === 'Pending Approval') h += '<button class="ract" data-ra="appr" data-ri="' + i + '" title="Approve / reject">' + ICO.tick + '</button>';
      if (mrCanAct(r)) h += '<button class="ract" data-ra="dc" data-ri="' + i + '" title="' + (isWHReq(r) ? 'Dispatch to warehouse (STN)' : 'Issue on delivery challan') + '">' + ICO.box + '</button>';
      return h;
    },
    onAction: function (a, r) { if (a === 'view') location.hash = '#/s/mr/' + r.mr_id; else if (a === 'appr') mrApproveForm(r.mr_id); else if (a === 'dc') mrNext(r.mr_id); },
    onRow: function (r) { location.hash = '#/s/mr/' + r.mr_id; }
  });
}
var MR_OPEN = ['Approved', 'Partly Approved', 'Partly Issued'];
/* who acts next on an approved request: warehouse issues SC requests, HO dispatches warehouse indents */
function mrCanAct(m) { return MR_OPEN.indexOf(m.status) >= 0 && (isWHReq(m) ? canDispatch() : canIssue()); }
function mrNext(id) { var m = DB.get('material_request', id); if (isWHReq(m)) stnForm(id); else dcForm(id); }
function mrForm(row) {
  if (row && typeof row !== 'object') row = DB.get('material_request', row);
  MR = { row: row, lines: [] };
  if (row) mrLines(row).forEach(function (i) { MR.lines.push({ spare_id: i.spare_id, qty: i.qty_req, remarks: i.remarks || '' }); });
  else MR.lines.push({ spare_id: '', qty: 1, remarks: '' });
  var d = row || { mr_date: today(), sc_id: mySc() || '', purpose: 'Stock replenishment', priority: 'Medium', req_from: isWH() ? 'WAREHOUSE' : 'SC' };
  var lockSc = !!mySc() && !isHO(), wh = isWHReq(d);
  MR.wh = wh;
  var scs = DB.all('service_center').filter(function (s) { return s.is_active == 1 || s.sc_id == d.sc_id; });
  var body = '<div class="sec-h">1 · Request details</div><div class="frm c3">' +
    '<div class="f"><label>MR date <span class="rq">*</span></label><input id="mr_date" type="date" max="' + today() + '" value="' + esc(d.mr_date) + '"></div>' +
    (wh ? '<div class="f"><label>Requested by</label><input readonly value="Central Warehouse → HO"></div>' : '<div class="f"><label>Service center <span class="rq">*</span></label><select id="mr_sc"' + (lockSc ? ' disabled' : '') + '><option value="">— select —</option>' + scs.map(function (s) { return '<option value="' + s.sc_id + '"' + (d.sc_id == s.sc_id ? ' selected' : '') + '>' + esc(s.sc_name) + '</option>'; }).join('') + '</select></div>') +
    '<div class="f"><label>Purpose <span class="rq">*</span></label><select id="mr_purpose">' + MAT_PURPOSE.map(function (p) { return '<option' + (d.purpose === p ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></div>' +
    (wh ? '' : '<div class="f"><label>Against service call</label><select id="mr_call"><option value="">— none —</option></select></div>') +
    '<div class="f"><label>Required by</label><input id="mr_reqby" type="date" value="' + esc(d.required_by || '') + '"></div>' +
    '<div class="f"><label>Priority</label><select id="mr_pri">' + PRIORITY.map(function (p) { return '<option' + (d.priority === p ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></div>' +
    '<div class="f full"><label>Remarks</label><input id="mr_rem" value="' + esc(d.remarks || '') + '"></div></div>' +
    (row && row.status === 'Rejected' ? '<div class="note w" style="margin-top:10px">Rejected by ' + esc(row.approved_by || 'HO') + ': ' + esc(row.approval_remarks || '') + ' — edit and submit again.</div>' : '') +
    '<div class="sec-h">2 · Material required</div><div id="mr_lines"></div><button class="btn sm" style="margin-top:6px" onclick="MR.lines.push({spare_id:\'\',qty:1,remarks:\'\'});mrPaint()">' + ICO.plus + ' Add line</button>';
  modal(row ? 'Edit ' + (wh ? 'indent' : 'material request') + ' — ' + esc(row.mr_no) : (wh ? 'New warehouse indent to HO' : 'New material request to warehouse'), body,
    '<button class="btn" onclick="closeModal()">Cancel</button><button class="btn" onclick="mrSave(false)">' + ICO.save + ' Save draft</button><button class="btn pri" onclick="mrSave(true)">' + ICO.arrow + ' Submit to HO for approval</button>', 'wide sticky');
  var fillCalls = function () {
    var sc = $('#mr_sc').value, cs = Q.complaints().filter(function (c) { return (!sc || c.sc_id == sc) && (callOpen(c) || (row && row.complaint_id === c.complaint_id)); });
    $('#mr_call').innerHTML = '<option value="">— none —</option>' + cs.map(function (c) { return '<option value="' + c.complaint_id + '"' + (d.complaint_id == c.complaint_id ? ' selected' : '') + '>' + esc(c.complaint_no + ' — ' + c.customer_name) + '</option>'; }).join('');
    mrPaint();
  };
  if (wh) { mrPaint(); return; }
  $('#mr_sc').addEventListener('change', fillCalls); fillCalls();
}
function mrPaint() {
  var sc = $('#mr_sc') ? $('#mr_sc').value : '', sps = DB.all('spare_master').filter(function (s) { return s.is_active == 1; });
  var h = '<table class="dt"><thead><tr><th style="width:34px">#</th><th>Spare / material</th><th style="width:90px">Category</th>' + (MR.wh ? '' : '<th class="n" style="width:120px">Center stock (good)</th>') + '<th class="n" style="width:110px">Warehouse stock</th><th class="n" style="width:90px">Qty required</th><th style="width:200px">Remarks</th><th style="width:34px"></th></tr></thead><tbody>';
  MR.lines.forEach(function (l, i) {
    var s = DB.get('spare_master', l.spare_id);
    h += '<tr><td>' + (i + 1) + '</td><td><select data-i="' + i + '" data-f="spare_id" style="width:100%"><option value="">— select spare —</option>' + sps.map(function (x) { return '<option value="' + x.spare_id + '"' + (l.spare_id == x.spare_id ? ' selected' : '') + '>' + esc(x.spare_name + ' (' + x.spare_code + ')') + '</option>'; }).join('') + '</select></td>' +
      '<td>' + (s ? catTag(s.category) : '') + '</td>' + (MR.wh ? '' : '<td class="n">' + (s && sc ? stockBal(s.spare_id, 'SC', sc, 'GOOD') : '—') + '</td>') + '<td class="n">' + (s ? stockBal(s.spare_id, 'WH', 0, 'GOOD') : '—') + '</td>' +
      '<td class="n"><input type="number" min="1" step="any" style="width:76px;text-align:right" data-i="' + i + '" data-f="qty" value="' + esc(l.qty) + '"></td>' +
      '<td><input data-i="' + i + '" data-f="remarks" value="' + esc(l.remarks) + '" style="width:100%"></td>' +
      '<td><button class="ract del" onclick="MR.lines.splice(' + i + ',1);if(!MR.lines.length)MR.lines.push({spare_id:\'\',qty:1,remarks:\'\'});mrPaint()">' + ICO.trash + '</button></td></tr>';
  });
  $('#mr_lines').innerHTML = h + '</tbody></table>';
  $$('#mr_lines [data-f]').forEach(function (e) { e.addEventListener(e.tagName === 'SELECT' ? 'change' : 'input', function () { MR.lines[+this.dataset.i][this.dataset.f] = this.value; if (this.tagName === 'SELECT') mrPaint(); }); });
}
function mrSave(submit) {
  var g = function (x) { var e = document.getElementById(x); return e ? e.value.trim() : ''; }, row = MR.row;
  var wh = MR.wh, sc = wh ? null : (+g('mr_sc') || mySc()); if (!wh && !sc) return toast('Select the service center', 'err');
  if (!g('mr_date')) return toast('MR date is required', 'err'); if (g('mr_date') > today()) return toast('MR date cannot be in the future', 'err');
  if (g('mr_reqby') && g('mr_reqby') < g('mr_date')) return toast('Required-by date cannot be before the MR date', 'err');
  var lines = MR.lines.filter(function (l) { return l.spare_id; });
  if (!lines.length) return toast('Add at least one spare line', 'err');
  for (var i = 0; i < lines.length; i++) {
    if (!(+lines[i].qty > 0)) return toast('Line ' + (i + 1) + ': quantity must be more than zero', 'err');
    if (lines.some(function (o, j) { return j !== i && o.spare_id == lines[i].spare_id; })) return toast('Line ' + (i + 1) + ': the same spare is entered twice', 'err');
  }
  var v = { mr_date: g('mr_date'), req_from: wh ? 'WAREHOUSE' : 'SC', sc_id: sc, purpose: g('mr_purpose'), complaint_id: +g('mr_call') || null, required_by: g('mr_reqby') || null, priority: g('mr_pri'), remarks: g('mr_rem') || null };
  if (submit) { v.status = 'Pending Approval'; v.submitted_on = nowIso(); v.approved_by = null; v.approved_on = null; v.approval_remarks = null; }
  var m;
  if (row) { DB.upd('material_request', row.mr_id, v); m = row; mrLines(m).forEach(function (x) { DB.del('material_request_item', x.mritem_id, true); }); }
  else { v.mr_no = wh ? DB.nextNo('WIND', 'WI/{fy}/{n:4}') : DB.nextNo('MR', 'MR/{fy}/{n:4}'); v.status = submit ? 'Pending Approval' : 'Draft'; v.requested_by = myName(); m = DB.add('material_request', v); }
  lines.forEach(function (l, n) { var s = DB.get('spare_master', l.spare_id); DB.add('material_request_item', { mr_id: m.mr_id, line_no: n + 1, spare_id: s.spare_id, spare_code: s.spare_code, particulars: s.spare_name, qty_req: +l.qty, qty_appr: null, qty_issued: 0, remarks: l.remarks || null }, true); });
  if (submit) DB.log('Submitted', 'material_request', m.mr_no, 'for HO approval');
  DB.save(); closeModal(); location.hash = '#/s/mr/' + m.mr_id; route(true);
  toast((wh ? 'Indent ' : 'Material request ') + m.mr_no + (submit ? ' sent to HO for approval' : ' saved as draft'), 'ok');
}
function mrSubmit(id) { var m = DB.get('material_request', id); m.status = 'Pending Approval'; m.submitted_on = nowIso(); DB.log('Submitted', 'material_request', m.mr_no, 'for HO approval'); DB.save(); route(true); toast(m.mr_no + ' sent to HO for approval', 'ok'); }

function mrApproveForm(id) {
  var m = DB.get('material_request', id); if (!m) return;
  var ls = mrLines(m);
  modal('Approve material request — ' + esc(m.mr_no),
    '<div class="note">' + esc(partyOf(m)) + ' · ' + esc(m.purpose) + ' · requested ' + dmy(m.mr_date) + (m.required_by ? ' · needed by ' + dmy(m.required_by) : '') + (m.remarks ? '<br>' + esc(m.remarks) : '') + '</div>' +
    '<table class="dt"><thead><tr><th>Spare</th><th class="n">Requested</th><th class="n">' + (isWHReq(m) ? '—' : 'Center stock') + '</th><th class="n">Warehouse stock</th><th class="n" style="width:110px">Approve qty</th></tr></thead><tbody>' +
    ls.map(function (i) { return '<tr><td>' + esc(i.particulars) + ' <span class="hint" style="margin:0">' + esc(i.spare_code || '') + '</span>' + (i.remarks ? '<div class="hint">' + esc(i.remarks) + '</div>' : '') + '</td><td class="n">' + i.qty_req + '</td><td class="n">' + (isWHReq(m) ? '' : stockBal(i.spare_id, 'SC', m.sc_id, 'GOOD')) + '</td><td class="n">' + stockBal(i.spare_id, 'WH', 0, 'GOOD') + '</td><td class="n"><input type="number" min="0" step="any" class="apq" data-id="' + i.mritem_id + '" value="' + (i.qty_appr != null ? i.qty_appr : i.qty_req) + '" style="width:90px;text-align:right"></td></tr>'; }).join('') +
    '</tbody></table><div class="frm" style="margin-top:12px"><div class="f full"><label>Approval / rejection remarks</label><input id="ap_rem" placeholder="Required when rejecting"></div></div>',
    '<button class="btn" onclick="closeModal()">Cancel</button><button class="btn dang-o" onclick="mrDecide(' + id + ',false)">' + ICO.x + ' Reject</button><button class="btn pri" onclick="mrDecide(' + id + ',true)">' + ICO.tick + ' Approve</button>', 'wide sticky');
}
function mrDecide(id, ok) {
  var m = DB.get('material_request', id), rem = $('#ap_rem').value.trim();
  if (!ok) {
    if (!rem) return toast('Enter the reason for rejection', 'err');
    DB.upd('material_request', id, { status: 'Rejected', approved_by: myName(), approved_on: nowIso(), approval_remarks: rem });
    DB.log('Rejected', 'material_request', m.mr_no, rem);
  } else {
    var qs = $$('.apq').map(function (e) { return { id: +e.dataset.id, q: +e.value }; });
    if (qs.some(function (x) { return !(x.q >= 0); })) return toast('Approved quantity cannot be negative', 'err');
    if (!qs.some(function (x) { return x.q > 0; })) return toast('Approve at least one line, or reject the request', 'err');
    var bad = qs.filter(function (x) { var it = DB.get('material_request_item', x.id); return x.q > it.qty_req; })[0];
    if (bad) return toast('Approved quantity cannot be more than requested', 'err');
    qs.forEach(function (x) { DB.upd('material_request_item', x.id, { qty_appr: x.q }, true); });
    DB.upd('material_request', id, { status: 'Approved', approved_by: myName(), approved_on: nowIso(), approval_remarks: rem || 'Approved' });
    mrRefreshStatus(m);
    DB.log('Approved', 'material_request', m.mr_no, m.status);
  }
  DB.save(); closeModal(); route(true); if (ok && !isWHReq(m)) notify({ channel: 'SMS', to: (DB.find('app_user', function (x) { return x.role === 'WAREHOUSE' && x.is_active == 1; }) || {}).phone || '', tpl: 'MR_APPROVED', msg: 'Material request ' + m.mr_no + ' of ' + partyOf(m) + ' approved by HO — please issue the material on a delivery challan.', refType: 'material_request', refNo: m.mr_no });
  DB.save(); toast(m.mr_no + (ok ? ' ' + m.status.toLowerCase() + (isWHReq(m) ? ' — dispatch it to the warehouse (STN) next' : ' — now in the warehouse issue queue') : ' rejected'), 'ok');
}
function mrDelete(id) {
  var m = DB.get('material_request', id);
  if (DB.where('delivery_challan', function (c) { return c.mr_id === id && c.status !== 'Cancelled'; }).length) return toast('Challans exist against this request — cancel them first', 'err');
  confirmDo('Delete ' + esc(m.mr_no) + '?', 'The material request and its lines will be deleted.', 'Delete', function () {
    mrLines(m).forEach(function (x) { DB.del('material_request_item', x.mritem_id, true); }); DB.del('material_request', id); DB.save(); location.hash = '#/s/mr'; toast('Material request deleted', 'ok');
  }, true);
}
function mrView(id) {
  var m = DB.get('material_request', id);
  if (!m || Q.mr().indexOf(m) < 0) return { title: 'Material request', crumb: 'Home › Material › <a href="#/s/mr">Material Requests</a>', body: '<div class="card"><div class="empty">Not found, or you do not have access.</div></div>' };
  var ls = mrLines(m), dcs = DB.where('delivery_challan', function (c) { return c.mr_id === m.mr_id; }), own = isHO() || (isWHReq(m) ? isWH() : (mySc() && mySc() == m.sc_id));
  var act = '<button class="btn" onclick="location.hash=\'#/s/mr\'">' + ICO.back + ' Back</button>';
  if (own && (m.status === 'Draft' || m.status === 'Rejected')) act += '<button class="btn" onclick="mrForm(' + m.mr_id + ')">' + ICO.edit + ' Edit</button><button class="btn pri" onclick="mrSubmit(' + m.mr_id + ')">' + ICO.arrow + ' Submit for approval</button>';
  if (isHO() && m.status === 'Pending Approval') act += '<button class="btn pri" onclick="mrApproveForm(' + m.mr_id + ')">' + ICO.tick + ' Approve / Reject</button>';
  if (mrCanAct(m)) act += '<button class="btn pri" onclick="mrNext(' + m.mr_id + ')">' + ICO.box + (isWHReq(m) ? ' Dispatch to warehouse (STN)' : ' Issue on delivery challan') + '</button>';
  if (mrCanAct(m) && m.status === 'Partly Issued') act += '<button class="btn" onclick="mrCloseShort(' + m.mr_id + ')">' + ICO.check + ' Short-close</button>';
  if ((isHO() || (own && (m.status === 'Draft' || m.status === 'Rejected')))) act += '<button class="btn dang-o" style="margin:0" onclick="mrDelete(' + m.mr_id + ')">' + ICO.trash + ' Delete</button>';
  return {
    title: esc(m.mr_no) + ' &nbsp;' + statusTag(m.status), crumb: 'Home › Material › <a href="#/s/mr">Material Requests</a> › <b>' + esc(m.mr_no) + '</b>',
    sub: esc(partyOf(m)) + ' · ' + esc(m.purpose) + ' · ' + dmy(m.mr_date), actions: act,
    body: '<div class="grid2"><div class="card" style="margin:0"><h3>Request</h3><div class="cbody" style="font-size:12.5px;line-height:1.9">' +
      'Service center: <b>' + esc(partyOf(m)) + '</b><br>Requested by: ' + esc(m.requested_by || '—') + '<br>Purpose: ' + esc(m.purpose) + ' · Priority: ' + esc(m.priority || '') +
      '<br>Required by: ' + (m.required_by ? dmy(m.required_by) : '—') + (m.complaint_id ? '<br>Service call: <a href="#/s/call/' + m.complaint_id + '">' + esc(nameOf('complaint', m.complaint_id, 'complaint_no')) + '</a>' : '') + (m.remarks ? '<br>Remarks: ' + esc(m.remarks) : '') + '</div></div>' +
      '<div class="card" style="margin:0"><h3>HO approval</h3><div class="cbody" style="font-size:12.5px;line-height:1.9">' +
      (m.approved_on ? (m.status === 'Rejected' ? tag('Rejected', 'dang') : tag('Approved', 'ok')) + ' by <b>' + esc(m.approved_by || '') + '</b> on ' + dmyT(m.approved_on) + '<br>Remarks: ' + esc(m.approval_remarks || '—') : m.status === 'Pending Approval' ? tag('Waiting for HO approval', 'warn') + '<br>Submitted ' + (m.submitted_on ? dmyT(m.submitted_on) : '') : tag('Not submitted yet', 'mut')) + '</div></div></div>' +
      '<div class="card" style="margin-top:16px"><h3>Material</h3><table class="dt"><thead><tr><th>#</th><th>Spare</th><th>Code</th><th class="n">Requested</th><th class="n">Approved</th><th class="n">Issued</th><th class="n">Balance to issue</th><th>Remarks</th></tr></thead><tbody>' +
      ls.map(function (i) { return '<tr><td>' + i.line_no + '</td><td>' + esc(i.particulars) + '</td><td class="mono">' + esc(i.spare_code || '') + '</td><td class="n">' + i.qty_req + '</td><td class="n">' + (i.qty_appr == null ? '—' : i.qty_appr) + '</td><td class="n">' + (i.qty_issued || 0) + '</td><td class="n"><b>' + (i.qty_appr == null ? '—' : Math.max(0, i.qty_appr - (i.qty_issued || 0))) + '</b></td><td>' + esc(i.remarks || '') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="card"><h3>Delivery challans against this request <span class="sm2">' + dcs.length + '</span></h3>' + (dcs.length ? '<table class="dt"><thead><tr><th>Challan</th><th>Date</th><th>Type</th><th class="n">Qty</th><th class="n">Pending return</th><th>Status</th></tr></thead><tbody>' +
        dcs.map(function (c) { return '<tr class="clk" onclick="location.hash=\'#/s/' + (c.challan_type === 'Stock Transfer' ? 'whinward/' : 'challans/') + c.dc_id + '\'"><td><b>' + esc(c.dc_no) + '</b></td><td>' + dmy(c.dc_date) + '</td><td>' + dcTypeTag(c.challan_type) + '</td><td class="n">' + sum(dcLines(c), function (i) { return +i.qty; }) + '</td><td class="n">' + (c.challan_type === 'Returnable' ? dcPendTotal(c) : '—') + '</td><td>' + statusTag(c.status) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="empty" style="padding:22px">No challan yet</div>') + '</div>'
  };
}
function mrCloseShort(id) { var m = DB.get('material_request', id); confirmDo('Short-close ' + esc(m.mr_no) + '?', 'The balance quantity will not be issued.', 'Short-close', function () { DB.upd('material_request', id, { status: 'Closed' }); DB.save(); route(true); toast(m.mr_no + ' closed', 'ok'); }); }

function whMrList() {
  var rows = Q.mr(), q2 = rows.filter(function (r) { return ['Approved', 'Partly Approved', 'Partly Issued'].indexOf(r.status) >= 0; });
  return {
    title: 'Material Requests — Warehouse', crumb: 'Home › Material › <b>Material Requests</b>', sub: 'Requests raised by service centers. Once HO approves, issue the material here on a Returnable or Non-Returnable challan.',
    actions: '<button class="btn pri" onclick="dcForm()">' + ICO.box + ' Issue against request</button>',
    body: stripCards([{ l: 'To issue (approved)', v: q2.length, c: 'warn' }, { l: 'Waiting for HO approval', v: rows.filter(function (r) { return r.status === 'Pending Approval'; }).length }, { l: 'Issued', v: rows.filter(function (r) { return r.status === 'Issued'; }).length, c: 'ok' }, { l: 'Rejected by HO', v: rows.filter(function (r) { return r.status === 'Rejected'; }).length, c: 'dang' }]) +
      '<div class="card"><h3>Issue queue</h3><div class="cbody" style="padding:0" id="whQ"></div></div><div class="card"><h3>All requests</h3><div class="cbody" style="padding:0" id="whA"></div></div>',
    after: function () { mrGrid('#whQ', q2); mrGrid('#whA', rows); }
  };
}
ROUTES['s/mrapproval'] = function () {
  var rows = DB.all('material_request').filter(function (r) { return r.status === 'Pending Approval'; }), done = DB.all('material_request').filter(function (r) { return r.approved_on; });
  return {
    title: 'Material Request Approval', crumb: 'Home › Material › <b>Approval</b>', sub: 'Service center requests and warehouse indents waiting for the head office — approve full / part quantity or reject with a reason',
    body: stripCards([{ l: 'Waiting for approval', v: rows.length, c: 'warn' }, { l: 'Approved (all time)', v: done.filter(function (r) { return r.status !== 'Rejected'; }).length, c: 'ok' }, { l: 'Rejected', v: done.filter(function (r) { return r.status === 'Rejected'; }).length, c: 'dang' },
      { l: 'Approved — challan pending', v: DB.all('material_request').filter(function (r) { return r.status === 'Approved' || r.status === 'Partly Approved'; }).length, c: 'info' }]) +
      '<div class="card"><h3>Pending approval</h3><div class="cbody" style="padding:0" id="mraG"></div></div><div class="card"><h3>Approved — waiting for warehouse issue (SC requests) / HO dispatch (warehouse indents)</h3><div class="cbody" style="padding:0" id="mraG2"></div></div>',
    after: function () { mrGrid('#mraG', rows); mrGrid('#mraG2', DB.all('material_request').filter(function (r) { return ['Approved', 'Partly Approved', 'Partly Issued'].indexOf(r.status) >= 0; })); }
  };
};

/* ============================================================
   5. DELIVERY CHALLAN  (Returnable / Non-Returnable)
   ============================================================ */
function dcTypeTag(t) { return t === 'Returnable' ? tag('Returnable', 'pur') : tag('Non-Returnable', 'info'); }
var DCF = { mr: null };
function dcForm(mrId) {
  if (!canIssue()) return toast('Material is issued to service centers from the warehouse login', 'err');
  var opts = DB.all('material_request').filter(function (r) { return !isWHReq(r) && MR_OPEN.indexOf(r.status) >= 0; });
  if (!mrId) {
    if (!opts.length) return toast('No approved material request is waiting for a challan', 'err');
    modal('New delivery challan — pick the approved request', '<div class="frm"><div class="f full"><label>Approved material request <span class="rq">*</span></label><select id="dc_pickmr">' + opts.map(function (m) { return '<option value="' + m.mr_id + '">' + esc(m.mr_no + ' — ' + partyOf(m) + ' (' + m.status + ')') + '</option>'; }).join('') + '</select></div></div>',
      '<button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" onclick="dcForm(+$(\'#dc_pickmr\').value)">Next ' + ICO.arrow + '</button>', 'narrow sticky');
    return;
  }
  var m = DB.get('material_request', mrId), sc = DB.get('service_center', m.sc_id), ls = mrLines(m).filter(function (i) { return (i.qty_appr || 0) - (i.qty_issued || 0) > 0; });
  DCF.mr = m;
  var body = '<div class="note">Against <b>' + esc(m.mr_no) + '</b> · ' + esc(sc.sc_name) + ', ' + esc(sc.city || '') + ' · approved by ' + esc(m.approved_by || '') + '</div>' +
    '<div class="sec-h">1 · Challan type</div><div style="display:flex;gap:12px;flex-wrap:wrap">' +
    '<label class="card" style="margin:0;padding:12px 14px;cursor:pointer;flex:1;min-width:240px"><input type="radio" name="dc_type" value="Returnable" onchange="dcTypeChg()"> <b>Returnable (RDC)</b><div class="hint">Material / defective parts must come back to HO — tracked in the Fresh / Defective receipt.</div></label>' +
    '<label class="card" style="margin:0;padding:12px 14px;cursor:pointer;flex:1;min-width:240px"><input type="radio" name="dc_type" value="Non-Returnable" onchange="dcTypeChg()"> <b>Non-Returnable (NRDC)</b><div class="hint">Material is consumed at the service center — nothing comes back.</div></label></div>' +
    '<div class="sec-h">2 · Dispatch details</div><div class="frm c3">' +
    '<div class="f"><label>Challan date <span class="rq">*</span></label><input id="dc_date" type="date" max="' + today() + '" value="' + today() + '"></div>' +
    '<div class="f"><label>Expected return by <span class="rq" id="dc_retrq" style="display:none">*</span></label><input id="dc_ret" type="date" disabled></div>' +
    '<div class="f"><label>Transporter</label><input id="dc_tr"></div><div class="f"><label>Vehicle no</label><input id="dc_veh"></div><div class="f"><label>LR / docket no</label><input id="dc_lr"></div>' +
    '<div class="f"><label>Remarks</label><input id="dc_rem"></div></div>' +
    '<div class="sec-h">3 · Material to issue</div><table class="dt"><thead><tr><th>Spare</th><th class="n">Approved</th><th class="n">Already issued</th><th class="n">Warehouse stock</th><th class="n" style="width:100px">Issue qty</th><th class="n" style="width:110px">Rate ₹</th><th class="n">Amount ₹</th></tr></thead><tbody>' +
    ls.map(function (i) { var s = DB.get('spare_master', i.spare_id) || {}, bal = (i.qty_appr || 0) - (i.qty_issued || 0); return '<tr><td>' + esc(i.particulars) + ' <span class="hint" style="margin:0">' + esc(i.spare_code || '') + '</span></td><td class="n">' + i.qty_appr + '</td><td class="n">' + (i.qty_issued || 0) + '</td><td class="n">' + stockBal(i.spare_id, 'WH', 0, 'GOOD') + '</td><td class="n"><input type="number" class="dcq" data-id="' + i.mritem_id + '" data-max="' + bal + '" min="0" step="any" value="' + bal + '" style="width:80px;text-align:right" oninput="dcAmt()"></td><td class="n"><input type="number" class="dcr" data-id="' + i.mritem_id + '" min="0" step="any" value="' + (s.rate || 0) + '" style="width:92px;text-align:right" oninput="dcAmt()"></td><td class="n dca" data-id="' + i.mritem_id + '"></td></tr>'; }).join('') +
    '</tbody><tfoot><tr><td colspan="6" class="n"><b>Total</b></td><td class="n"><b id="dc_tot"></b></td></tr></tfoot></table>';
  modal('New delivery challan', body, '<button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" onclick="dcSave()">' + ICO.save + ' Save &amp; issue challan</button>', 'wide sticky');
  dcAmt();
}
function dcTypeChg() { var r = $('input[name="dc_type"]:checked'), ret = r && r.value === 'Returnable'; $('#dc_ret').disabled = !ret; $('#dc_retrq').style.display = ret ? '' : 'none'; if (ret && !$('#dc_ret').value) $('#dc_ret').value = addDays(today(), 30); if (!ret) $('#dc_ret').value = ''; }
function dcAmt() { var t = 0; $$('.dcq').forEach(function (q) { var r = $('.dcr[data-id="' + q.dataset.id + '"]'), a = round2((+q.value || 0) * (+r.value || 0)); t += a; $('.dca[data-id="' + q.dataset.id + '"]').textContent = inr(a, 2); }); $('#dc_tot').textContent = '₹ ' + inr(t, 2); }
function dcSave() {
  var m = DCF.mr, tp = $('input[name="dc_type"]:checked');
  if (!tp) return toast('Select the challan type — Returnable or Non-Returnable', 'err');
  var date = $('#dc_date').value; if (!date) return toast('Challan date is required', 'err'); if (date > today()) return toast('Challan date cannot be in the future', 'err');
  if (date < m.mr_date) return toast('Challan date cannot be before the MR date', 'err');
  var ret = tp.value === 'Returnable' ? $('#dc_ret').value : null;
  if (tp.value === 'Returnable' && !ret) return toast('Enter the expected return date for a returnable challan', 'err');
  if (ret && ret < date) return toast('Expected return date cannot be before the challan date', 'err');
  var ls = $$('.dcq').map(function (q) { return { it: DB.get('material_request_item', +q.dataset.id), q: +q.value || 0, max: +q.dataset.max, rate: +$('.dcr[data-id="' + q.dataset.id + '"]').value || 0 }; });
  if (ls.some(function (x) { return x.q < 0; })) return toast('Quantity cannot be negative', 'err');
  var over = ls.filter(function (x) { return x.q > x.max; })[0]; if (over) return toast(over.it.particulars + ': cannot issue more than the approved balance (' + over.max + ')', 'err');
  ls = ls.filter(function (x) { return x.q > 0; }); if (!ls.length) return toast('Enter the quantity to issue on at least one line', 'err');
  var short = ls.filter(function (x) { return stockBal(x.it.spare_id, 'WH', 0, 'GOOD') < x.q; });
  if (short.length) return toast('Not enough warehouse stock for ' + short[0].it.particulars + ' — available ' + stockBal(short[0].it.spare_id, 'WH', 0, 'GOOD') + '. Raise an indent to HO and receive the material first.', 'err');
  var go = function () {
    var pre = tp.value === 'Returnable' ? 'RDC' : 'NRDC';
    var c = DB.add('delivery_challan', { dc_no: DB.nextNo(pre, pre + '/{fy}/{n:4}'), dc_date: date, challan_type: tp.value, mr_id: m.mr_id, issue_to: 'SC', sc_id: m.sc_id, expected_return: ret, transporter: $('#dc_tr').value.trim() || null, vehicle_no: $('#dc_veh').value.trim() || null, lr_no: $('#dc_lr').value.trim() || null, status: 'Issued', remarks: $('#dc_rem').value.trim() || null, created_by: myName() });
    ls.forEach(function (x, n) { DB.add('delivery_challan_item', { dc_id: c.dc_id, line_no: n + 1, mritem_id: x.it.mritem_id, spare_id: x.it.spare_id, particulars: x.it.particulars, qty: x.q, rate: x.rate, amount: round2(x.q * x.rate), qty_fresh_ret: 0, qty_def_ret: 0 }, true); x.it.qty_issued = round2((+x.it.qty_issued || 0) + x.q); });
    dcPostStock(c); mrRefreshStatus(m);
    DB.save(); closeModal(); location.hash = '#/s/challans/' + c.dc_id; toast(c.dc_no + ' issued to ' + partyOf(c) + ' — stock moved from the warehouse to the center', 'ok');
  };
  if (false) confirmDo('HO stock is short', 'HO good stock is less than the issue quantity for <b>' + esc(short[0].it.particulars) + '</b>' + (short.length > 1 ? ' and ' + (short.length - 1) + ' more' : '') + '. Issue anyway? (HO stock will go negative)', 'Issue anyway', go);
  else go();
}
function dcCancel(id) {
  var c = DB.get('delivery_challan', id);
  if (DB.where('dc_receipt', function (r) { return r.dc_id === id; }).length) return toast('Returns are booked against this challan — delete those receipts first', 'err');
  confirmDo('Cancel ' + esc(c.dc_no) + '?', 'The stock movement is reversed and the quantity goes back to the material request balance.', 'Cancel challan', function () {
    unpostRef(c.dc_no);
    dcLines(c).forEach(function (it) { var mi = DB.get('material_request_item', it.mritem_id); if (mi) mi.qty_issued = Math.max(0, round2((+mi.qty_issued || 0) - it.qty)); });
    c.status = 'Cancelled'; var m = DB.get('material_request', c.mr_id); if (m) { if (m.status === 'Issued' || m.status === 'Partly Issued') m.status = 'Approved'; mrRefreshStatus(m); }
    DB.log('Cancelled', 'delivery_challan', c.dc_no, ''); DB.save(); route(true); toast(c.dc_no + ' cancelled', 'ok');
  }, true);
}

ROUTES['s/challans'] = function (a, q) {
  if (a[0]) return dcView(a[0]);
  var rows = Q.dc(), live = rows.filter(function (r) { return r.status !== 'Cancelled'; }), rdc = live.filter(function (r) { return r.challan_type === 'Returnable'; });
  var pend = sum(rdc, dcPendTotal), overdue = rdc.filter(function (c) { return dcPendTotal(c) > 0 && c.expected_return && c.expected_return < today(); }).length;
  return {
    title: 'Delivery Challans', crumb: 'Home › Material › <b>Delivery Challans</b>', sub: 'Material issued by HO to service centers against approved requests — Returnable (RDC) and Non-Returnable (NRDC)',
    actions: canIssue() ? '<button class="btn pri" onclick="dcForm()">' + ICO.plus + ' New Delivery Challan</button>' : '',
    body: stripCards([{ l: 'Challans', v: live.length }, { l: 'Returnable (RDC)', v: rdc.length, c: 'purple' }, { l: 'Non-Returnable (NRDC)', v: live.length - rdc.length, c: 'info' },
      { l: 'Qty pending return', v: inr(pend), c: 'warn' }, { l: 'Overdue returns', v: overdue, c: 'dang' }, { l: 'Value issued ₹', v: inr(sum(live, function (c) { return sum(dcLines(c), function (i) { return i.amount; }); })) }]) + '<div id="dcGrid"></div>',
    after: function () { dcGrid('#dcGrid', rows); }
  };
};
function dcGrid(sel, rows) {
  mountGrid(sel, {
    title: 'Delivery_challans', rows: rows, sortI: 1, sortD: 'desc', searchPlaceholder: 'Search challan, MR, center, spare…',
    search: function (r) { return [r.dc_no, mrNo(r.mr_id), partyOf(r), r.lr_no, dcLines(r).map(function (i) { return i.particulars; }).join(' ')].join(' '); },
    filters: [{ label: 'Type', get: function (r) { return r.challan_type; }, opts: ['Returnable', 'Non-Returnable'] }, { label: 'Status', get: function (r) { return r.status; }, opts: DC_STATUS }, { label: 'Service center', get: function (r) { return partyOf(r); } }],
    rowClass: function (r) { return dcPendTotal(r) > 0 && r.expected_return && r.expected_return < today() ? 'overdue' : ''; },
    cols: [
      { h: 'Challan No', val: function (r) { return r.dc_no; }, cell: function (r) { return '<b>' + esc(r.dc_no) + '</b>'; } },
      { h: 'Date', val: function (r) { return r.dc_date; }, cell: function (r) { return dmy(r.dc_date); } },
      { h: 'Type', val: function (r) { return r.challan_type; }, cell: function (r) { return dcTypeTag(r.challan_type); } },
      { h: 'Service center', val: function (r) { return partyOf(r); } },
      { h: 'MR No', val: function (r) { return mrNo(r.mr_id); } },
      { h: 'Qty issued', val: function (r) { return sum(dcLines(r), function (i) { return +i.qty; }); }, cls: 'n' },
      { h: 'Value ₹', val: function (r) { return sum(dcLines(r), function (i) { return i.amount; }); }, cls: 'n', cell: function (r) { return inr(sum(dcLines(r), function (i) { return i.amount; }), 2); } },
      { h: 'Fresh ret.', val: function (r) { return sum(dcLines(r), function (i) { return +i.qty_fresh_ret || 0; }); }, cls: 'n' },
      { h: 'Defective ret.', val: function (r) { return sum(dcLines(r), function (i) { return +i.qty_def_ret || 0; }); }, cls: 'n' },
      { h: 'Pending', val: function (r) { return dcPendTotal(r); }, cls: 'n', cell: function (r) { return r.challan_type === 'Returnable' ? '<b>' + dcPendTotal(r) + '</b>' : '—'; } },
      { h: 'Return by', val: function (r) { return r.expected_return || ''; }, cell: function (r) { return r.expected_return ? '<span style="color:var(--' + (dcPendTotal(r) > 0 && r.expected_return < today() ? 'dang' : 'ink2') + ')">' + dmy(r.expected_return) + '</span>' : '—'; } },
      { h: 'Status', val: function (r) { return r.status; }, cell: function (r) { return statusTag(r.status); } }
    ],
    actions: function (r, i) { var h = '<button class="ract" data-ra="view" data-ri="' + i + '" title="Open / print">' + ICO.eye + '</button>'; if (canIssue() && dcPendTotal(r) > 0) h += '<button class="ract" data-ra="rcv" data-ri="' + i + '" title="Receive fresh / defective">' + ICO.imp + '</button>'; return h; },
    onAction: function (a, r) { if (a === 'view') location.hash = '#/s/challans/' + r.dc_id; else if (a === 'rcv') rcvForm(r.dc_id); },
    onRow: function (r) { location.hash = '#/s/challans/' + r.dc_id; },
    totals: function (data, i) { var f = [null, null, null, null, null, function (r) { return +sum(dcLines(r), function (x) { return +x.qty; }); }, function (r) { return sum(dcLines(r), function (x) { return x.amount; }); }, function (r) { return sum(dcLines(r), function (x) { return +x.qty_fresh_ret || 0; }); }, function (r) { return sum(dcLines(r), function (x) { return +x.qty_def_ret || 0; }); }, dcPendTotal][i]; if (i === 0) return '<b>Total</b>'; return f ? '<b>' + inr(sum(data, f), i === 6 ? 2 : 0) + '</b>' : null; }
  });
}
function dcView(id) {
  var c = DB.get('delivery_challan', id);
  if (!c || Q.dc().indexOf(c) < 0) return { title: 'Delivery challan', crumb: 'Home › Material › <a href="#/s/challans">Delivery Challans</a>', body: '<div class="card"><div class="empty">Not found, or you do not have access.</div></div>' };
  var sc = DB.get('service_center', c.sc_id) || {}, ls = dcLines(c), ret = c.challan_type === 'Returnable', rcvs = DB.where('dc_receipt', function (r) { return r.dc_id === c.dc_id; });
  var act = '<button class="btn" onclick="goBack(\'#/s/challans\')">' + ICO.back + ' Back</button>';
  if (canIssue() && ret && dcPendTotal(c) > 0) act += '<button class="btn pri" onclick="rcvForm(' + c.dc_id + ')">' + ICO.imp + ' Receive fresh / defective</button>';
  if (canIssue() && c.status !== 'Cancelled' && !rcvs.length) act += '<button class="btn dang-o" style="margin:0" onclick="dcCancel(' + c.dc_id + ')">' + ICO.x + ' Cancel challan</button>';
  act += '<button class="btn" onclick="window.print()">' + ICO.prn + ' Print</button>';
  var tot = sum(ls, function (i) { return i.amount; });
  return {
    title: esc(c.dc_no) + ' &nbsp;' + dcTypeTag(c.challan_type) + ' ' + statusTag(c.status), crumb: 'Home › Material › <a href="#/s/challans">Delivery Challans</a> › <b>' + esc(c.dc_no) + '</b>',
    sub: 'To ' + esc(sc.sc_name || '') + ' · against ' + esc(mrNo(c.mr_id)) + (ret ? ' · return by ' + dmy(c.expected_return) : ''), actions: act,
    body: '<div class="paper">' + docHead(c.dc_no, c.dc_date, esc(c.status)) +
      '<div class="dt-title"><h2>' + (ret ? 'Returnable' : 'Non-Returnable') + ' Delivery Challan</h2></div>' +
      '<div class="pmeta"><div><div class="hd">From Central Warehouse to — service center</div><b>' + esc(sc.sc_name || '') + '</b> (' + esc(sc.sc_code || '') + ')<br>' + esc([sc.address, sc.city, sc.district, stateName(sc.state_code), sc.pincode].filter(Boolean).join(', ')) + '<br>' + esc(sc.contact_person || '') + ' · ' + esc(sc.mobile || '') + (sc.gstin ? '<br>GSTIN: ' + esc(sc.gstin) : '') + '</div>' +
      '<div><div class="hd">Dispatch</div>Material request: <b>' + esc(mrNo(c.mr_id)) + '</b><br>Transporter: ' + esc(c.transporter || '—') + ' · Vehicle: ' + esc(c.vehicle_no || '—') + '<br>LR / docket: ' + esc(c.lr_no || '—') + (ret ? '<br>Expected return by: <b>' + dmy(c.expected_return) + '</b>' : '<br>Not to be returned') + '</div></div>' +
      '<table class="ptab"><thead><tr><th>#</th><th>Particulars</th><th>Code</th><th class="n">Qty</th><th class="n">Rate</th><th class="n">Amount</th>' + (ret ? '<th class="n">Fresh ret.</th><th class="n">Defective ret.</th><th class="n">Pending</th>' : '') + '</tr></thead><tbody>' +
      ls.map(function (i) { var s = DB.get('spare_master', i.spare_id) || {}; return '<tr><td>' + i.line_no + '</td><td>' + esc(i.particulars) + '</td><td class="mono">' + esc(s.spare_code || '') + '</td><td class="n">' + i.qty + '</td><td class="n">' + inr(i.rate, 2) + '</td><td class="n">' + inr(i.amount, 2) + '</td>' + (ret ? '<td class="n">' + (i.qty_fresh_ret || 0) + '</td><td class="n">' + (i.qty_def_ret || 0) + '</td><td class="n"><b>' + dcPend(i) + '</b></td>' : '') + '</tr>'; }).join('') +
      '</tbody><tfoot><tr><td colspan="3" class="n"><b>Total</b></td><td class="n"><b>' + sum(ls, function (i) { return +i.qty; }) + '</b></td><td></td><td class="n"><b>₹ ' + inr(tot, 2) + '</b></td>' + (ret ? '<td class="n">' + sum(ls, function (i) { return +i.qty_fresh_ret || 0; }) + '</td><td class="n">' + sum(ls, function (i) { return +i.qty_def_ret || 0; }) + '</td><td class="n"><b>' + dcPendTotal(c) + '</b></td>' : '') + '</tr></tfoot></table>' +
      (c.remarks ? '<div class="ptc" style="margin-top:12px"><h4>Remarks</h4>' + esc(c.remarks) + '</div>' : '') +
      (ret ? '<div class="ptc" style="margin-top:12px"><h4>Returns received at HO</h4>' + (rcvs.length ? '<table class="ptab"><thead><tr><th>Receipt</th><th>Date</th><th>Spare</th><th class="n">Fresh</th><th class="n">Defective</th><th>Defect serial / remarks</th></tr></thead><tbody>' +
        rcvs.map(function (r) { return rcvLines(r).map(function (x) { return '<tr><td>' + esc(r.rcv_no) + '</td><td>' + dmy(r.rcv_date) + '</td><td>' + esc(spareLbl(x.spare_id)) + '</td><td class="n">' + (x.qty_fresh || 0) + '</td><td class="n">' + (x.qty_defective || 0) + '</td><td>' + esc([x.defect_serial, x.remarks].filter(Boolean).join(' · ')) + '</td></tr>'; }).join(''); }).join('') + '</tbody></table>' : 'Nothing received yet.') + '</div>' : '') +
      '<div class="sign"><div><b>For ' + esc(CO().company_name) + '</b>Authorised signatory (' + esc(c.created_by || '') + ')</div><div><b>Received by</b>' + esc(sc.sc_name || '') + '</div></div>' +
      '<div class="pfoot"><span>' + esc(CO().company_name) + '</span><span>' + (ret ? 'Returnable — goods to be returned to the warehouse' : 'Non-returnable — not for sale') + '</span></div></div>'
  };
}

/* ============================================================
   6. FRESH / DEFECTIVE RECEIPT against returnable challan  (HO)
   ============================================================ */
var RCV = { dc: null };
function rcvForm(dcId) {
  var open = DB.all('delivery_challan').filter(function (c) { return c.challan_type === 'Returnable' && dcPendTotal(c) > 0; });
  if (!dcId) {
    if (!open.length) return toast('No returnable challan has quantity pending return', 'err');
    modal('Receive against returnable challan', '<div class="frm"><div class="f full"><label>Returnable delivery challan <span class="rq">*</span></label><select id="rc_pick">' + open.map(function (c) { return '<option value="' + c.dc_id + '">' + esc(c.dc_no + ' — ' + partyOf(c) + ' · pending ' + dcPendTotal(c)) + '</option>'; }).join('') + '</select></div></div>',
      '<button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" onclick="rcvForm(+$(\'#rc_pick\').value)">Next ' + ICO.arrow + '</button>', 'narrow sticky');
    return;
  }
  var c = DB.get('delivery_challan', dcId), ls = dcLines(c).filter(function (i) { return dcPend(i) > 0; });
  RCV.dc = c;
  modal('Fresh / defective receipt — ' + esc(c.dc_no),
    '<div class="note">From <b>' + esc(partyOf(c)) + '</b> · challan ' + esc(c.dc_no) + ' dated ' + dmy(c.dc_date) + ' · return due ' + dmy(c.expected_return) + '. <b>Fresh</b> = unused good stock back to warehouse stock; <b>Defective</b> = faulty part, booked into warehouse damaged stock.</div>' +
    '<div class="frm c3"><div class="f"><label>Receipt date <span class="rq">*</span></label><input id="rc_date" type="date" max="' + today() + '" value="' + today() + '"></div><div class="f"><label>Received through</label><input id="rc_thr" placeholder="Courier / transporter / by hand"></div><div class="f"><label>Remarks</label><input id="rc_rem"></div></div>' +
    '<table class="dt" style="margin-top:12px"><thead><tr><th>Spare</th><th class="n">Issued</th><th class="n">Already back</th><th class="n">Pending</th><th class="n" style="width:96px">Fresh qty</th><th class="n" style="width:96px">Defective qty</th><th style="width:200px">Defect serial / remarks</th></tr></thead><tbody>' +
    ls.map(function (i) { return '<tr><td>' + esc(i.particulars) + '</td><td class="n">' + i.qty + '</td><td class="n">' + ((+i.qty_fresh_ret || 0) + (+i.qty_def_ret || 0)) + '</td><td class="n"><b>' + dcPend(i) + '</b></td><td class="n"><input type="number" class="rcf" data-id="' + i.dcitem_id + '" data-max="' + dcPend(i) + '" min="0" step="any" value="0" style="width:80px;text-align:right"></td><td class="n"><input type="number" class="rcd" data-id="' + i.dcitem_id + '" min="0" step="any" value="0" style="width:80px;text-align:right"></td><td><input class="rcs" data-id="' + i.dcitem_id + '" style="width:100%"></td></tr>'; }).join('') + '</tbody></table>',
    '<button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" onclick="rcvSave()">' + ICO.save + ' Save receipt</button>', 'wide sticky');
}
function rcvSave() {
  var c = RCV.dc, date = $('#rc_date').value;
  if (!date) return toast('Receipt date is required', 'err'); if (date > today()) return toast('Receipt date cannot be in the future', 'err'); if (date < c.dc_date) return toast('Receipt date cannot be before the challan date', 'err');
  var ls = $$('.rcf').map(function (f) { var id = f.dataset.id; return { it: DB.get('delivery_challan_item', +id), fr: +f.value || 0, df: +$('.rcd[data-id="' + id + '"]').value || 0, max: +f.dataset.max, sn: $('.rcs[data-id="' + id + '"]').value.trim() }; });
  if (ls.some(function (x) { return x.fr < 0 || x.df < 0; })) return toast('Quantity cannot be negative', 'err');
  var over = ls.filter(function (x) { return x.fr + x.df > x.max; })[0]; if (over) return toast(over.it.particulars + ': fresh + defective cannot be more than the pending ' + over.max, 'err');
  ls = ls.filter(function (x) { return x.fr + x.df > 0; }); if (!ls.length) return toast('Enter the fresh or defective quantity received on at least one line', 'err');
  var r = DB.add('dc_receipt', { rcv_no: DB.nextNo('DRN', 'DRN/{fy}/{n:4}'), rcv_date: date, dc_id: c.dc_id, sc_id: c.sc_id, received_through: $('#rc_thr').value.trim() || null, remarks: $('#rc_rem').value.trim() || null, created_by: myName() });
  ls.forEach(function (x) { DB.add('dc_receipt_item', { rcv_id: r.rcv_id, dcitem_id: x.it.dcitem_id, spare_id: x.it.spare_id, qty_fresh: x.fr, qty_defective: x.df, defect_serial: x.sn || null }, true); x.it.qty_fresh_ret = round2((+x.it.qty_fresh_ret || 0) + x.fr); x.it.qty_def_ret = round2((+x.it.qty_def_ret || 0) + x.df); });
  rcvPostStock(r); dcRefreshStatus(c);
  DB.save(); closeModal(); route(true);
  toast(r.rcv_no + ' saved — ' + sum(ls, function (x) { return x.fr; }) + ' fresh, ' + sum(ls, function (x) { return x.df; }) + ' defective received against ' + c.dc_no, 'ok');
}
function rcvDelete(id) {
  var r = DB.get('dc_receipt', id), c = DB.get('delivery_challan', r.dc_id);
  confirmDo('Delete receipt ' + esc(r.rcv_no) + '?', 'Quantities go back to pending on ' + esc(c.dc_no) + ' and the stock entries are reversed.', 'Delete', function () {
    rcvLines(r).forEach(function (x) { var it = DB.get('delivery_challan_item', x.dcitem_id); if (it) { it.qty_fresh_ret = Math.max(0, round2(it.qty_fresh_ret - x.qty_fresh)); it.qty_def_ret = Math.max(0, round2(it.qty_def_ret - x.qty_defective)); } DB.del('dc_receipt_item', x.rcvitem_id, true); });
    unpostRef(r.rcv_no); DB.del('dc_receipt', id); dcRefreshStatus(c); DB.save(); route(true); toast('Receipt deleted', 'ok');
  }, true);
}
function rcvRows() {
  var out = [];
  Q.rcv().forEach(function (r) { var c = DB.get('delivery_challan', r.dc_id) || {}; rcvLines(r).forEach(function (x) { var it = DB.get('delivery_challan_item', x.dcitem_id) || {}; out.push({ r: r, c: c, x: x, it: it }); }); });
  return out;
}
ROUTES['s/dcreturn'] = function () {
  var rows = rcvRows(), open = DB.all('delivery_challan').filter(function (c) { return c.challan_type === 'Returnable' && dcPendTotal(c) > 0; });
  return {
    title: 'Defective / Fresh Receipt', crumb: 'Home › Material › <b>Defective / Fresh Receipt</b>', sub: 'Fresh (unused) stock and defective parts received back at the warehouse against returnable delivery challans',
    actions: '<button class="btn pri" onclick="rcvForm()">' + ICO.plus + ' Receive against RDC</button>',
    body: stripCards([{ l: 'Receipts', v: uniq(rows.map(function (o) { return o.r.rcv_id; })).length }, { l: 'Fresh qty received', v: inr(sum(rows, function (o) { return +o.x.qty_fresh || 0; })), c: 'ok' }, { l: 'Defective qty received', v: inr(sum(rows, function (o) { return +o.x.qty_defective || 0; })), c: 'dang' },
      { l: 'RDC with pending return', v: open.length, c: 'warn', go: '#/s/matreport?t=pending' }, { l: 'Qty still pending', v: inr(sum(open, dcPendTotal)), c: 'warn' }]) + '<div id="rcvG"></div>',
    after: function () {
      mountGrid('#rcvG', {
        title: 'Defective_fresh_receipts', rows: rows, sortI: 1, sortD: 'desc', searchPlaceholder: 'Search receipt, challan, center, spare…',
        search: function (o) { return [o.r.rcv_no, o.c.dc_no, partyOf(o.c), o.it.particulars, o.x.defect_serial].join(' '); },
        filters: [{ label: 'Service center', get: function (o) { return partyOf(o.c); } }, { label: 'Received as', get: function (o) { return o.x.qty_fresh && o.x.qty_defective ? 'Fresh + defective' : o.x.qty_defective ? 'Defective' : 'Fresh'; }, opts: ['Fresh', 'Defective', 'Fresh + defective'] }],
        cols: [
          { h: 'Receipt No', val: function (o) { return o.r.rcv_no; }, cell: function (o) { return '<b>' + esc(o.r.rcv_no) + '</b>'; } },
          { h: 'Date', val: function (o) { return o.r.rcv_date; }, cell: function (o) { return dmy(o.r.rcv_date); } },
          { h: 'Against RDC', val: function (o) { return o.c.dc_no; }, cell: function (o) { return '<a href="#/s/challans/' + o.c.dc_id + '" onclick="event.stopPropagation()">' + esc(o.c.dc_no) + '</a>'; } },
          { h: 'RDC date', val: function (o) { return o.c.dc_date; }, cell: function (o) { return dmy(o.c.dc_date); } },
          { h: 'Service center', val: function (o) { return partyOf(o.c); } },
          { h: 'Spare', val: function (o) { return o.it.particulars; } },
          { h: 'Issued', val: function (o) { return o.it.qty; }, cls: 'n' },
          { h: 'Fresh', val: function (o) { return +o.x.qty_fresh || 0; }, cls: 'n', cell: function (o) { return o.x.qty_fresh ? '<b style="color:var(--ok)">' + o.x.qty_fresh + '</b>' : '0'; } },
          { h: 'Defective', val: function (o) { return +o.x.qty_defective || 0; }, cls: 'n', cell: function (o) { return o.x.qty_defective ? '<b style="color:var(--dang)">' + o.x.qty_defective + '</b>' : '0'; } },
          { h: 'Pending on RDC', val: function (o) { return dcPend(o.it); }, cls: 'n' },
          { h: 'Defect serial', val: function (o) { return o.x.defect_serial || ''; }, cls: 'mono' },
          { h: 'Through', val: function (o) { return o.r.received_through || ''; } }
        ],
        actions: function (o, i) { return '<button class="ract del" data-ra="del" data-ri="' + i + '" title="Delete receipt">' + ICO.trash + '</button>'; },
        onAction: function (a, o) { if (a === 'del') rcvDelete(o.r.rcv_id); },
        totals: function (data, i) { return i === 0 ? '<b>Total</b>' : i === 7 ? '<b>' + inr(sum(data, function (o) { return +o.x.qty_fresh || 0; })) + '</b>' : i === 8 ? '<b>' + inr(sum(data, function (o) { return +o.x.qty_defective || 0; })) + '</b>' : null; }
      });
    }
  };
};

/* ============================================================
   7. REPORTS
   ============================================================ */
ROUTES['s/matreport'] = function (a, q) {
  var t = q.t || 'mr', from = q.from || '', to = q.to || '', scf = q.sc || '';
  var inR = function (d) { return (!from || d >= from) && (!to || d <= to); }, inS = function (s) { return !scf || s == scf; };
  var tabs = [['mr', 'Material Request Register'], ['dc', 'Challan Register (RDC / NRDC)'], ['pending', 'Returnable Pending'], ['rcv', 'Fresh / Defective Received'], ['wh', 'Warehouse Stock Movement'], ['sc', 'Service Center Summary']];
  var base = '#/s/matreport', qs = function (o) { var p = Object.assign({ t: t, from: from, to: to, sc: scf }, o), s = Object.keys(p).filter(function (k) { return p[k]; }).map(function (k) { return k + '=' + encodeURIComponent(p[k]); }); return base + (s.length ? '?' + s.join('&') : ''); };
  var scList = isHO() || !mySc() ? DB.all('service_center') : DB.where('service_center', function (s) { return s.sc_id == mySc(); });
  var bar = '<div class="card"><div class="cbody" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">' +
    '<div class="f"><label style="font-size:10.5px;font-weight:700;color:var(--ink3)">FROM</label><br><input type="date" id="mx_from" value="' + esc(from) + '"></div><div class="f"><label style="font-size:10.5px;font-weight:700;color:var(--ink3)">TO</label><br><input type="date" id="mx_to" value="' + esc(to) + '"></div>' +
    (scList.length > 1 ? '<div class="f"><label style="font-size:10.5px;font-weight:700;color:var(--ink3)">SERVICE CENTER</label><br><select id="mx_sc"><option value="">All</option>' + scList.map(function (s) { return '<option value="' + s.sc_id + '"' + (scf == s.sc_id ? ' selected' : '') + '>' + esc(s.sc_name) + '</option>'; }).join('') + '</select></div>' : '') +
    '<button class="btn pri" onclick="matRepApply(\'' + t + '\')">Apply</button><button class="btn" onclick="location.hash=\'' + base + '?t=' + t + '\'">Clear</button></div></div>';
  var tabHtml = '<div class="tabs">' + tabs.map(function (x) { return '<div class="tab' + (x[0] === t ? ' on' : '') + '" onclick="location.hash=\'' + qs({ t: x[0] }) + '\'">' + x[1] + '</div>'; }).join('') + '</div>';
  var mrs = Q.mr().filter(function (m) { return inR(m.mr_date) && inS(m.sc_id); }), dcs = Q.dc().filter(function (c) { return c.status !== 'Cancelled' && inR(c.dc_date) && inS(c.sc_id); });
  var body = bar + '<div id="mxG"></div>', after;
  if (t === 'mr') {
    var rows = []; mrs.forEach(function (m) { mrLines(m).forEach(function (i) { rows.push({ m: m, i: i }); }); });
    body = bar + stripCards([{ l: 'Requests', v: mrs.length }, { l: 'Lines', v: rows.length }, { l: 'Qty requested', v: inr(sum(rows, function (o) { return +o.i.qty_req; })) }, { l: 'Qty approved', v: inr(sum(rows, function (o) { return +o.i.qty_appr || 0; })), c: 'ok' }, { l: 'Qty issued', v: inr(sum(rows, function (o) { return +o.i.qty_issued || 0; })), c: 'info' }, { l: 'Pending approval', v: mrs.filter(function (m) { return m.status === 'Pending Approval'; }).length, c: 'warn' }]) + '<div id="mxG"></div>';
    after = function () { mountGrid('#mxG', { title: 'MR_register', rows: rows, sortI: 1, sortD: 'desc', pageSize: 50, search: function (o) { return [o.m.mr_no, partyOf(o.m), o.i.particulars, o.i.spare_code].join(' '); },
      filters: [{ label: 'Status', get: function (o) { return o.m.status; }, opts: MR_STATUS }, { label: 'Request type', get: function (o) { return isWHReq(o.m) ? 'Warehouse indent → HO' : 'Service center → Warehouse'; } }, { label: 'Requested by', get: function (o) { return partyOf(o.m); } }, { label: 'Purpose', get: function (o) { return o.m.purpose; } }],
      cols: [{ h: 'MR No', val: function (o) { return o.m.mr_no; }, cell: function (o) { return '<a href="#/s/mr/' + o.m.mr_id + '">' + esc(o.m.mr_no) + '</a>'; } }, { h: 'Date', val: function (o) { return o.m.mr_date; }, cell: function (o) { return dmy(o.m.mr_date); } }, { h: 'Requested by', val: function (o) { return partyOf(o.m); } }, { h: 'Purpose', val: function (o) { return o.m.purpose; } },
        { h: 'Spare', val: function (o) { return o.i.particulars; } }, { h: 'Code', val: function (o) { return o.i.spare_code || ''; }, cls: 'mono' }, { h: 'Requested', val: function (o) { return +o.i.qty_req; }, cls: 'n' }, { h: 'Approved', val: function (o) { return o.i.qty_appr == null ? '' : +o.i.qty_appr; }, cls: 'n' }, { h: 'Issued', val: function (o) { return +o.i.qty_issued || 0; }, cls: 'n' },
        { h: 'Balance', val: function (o) { return o.i.qty_appr == null || o.m.status === 'Closed' ? 0 : Math.max(0, o.i.qty_appr - (o.i.qty_issued || 0)); }, cls: 'n' }, { h: 'Approved by', val: function (o) { return o.m.approved_by || ''; } }, { h: 'Status', val: function (o) { return o.m.status; }, cell: function (o) { return statusTag(o.m.status); } }],
      totals: function (d, i) { return i === 0 ? '<b>Total</b>' : i === 6 ? '<b>' + inr(sum(d, function (o) { return +o.i.qty_req; })) + '</b>' : i === 7 ? '<b>' + inr(sum(d, function (o) { return +o.i.qty_appr || 0; })) + '</b>' : i === 8 ? '<b>' + inr(sum(d, function (o) { return +o.i.qty_issued || 0; })) + '</b>' : null; } }); };
  } else if (t === 'dc' || t === 'pending') {
    var rows2 = []; dcs.forEach(function (c) { dcLines(c).forEach(function (i) { if (t === 'pending' && !(c.challan_type === 'Returnable' && dcPend(i) > 0)) return; rows2.push({ c: c, i: i }); }); });
    var ret = rows2.filter(function (o) { return o.c.challan_type === 'Returnable'; });
    body = bar + stripCards(t === 'dc' ? [{ l: 'Challans', v: uniq(rows2.map(function (o) { return o.c.dc_id; })).length }, { l: 'RDC qty', v: inr(sum(ret, function (o) { return +o.i.qty; })), c: 'purple' }, { l: 'NRDC qty', v: inr(sum(rows2, function (o) { return o.c.challan_type === 'Returnable' ? 0 : +o.i.qty; })), c: 'info' }, { l: 'Value issued ₹', v: inr(sum(rows2, function (o) { return o.i.amount; })) }, { l: 'Fresh back', v: inr(sum(ret, function (o) { return +o.i.qty_fresh_ret || 0; })), c: 'ok' }, { l: 'Defective back', v: inr(sum(ret, function (o) { return +o.i.qty_def_ret || 0; })), c: 'dang' }, { l: 'Pending return', v: inr(sum(ret, function (o) { return dcPend(o.i); })), c: 'warn' }]
      : [{ l: 'Challans with pending return', v: uniq(rows2.map(function (o) { return o.c.dc_id; })).length, c: 'warn' }, { l: 'Qty pending', v: inr(sum(rows2, function (o) { return dcPend(o.i); })), c: 'warn' }, { l: 'Value pending ₹', v: inr(sum(rows2, function (o) { return dcPend(o.i) * (+o.i.rate || 0); })) }, { l: 'Overdue lines', v: rows2.filter(function (o) { return o.c.expected_return < today(); }).length, c: 'dang' }]) + '<div id="mxG"></div>';
    after = function () { mountGrid('#mxG', { title: t === 'dc' ? 'Challan_register' : 'Returnable_pending', rows: rows2, sortI: 1, sortD: 'desc', pageSize: 50, search: function (o) { return [o.c.dc_no, mrNo(o.c.mr_id), partyOf(o.c), o.i.particulars].join(' '); },
      rowClass: function (o) { return o.c.challan_type === 'Returnable' && dcPend(o.i) > 0 && o.c.expected_return < today() ? 'overdue' : ''; },
      filters: [{ label: 'Type', get: function (o) { return o.c.challan_type; }, opts: ['Returnable', 'Non-Returnable'] }, { label: 'Service center', get: function (o) { return partyOf(o.c); } }, { label: 'Return', get: function (o) { return o.c.challan_type !== 'Returnable' ? 'Not returnable' : dcPend(o.i) <= 0 ? 'Fully returned' : o.c.expected_return < today() ? 'Overdue' : 'Pending'; }, opts: ['Pending', 'Overdue', 'Fully returned', 'Not returnable'] }],
      cols: [{ h: 'Challan', val: function (o) { return o.c.dc_no; }, cell: function (o) { return '<a href="#/s/challans/' + o.c.dc_id + '">' + esc(o.c.dc_no) + '</a>'; } }, { h: 'Date', val: function (o) { return o.c.dc_date; }, cell: function (o) { return dmy(o.c.dc_date); } }, { h: 'Type', val: function (o) { return o.c.challan_type; }, cell: function (o) { return dcTypeTag(o.c.challan_type); } },
        { h: 'Service center', val: function (o) { return partyOf(o.c); } }, { h: 'MR No', val: function (o) { return mrNo(o.c.mr_id); } }, { h: 'Spare', val: function (o) { return o.i.particulars; } },
        { h: 'Qty', val: function (o) { return +o.i.qty; }, cls: 'n' }, { h: 'Value ₹', val: function (o) { return o.i.amount; }, cls: 'n', cell: function (o) { return inr(o.i.amount, 2); } },
        { h: 'Fresh back', val: function (o) { return +o.i.qty_fresh_ret || 0; }, cls: 'n' }, { h: 'Defective back', val: function (o) { return +o.i.qty_def_ret || 0; }, cls: 'n' },
        { h: 'Pending', val: function (o) { return o.c.challan_type === 'Returnable' ? dcPend(o.i) : ''; }, cls: 'n' },
        { h: 'Return by', val: function (o) { return o.c.expected_return || ''; }, cell: function (o) { return o.c.expected_return ? dmy(o.c.expected_return) : '—'; } },
        { h: 'Days out', val: function (o) { return o.c.challan_type === 'Returnable' && dcPend(o.i) > 0 ? daysBetween(o.c.dc_date, today()) : ''; }, cls: 'n' }],
      totals: function (d, i) { return i === 0 ? '<b>Total</b>' : i === 6 ? '<b>' + inr(sum(d, function (o) { return +o.i.qty; })) + '</b>' : i === 7 ? '<b>' + inr(sum(d, function (o) { return o.i.amount; }), 2) + '</b>' : i === 8 ? '<b>' + inr(sum(d, function (o) { return +o.i.qty_fresh_ret || 0; })) + '</b>' : i === 9 ? '<b>' + inr(sum(d, function (o) { return +o.i.qty_def_ret || 0; })) + '</b>' : i === 10 ? '<b>' + inr(sum(d, function (o) { return o.c.challan_type === 'Returnable' ? dcPend(o.i) : 0; })) + '</b>' : null; } }); };
  } else if (t === 'rcv') {
    var rr = rcvRows().filter(function (o) { return inR(o.r.rcv_date) && inS(o.c.sc_id); });
    body = bar + stripCards([{ l: 'Receipts', v: uniq(rr.map(function (o) { return o.r.rcv_id; })).length }, { l: 'Fresh qty', v: inr(sum(rr, function (o) { return +o.x.qty_fresh || 0; })), c: 'ok' }, { l: 'Defective qty', v: inr(sum(rr, function (o) { return +o.x.qty_defective || 0; })), c: 'dang' }, { l: 'Defective value ₹', v: inr(sum(rr, function (o) { return (+o.x.qty_defective || 0) * (+o.it.rate || 0); })) }]) + '<div id="mxG"></div>';
    after = function () { mountGrid('#mxG', { title: 'Fresh_defective_received', rows: rr, sortI: 1, sortD: 'desc', pageSize: 50, search: function (o) { return [o.r.rcv_no, o.c.dc_no, partyOf(o.c), o.it.particulars, o.x.defect_serial].join(' '); },
      filters: [{ label: 'Service center', get: function (o) { return partyOf(o.c); } }],
      cols: [{ h: 'Receipt', val: function (o) { return o.r.rcv_no; } }, { h: 'Date', val: function (o) { return o.r.rcv_date; }, cell: function (o) { return dmy(o.r.rcv_date); } }, { h: 'RDC', val: function (o) { return o.c.dc_no; }, cell: function (o) { return '<a href="#/s/challans/' + o.c.dc_id + '">' + esc(o.c.dc_no) + '</a>'; } }, { h: 'Service center', val: function (o) { return partyOf(o.c); } },
        { h: 'Spare', val: function (o) { return o.it.particulars; } }, { h: 'Fresh', val: function (o) { return +o.x.qty_fresh || 0; }, cls: 'n' }, { h: 'Defective', val: function (o) { return +o.x.qty_defective || 0; }, cls: 'n' }, { h: 'Defect serial', val: function (o) { return o.x.defect_serial || ''; }, cls: 'mono' }, { h: 'Received by', val: function (o) { return o.r.created_by || ''; } }],
      totals: function (d, i) { return i === 0 ? '<b>Total</b>' : i === 5 ? '<b>' + inr(sum(d, function (o) { return +o.x.qty_fresh || 0; })) + '</b>' : i === 6 ? '<b>' + inr(sum(d, function (o) { return +o.x.qty_defective || 0; })) + '</b>' : null; } }); };
  } else if (t === 'wh') {
    var mv = {};
    var bump = function (sp, k, q) { var r = mv[sp] || (mv[sp] = { sp: DB.get('spare_master', sp) || {}, open: 0, grn: 0, iss: 0, fr: 0, df: 0, adj: 0 }); r[k] += q; };
    DB.all('stock_txn').forEach(function (x) {
      if (x.loc_type !== 'WH' || !inR(x.txn_date)) return;
      var k = x.ref_type === 'grn' ? 'grn' : x.ref_type === 'challan' ? 'iss' : x.ref_type === 'dc-return' ? (x.bucket === 'DAMAGED' ? 'df' : 'fr') : x.txn_type === 'Opening' ? 'open' : 'adj';
      bump(x.spare_id, k, k === 'iss' ? -x.qty : x.qty);
    });
    var wr = Object.keys(mv).map(function (k) { var r = mv[k]; r.good = stockBal(+k, 'WH', 0, 'GOOD'); r.bad = stockBal(+k, 'WH', 0, 'DAMAGED'); r.val = r.good * (r.sp.rate || 0); return r; });
    body = bar.replace(/<div class="f"><label[^>]*>SERVICE CENTER[\s\S]*?<\/select><\/div>/, '') + stripCards([{ l: 'Received from HO (GRN)', v: inr(sum(wr, function (r) { return r.grn; })), c: 'ok' }, { l: 'Issued to centers', v: inr(sum(wr, function (r) { return r.iss; })), c: 'info' }, { l: 'Fresh returned', v: inr(sum(wr, function (r) { return r.fr; })) }, { l: 'Defective returned', v: inr(sum(wr, function (r) { return r.df; })), c: 'dang' }, { l: 'Good stock now', v: inr(sum(wr, function (r) { return r.good; })) }, { l: 'Stock value ₹', v: inr(sum(wr, function (r) { return Math.max(0, r.val); })) }]) + '<div id="mxG"></div>';
    after = function () { mountGrid('#mxG', { title: 'Warehouse_stock_movement', rows: wr, sortI: 0, sortD: 'asc', pageSize: 50, search: function (r) { return r.sp.spare_name + ' ' + r.sp.spare_code; },
      filters: [{ label: 'Category', get: function (r) { return r.sp.category; } }, { label: 'Level', get: function (r) { return r.good <= 0 ? 'Out of stock' : r.good <= (r.sp.min_stock || 0) ? 'Low' : 'OK'; }, opts: ['OK', 'Low', 'Out of stock'] }],
      cols: [{ h: 'Spare', val: function (r) { return r.sp.spare_name; } }, { h: 'Code', val: function (r) { return r.sp.spare_code; }, cls: 'mono' }, { h: 'Opening', val: function (r) { return r.open; }, cls: 'n' }, { h: 'GRN (from HO)', val: function (r) { return r.grn; }, cls: 'n' }, { h: 'Issued to SC', val: function (r) { return r.iss; }, cls: 'n' },
        { h: 'Fresh back', val: function (r) { return r.fr; }, cls: 'n' }, { h: 'Adjust / other', val: function (r) { return r.adj; }, cls: 'n' }, { h: 'Good stock', val: function (r) { return r.good; }, cls: 'n', cell: function (r) { return '<b' + (r.good <= (r.sp.min_stock || 0) ? ' style="color:var(--dang)"' : '') + '>' + r.good + '</b>'; } }, { h: 'Defective held', val: function (r) { return r.bad; }, cls: 'n' }, { h: 'Value ₹', val: function (r) { return r.val; }, cls: 'n', cell: function (r) { return inr(r.val, 2); } }],
      totals: function (d, i) { var k = [null, null, 'open', 'grn', 'iss', 'fr', 'adj', 'good', 'bad', 'val'][i]; return i === 0 ? '<b>Total</b>' : k ? '<b>' + inr(sum(d, function (o) { return o[k]; }), k === 'val' ? 2 : 0) + '</b>' : null; } }); };
  } else {
    var srows = scList.filter(function (s) { return inS(s.sc_id); }).map(function (s) {
      var m = mrs.filter(function (x) { return x.sc_id === s.sc_id; }), c = dcs.filter(function (x) { return x.sc_id === s.sc_id; }), rd = c.filter(function (x) { return x.challan_type === 'Returnable'; }), all = []; c.forEach(function (x) { all = all.concat(dcLines(x)); });
      var rl = []; rd.forEach(function (x) { rl = rl.concat(dcLines(x)); });
      return { s: s, mr: m.length, pend: m.filter(function (x) { return x.status === 'Pending Approval'; }).length, appr: m.filter(function (x) { return x.approved_on && x.status !== 'Rejected'; }).length, rej: m.filter(function (x) { return x.status === 'Rejected'; }).length, rdc: rd.length, nrdc: c.length - rd.length, qty: sum(all, function (i) { return +i.qty; }), val: sum(all, function (i) { return i.amount; }), fr: sum(rl, function (i) { return +i.qty_fresh_ret || 0; }), df: sum(rl, function (i) { return +i.qty_def_ret || 0; }), pr: sum(rl, dcPend) };
    });
    body = bar + '<div id="mxG"></div>';
    after = function () { mountGrid('#mxG', { title: 'Service_center_material_summary', rows: srows, sortI: 0, sortD: 'asc', pageSize: 50, search: function (o) { return o.s.sc_name; },
      cols: [{ h: 'Service center', val: function (o) { return o.s.sc_name; }, cell: function (o) { return '<b>' + esc(o.s.sc_name) + '</b>'; } }, { h: 'MRs', val: function (o) { return o.mr; }, cls: 'n' }, { h: 'Pending approval', val: function (o) { return o.pend; }, cls: 'n' }, { h: 'Approved', val: function (o) { return o.appr; }, cls: 'n' }, { h: 'Rejected', val: function (o) { return o.rej; }, cls: 'n' },
        { h: 'RDC', val: function (o) { return o.rdc; }, cls: 'n' }, { h: 'NRDC', val: function (o) { return o.nrdc; }, cls: 'n' }, { h: 'Qty issued', val: function (o) { return o.qty; }, cls: 'n' }, { h: 'Value ₹', val: function (o) { return o.val; }, cls: 'n', cell: function (o) { return inr(o.val, 2); } },
        { h: 'Fresh back', val: function (o) { return o.fr; }, cls: 'n' }, { h: 'Defective back', val: function (o) { return o.df; }, cls: 'n' }, { h: 'Pending return', val: function (o) { return o.pr; }, cls: 'n', cell: function (o) { return o.pr ? '<b style="color:var(--warn)">' + o.pr + '</b>' : '0'; } }],
      totals: function (d, i) { var k = [null, 'mr', 'pend', 'appr', 'rej', 'rdc', 'nrdc', 'qty', 'val', 'fr', 'df', 'pr'][i]; return i === 0 ? '<b>Total</b>' : k ? '<b>' + inr(sum(d, function (o) { return o[k]; }), k === 'val' ? 2 : 0) + '</b>' : null; } }); };
  }
  return { title: 'Material & Challan Reports', crumb: 'Home › Material › <b>Reports</b>', sub: 'Material requests, returnable / non-returnable challans and fresh / defective returns — every grid exports to Excel', tabs: tabHtml, body: body, after: after };
};
function matRepApply(t) {
  var p = ['t=' + t]; [['from', 'mx_from'], ['to', 'mx_to'], ['sc', 'mx_sc']].forEach(function (x) { var e = document.getElementById(x[1]); if (e && e.value) p.push(x[0] + '=' + encodeURIComponent(e.value)); });
  location.hash = '#/s/matreport?' + p.join('&');
}

/* ============================================================
   8. DASHBOARDS
   ============================================================ */
function scDash() {
  var u = APP.user, calls = Q.complaints(), open = calls.filter(callOpen), jcs = Q.jobcards(), mrs = Q.mr(), dcs = Q.dc().filter(function (c) { return c.status !== 'Cancelled'; });
  var low = stockRows().filter(function (x) { return x.loc_type === 'SC' && x.good <= (x.spare.min_stock || 0); });
  var pendRet = sum(dcs, dcPendTotal);
  return {
    title: 'Service Center Dashboard', crumb: 'Home › <b>Dashboard</b>', sub: esc(u.name) + ' · ' + esc(u.rec.city || '') + ' · ' + dmy(today()),
    actions: '<button class="btn" onclick="location.hash=\'#/s/calls\'">' + ICO.phone + ' Service calls</button><button class="btn pri" onclick="mrForm(null)">' + ICO.cart + ' New material request</button>',
    body: '<div class="kpis">' +
      counter({ label: 'Open service calls', value: open.length, sub: open.filter(callOverdue).length + ' overdue · ' + open.filter(function (c) { return !c.engineer_id; }).length + ' without engineer', go: '#/s/calls', cls: open.filter(callOverdue).length ? 'r' : 'b' }) +
      counter({ label: 'Job cards in approval', value: jcs.filter(function (j) { return j.status === 'In Approval'; }).length, sub: jcs.filter(function (j) { return j.status === 'Draft' || j.status === 'Rejected'; }).length + ' draft / sent back', go: '#/s/jobcards', cls: 'a' }) +
      counter({ label: 'Material requests at HO', value: mrs.filter(function (m) { return m.status === 'Pending Approval'; }).length, sub: mrs.filter(function (m) { return m.status === 'Approved' || m.status === 'Partly Approved'; }).length + ' approved — waiting for challan', go: '#/s/mr', cls: 'p' }) +
      counter({ label: 'To return to warehouse (RDC)', value: inr(pendRet), sub: dcs.filter(function (c) { return dcPendTotal(c) > 0 && c.expected_return < today(); }).length + ' challan(s) overdue', go: '#/s/challans', cls: pendRet ? 'a' : 'g' }) +
      counter({ label: 'Low / out of stock lines', value: low.length, sub: 'center store', go: '#/k/stock', cls: low.length ? 'a' : 'g' }) + '</div>' +
      '<div class="grid2"><div class="card" style="margin:0"><h3>Recent material requests</h3>' + (mrs.length ? '<table class="dt"><thead><tr><th>MR</th><th>Date</th><th>Purpose</th><th class="n">Qty</th><th>Status</th></tr></thead><tbody>' + sortBy(mrs, function (m) { return m.mr_date; }, true).slice(0, 6).map(function (m) { return '<tr class="clk" onclick="location.hash=\'#/s/mr/' + m.mr_id + '\'"><td><b>' + esc(m.mr_no) + '</b></td><td>' + dmy(m.mr_date) + '</td><td>' + esc(m.purpose) + '</td><td class="n">' + sum(mrLines(m), function (i) { return +i.qty_req; }) + '</td><td>' + statusTag(m.status) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="empty" style="padding:22px">No requests yet</div>') + '</div>' +
      '<div class="card" style="margin:0"><h3>Challans received</h3>' + (dcs.length ? '<table class="dt"><thead><tr><th>Challan</th><th>Date</th><th>Type</th><th class="n">Pending return</th><th>Status</th></tr></thead><tbody>' + sortBy(dcs, function (c) { return c.dc_date; }, true).slice(0, 6).map(function (c) { return '<tr class="clk" onclick="location.hash=\'#/s/challans/' + c.dc_id + '\'"><td><b>' + esc(c.dc_no) + '</b></td><td>' + dmy(c.dc_date) + '</td><td>' + dcTypeTag(c.challan_type) + '</td><td class="n">' + (c.challan_type === 'Returnable' ? dcPendTotal(c) : '—') + '</td><td>' + statusTag(c.status) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="empty" style="padding:22px">No challans yet</div>') + '</div></div>' +
      '<div class="card" style="margin-top:16px"><h3>Open calls of my center</h3>' + (open.length ? '<table class="dt"><thead><tr><th>Call</th><th>Customer</th><th>Place</th><th>Engineer</th><th>Due</th><th>Status</th></tr></thead><tbody>' + open.slice(0, 10).map(function (c) { return '<tr class="clk" onclick="location.hash=\'#/s/call/' + c.complaint_id + '\'"><td><b>' + esc(c.complaint_no) + '</b></td><td>' + esc(c.customer_name) + '</td><td>' + esc(c.village || c.district || '') + '</td><td>' + esc(userName(c.engineer_id) || '—') + '</td><td>' + dmy(c.due_date) + '</td><td>' + statusTag(c.status) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="empty" style="padding:22px">No open calls</div>') + '</div>' +
      '<div style="margin-top:16px">' + quickBtns([{ go: '#/s/mr', t: 'Material requests', ico: ICO.cart, pri: 1 }, { go: '#/s/challans', t: 'Delivery challans', ico: ICO.box }, { go: '#/s/jobcards', t: 'Job cards', ico: ICO.clip }, { go: '#/k/stock', t: 'My center stock', ico: ICO.box }, { go: '#/s/matreport', t: 'Material reports', ico: ICO.rep }]) + '</div>'
  };
}
(function () {
  var bd = ROUTES['dashboard'];
  ROUTES['dashboard'] = function () {
    if (isSC()) return scDash();
    if (isWH()) return whDash();
    var p = bd.apply(this, arguments);
    if (isHO() && p && p.body) {
      var dsp = DB.all('material_request').filter(function (m) { return isWHReq(m) && MR_OPEN.indexOf(m.status) >= 0 && sum(mrLines(m), function (i) { return Math.max(0, (+i.qty_appr || 0) - (+i.qty_issued || 0)); }) > 0; }).length;
      var pm = DB.all('material_request').filter(function (m) { return m.status === 'Pending Approval'; }).length, od = DB.all('delivery_challan').filter(function (c) { return dcPendTotal(c) > 0 && c.expected_return < today(); }).length;
      if (pm || od || dsp) p.body = '<div class="note w" style="margin-bottom:14px">' + (pm ? '<b>' + pm + ' material request / indent(s)</b> wait for your approval — <a href="#/s/mrapproval">open approvals</a>. ' : '') + (dsp ? '<b>' + dsp + ' approved warehouse indent(s)</b> to dispatch — <a href="#/s/whinward">warehouse inward</a>. ' : '') + (od ? '<b>' + od + ' returnable challan(s)</b> are past their return date — <a href="#/s/matreport?t=pending">see pending returns</a>.' : '') + '</div>' + p.body;
    }
    return p;
  };
})();

function whDash() {
  var u = APP.user, all = DB.all('material_request'), queue = all.filter(function (m) { return !isWHReq(m) && MR_OPEN.indexOf(m.status) >= 0; }), waitHo = all.filter(function (m) { return !isWHReq(m) && m.status === 'Pending Approval'; });
  var myInd = all.filter(function (m) { return isWHReq(m) && m.status === 'Pending Approval'; }), transit = Q.stn().filter(function (c) { return c.status === 'In Transit' || c.status === 'Partly Received'; });
  var dcs = Q.dc().filter(function (c) { return c.status !== 'Cancelled'; }), mon = ymKey(today()), od = dcs.filter(function (c) { return dcPendTotal(c) > 0 && c.expected_return < today(); });
  var wrows = stockRows().filter(function (x) { return x.loc_type === 'WH'; }), low = wrows.filter(function (x) { return x.good <= (x.spare.min_stock || 0); });
  var toIssue = function (m) { return sum(mrLines(m), function (i) { return Math.max(0, (+i.qty_appr || 0) - (+i.qty_issued || 0)); }); };
  return {
    title: 'Warehouse Dashboard', crumb: 'Home › <b>Dashboard</b>', sub: 'Welcome, ' + esc(u.name) + ' · Central Warehouse · ' + dmy(today()),
    actions: '<button class="btn" onclick="mrForm(null)">' + ICO.plus + ' Indent to HO</button><button class="btn" onclick="grnForm()">' + ICO.imp + ' Book GRN</button><button class="btn pri" onclick="dcForm()">' + ICO.box + ' Issue to service center</button>',
    body: '<div class="kpis">' +
      counter({ label: 'SC requests to issue', value: queue.length, sub: sum(queue, toIssue) + ' qty approved, not yet issued · ' + waitHo.length + ' waiting at HO', go: '#/s/mr', cls: queue.length ? 'a' : 'g' }) +
      counter({ label: 'Inward in transit from HO', value: transit.length, sub: sum(transit, function (c) { return sum(dcLines(c), stnPend); }) + ' qty to receive (GRN) · ' + myInd.length + ' indent(s) at HO', go: '#/s/whinward', cls: transit.length ? 'p' : 'g' }) +
      counter({ label: 'Warehouse stock', value: inr(sum(wrows, function (x) { return Math.max(0, x.good); })), sub: '₹ ' + inr(sum(wrows, function (x) { return Math.max(0, x.val); })) + ' · ' + inr(sum(wrows, function (x) { return x.damaged; })) + ' defective held', go: '#/k/stock', cls: 'b' }) +
      counter({ label: 'Challans this month', value: dcs.filter(function (c) { return ymKey(c.dc_date) === mon; }).length, sub: dcs.filter(function (c) { return ymKey(c.dc_date) === mon && c.challan_type === 'Returnable'; }).length + ' returnable · ' + dcs.filter(function (c) { return ymKey(c.dc_date) === mon && c.challan_type !== 'Returnable'; }).length + ' non-returnable', go: '#/s/challans' }) +
      counter({ label: 'Pending return (RDC)', value: inr(sum(dcs, dcPendTotal)), sub: od.length + ' challan(s) overdue', go: '#/s/matreport?t=pending', cls: od.length ? 'r' : 'g' }) +
      counter({ label: 'Low warehouse stock', value: low.length, sub: 'at or below minimum — raise an indent', go: '#/k/stock', cls: low.length ? 'a' : 'g' }) + '</div>' +
      '<div class="card"><h3>Issue queue <span class="sm2">service center requests approved by HO — issue on a Returnable or Non-Returnable challan</span></h3>' + (queue.length ? '<table class="dt"><thead><tr><th>MR</th><th>Date</th><th>Service center</th><th>Purpose</th><th>Material</th><th class="n">To issue</th><th class="n">Stock OK?</th><th>Required by</th><th></th></tr></thead><tbody>' +
        sortBy(queue, function (m) { return m.required_by || m.mr_date; }).map(function (m) { var ls = mrLines(m), ok = ls.every(function (i) { return stockBal(i.spare_id, 'WH', 0, 'GOOD') >= Math.max(0, (+i.qty_appr || 0) - (+i.qty_issued || 0)); }); return '<tr><td><a href="#/s/mr/' + m.mr_id + '"><b>' + esc(m.mr_no) + '</b></a></td><td>' + dmy(m.mr_date) + '</td><td>' + esc(partyOf(m)) + '</td><td>' + esc(m.purpose) + '</td><td>' + esc(shortName(ls.map(function (i) { return i.particulars; }).join(', '), 46)) + '</td><td class="n"><b>' + toIssue(m) + '</b></td><td class="n">' + (ok ? tag('Yes', 'ok') : tag('Short', 'dang')) + '</td><td>' + (m.required_by ? '<span style="color:var(--' + (m.required_by < today() ? 'dang' : 'ink2') + ')">' + dmy(m.required_by) + '</span>' : '—') + '</td><td><button class="btn sm pri" onclick="dcForm(' + m.mr_id + ')">' + ICO.box + ' Issue</button></td></tr>'; }).join('') + '</tbody></table>' : '<div class="empty" style="padding:22px">Nothing to issue — all approved requests are issued</div>') + '</div>' +
      '<div class="grid2"><div class="card" style="margin:0"><h3>In transit from HO — book GRN</h3>' + (transit.length ? '<table class="dt"><thead><tr><th>STN</th><th>Date</th><th>Indent</th><th class="n">Pending</th><th></th></tr></thead><tbody>' + transit.map(function (c) { return '<tr><td><a href="#/s/whinward/' + c.dc_id + '"><b>' + esc(c.dc_no) + '</b></a></td><td>' + dmy(c.dc_date) + '</td><td>' + esc(mrNo(c.mr_id)) + '</td><td class="n"><b>' + sum(dcLines(c), stnPend) + '</b></td><td><button class="btn sm" onclick="grnForm(' + c.dc_id + ')">' + ICO.imp + ' GRN</button></td></tr>'; }).join('') + '</tbody></table>' : '<div class="empty" style="padding:22px">Nothing in transit</div>') + '</div>' +
      '<div class="card" style="margin:0"><h3>Returnable challans — overdue</h3>' + (od.length ? '<table class="dt"><thead><tr><th>Challan</th><th>Service center</th><th class="n">Pending</th><th>Return by</th><th></th></tr></thead><tbody>' + od.map(function (c) { return '<tr><td><a href="#/s/challans/' + c.dc_id + '"><b>' + esc(c.dc_no) + '</b></a></td><td>' + esc(partyOf(c)) + '</td><td class="n"><b>' + dcPendTotal(c) + '</b></td><td style="color:var(--dang)">' + dmy(c.expected_return) + '</td><td><button class="btn sm" onclick="rcvForm(' + c.dc_id + ')">' + ICO.imp + ' Receive</button></td></tr>'; }).join('') + '</tbody></table>' : '<div class="empty" style="padding:22px">No overdue returns</div>') + '</div></div>'
  };
}

/* stock screen: warehouse + location labels */
(function () {
  var bk = ROUTES['k/stock'];
  ROUTES['k/stock'] = function () {
    var p = bk.apply(this, arguments), af = p.after;
    p.after = function () {
      af();
    };
    if (isSC()) p.title = 'My Center Stock';
    if (isWH()) p.title = 'Warehouse & Center Stock';
    return p;
  };
})();
/* ============================================================
   9. WAREHOUSE INWARD  -  HO dispatch (STN) against warehouse indent, warehouse GRN
   ============================================================ */
function stnForm(mrId) {
  if (!canDispatch()) return toast('Dispatch to the warehouse is done in the HO login', 'err');
  var opts = DB.all('material_request').filter(function (r) { return isWHReq(r) && MR_OPEN.indexOf(r.status) >= 0; });
  if (!mrId) {
    if (!opts.length) return toast('No approved warehouse indent is waiting for dispatch', 'err');
    modal('Dispatch to warehouse — pick the approved indent', '<div class="frm"><div class="f full"><label>Approved warehouse indent <span class="rq">*</span></label><select id="stn_pick">' + opts.map(function (m) { return '<option value="' + m.mr_id + '">' + esc(m.mr_no + ' — ' + dmy(m.mr_date) + ' (' + m.status + ')') + '</option>'; }).join('') + '</select></div></div>',
      '<button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" onclick="stnForm(+$(\'#stn_pick\').value)">Next ' + ICO.arrow + '</button>', 'narrow sticky');
    return;
  }
  var m = DB.get('material_request', mrId), ls = mrLines(m).filter(function (i) { return (i.qty_appr || 0) - (i.qty_issued || 0) > 0; });
  DCF.mr = m;
  modal('Stock transfer HO → Central Warehouse',
    '<div class="note">Against warehouse indent <b>' + esc(m.mr_no) + '</b> (' + dmy(m.mr_date) + '). Warehouse stock goes up when the warehouse books the goods receipt (GRN).</div>' +
    '<div class="frm c3"><div class="f"><label>Dispatch date <span class="rq">*</span></label><input id="stn_date" type="date" max="' + today() + '" value="' + today() + '"></div><div class="f"><label>Transporter</label><input id="stn_tr"></div><div class="f"><label>Vehicle no</label><input id="stn_veh"></div><div class="f"><label>LR / docket no</label><input id="stn_lr"></div><div class="f full"><label>Remarks</label><input id="stn_rem"></div></div>' +
    '<table class="dt" style="margin-top:12px"><thead><tr><th>Spare</th><th class="n">Approved</th><th class="n">Already dispatched</th><th class="n" style="width:100px">Dispatch qty</th><th class="n" style="width:110px">Rate ₹</th></tr></thead><tbody>' +
    ls.map(function (i) { var s = DB.get('spare_master', i.spare_id) || {}, bal = (i.qty_appr || 0) - (i.qty_issued || 0); return '<tr><td>' + esc(i.particulars) + '</td><td class="n">' + i.qty_appr + '</td><td class="n">' + (i.qty_issued || 0) + '</td><td class="n"><input type="number" class="stq" data-id="' + i.mritem_id + '" data-max="' + bal + '" min="0" step="any" value="' + bal + '" style="width:80px;text-align:right"></td><td class="n"><input type="number" class="str" data-id="' + i.mritem_id + '" min="0" step="any" value="' + (s.rate || 0) + '" style="width:92px;text-align:right"></td></tr>'; }).join('') + '</tbody></table>',
    '<button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" onclick="stnSave()">' + ICO.save + ' Save &amp; dispatch</button>', 'wide sticky');
}
function stnSave() {
  var m = DCF.mr, date = $('#stn_date').value;
  if (!date) return toast('Dispatch date is required', 'err'); if (date > today()) return toast('Date cannot be in the future', 'err'); if (date < m.mr_date) return toast('Dispatch date cannot be before the indent date', 'err');
  var ls = $$('.stq').map(function (q) { return { it: DB.get('material_request_item', +q.dataset.id), q: +q.value || 0, max: +q.dataset.max, rate: +$('.str[data-id="' + q.dataset.id + '"]').value || 0 }; });
  if (ls.some(function (x) { return x.q < 0; })) return toast('Quantity cannot be negative', 'err');
  var over = ls.filter(function (x) { return x.q > x.max; })[0]; if (over) return toast(over.it.particulars + ': cannot dispatch more than the approved balance (' + over.max + ')', 'err');
  ls = ls.filter(function (x) { return x.q > 0; }); if (!ls.length) return toast('Enter the dispatch quantity on at least one line', 'err');
  var c = DB.add('delivery_challan', { dc_no: DB.nextNo('STN', 'STN/{fy}/{n:4}'), dc_date: date, challan_type: 'Stock Transfer', mr_id: m.mr_id, issue_to: 'WAREHOUSE', sc_id: null, expected_return: null, transporter: $('#stn_tr').value.trim() || null, vehicle_no: $('#stn_veh').value.trim() || null, lr_no: $('#stn_lr').value.trim() || null, status: 'In Transit', remarks: $('#stn_rem').value.trim() || null, created_by: myName() });
  ls.forEach(function (x, n) { DB.add('delivery_challan_item', { dc_id: c.dc_id, line_no: n + 1, mritem_id: x.it.mritem_id, spare_id: x.it.spare_id, particulars: x.it.particulars, qty: x.q, rate: x.rate, amount: round2(x.q * x.rate), qty_fresh_ret: 0, qty_def_ret: 0, qty_recd: 0 }, true); x.it.qty_issued = round2((+x.it.qty_issued || 0) + x.q); });
  mrRefreshStatus(m);
  notify({ channel: 'SMS', to: (DB.find('app_user', function (x) { return x.role === 'WAREHOUSE' && x.is_active == 1; }) || {}).phone || '', tpl: 'STN_DISPATCHED', msg: 'Stock transfer ' + c.dc_no + ' dispatched from HO against indent ' + m.mr_no + '. Please book the GRN on receipt.', refType: 'delivery_challan', refNo: c.dc_no });
  DB.save(); closeModal(); location.hash = '#/s/whinward/' + c.dc_id; toast(c.dc_no + ' dispatched — in transit to the warehouse', 'ok');
}
function grnForm(dcId) {
  if (!canIssue()) return toast('Goods receipt is booked in the warehouse login', 'err');
  var open = Q.stn().filter(function (c) { return c.status === 'In Transit' || c.status === 'Partly Received'; });
  if (!dcId) {
    if (!open.length) return toast('Nothing is in transit from HO', 'err');
    modal('Goods receipt — pick the stock transfer', '<div class="frm"><div class="f full"><label>Stock transfer note <span class="rq">*</span></label><select id="grn_pick">' + open.map(function (c) { return '<option value="' + c.dc_id + '">' + esc(c.dc_no + ' — ' + dmy(c.dc_date) + ' · pending ' + sum(dcLines(c), stnPend)) + '</option>'; }).join('') + '</select></div></div>',
      '<button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" onclick="grnForm(+$(\'#grn_pick\').value)">Next ' + ICO.arrow + '</button>', 'narrow sticky');
    return;
  }
  var c = DB.get('delivery_challan', dcId), ls = dcLines(c).filter(function (i) { return stnPend(i) > 0; });
  RCV.dc = c;
  modal('Goods receipt (GRN) — ' + esc(c.dc_no),
    '<div class="note">Dispatched by HO on ' + dmy(c.dc_date) + ' against ' + esc(mrNo(c.mr_id)) + '. The received quantity is added to <b>Central Warehouse</b> good stock.</div>' +
    '<div class="frm c3"><div class="f"><label>GRN date <span class="rq">*</span></label><input id="grn_date" type="date" max="' + today() + '" value="' + today() + '"></div><div class="f full" style="grid-column:span 2"><label>Remarks</label><input id="grn_rem" placeholder="Shortage / damage in transit, if any"></div></div>' +
    '<table class="dt" style="margin-top:12px"><thead><tr><th>Spare</th><th class="n">Dispatched</th><th class="n">Already received</th><th class="n">Pending</th><th class="n" style="width:110px">Received now</th><th style="width:200px">Remarks</th></tr></thead><tbody>' +
    ls.map(function (i) { return '<tr><td>' + esc(i.particulars) + '</td><td class="n">' + i.qty + '</td><td class="n">' + (i.qty_recd || 0) + '</td><td class="n"><b>' + stnPend(i) + '</b></td><td class="n"><input type="number" class="grq" data-id="' + i.dcitem_id + '" data-max="' + stnPend(i) + '" min="0" step="any" value="' + stnPend(i) + '" style="width:86px;text-align:right"></td><td><input class="grr" data-id="' + i.dcitem_id + '" style="width:100%"></td></tr>'; }).join('') + '</tbody></table>',
    '<button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" onclick="grnSave()">' + ICO.save + ' Save GRN</button>', 'wide sticky');
}
function grnSave() {
  var c = RCV.dc, date = $('#grn_date').value;
  if (!date) return toast('GRN date is required', 'err'); if (date > today()) return toast('Date cannot be in the future', 'err'); if (date < c.dc_date) return toast('GRN date cannot be before the dispatch date', 'err');
  var ls = $$('.grq').map(function (q) { return { it: DB.get('delivery_challan_item', +q.dataset.id), q: +q.value || 0, max: +q.dataset.max, rm: $('.grr[data-id="' + q.dataset.id + '"]').value.trim() }; });
  if (ls.some(function (x) { return x.q < 0; })) return toast('Quantity cannot be negative', 'err');
  var over = ls.filter(function (x) { return x.q > x.max; })[0]; if (over) return toast(over.it.particulars + ': cannot receive more than pending ' + over.max, 'err');
  ls = ls.filter(function (x) { return x.q > 0; }); if (!ls.length) return toast('Enter the received quantity on at least one line', 'err');
  var g = DB.add('wh_grn', { grn_no: DB.nextNo('GRN', 'GRN/{fy}/{n:4}'), grn_date: date, dc_id: c.dc_id, received_by: myName(), remarks: $('#grn_rem').value.trim() || null });
  ls.forEach(function (x) { DB.add('wh_grn_item', { grn_id: g.grn_id, dcitem_id: x.it.dcitem_id, spare_id: x.it.spare_id, qty_recd: x.q, remarks: x.rm || null }, true); x.it.qty_recd = round2((+x.it.qty_recd || 0) + x.q); });
  grnPostStock(g); dcRefreshStatus(c);
  DB.save(); closeModal(); route(true); toast(g.grn_no + ' saved — ' + sum(ls, function (x) { return x.q; }) + ' units added to warehouse stock', 'ok');
}
function grnDelete(id) {
  var g = DB.get('wh_grn', id), c = DB.get('delivery_challan', g.dc_id), short = grnLines(g).filter(function (x) { return stockBal(x.spare_id, 'WH', 0, 'GOOD') < x.qty_recd; });
  if (short.length) return toast('Part of this receipt is already issued to service centers — it cannot be deleted', 'err');
  confirmDo('Delete ' + esc(g.grn_no) + '?', 'The received quantity is removed from warehouse stock and goes back to pending on ' + esc(c.dc_no) + '.', 'Delete', function () {
    grnLines(g).forEach(function (x) { var it = DB.get('delivery_challan_item', x.dcitem_id); if (it) it.qty_recd = Math.max(0, round2(it.qty_recd - x.qty_recd)); DB.del('wh_grn_item', x.grnitem_id, true); });
    unpostRef(g.grn_no); DB.del('wh_grn', id); dcRefreshStatus(c); DB.save(); route(true); toast('GRN deleted', 'ok');
  }, true);
}
function stnCancel(id) {
  var c = DB.get('delivery_challan', id);
  if (DB.where('wh_grn', function (g) { return g.dc_id === id; }).length) return toast('A GRN is booked against this transfer — delete it first', 'err');
  confirmDo('Cancel ' + esc(c.dc_no) + '?', 'The quantity goes back to the indent balance.', 'Cancel transfer', function () {
    dcLines(c).forEach(function (it) { var mi = DB.get('material_request_item', it.mritem_id); if (mi) mi.qty_issued = Math.max(0, round2((+mi.qty_issued || 0) - it.qty)); });
    c.status = 'Cancelled'; var m = DB.get('material_request', c.mr_id); if (m) { if (m.status === 'Issued' || m.status === 'Partly Issued') m.status = 'Approved'; mrRefreshStatus(m); }
    DB.save(); route(true); toast(c.dc_no + ' cancelled', 'ok');
  }, true);
}
ROUTES['s/whinward'] = function (a) {
  if (a[0]) return stnView(a[0]);
  var rows = Q.stn(), grns = DB.all('wh_grn'), live = rows.filter(function (r) { return r.status !== 'Cancelled'; });
  var acts = (canDispatch() ? '<button class="btn pri" onclick="stnForm()">' + ICO.arrow + ' Dispatch to warehouse (STN)</button>' : '') + (canIssue() ? '<button class="btn" onclick="mrForm(null)">' + ICO.plus + ' New indent to HO</button><button class="btn pri" onclick="grnForm()">' + ICO.imp + ' Book GRN</button>' : '');
  return {
    title: 'Warehouse Inward (STN / GRN)', crumb: 'Home › Material › <b>Warehouse Inward</b>', sub: 'Warehouse indent → HO approval → HO dispatch (stock transfer note) → warehouse goods receipt → warehouse stock',
    actions: acts,
    body: stripCards([{ l: 'Indents waiting at HO', v: DB.all('material_request').filter(function (m) { return isWHReq(m) && m.status === 'Pending Approval'; }).length, c: 'warn', go: '#/s/mr' }, { l: 'Approved — to dispatch', v: DB.all('material_request').filter(function (m) { return isWHReq(m) && MR_OPEN.indexOf(m.status) >= 0 && sum(mrLines(m), function (i) { return Math.max(0, (+i.qty_appr || 0) - (+i.qty_issued || 0)); }) > 0; }).length, c: 'info' },
      { l: 'In transit', v: live.filter(function (c) { return c.status === 'In Transit' || c.status === 'Partly Received'; }).length, c: 'warn' }, { l: 'Qty in transit', v: inr(sum(live, function (c) { return sum(dcLines(c), stnPend); })) }, { l: 'GRNs booked', v: grns.length, c: 'ok' }, { l: 'Qty received', v: inr(sum(DB.all('wh_grn_item'), function (x) { return +x.qty_recd; })), c: 'ok' }]) +
      '<div class="card"><h3>Stock transfers from HO</h3><div class="cbody" style="padding:0" id="stnG"></div></div>',
    after: function () {
      mountGrid('#stnG', { title: 'Warehouse_inward', rows: rows, sortI: 1, sortD: 'desc', search: function (r) { return [r.dc_no, mrNo(r.mr_id), r.lr_no, dcLines(r).map(function (i) { return i.particulars; }).join(' ')].join(' '); },
        filters: [{ label: 'Status', get: function (r) { return r.status; }, opts: ['In Transit', 'Partly Received', 'Received', 'Cancelled'] }],
        cols: [{ h: 'STN No', val: function (r) { return r.dc_no; }, cell: function (r) { return '<b>' + esc(r.dc_no) + '</b>'; } }, { h: 'Dispatch date', val: function (r) { return r.dc_date; }, cell: function (r) { return dmy(r.dc_date); } }, { h: 'Indent', val: function (r) { return mrNo(r.mr_id); } },
          { h: 'Items', val: function (r) { return dcLines(r).length; }, cls: 'n' }, { h: 'Dispatched', val: function (r) { return sum(dcLines(r), function (i) { return +i.qty; }); }, cls: 'n' }, { h: 'Received', val: function (r) { return sum(dcLines(r), function (i) { return +i.qty_recd || 0; }); }, cls: 'n' },
          { h: 'Pending', val: function (r) { return sum(dcLines(r), stnPend); }, cls: 'n', cell: function (r) { var p = sum(dcLines(r), stnPend); return p && r.status !== 'Cancelled' ? '<b style="color:var(--warn)">' + p + '</b>' : '0'; } },
          { h: 'Value ₹', val: function (r) { return sum(dcLines(r), function (i) { return i.amount; }); }, cls: 'n', cell: function (r) { return inr(sum(dcLines(r), function (i) { return i.amount; }), 2); } }, { h: 'Transporter / LR', val: function (r) { return [r.transporter, r.lr_no].filter(Boolean).join(' / '); } }, { h: 'Status', val: function (r) { return r.status; }, cell: function (r) { return statusTag(r.status); } }],
        actions: function (r, i) { var h = '<button class="ract" data-ra="view" data-ri="' + i + '" title="Open">' + ICO.eye + '</button>'; if (canIssue() && (r.status === 'In Transit' || r.status === 'Partly Received')) h += '<button class="ract" data-ra="grn" data-ri="' + i + '" title="Book GRN">' + ICO.imp + '</button>'; return h; },
        onAction: function (a, r) { if (a === 'view') location.hash = '#/s/whinward/' + r.dc_id; else if (a === 'grn') grnForm(r.dc_id); },
        onRow: function (r) { location.hash = '#/s/whinward/' + r.dc_id; } });
    }
  };
};
function stnView(id) {
  var c = DB.get('delivery_challan', id);
  if (!c || c.challan_type !== 'Stock Transfer') return { title: 'Stock transfer', body: '<div class="card"><div class="empty">Not found.</div></div>' };
  var ls = dcLines(c), grns = DB.where('wh_grn', function (g) { return g.dc_id === c.dc_id; }), pend = sum(ls, stnPend);
  var act = '<button class="btn" onclick="goBack(\'#/s/whinward\')">' + ICO.back + ' Back</button>';
  if (canIssue() && pend > 0 && c.status !== 'Cancelled') act += '<button class="btn pri" onclick="grnForm(' + c.dc_id + ')">' + ICO.imp + ' Book GRN</button>';
  if (canDispatch() && c.status !== 'Cancelled' && !grns.length) act += '<button class="btn dang-o" style="margin:0" onclick="stnCancel(' + c.dc_id + ')">' + ICO.x + ' Cancel</button>';
  act += '<button class="btn" onclick="window.print()">' + ICO.prn + ' Print</button>';
  return {
    title: esc(c.dc_no) + ' &nbsp;' + statusTag(c.status), crumb: 'Home › Material › <a href="#/s/whinward">Warehouse Inward</a> › <b>' + esc(c.dc_no) + '</b>', sub: 'HO → Central Warehouse · against indent ' + esc(mrNo(c.mr_id)), actions: act,
    body: '<div class="paper">' + docHead(c.dc_no, c.dc_date, esc(c.status)) + '<div class="dt-title"><h2>Stock Transfer Note</h2></div>' +
      '<div class="pmeta"><div><div class="hd">From</div><b>Head Office</b><br>' + esc(CO().company_name) + '</div><div><div class="hd">To</div><b>Central Warehouse</b><br>Indent: ' + esc(mrNo(c.mr_id)) + '<br>Transporter: ' + esc(c.transporter || '—') + ' · Vehicle: ' + esc(c.vehicle_no || '—') + '<br>LR / docket: ' + esc(c.lr_no || '—') + '</div></div>' +
      '<table class="ptab"><thead><tr><th>#</th><th>Particulars</th><th class="n">Dispatched</th><th class="n">Rate</th><th class="n">Amount</th><th class="n">Received</th><th class="n">Pending</th></tr></thead><tbody>' +
      ls.map(function (i) { return '<tr><td>' + i.line_no + '</td><td>' + esc(i.particulars) + '</td><td class="n">' + i.qty + '</td><td class="n">' + inr(i.rate, 2) + '</td><td class="n">' + inr(i.amount, 2) + '</td><td class="n">' + (i.qty_recd || 0) + '</td><td class="n"><b>' + stnPend(i) + '</b></td></tr>'; }).join('') +
      '</tbody><tfoot><tr><td colspan="2" class="n"><b>Total</b></td><td class="n"><b>' + sum(ls, function (i) { return +i.qty; }) + '</b></td><td></td><td class="n"><b>₹ ' + inr(sum(ls, function (i) { return i.amount; }), 2) + '</b></td><td class="n">' + sum(ls, function (i) { return +i.qty_recd || 0; }) + '</td><td class="n"><b>' + pend + '</b></td></tr></tfoot></table>' +
      '<div class="ptc" style="margin-top:12px"><h4>Goods receipts at warehouse</h4>' + (grns.length ? '<table class="ptab"><thead><tr><th>GRN</th><th>Date</th><th>Spare</th><th class="n">Received</th><th>By</th><th>Remarks</th><th class="noprint"></th></tr></thead><tbody>' +
        grns.map(function (g) { return grnLines(g).map(function (x, k) { return '<tr><td>' + esc(g.grn_no) + '</td><td>' + dmy(g.grn_date) + '</td><td>' + esc(spareLbl(x.spare_id)) + '</td><td class="n">' + x.qty_recd + '</td><td>' + esc(g.received_by || '') + '</td><td>' + esc(x.remarks || g.remarks || '') + '</td><td>' + (k === 0 && canIssue() ? '<a href="javascript:void(0)" style="color:var(--dang)" onclick="grnDelete(' + g.grn_id + ')">delete</a>' : '') + '</td></tr>'; }).join(''); }).join('') + '</tbody></table>' : 'Not received yet.') + '</div>' +
      '<div class="sign"><div><b>Dispatched by (HO)</b>' + esc(c.created_by || '') + '</div><div><b>Received by</b>Central Warehouse</div></div></div>'
  };
}
(function () {
  NAV.forEach(function (g) { if (g.g === 'Material (Service)') g.items.splice(3, 0, ['#/s/whinward', 'Warehouse Inward (STN / GRN)', ['SUPER', 'HO', 'WAREHOUSE']]); });
})();
