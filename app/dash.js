/* ============================================================
   DASHBOARDS  -  one per kind of user
   ============================================================ */
'use strict';

function last6() { var o = []; for (var m = 5; m >= 0; m--) o.push(ymKey(addMonths(today().slice(0, 8) + '01', -m))); return o; }
function quickBtns(list) { return '<div class="card"><h3>Quick actions</h3><div class="cbody qa">' + list.filter(function (q) { return canGo(q.go); }).map(function (q) { return '<a class="btn' + (q.pri ? ' pri' : '') + '" href="' + q.go + '">' + q.ico + ' ' + q.t + '</a>'; }).join('') + '</div></div>'; }
function pendingForMe() {
  return Q.jobcards().filter(function (j) { if (j.status !== 'In Approval') return false; var p = jcPending(j); return p && canActApproval(p, j); });
}
function compChips(ws) {
  return ['PUMP', 'MOTOR', 'CONTROLLER'].map(function (cat) {
    var w = ws.filter(function (x) { return x.category === cat && x.status !== 'Replaced'; })[0] || ws.filter(function (x) { return x.category === cat; })[0], s = wStatus(w);
    return '<div class="pc"><span>' + catLabel(cat) + '</span>' + (w ? '<b>' + esc(w.serial_no) + '</b><small>' + esc(modelName(w.model_id)) + '</small>' + '<span class="tag ' + s.cls + '">' + s.txt + (s.k === 'active' || s.k === 'expiring' ? ' · ' + s.days + ' d left' : '') + '</span><small>till ' + dmy(w.end_date) + '</small>' : '<em>—</em>') + '</div>';
  }).join('');
}

ROUTES['dashboard'] = function () {
  var r = ROLE();
  if (r === 'CUSTOMER') return custDash();
  if (r === 'DEALER') return dealerDash();
  if (r === 'ENGINEER') return engDash();
  return hoDash();
};

/* ---------------- Head office / service manager ---------------- */
function hoDash() {
  var ws = Q.warranty(), ins = Q.install(), calls = Q.complaints(), open = calls.filter(callOpen), over = open.filter(callOverdue);
  var st = { active: 0, expiring: 0, expired: 0, replaced: 0 };
  ws.forEach(function (w) { var s = wStatus(w).k; if (st[s] != null) st[s]++; });
  var months = last6(), dealers = Q.dealers(), pendD = dealers.filter(function (d) { return d.status === 'Pending'; }), mine = pendingForMe();
  var expSoon = ws.filter(function (w) { return wStatus(w).k === 'expiring'; }).sort(function (a, b) { return a.end_date.localeCompare(b.end_date); });
  var byDealer = {}; ins.forEach(function (i) { var k = i.dealer_id ? dealerName(i.dealer_id) : 'Direct / customer'; byDealer[k] = (byDealer[k] || 0) + 1; });
  var stockLow = (typeof stockRows === 'function') ? stockRows().filter(function (x) { return x.good <= (x.spare.min_stock || 0); }).length : 0;
  var regMonths = months.map(function (m) { return { l: ymLbl(m), v: ins.filter(function (i) { return ymKey(i.install_date) === m; }).length, c: calls.filter(function (c) { return ymKey(c.call_date) === m; }).length }; });
  var stCol = { 'New': '#2E6FD9', 'Assigned': '#7B5AC4', 'Visited': '#00B7C7', 'In Approval': '#E8A317', 'Approved': '#12A150', 'Resolved': '#009694', 'Closed': '#78909C', 'Cancelled': '#DC3545' };
  var att = [];
  mine.slice(0, 3).forEach(function (j) { att.push({ t: 'Job card ' + j.jobcard_no + ' waits for your approval', s: '₹ ' + inr(j.grand_total) + ' · ' + nameOf('complaint', j.complaint_id, 'customer_name'), go: '#/s/jobcard/' + j.jobcard_id, k: 'a' }); });
  pendD.slice(0, 2).forEach(function (d) { att.push({ t: 'Dealer sign-up pending: ' + d.firm_name, s: d.city + ' · ' + d.mobile, go: '#/w/dealers', k: 'p' }); });
  over.sort(function (a, b) { return a.due_date.localeCompare(b.due_date); }).slice(0, 3).forEach(function (c) { att.push({ t: 'Overdue call ' + c.complaint_no + ' (due ' + dmy(c.due_date) + ')', s: c.customer_name + ' · ' + (c.engineer_id ? userName(c.engineer_id) : 'not assigned'), go: '#/s/call/' + c.complaint_id, k: 'r' }); });
  open.filter(function (c) { return c.status === 'New'; }).slice(0, 2).forEach(function (c) { att.push({ t: 'New call ' + c.complaint_no + ' to assign', s: c.customer_name + ' · ' + shortName(c.complaint_text, 48), go: '#/s/call/' + c.complaint_id, k: 'b' }); });
  expSoon.slice(0, 2).forEach(function (w) { att.push({ t: 'Warranty ending ' + dmy(w.end_date) + ' — ' + catLabel(w.category) + ' ' + w.serial_no, s: custName(w.customer_id), go: '#/w/search?sn=' + encodeURIComponent(w.serial_no), k: 'w' }); });
  att = att.filter(function (x) { return canGo(x.go); });
  var warrantyCost = sum(Q.jobcards().filter(function (j) { return j.status === 'Approved' || j.status === 'Closed'; }), function (j) { return j.warranty_amount; });
  return {
    title: 'Dashboard', crumb: 'Home › <b>Dashboard</b>', sub: esc(CO().company_name) + ' · warranty &amp; service at a glance · ' + dmy(today()),
    actions: '<button class="btn" onclick="location.hash=\'#/flow\'">' + ICO.flow + ' End-to-end flow</button><button class="btn pri" onclick="location.hash=\'#/w/register\'">' + ICO.shield + ' Register warranty</button>',
    body: '<div class="kpis">' +
      counter({ label: 'Pump sets under warranty', value: inr(ins.filter(function (i) { return wByInstall(i.install_id).some(function (w) { var k = wStatus(w).k; return k === 'active' || k === 'expiring'; }); }).length), sub: inr(ins.length) + ' installations · ' + inr(ws.length) + ' serials registered', go: '#/w/active' }) +
      counter({ label: 'Warranty ending in 45 days', value: inr(st.expiring), sub: inr(st.expired) + ' already expired', go: '#/w/active', cls: 'a' }) +
      counter({ label: 'Open service calls', value: inr(open.length), sub: inr(over.length) + ' overdue · ' + inr(open.filter(function (c) { return c.status === 'New'; }).length) + ' to assign', go: '#/s/calls', cls: over.length ? 'r' : 'b' }) +
      counter({ label: 'Job cards awaiting approval', value: inr(Q.jobcards().filter(function (j) { return j.status === 'In Approval'; }).length), sub: inr(mine.length) + ' waiting for you', go: '#/s/approvals', cls: 'p' }) +
      (isHO() ? counter({ label: 'Dealer sign-ups to approve', value: inr(pendD.length), sub: inr(dealers.filter(function (d) { return d.status === 'Approved'; }).length) + ' approved dealers', go: '#/w/dealers', cls: pendD.length ? 'a' : 'g' }) : counter({ label: 'Low / out of stock lines', value: inr(stockLow), sub: 'at your center and engineers', go: '#/k/stock', cls: stockLow ? 'a' : 'g' })) +
      counter({ label: 'Warranty cost (approved)', value: '₹ ' + cr(warrantyCost, 2), sub: 'borne by the company', go: '#/s/claims', cls: 'g' }) + '</div>' +
      '<div class="grid2"><div class="card" style="margin:0"><h3>Registrations and service calls <span class="sm2">last 6 months</span></h3><div class="cbody">' +
      barChart(regMonths.map(function (d) { return { l: d.l, a: d.v, b: d.c }; }), { h: 215, series: [{ key: 'a', color: '#009694', label: 'Installations registered' }, { key: 'b', color: '#FFAB40', label: 'Service calls booked' }] }) + '</div></div>' +
      '<div class="card" style="margin:0"><h3>Warranty position <span class="sm2">per serial</span></h3><div class="cbody">' +
      donut([{ l: 'Active', v: st.active, c: '#12A150' }, { l: 'Ending in 45 days', v: st.expiring, c: '#E8A317' }, { l: 'Expired', v: st.expired, c: '#DC3545' }, { l: 'Replaced', v: st.replaced, c: '#7B5AC4' }].filter(function (d) { return d.v; }), { center: String(ws.length), center2: 'serials' }) + '</div></div></div>' +
      '<div class="grid2" style="margin-top:16px"><div class="card" style="margin:0"><h3>Needs attention</h3>' + (att.length ? '<div class="attn">' + att.map(function (a) { return '<a class="at ' + a.k + '" href="' + a.go + '"><b>' + esc(a.t) + '</b><span>' + esc(a.s) + '</span></a>'; }).join('') + '</div>' : '<div class="empty" style="padding:26px">All clear</div>') + '</div>' +
      '<div class="grid3" style="grid-template-columns:1fr 1fr;margin:0"><div class="card" style="margin:0"><h3>Calls by status</h3><div class="cbody">' + donut(CALL_STATUS.map(function (s) { return { l: s, v: calls.filter(function (c) { return c.status === s; }).length, c: stCol[s] }; }).filter(function (d) { return d.v; }), { size: 150, center: String(calls.length), center2: 'calls' }) + '</div></div>' +
      '<div class="card" style="margin:0"><h3>Installations by dealer</h3><div class="cbody">' + barList(Object.keys(byDealer).map(function (k) { return { l: k, v: byDealer[k] }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 6), { fmt: function (v) { return v + ''; } }) + '</div></div></div></div>' +
      '<div style="margin-top:16px">' + quickBtns([{ go: '#/w/register', t: 'Register warranty', ico: ICO.shield, pri: 1 }, { go: '#/s/calls?new=1', t: 'Book a service call', ico: ICO.phone }, { go: '#/w/stickers', t: 'Import serial numbers (Excel)', ico: ICO.imp }, { go: '#/w/search', t: 'Serial no. search', ico: ICO.search }, { go: '#/s/jobcards', t: 'Job cards', ico: ICO.clip }, { go: '#/k/stock', t: 'Stock', ico: ICO.box }]) + '</div>'
  };
}

/* ---------------- Engineer ---------------- */
function engDash() {
  var u = APP.user, calls = Q.complaints().filter(callOpen), today0 = today();
  var visits = Q.visits().filter(function (v) { return v.visit_date === today0; });
  var stock = stockRows().filter(function (x) { return x.good <= (x.spare.min_stock || 0); });
  var jcs = Q.jobcards();
  return {
    title: 'My Dashboard', crumb: 'Home › <b>Dashboard</b>', sub: 'Welcome, ' + esc(u.name) + ' · ' + esc(scName(u.rec.sc_id)),
    body: '<div class="kpis">' + counter({ label: 'My open calls', value: calls.length, sub: calls.filter(callOverdue).length + ' overdue', go: '#/s/calls', cls: calls.filter(callOverdue).length ? 'r' : 'b' }) +
      counter({ label: 'Visits today', value: visits.length, sub: 'recorded so far', go: '#/s/visits' }) +
      counter({ label: 'My job cards', value: jcs.filter(function (j) { return j.status === 'Draft' || j.status === 'Rejected'; }).length, sub: 'draft / sent back — ' + jcs.filter(function (j) { return j.status === 'In Approval'; }).length + ' in approval', go: '#/s/jobcards', cls: 'a' }) +
      counter({ label: 'My low-stock spares', value: stock.length, sub: 'at or below minimum', go: '#/k/stock', cls: stock.length ? 'a' : 'g' }) + '</div>' +
      '<div class="card"><h3>My calls to attend</h3>' + (calls.length ? '<table class="dt"><thead><tr><th>Call</th><th>Customer</th><th>Place</th><th>Component</th><th>Fault</th><th>Due</th><th>Status</th></tr></thead><tbody>' +
        calls.sort(function (a, b) { return String(a.due_date).localeCompare(b.due_date); }).map(function (c) { return '<tr class="clk" onclick="location.hash=\'#/s/call/' + c.complaint_id + '\'"><td><b>' + esc(c.complaint_no) + '</b></td><td>' + esc(c.customer_name) + '<div class="hint">' + esc(c.mobile) + '</div></td><td>' + esc(c.village || c.district || '') + '</td><td>' + esc(callCompLabel(c)) + '</td><td class="el">' + esc(c.complaint_text) + '</td><td style="color:var(--' + (callOverdue(c) ? 'dang' : 'ink') + ')">' + dmy(c.due_date) + '</td><td>' + statusTag(c.status) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="empty" style="padding:26px">No open calls</div>') + '</div>'
  };
}

/* ---------------- Dealer ---------------- */
function dealerDash() {
  var u = APP.user, ins = Q.install(), ws = Q.warranty(), calls = Q.complaints();
  var exp = ws.filter(function (w) { return wStatus(w).k === 'expiring'; }).length;
  return {
    title: 'Dealer Dashboard', crumb: 'Home › <b>Dashboard</b>', sub: esc(u.rec.firm_name) + ' · dealer code ' + esc(u.rec.dealer_code) + (u.rec.warranty_months ? ' · special warranty period ' + u.rec.warranty_months + ' months' : ''),
    actions: '<button class="btn pri" onclick="location.hash=\'#/w/register\'">' + ICO.shield + ' Register a product</button><button class="btn" onclick="location.hash=\'#/s/calls?new=1\'">' + ICO.phone + ' Book a service call</button>',
    body: '<div class="kpis">' + counter({ label: 'Pump sets registered', value: ins.length, sub: ws.length + ' serials', go: '#/w/active' }) + counter({ label: 'Warranty ending in 45 days', value: exp, go: '#/w/active', cls: exp ? 'a' : 'g' }) +
      counter({ label: 'Open service calls', value: calls.filter(callOpen).length, sub: calls.length + ' in total', go: '#/s/calls', cls: 'b' }) + counter({ label: 'Replacements', value: Q.repl().length, sub: 'credit notes ₹ ' + inr(sum(Q.repl(), function (r) { return r.cn_amount; })), go: '#/w/replace', cls: 'p' }) + '</div>' +
      '<div class="card"><h3>My latest installations</h3>' + (ins.length ? '<table class="dt"><thead><tr><th>Installation</th><th>Date</th><th>Customer</th><th>Place</th><th>Pump / Motor / Controller</th><th></th></tr></thead><tbody>' +
        ins.slice().sort(function (a, b) { return b.install_date.localeCompare(a.install_date); }).slice(0, 8).map(function (i) { var w = wByInstall(i.install_id); return '<tr><td><b>' + esc(i.install_no) + '</b></td><td>' + dmy(i.install_date) + '</td><td>' + esc(custName(i.customer_id)) + '</td><td>' + esc(i.village || '') + ', ' + esc(i.district || '') + '</td><td>' +
          w.filter(function (x) { return x.status !== 'Replaced'; }).map(function (x) { var s = wStatus(x); return '<span class="tag ' + s.cls + '" title="' + esc(x.serial_no) + '">' + catLabel(x.category).charAt(0) + ' · ' + s.txt + '</span>'; }).join(' ') + '</td><td><button class="btn sm" onclick="location.hash=\'#/w/card/' + i.install_id + '\'">Card</button> <button class="btn sm" onclick="location.hash=\'#/s/calls?new=' + i.install_id + '\'">Raise call</button></td></tr>'; }).join('') + '</tbody></table>' : '<div class="empty" style="padding:26px">No registrations yet — use Register a product</div>') + '</div>'
  };
}

/* ---------------- Customer : My Products ---------------- */
function custDash() {
  var u = APP.user, ins = Q.install(), calls = Q.complaints();
  var cards = ins.slice().sort(function (a, b) { return b.install_date.localeCompare(a.install_date); }).map(function (i) {
    var ws = wByInstall(i.install_id), open = calls.filter(function (c) { return c.install_id === i.install_id && callOpen(c); });
    return '<div class="card prod"><h3>' + esc(modelName((ws.filter(function (w) { return w.category === 'PUMP'; })[0] || {}).model_id) || 'Solar pump set') + '<span class="sm2">installed ' + dmy(i.install_date) + ' · ' + esc(i.install_no) + '</span></h3><div class="cbody">' +
      '<div class="hint" style="margin:-2px 0 10px">' + esc([i.village, i.district, stateName(i.state_code)].filter(Boolean).join(', ')) + ' · dealer: ' + esc(dealerName(i.dealer_id) || 'direct') + '</div><div class="pcs">' + compChips(ws) + '</div>' +
      (open.length ? '<div class="note" style="margin-top:10px">Service call <b>' + esc(open[0].complaint_no) + '</b> is ' + esc(open[0].status.toLowerCase()) + ' — <a href="#/s/call/' + open[0].complaint_id + '">track it</a></div>' : '') +
      '<div class="qa" style="margin-top:12px"><a class="btn" href="#/w/card/' + i.install_id + '">' + ICO.prn + ' Warranty card</a><a class="btn pri" href="#/s/calls?new=' + i.install_id + '">' + ICO.phone + ' Raise service call</a></div></div></div>';
  }).join('');
  return {
    title: 'My Products', crumb: 'Home › <b>My Products</b>', sub: 'Namaste ' + esc(u.name) + ' · ' + esc(u.rec.mobile), actions: '<button class="btn pri" onclick="location.hash=\'#/w/register\'">' + ICO.qr + ' Register another product</button>',
    body: (cards || '<div class="card"><div class="empty" style="padding:30px">No products registered yet. Scan the QR code on the pump sticker to register.</div></div>') +
      (calls.length ? '<div class="card"><h3>My service calls</h3><table class="dt"><thead><tr><th>Call</th><th>Date</th><th>Problem</th><th>Engineer</th><th>Status</th></tr></thead><tbody>' + calls.slice().sort(function (a, b) { return b.call_date.localeCompare(a.call_date); }).map(function (c) { return '<tr class="clk" onclick="location.hash=\'#/s/call/' + c.complaint_id + '\'"><td><b>' + esc(c.complaint_no) + '</b></td><td>' + dmy(c.call_date) + '</td><td class="el">' + esc(c.complaint_text) + '</td><td>' + esc(userName(c.engineer_id) || '—') + '</td><td>' + statusTag(c.status) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '')
  };
}
