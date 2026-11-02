/* ============================================================
   Dealers (sign-up, approval, master), customers, geo report
   ============================================================ */
'use strict';

function nextDealerCode() {
  var max = 1000;
  DB.all('dealer').forEach(function (d) { var n = parseInt(d.dealer_code, 10); if (!isNaN(n) && n > max) max = n; });
  return String(max + 1);
}
function genPwd() { var c = 'abcdefghjkmnpqrstuvwxyz23456789', s = ''; for (var i = 0; i < 6; i++) s += c.charAt(Math.floor(Math.random() * c.length)); return s; }

/** approve a pending dealer: code + password + WhatsApp credentials */
function approveDealer(d, silent) {
  var code = d.dealer_code || nextDealerCode(), pwd = d.password || genPwd();
  DB.upd('dealer', d.dealer_id, { dealer_code: code, password: pwd, status: 'Approved', approved_by: myName(), approved_on: nowIso() });
  var r = DB.get('dealer', d.dealer_id);
  if (!silent) notify({ channel: 'WhatsApp', to: r.mobile, tpl: 'DEALER_APPROVED', msg: MSG.dealerApproved(r), refType: 'dealer', refNo: r.dealer_code });
  return r;
}

var DEALER_STATUS = ['Pending', 'Approved', 'Rejected', 'Blocked'];

defEntity({
  key: 'dealer', table: 'dealer', title: 'Dealer', plural: 'Dealer Approval & Master', softOff: 'Status (Blocked)',
  rows: function () { return Q.dealers(); },
  refLabel: function (r) { return r.firm_name; },
  sub: function (rows) { var p = rows.filter(function (d) { return d.status === 'Pending'; }).length; return inr(rows.length) + ' dealers · ' + (p ? '<b style="color:var(--warn)">' + p + ' awaiting approval</b>' : 'none pending'); },
  kpis: function (rows) {
    var c = function (s) { return rows.filter(function (d) { return d.status === s; }).length; };
    return stripCards([{ l: 'Pending approval', v: c('Pending'), c: 'warn' }, { l: 'Approved', v: c('Approved'), c: 'ok' }, { l: 'Rejected', v: c('Rejected'), c: 'dang' }, { l: 'Blocked', v: c('Blocked') },
      { l: 'Registrations by dealers', v: inr(DB.all('installation').filter(function (i) { return i.dealer_id && i.registered_by === 'Dealer'; }).length) }]);
  },
  note: 'Dealers sign up themselves from the login page (<b>Dealer → New dealer? Sign up</b>). The head office reviews the sign-up here; <b>Approve</b> generates the dealer code and password and sends them on WhatsApp.',
  fields: function (row) {
    return [
      { k: 'firm_name', l: 'Firm / dealer name', req: 1, full: 1 }, { k: 'contact_person', l: 'Contact person' },
      { k: 'mobile', l: 'Mobile', type: 'tel', req: 1, unique: 1, pattern: /^[6-9]\d{9}$/, patMsg: 'Enter a valid 10-digit mobile number' },
      { k: 'email', l: 'Email', type: 'email' }, { k: 'gstin', l: 'GSTIN' },
      { k: 'address', l: 'Address', type: 'area', full: 1 },
      { k: 'state_code', l: 'State', type: 'select', req: 1, opts: stateOpts }, { k: 'district', l: 'District', suggest: { dep: 'state_code', fn: districtList } },
      { k: 'city', l: 'City / town' }, { k: 'pincode', l: 'Pincode', pattern: /^\d{6}$/, patMsg: 'Pincode must be 6 digits' },
      { k: 'warranty_months', l: 'Warranty months (dealer-specific)', type: 'num', min: 1, max: 120, hint: 'Leave blank to use the product model default. Registrations made by this dealer use this period.' },
      { k: 'status', l: 'Status', type: 'select', req: 1, opts: DEALER_STATUS },
      { k: 'dealer_code', l: 'Dealer code', ro: 1, hint: 'Generated on approval' }, { k: 'password', l: 'Password', type: 'pwd', hint: 'Generated on approval; can be reset here' },
      { k: 'remarks', l: 'Remarks', type: 'area', full: 1 }
    ];
  },
  defaults: function () { return { status: 'Approved', state_code: '09' }; },
  before: function (v, row) {
    if (v.status === 'Approved' && !(row && row.dealer_code)) {
      v.dealer_code = nextDealerCode(); if (!v.password) v.password = genPwd(); v.approved_by = myName(); v.approved_on = nowIso();
      window._dealerNew = true;
    } else window._dealerNew = false;
    if (!row) v.signup_on = nowIso();
    if (v.status === 'Approved' && !v.password) v.password = genPwd();   /* an approved dealer must always be able to log in */
    if (v.password && String(v.password).length < 4) return 'Password must be at least 4 characters';
    return null;
  },
  after: function (saved) { if (window._dealerNew) notify({ channel: 'WhatsApp', to: saved.mobile, tpl: 'DEALER_APPROVED', msg: MSG.dealerApproved(saved), refType: 'dealer', refNo: saved.dealer_code }); },
  filters: [{ label: 'Status', get: function (d) { return d.status; }, opts: DEALER_STATUS }, { label: 'State', get: function (d) { return stateName(d.state_code); } }],
  searchPh: 'Search firm, code, mobile, district…',
  search: function (d) { return [d.firm_name, d.dealer_code, d.mobile, d.district, d.contact_person].join(' '); },
  sortI: 9, sortD: 'asc',
  cols: [
    { h: 'Code', val: function (d) { return d.dealer_code || ''; }, cell: function (d) { return d.dealer_code ? '<b class="mono">' + esc(d.dealer_code) + '</b>' : '<span class="muted">—</span>'; } },
    { h: 'Firm', val: function (d) { return d.firm_name; }, cell: function (d) { return '<b>' + esc(d.firm_name) + '</b><div class="hint" style="margin:0">' + esc(d.contact_person || '') + '</div>'; } },
    { h: 'Mobile', val: function (d) { return d.mobile; } },
    { h: 'District', val: function (d) { return d.district || ''; } },
    { h: 'State', val: function (d) { return stateName(d.state_code); } },
    { h: 'GSTIN', val: function (d) { return d.gstin || ''; }, cls: 'mono' },
    { h: 'Warranty mths', val: function (d) { return d.warranty_months || 0; }, cls: 'n', cell: function (d) { return d.warranty_months ? d.warranty_months : '<span class="muted">model</span>'; } },
    { h: 'Sets sold', val: function (d) { return DB.where('installation', function (i) { return i.dealer_id === d.dealer_id; }).length; }, cls: 'n' },
    { h: 'Signed up', val: function (d) { return d.signup_on || ''; }, cell: function (d) { return dmy(d.signup_on); } },
    { h: 'Status', val: function (d) { return d.status === 'Pending' ? '0 Pending' : d.status; }, cell: function (d) { return statusTag(d.status); } }
  ],
  rowActions: function (d) {
    var a = [];
    if (d.status === 'Pending') { a.push({ a: 'approve', t: 'Approve & send credentials', i: ICO.tick, cls: 'ok' }); a.push({ a: 'reject', t: 'Reject', i: ICO.x }); }
    else if (d.status === 'Approved') { a.push({ a: 'cred', t: 'Resend login on WhatsApp', i: ICO.wa }); a.push({ a: 'block', t: 'Block dealer', i: ICO.x }); }
    else if (d.status === 'Blocked' || d.status === 'Rejected') a.push({ a: 'approve', t: 'Approve / re-activate', i: ICO.tick });
    return a;
  },
  onAction: function (a, d) {
    if (a === 'approve') confirmDo('Approve dealer?', '<b>' + esc(d.firm_name) + '</b> will receive dealer code <b>' + esc(d.dealer_code || nextDealerCode()) + '</b> and a password on WhatsApp.', 'Approve', function () { approveDealer(d); DB.save(); route(true); toast('Dealer approved — credentials sent on WhatsApp', 'ok'); });
    else if (a === 'reject') promptDo('Reject sign-up', 'Reason (sent to the dealer)', '', 'Reject', function (why) { DB.upd('dealer', d.dealer_id, { status: 'Rejected', remarks: why }); notify({ channel: 'WhatsApp', to: d.mobile, tpl: 'DEALER_REJECTED', msg: MSG.dealerRejected(d, why), refType: 'dealer', refNo: d.firm_name }); DB.save(); route(true); toast('Dealer rejected', 'ok'); }, true);
    else if (a === 'block') confirmDo('Block dealer?', 'The dealer will not be able to log in. Existing registrations stay valid.', 'Block', function () { DB.upd('dealer', d.dealer_id, { status: 'Blocked' }); DB.save(); route(true); toast('Dealer blocked', 'ok'); }, true);
    else if (a === 'cred') { notify({ channel: 'WhatsApp', to: d.mobile, tpl: 'DEALER_APPROVED', msg: MSG.dealerApproved(d), refType: 'dealer', refNo: d.dealer_code }); }
  },
  perm: function () { return { add: 1, edit: 1, del: 1, imp: 1 }; },
  imp: {
    key: 'mobile',
    cols: [
      { h: 'Firm Name', k: 'firm_name', req: 1, alias: ['Dealer Name', 'Firm'], sample: 'Shree Ram Solar Agency' },
      { h: 'Contact Person', k: 'contact_person', sample: 'Ramesh Sharma' },
      { h: 'Mobile', k: 'mobile', req: 1, pattern: /^[6-9]\d{9}$/, patMsg: 'must be a 10-digit mobile', sample: '9811000001' },
      { h: 'Email', k: 'email', sample: 'shreeram@example.com' },
      { h: 'Address', k: 'address', sample: 'Main Road, Sikar' },
      { h: 'City', k: 'city', sample: 'Sikar' },
      { h: 'District', k: 'district', sample: 'Sikar' },
      { h: 'State', k: 'state_code', req: 1, lk: { t: 'state_master', f: ['state_name', 'short_name', 'state_code'] }, sample: 'Rajasthan' },
      { h: 'Pincode', k: 'pincode', pattern: /^\d{6}$/, patMsg: 'must be 6 digits', sample: '332001' },
      { h: 'GSTIN', k: 'gstin', sample: '08ABCDE1234F1Z5' },
      { h: 'Warranty Months', k: 'warranty_months', type: 'int', alias: ['Warranty'], sample: 24, note: 'Optional dealer-specific warranty period' },
      { h: 'Status', k: 'status', enumv: DEALER_STATUS, sample: 'Approved', note: 'Blank = Approved. Approved dealers get a code and password generated.' }
    ],
    make: function (o) {
      var d = { firm_name: o.firm_name, contact_person: o.contact_person, mobile: o.mobile, email: o.email, address: o.address, city: o.city, district: o.district, state_code: o.state_code, pincode: o.pincode, gstin: o.gstin, warranty_months: o.warranty_months || null, status: o.status || 'Approved', signup_on: nowIso(), remarks: 'Imported from Excel' };
      if (d.status === 'Approved') { d.dealer_code = nextDealerCode(); d.password = genPwd(); d.approved_by = myName(); d.approved_on = nowIso(); }
      return d;
    },
    makeUpdate: function (o) { var p = {}; ['firm_name', 'contact_person', 'email', 'address', 'city', 'district', 'state_code', 'pincode', 'gstin', 'warranty_months'].forEach(function (k) { if (o[k] != null) p[k] = o[k]; }); return p; }
  }
});
/* DB.add inside Import.commit goes through make() one at a time, so nextDealerCode() sees earlier rows */
ROUTES['w/dealers'] = function () { var p = entityScreen('dealer'); p.crumb = 'Home › Warranty › <b>Dealers</b>'; return p; };

/* ============================================================
   CUSTOMERS
   ============================================================ */
function custCounts(c) {
  var inst = DB.where('installation', function (i) { return i.customer_id === c.customer_id; });
  var w = DB.where('warranty', function (x) { return x.customer_id === c.customer_id; });
  var act = w.filter(function (x) { var s = wStatus(x); return s.k === 'active' || s.k === 'expiring'; }).length;
  return { inst: inst.length, w: w.length, act: act, calls: DB.where('complaint', function (x) { return x.customer_id === c.customer_id; }).length };
}
defEntity({
  key: 'customer', table: 'customer', title: 'Customer', plural: 'Customers', refLabel: function (r) { return r.customer_name; },
  rows: function () { return Q.customers(); },
  sub: function (rows) { return inr(rows.length) + ' end-user customers · created automatically at warranty registration; mobile number is their login'; },
  fields: function () {
    return [
      { k: 'customer_name', l: 'Customer name', req: 1, full: 1 },
      { k: 'mobile', l: 'Mobile', type: 'tel', req: 1, unique: 1, pattern: /^[6-9]\d{9}$/, patMsg: 'Enter a valid 10-digit mobile number' }, { k: 'alt_mobile', l: 'Alternate mobile' },
      { k: 'email', l: 'Email', type: 'email' }, { k: 'language', l: 'Preferred language', type: 'select', opts: [{ v: 'EN', l: 'English' }, { v: 'HI', l: 'Hindi' }, { v: 'GU', l: 'Gujarati' }] },
      { k: 'address', l: 'Address', type: 'area', full: 1 }, { k: 'village', l: 'Village / area' },
      { k: 'state_code', l: 'State', type: 'select', req: 1, opts: stateOpts }, { k: 'district', l: 'District', suggest: { dep: 'state_code', fn: districtList } },
      { k: 'city', l: 'City / town' }, { k: 'pincode', l: 'Pincode', pattern: /^\d{6}$/, patMsg: 'Pincode must be 6 digits' }
    ];
  },
  defaults: function () { return { language: 'EN', state_code: '09' }; },
  before: function (v, row) { if (!row) v.created_on = nowIso(); return null; },
  perm: function () { var r = ROLE(); return { add: (r === 'SUPER' || r === 'HO') ? 1 : 0, edit: (r === 'SUPER' || r === 'HO' || r === 'DEALER') ? 1 : 0, del: (r === 'SUPER' || r === 'HO') ? 1 : 0, imp: (r === 'SUPER' || r === 'HO') }; },
  filters: [{ label: 'State', get: function (c) { return stateName(c.state_code); } }, { label: 'District', get: function (c) { return c.district || ''; } }],
  searchPh: 'Search name, mobile, village, district…',
  search: function (c) { return [c.customer_name, c.mobile, c.village, c.district, c.pincode].join(' '); },
  sortI: 0, sortD: 'asc',
  cols: [
    { h: 'Customer', val: function (c) { return c.customer_name; }, cell: function (c) { return '<b>' + esc(c.customer_name) + '</b>'; } },
    { h: 'Mobile', val: function (c) { return c.mobile; } },
    { h: 'Village / area', val: function (c) { return c.village || ''; } },
    { h: 'District', val: function (c) { return c.district || ''; } },
    { h: 'State', val: function (c) { return stateName(c.state_code); } },
    { h: 'Pincode', val: function (c) { return c.pincode || ''; } },
    { h: 'Pump sets', val: function (c) { return custCounts(c).inst; }, cls: 'n' },
    { h: 'Active warranties', val: function (c) { return custCounts(c).act; }, cls: 'n' },
    { h: 'Service calls', val: function (c) { return custCounts(c).calls; }, cls: 'n' },
    { h: 'Last login', val: function (c) { return c.last_login || ''; }, cell: function (c) { return c.last_login ? dmy(c.last_login.slice(0, 10)) : '<span class="muted">never</span>'; } }
  ],
  rowActions: function () { return [{ a: 'view', t: 'Open customer 360', i: ICO.eye }]; },
  onAction: function (a, c) { if (a === 'view') location.hash = '#/w/customers/' + c.customer_id; },
  onRow: function (c) { location.hash = '#/w/customers/' + c.customer_id; },
  imp: {
    key: 'mobile',
    cols: [
      { h: 'Customer Name', k: 'customer_name', req: 1, alias: ['Name'], sample: 'Mohan Lal Yadav' },
      { h: 'Mobile', k: 'mobile', req: 1, pattern: /^[6-9]\d{9}$/, patMsg: 'must be a 10-digit mobile', sample: '9822000001' },
      { h: 'Address', k: 'address', sample: 'Ward 4, Near Panchayat Bhawan' },
      { h: 'Village', k: 'village', alias: ['Village / Area'], sample: 'Rampura' },
      { h: 'District', k: 'district', sample: 'Sikar' },
      { h: 'State', k: 'state_code', req: 1, lk: { t: 'state_master', f: ['state_name', 'short_name', 'state_code'] }, sample: 'Rajasthan' },
      { h: 'Pincode', k: 'pincode', pattern: /^\d{6}$/, patMsg: 'must be 6 digits', sample: '332001' },
      { h: 'Email', k: 'email', sample: '' },
      { h: 'Language', k: 'language', enumv: ['EN', 'HI', 'GU'], upper: 1, sample: 'HI' }
    ],
    make: function (o) { o.language = o.language || 'EN'; o.created_on = nowIso(); return o; },
    makeUpdate: function (o) { var p = {}; for (var k in o) if (o[k] != null && k !== 'mobile') p[k] = o[k]; return p; }
  }
});

ROUTES['w/customers'] = function (a, q) {
  if (a[0]) return customerDetail(+a[0]);
  var p = entityScreen('customer'); p.crumb = 'Home › Warranty › <b>Customers</b>'; return p;
};

function customerDetail(id) {
  var c = DB.get('customer', id);
  if (!c) return { title: 'Customer', body: '<div class="empty">Customer not found</div>' };
  var n = custCounts(c), insts = DB.where('installation', function (i) { return i.customer_id === id; });
  var calls = DB.where('complaint', function (x) { return x.customer_id === id; }).filter(function (x) { return Q.complaints().indexOf(x) >= 0; });
  var instHtml = insts.map(function (i) {
    var ws = wByInstall(i.install_id);
    return '<div class="card"><h3>' + esc(i.install_no) + ' <span class="sm2">installed ' + dmy(i.install_date) + ' · ' + esc(i.village || i.district || '') + ' · dealer: ' + esc(dealerName(i.dealer_id) || 'Direct') + '</span>' +
      '<span style="margin-left:auto;display:flex;gap:6px"><button class="btn sm" onclick="location.hash=\'#/w/card/' + i.install_id + '\'">' + ICO.prn + ' Warranty card</button>' +
      '<button class="btn sm pri" onclick="location.hash=\'#/s/calls?new=' + i.install_id + '\'">' + ICO.wrench + ' Book service call</button></span></h3>' +
      '<table class="dt"><thead><tr><th>Component</th><th>Serial</th><th>Model</th><th>From</th><th>Valid till</th><th class="n">Balance</th><th>Status</th></tr></thead><tbody>' +
      ws.map(function (w) { var s = wStatus(w); return '<tr class="clk" onclick="location.hash=\'#/w/search?sn=' + encodeURIComponent(w.serial_no) + '\'"><td>' + catTag(w.category) + '</td><td class="mono"><b>' + esc(w.serial_no) + '</b></td><td>' + esc(modelName(w.model_id)) + '</td><td>' + dmy(w.start_date) + '</td><td>' + dmy(w.end_date) + '</td><td class="n">' + ((s.k === 'active' || s.k === 'expiring') ? s.days + ' d' : '—') + '</td><td><span class="tag ' + s.cls + '">' + s.txt + '</span></td></tr>'; }).join('') + '</tbody></table></div>';
  }).join('');
  var can = ROLE() === 'SUPER' || ROLE() === 'HO';
  return {
    title: esc(c.customer_name), crumb: 'Home › Warranty › <a href="#/w/customers">Customers</a> › <b>' + esc(c.mobile) + '</b>',
    sub: esc(c.mobile) + ' · ' + esc([c.village, c.district, stateName(c.state_code), c.pincode].filter(Boolean).join(', ')),
    actions: '<button class="btn" onclick="goBack(\'#/w/customers\')">' + ICO.back + ' Back</button>' +
      (can || ROLE() === 'DEALER' ? '<button class="btn" onclick="openForm(\'customer\',DB.get(\'customer\',' + id + '))">' + ICO.edit + ' Edit</button>' : '') +
      (can ? '<button class="btn dang-o" style="margin:0" onclick="deleteEntity(\'customer\',DB.get(\'customer\',' + id + '))">' + ICO.trash + ' Delete</button>' : ''),
    body: stripCards([{ l: 'Pump sets', v: n.inst }, { l: 'Component warranties', v: n.w }, { l: 'Active', v: n.act, c: 'ok' }, { l: 'Service calls', v: n.calls, c: n.calls ? 'warn' : '' }, { l: 'Language', v: esc(c.language || 'EN') }]) +
      (instHtml || '<div class="card"><div class="empty">No registered pump sets</div></div>') +
      '<div class="card"><h3>Service calls <span class="sm2">' + calls.length + '</span></h3>' + (calls.length ? '<table class="dt"><thead><tr><th>Call no</th><th>Date</th><th>Type</th><th>Complaint</th><th>Status</th></tr></thead><tbody>' +
        calls.map(function (x) { return '<tr class="clk" onclick="location.hash=\'#/s/call/' + x.complaint_id + '\'"><td><b>' + esc(x.complaint_no) + '</b></td><td>' + dmy(x.call_date) + '</td><td>' + esc(nameOf('call_type', x.calltype_id, 'call_type')) + '</td><td>' + esc(shortName(x.complaint_text, 70)) + '</td><td>' + statusTag(x.status) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="empty">No service calls</div>') + '</div>'
  };
}

/* ============================================================
   GEO-GRAPHICAL REPORT - India tile map + state / district table
   ============================================================ */
var TILE = {   /* short name -> [col,row] */
  LA: [3, 0], JK: [4, 0], HP: [4, 1], PB: [3, 1], UK: [5, 1], CH: [3, 2], HR: [4, 2], DL: [5, 2], RJ: [3, 3], UP: [5, 3], BR: [7, 3], SK: [8, 3],
  AR: [10, 3], GJ: [2, 4], MP: [4, 4], CG: [5, 4], JH: [6, 4], WB: [7, 4], AS: [9, 4], NL: [10, 4], DD: [1, 5], DN: [2, 5], MH: [3, 5], TG: [4, 5], TS: [4, 5], OD: [6, 5], ML: [9, 5], MN: [10, 5],
  GA: [3, 6], KA: [4, 6], AP: [5, 6], TR: [9, 6], MZ: [10, 6], KL: [4, 7], TN: [5, 7], PY: [6, 7], AN: [8, 7], LD: [3, 7]
};
ROUTES['w/geo'] = function (a, q) {
  var inst = Q.install(), by = groupBy(inst, function (i) { return i.state_code || '--'; });
  var sets = {}, max = 1;
  Object.keys(by).forEach(function (k) { sets[k] = by[k].length; if (by[k].length > max) max = by[k].length; });
  var states = DB.all('state_master'), W = 11, tiles = '', extras = [];
  var grid = {};
  states.forEach(function (s) {
    var p = TILE[s.short_name]; if (!p) { extras.push(s); return; }
    var key = p[0] + ',' + p[1]; if (grid[key]) { extras.push(s); return; }
    grid[key] = s;
  });
  var rowsN = 9;
  for (var r = 0; r < rowsN; r++) {
    for (var c = 0; c < W; c++) {
      var s = grid[c + ',' + r];
      if (!s) { tiles += '<i class="tile off"></i>'; continue; }
      var n = sets[s.state_code] || 0, lvl = n ? Math.min(5, 1 + Math.floor(4 * n / max)) : 0;
      tiles += '<a class="tile l' + lvl + '" href="#/w/geo?state=' + s.state_code + '" title="' + esc(s.state_name) + ': ' + n + ' pump sets"><b>' + esc(s.short_name) + '</b><span>' + (n || '') + '</span></a>';
    }
  }
  var rows = states.map(function (s) {
    var ins = by[s.state_code] || [], ids = {}; ins.forEach(function (i) { ids[i.install_id] = 1; });
    var ws = DB.all('warranty').filter(function (w) { return ids[w.install_id]; });
    var act = ws.filter(function (w) { var st = wStatus(w); return st.k === 'active' || st.k === 'expiring'; }).length;
    var calls = DB.all('complaint').filter(function (cp) { return cp.state_code === s.state_code; }).length;
    return { code: s.state_code, name: s.state_name, sets: ins.length, w: ws.length, act: act, calls: calls, cust: uniq(ins.map(function (i) { return i.customer_id; })).length, dealers: uniq(ins.map(function (i) { return i.dealer_id; })).length };
  }).filter(function (x) { return x.sets || x.calls; });
  var st = q.state, drill = '';
  if (st) {
    var di = groupBy((by[st] || []), function (i) { return i.district || '—'; });
    drill = '<div class="card"><h3>District-wise · ' + esc(stateName(st)) + ' <a class="sm2" href="#/w/geo" style="margin-left:auto">clear</a></h3><div class="cbody">' +
      barList(Object.keys(di).map(function (k) { return { l: k, v: di[k].length }; }).sort(function (x, y) { return y.v - x.v; }), { fmt: function (v) { return v + ' sets'; } }) + '</div></div>';
  }
  return {
    title: 'Geo-Graphical Report', crumb: 'Home › Warranty › <b>Geo Report</b>', sub: 'Registered pump sets by state — click a state for the district split',
    body: '<div class="grid2" style="grid-template-columns:1.25fr 1fr"><div class="card" style="margin:0"><h3>India tile map <span class="sm2">darker = more installed sets</span></h3><div class="cbody"><div class="tilemap" style="grid-template-columns:repeat(' + W + ',1fr)">' + tiles + '</div>' +
      (extras.length ? '<div class="hint">Not drawn: ' + extras.map(function (s) { return esc(s.short_name); }).join(', ') + '</div>' : '') + '</div></div>' +
      '<div>' + drill + '<div class="card" style="margin:0 0 16px"><h3>Top states</h3><div class="cbody">' + barList(rows.slice().sort(function (x, y) { return y.sets - x.sets; }).slice(0, 8).map(function (x) { return { l: x.name, v: x.sets }; }), { fmt: function (v) { return v + ' sets'; } }) + '</div></div></div></div>' +
      '<div id="geoGrid"></div>',
    after: function () {
      mountGrid('#geoGrid', {
        title: 'State_wise_registrations', rows: rows, sortI: 1, sortD: 'desc', pageSize: 50,
        cols: [
          { h: 'State', val: function (r) { return r.name; }, cell: function (r) { return '<a href="#/w/geo?state=' + r.code + '"><b>' + esc(r.name) + '</b></a>'; } },
          { h: 'Pump sets', val: function (r) { return r.sets; }, cls: 'n' }, { h: 'Component warranties', val: function (r) { return r.w; }, cls: 'n' },
          { h: 'Active', val: function (r) { return r.act; }, cls: 'n' }, { h: 'Customers', val: function (r) { return r.cust; }, cls: 'n' },
          { h: 'Dealers', val: function (r) { return r.dealers; }, cls: 'n' }, { h: 'Service calls', val: function (r) { return r.calls; }, cls: 'n' }
        ],
        totals: function (data, i) { var keys = [null, 'sets', 'w', 'act', 'cust', 'dealers', 'calls']; return i === 0 ? '<b>Total</b>' : '<b>' + inr(sum(data, function (r) { return r[keys[i]]; })) + '</b>'; }
      });
    }
  };
};
