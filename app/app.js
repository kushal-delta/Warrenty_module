/* ============================================================
   Delta iERP Warranty & Service  -  shell, login, navigation, router
   ============================================================ */
'use strict';

var APP = { name: 'Delta iERP', sub: 'Warranty & Service', ver: '1.0.0', build: '20261031', vendor: 'Delta Infosoft Pvt. Ltd.', user: null, login: null };
var ROUTES = {};
var ALL = ['SUPER', 'HO', 'MANAGER', 'ENGINEER', 'DEALER', 'CUSTOMER'];
var STAFF = ['SUPER', 'HO', 'MANAGER'];
var HO = ['SUPER', 'HO'];

/* role of the signed-in user: SUPER / HO / MANAGER / ENGINEER / DEALER / CUSTOMER */
function ROLE() { return APP.user ? APP.user.role : ''; }
function isHO() { return ROLE() === 'SUPER' || ROLE() === 'HO'; }
function isStaff() { return STAFF.indexOf(ROLE()) >= 0; }
function myName() { return APP.user ? APP.user.name : 'System'; }

/* ---------------- NAVIGATION ----------------
   [hash, label, roles, rights-group]                                         */
var NAV = [
  { g: 'Dashboard', ico: ICO.dash, key: 'Dash', items: [['#/dashboard', 'Dashboard', ALL]] },
  {
    g: 'Warranty', ico: ICO.shield, key: 'Warranty', items: [
      ['#/w/stickers', 'Warranty Sticker Entry', HO],
      ['#/w/serials', 'Serial / Sticker Register', HO],
      ['#/w/register', 'Register Warranty', ['SUPER', 'HO', 'DEALER', 'CUSTOMER']],
      ['#/w/active', 'Active Warranty List', ['SUPER', 'HO', 'DEALER', 'CUSTOMER', 'MANAGER']],
      ['#/w/replace', 'Replacement Flow (In Warranty)', ['SUPER', 'HO', 'DEALER']],
      ['#/w/search', 'Serial No. Search Report', ALL],
      ['#/w/dealers', 'Dealer Approval & Master', HO],
      ['#/w/customers', 'Customers', ['SUPER', 'HO', 'DEALER', 'MANAGER']],
      ['#/w/geo', 'Geo-Graphical Report', HO]
    ]
  },
  {
    g: 'Service', ico: ICO.wrench, key: 'Service', items: [
      ['#/s/dashboard', 'Service Dashboard', STAFF],
      ['#/s/calls', 'Service Calls', ALL],
      ['#/s/reminders', 'Call Reminders', STAFF],
      ['#/s/visits', 'Visit Reports', ['SUPER', 'HO', 'MANAGER', 'ENGINEER']],
      ['#/s/jobcards', 'Job Cards (Estimate)', ['SUPER', 'HO', 'MANAGER', 'ENGINEER']],
      ['#/s/approvals', 'Job Card Approvals', STAFF],
      ['#/s/replacements', 'Replacement / Return Pump', STAFF],
      ['#/s/summary', 'Call Summary Report', STAFF],
      ['#/s/jcreport', 'Job Card Detail Report', STAFF],
      ['#/s/replreport', 'Replacement Report (CN effect)', STAFF],
      ['#/s/claims', 'Warranty Claim Summary', STAFF]
    ]
  },
  {
    g: 'Stock', ico: ICO.box, key: 'Stock', items: [
      ['#/k/stock', 'Stock Availability', ['SUPER', 'HO', 'MANAGER', 'ENGINEER']],
      ['#/k/engineer', 'Engineer-wise Stock', STAFF],
      ['#/k/txns', 'Stock Ledger & Entry', ['SUPER', 'HO', 'MANAGER']],
      ['#/k/consume', 'Parts Consumption', STAFF]
    ]
  },
  {
    g: 'Masters', ico: ICO.cog, key: 'Masters', items: [
      ['#/m/company', 'Company Profile', HO],
      ['#/m/models', 'Product Models', HO],
      ['#/m/spares', 'Spares & Rates', HO],
      ['#/m/labour', 'Labour / Service Charges', HO],
      ['#/m/faults', 'Fault Master', HO],
      ['#/m/calltypes', 'Call Types & Valid Days', HO],
      ['#/m/projects', 'Projects / Schemes', HO],
      ['#/m/centers', 'Service Centers', HO],
      ['#/m/engineers', 'Engineers', HO],
      ['#/m/users', 'Users & Rights', HO],
      ['#/m/rules', 'Approval Rules', HO],
      ['#/m/states', 'States & Districts', HO]
    ]
  },
  {
    g: 'Guide & System', ico: ICO.flow, key: 'Guide', items: [
      ['#/flow', 'End-to-End Flow', ['SUPER', 'HO', 'MANAGER']],
      ['#/db', 'Database Schema', ['SUPER', 'HO']],
      ['#/sys/import', 'Import Center (Excel)', HO],
      ['#/sys/notifications', 'WhatsApp / SMS Log', ['SUPER', 'HO', 'MANAGER']],
      ['#/sys/activity', 'Activity Log', HO]
    ]
  }
];

function navVisible(item, grp) {
  var u = APP.user; if (!u) return false;
  if (item[2].indexOf(u.role) < 0) return false;
  if (u.role === 'HO' && u.kind === 'HO') {
    var r = String(u.rec.form_rights || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    if (r.length && grp.key !== 'Dash' && grp.key !== 'Guide' && r.indexOf(grp.key) < 0) return false;
  }
  return true;
}
/* can the signed-in user open this hash? (dashboard tiles / alerts only link to pages the user can reach) */
function canGo(hash) {
  var path = String(hash || '').split('?')[0], found = null;
  NAV.forEach(function (g) { g.items.forEach(function (i) { if (i[0] === path) found = { i: i, g: g }; }); });
  return found ? navVisible(found.i, found.g) : true;
}
function labelFor(item) {
  var r = ROLE();
  if (item[0] === '#/s/calls' && (r === 'DEALER' || r === 'CUSTOMER')) return r === 'CUSTOMER' ? 'My Service Calls' : 'Book / Track Service Calls';
  if (item[0] === '#/w/active' && r === 'CUSTOMER') return 'My Warranty';
  if (item[0] === '#/w/register' && r === 'CUSTOMER') return 'Register Product (Scan QR)';
  if (item[0] === '#/dashboard' && r === 'CUSTOMER') return 'My Products';
  if (item[0] === '#/k/stock' && r === 'ENGINEER') return 'My Stock';
  return item[1];
}

/* ---------------- LOGIN ---------------- */
var LOGIN = { tab: 'ho', otp: null, otpMobile: '' };

function showLogin() {
  var l = $('#login');
  $('#shell').style.display = 'none';
  l.style.display = 'flex';
  var c = CO();
  l.innerHTML =
    '<div class="lhs"><div class="lbrand">' +
    '<div class="lplate"><img class="llogo" src="solartive-logo.png" alt="' + esc(c.company_name) + '"></div>' +
    '<div class="lname">Warranty <b>&amp; Service</b></div>' +
    '<div class="by">Solar Submersible Pump · Motor · Controller</div></div>' +
    '<div class="ltag">One QR sticker. <b>Warranty</b> registered in seconds, <b>service</b> tracked to closure.</div>' +
    '<div class="lfeat"><div>Excel sticker import &amp; QR warranty cards</div><div>Dealer, customer &amp; HO portals</div>' +
    '<div>Pump / Motor / Controller — own warranty each</div><div>Complaint → visit → job card → approval</div>' +
    '<div>Replacement with balance warranty</div><div>Engineer-wise spares stock</div></div>' +
    '<div class="lfoot">Powered by <b style="color:#fff">Delta iERP</b> · ' + APP.vendor + ' · v' + APP.ver + '<div style="margin-top:7px;display:flex;gap:12px"><a href="../Demo-Runbook.html" target="_blank" rel="noopener" style="color:var(--cyan);text-decoration:none;font-weight:600">Demo Runbook (Script) →</a><a href="../START%20HERE.html" target="_blank" rel="noopener" style="color:#B9D3DA;text-decoration:none">System Overview</a></div></div></div>' +
    '<div class="rhs"><div class="ltabs">' +
    '<button data-t="ho" class="on">HO / Service</button><button data-t="dealer">Dealer</button><button data-t="cust">Customer</button></div>' +
    '<div id="loginForm"></div></div>';
  $$('.ltabs button', l).forEach(function (b) { b.addEventListener('click', function () { LOGIN.tab = this.dataset.t; LOGIN.otp = null; paintLogin(); }); });
  paintLogin();
}

function paintLogin() {
  $$('.ltabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.t === LOGIN.tab); });
  var f = $('#loginForm'), h = '';
  if (LOGIN.tab === 'ho') {
    var chips = [];
    ['SUPER', 'HO', 'MANAGER', 'ENGINEER'].forEach(function (r) {
      var u = DB.find('app_user', function (x) { return x.role === r && x.is_active == 1 && (r !== 'HO' || x.state_rights); }) || DB.find('app_user', function (x) { return x.role === r && x.is_active == 1; });
      if (u) chips.push('<span class="chip" data-u="' + esc(u.username) + '" data-p="' + esc(u.password) + '">' + ({ SUPER: 'Super Admin', HO: 'HO User (UP rights)', MANAGER: 'Service Manager', ENGINEER: 'Service Engineer' })[r] + '</span>');
    });
    h = '<h2>Sign in</h2><div class="sub">Head office, service managers and engineers</div>' +
      '<label>User name</label><input id="lgU" type="text" value="admin" autocomplete="off">' +
      '<label>Password</label><input id="lgP" type="password" value="delta@2026">' +
      '<button class="btn-login" id="lgGo">Sign in</button>' +
      '<div class="lquick"><b>Quick demo logins</b>' + chips.join('') + '</div>';
  } else if (LOGIN.tab === 'dealer') {
    var d = DB.find('dealer', function (x) { return x.status === 'Approved'; });
    h = '<h2>Dealer login</h2><div class="sub">Dealer code and password issued on approval</div>' +
      '<label>Dealer code</label><input id="lgU" type="text" value="' + esc(d ? d.dealer_code : '') + '" autocomplete="off">' +
      '<label>Password</label><input id="lgP" type="password" value="' + esc(d ? d.password : '') + '">' +
      '<button class="btn-login" id="lgGo">Login</button>' +
      '<div class="llinks"><a href="javascript:void(0)" onclick="forgotDealer()">Forgot password?</a><a href="javascript:void(0)" onclick="dealerSignup()">New dealer? Sign up</a></div>' +
      '<div class="lquick"><b>Demo</b><span class="chip" data-u="' + esc(d ? d.dealer_code : '') + '" data-p="' + esc(d ? d.password : '') + '">Approved dealer ' + esc(d ? d.dealer_code : '') + '</span></div>';
  } else {
    var c0 = DB.all('customer')[0];
    h = '<h2>Customer login</h2><div class="sub">Sign in with your registered mobile number</div>' +
      '<label>Mobile number</label><input id="lgU" type="tel" maxlength="10" value="' + esc(LOGIN.otpMobile || (c0 ? c0.mobile : '')) + '" autocomplete="off">' +
      (LOGIN.otp ? '<label>OTP</label><input id="lgP" type="text" maxlength="4" placeholder="4-digit OTP" autocomplete="off"><div class="hint">An OTP was sent by SMS (shown on screen for the demo).</div>' +
        '<button class="btn-login" id="lgGo">Verify OTP &amp; login</button><div class="llinks"><a href="javascript:void(0)" id="lgResend">Resend OTP</a></div>'
        : '<button class="btn-login" id="lgGo">Send OTP</button>') +
      '<div class="llinks"><a href="javascript:void(0)" onclick="openRegistration({pub:true})">Scan QR &amp; register a new product</a></div>';
  }
  f.innerHTML = h;
  $$('.chip', f).forEach(function (c) { c.addEventListener('click', function () { $('#lgU').value = this.dataset.u; $('#lgP').value = this.dataset.p; doLogin(); }); });
  $('#lgGo').addEventListener('click', doLogin);
  var rs = $('#lgResend'); if (rs) rs.addEventListener('click', function () { LOGIN.otp = null; doLogin(); });
  $$('#loginForm input').forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); }); });
}

function doLogin() {
  var u = ($('#lgU').value || '').trim(), p = ($('#lgP') ? $('#lgP').value : '');
  if (LOGIN.tab === 'ho') {
    var r = DB.find('app_user', function (x) { return x.username.toLowerCase() === u.toLowerCase() && x.password === p; });
    if (!r) return toast('Wrong user name or password', 'err');
    if (r.is_active != 1) return toast('This user is inactive', 'err');
    DB.upd('app_user', r.user_id, { last_login: nowIso() }, true);
    enterApp({ kind: 'HO', id: r.user_id, name: (r.first_name + ' ' + (r.last_name || '')).trim(), role: r.role, rec: r });
  } else if (LOGIN.tab === 'dealer') {
    var d = DB.find('dealer', function (x) { return (String(x.dealer_code) === u || x.mobile === u) && x.password === p; });
    if (!d) return toast('Wrong dealer code or password', 'err');
    if (d.status === 'Pending') return toast('Your signup is awaiting approval by the head office', 'err');
    if (d.status !== 'Approved') return toast('This dealer account is ' + d.status.toLowerCase() + '. Please contact the company.', 'err');
    enterApp({ kind: 'DEALER', id: d.dealer_id, name: d.firm_name, role: 'DEALER', rec: d });
  } else {
    if (!/^\d{10}$/.test(u)) return toast('Enter a 10-digit mobile number', 'err');
    var c = DB.find('customer', function (x) { return x.mobile === u; });
    if (!LOGIN.otp) {
      if (!c) return toast('This mobile number is not registered yet. Use "Scan QR & register a new product" to create your account.', 'err');
      LOGIN.otp = String(1000 + Math.floor(Math.random() * 9000)); LOGIN.otpMobile = u;
      paintLogin();
      notify({ channel: 'SMS', to: u, tpl: 'OTP', msg: MSG.otp(LOGIN.otp), refType: 'login', refNo: u });
      return;
    }
    if (p !== LOGIN.otp) return toast('Incorrect OTP', 'err');
    DB.upd('customer', c.customer_id, { last_login: nowIso() }, true);
    LOGIN.otp = null;
    enterApp({ kind: 'CUSTOMER', id: c.customer_id, name: c.customer_name, role: 'CUSTOMER', rec: c });
  }
}

function enterApp(user, restore) {
  APP.user = user; APP.login = new Date();
  try { sessionStorage.setItem('dws.session', JSON.stringify({ kind: user.kind, id: user.id })); } catch (e) { }
  if (!restore) { DB.log('Login', 'app', user.name, user.role); DB.save(); }
  $('#login').style.display = 'none';
  $('#shell').style.display = 'flex';
  buildTopbar(); buildSide();
  if (!restore || !location.hash || location.hash === '#') location.hash = '#/dashboard'; else route();
  if (!restore) route();
  SYNC.paint();
}

function logout() {
  try { sessionStorage.removeItem('dws.session'); } catch (e) { }
  location.hash = ''; location.reload();
}

function restoreSession() {
  var s = null; try { s = JSON.parse(sessionStorage.getItem('dws.session') || 'null'); } catch (e) { }
  if (!s) return false;
  var u = null;
  if (s.kind === 'HO') { var r = DB.get('app_user', s.id); if (r && r.is_active == 1) u = { kind: 'HO', id: r.user_id, name: (r.first_name + ' ' + (r.last_name || '')).trim(), role: r.role, rec: r }; }
  else if (s.kind === 'DEALER') { var d = DB.get('dealer', s.id); if (d && d.status === 'Approved') u = { kind: 'DEALER', id: d.dealer_id, name: d.firm_name, role: 'DEALER', rec: d }; }
  else if (s.kind === 'CUSTOMER') { var c = DB.get('customer', s.id); if (c) u = { kind: 'CUSTOMER', id: c.customer_id, name: c.customer_name, role: 'CUSTOMER', rec: c }; }
  if (!u) return false;
  enterApp(u, true); return true;
}

/* ---- dealer sign-up (public) / forgot password / change password ---- */
function dealerFields() {
  return [
    { k: 'firm_name', l: 'Firm / dealer name', req: 1, full: 1 },
    { k: 'contact_person', l: 'Contact person', req: 1 },
    { k: 'mobile', l: 'Mobile', type: 'tel', req: 1, pattern: /^[6-9]\d{9}$/, patMsg: 'Enter a valid 10-digit mobile number' },
    { k: 'email', l: 'Email', type: 'email' },
    { k: 'gstin', l: 'GSTIN', hint: 'Optional' },
    { k: 'address', l: 'Address', type: 'area', full: 1, req: 1 },
    { k: 'state_code', l: 'State', type: 'select', req: 1, opts: stateOpts },
    { k: 'district', l: 'District', req: 1, suggest: { dep: 'state_code', fn: districtList } },
    { k: 'city', l: 'City / town' },
    { k: 'pincode', l: 'Pincode', pattern: /^\d{6}$/, patMsg: 'Pincode must be 6 digits' },
    { k: 'password', l: 'Choose a password', type: 'pwd', req: 1 }
  ];
}
function dealerSignup() {
  var F = dealerFields();
  window._form = { fields: F };
  modal('Dealer sign-up', '<div class="note">Fill in your firm details. The head office will review and approve your sign-up; you will then receive your dealer code and password on WhatsApp.</div>' + formHtml(F, { state_code: '09' }, 'ff_'),
    '<button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" onclick="dealerSignupSave()">Sign up</button>', 'sticky');
  wireSuggest(F, 'ff_');
}
function dealerSignupSave() {
  var F = window._form, r = collectForm(F.fields, 'ff_');
  if (r.err) return toast(r.err, 'err');
  var v = r.v;
  if (DB.find('dealer', function (d) { return d.mobile === v.mobile; })) return toast('A dealer with this mobile number is already registered', 'err');
  v.status = 'Pending'; v.signup_on = nowIso(); v.dealer_code = null; v.warranty_months = null;
  var d = DB.add('dealer', v);
  notify({ channel: 'WhatsApp', to: v.mobile, tpl: 'DEALER_SIGNUP', msg: MSG.dealerSignup(d), refType: 'dealer', refNo: d.firm_name });
  DB.save(); closeModal();
  toast('Sign-up received — awaiting approval', 'ok');
}
function forgotDealer() {
  modal('Forgot password', '<div class="frm"><div class="f full"><label>Dealer code or registered mobile</label><input id="fpU" type="text" autocomplete="off"></div></div><div class="hint" style="margin-top:8px">The dealer code and password are sent to the registered mobile by SMS.</div>',
    '<button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" onclick="forgotSend()">Send SMS</button>', 'narrow sticky');
}
function forgotSend() {
  var u = $('#fpU').value.trim(), d = DB.find('dealer', function (x) { return String(x.dealer_code) === u || x.mobile === u; });
  if (!d || !d.dealer_code) return toast('No approved dealer found for this code / mobile', 'err');
  notify({ channel: 'SMS', to: d.mobile, tpl: 'FORGOT_PASSWORD', msg: MSG.forgot(d), refType: 'dealer', refNo: d.dealer_code });
  DB.save(); closeModal();
}
function changePassword() {
  modal('Change password', '<div class="frm"><div class="f full"><label>Current password</label><input id="cpO" type="password"></div>' +
    '<div class="f full"><label>New password</label><input id="cpN" type="password"></div><div class="f full"><label>Confirm new password</label><input id="cpC" type="password"></div></div>',
    '<button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" onclick="changePasswordSave()">Change password</button>', 'narrow sticky');
}
function changePasswordSave() {
  var u = APP.user, tbl = u.kind === 'DEALER' ? 'dealer' : 'app_user', rec = DB.get(tbl, u.id);
  if (!rec || u.kind === 'CUSTOMER') return;
  if ($('#cpO').value !== rec.password) return toast('Current password is wrong', 'err');
  if ($('#cpN').value.length < 3) return toast('New password is too short', 'err');
  if ($('#cpN').value !== $('#cpC').value) return toast('The two new passwords do not match', 'err');
  DB.upd(tbl, u.id, { password: $('#cpN').value }); DB.save(); closeModal(); toast('Password changed', 'ok');
}

/* ---------------- SHELL ---------------- */
function buildTopbar() {
  var t = $('#topbar'), u = APP.user;
  t.innerHTML =
    '<button class="burger" id="brg">' + ICO.menu + '</button>' +
    '<div class="tb-logo"><img src="logo-mark.png" alt="Delta" style="height:26px;width:auto"><div><div class="pq">Delta <b>iERP</b></div><div class="di">Warranty &amp; Service</div></div></div>' +
    '<div class="tb-client"><img src="solartive-logo-sm.png" alt="Client"></div>' +
    '<div class="gsearch">' + ICO.search + '<input type="text" id="gq" placeholder="Search serial no, complaint, customer, mobile, job card…" autocomplete="off"><div class="gres" id="gres"></div></div>' +
    '<div class="tb-sp"></div>' +
    '<button class="btn sm" id="btnSync">' + ICO.ref + ' <span id="syncTxt">Synced</span></button>' +
    '<button class="tb-ic" id="btnBell" title="WhatsApp / SMS messages sent">' + ICO.wa + '<span class="dot" id="notifDot">0</span></button>' +
    '<div class="tb-user" id="btnUser"><div class="av">' + esc(initials(u.name)) + '</div><div><div class="un">' + esc(shortName(u.name, 26)) + '</div><div class="ur">' + esc(roleLabel(u)) + '</div></div></div>';
  $('#brg').addEventListener('click', function () { document.body.classList.toggle('mini'); });
  $('#btnSync').addEventListener('click', function () { SYNC.pull(true); });
  $('#btnBell').addEventListener('click', function () { location.hash = '#/sys/notifications'; if (!isStaff()) toast('Messages are shown in the corner when they are sent'); });
  $('#btnUser').addEventListener('click', function (e) { e.stopPropagation(); var p = $('#popuser'); if (p) p.classList.toggle('show'); });
  $('#gq').addEventListener('input', gsearch); $('#gq').addEventListener('focus', gsearch);
  document.addEventListener('click', function () { var p = $('#popuser'); if (p) p.classList.remove('show'); var g = $('#gres'); if (g) g.style.display = 'none'; });
  buildUserPop(); refreshChrome();
}
function roleLabel(u) {
  return ({ SUPER: 'Super Admin', HO: 'HO User', MANAGER: 'Service Manager', ENGINEER: 'Service Engineer', DEALER: 'Dealer ' + (u.rec.dealer_code || ''), CUSTOMER: 'Customer' })[u.role] || u.role;
}
function buildUserPop() {
  var old = $('#popuser'); if (old) old.remove();
  var u = APP.user, p = el('div', { class: 'pop', id: 'popuser' }), rec = u.rec;
  var st = (u.kind === 'HO' && u.role !== 'SUPER' && rec.state_rights) ? rec.state_rights.split(',').map(stateName).join(', ') : 'All states';
  p.innerHTML = '<h4>' + esc(u.name) + ' <span>' + esc(roleLabel(u)) + '</span></h4>' +
    '<div style="padding:11px 14px;border-bottom:1px solid var(--line2);font-size:11.5px;color:var(--ink3)">' +
    '<div>Company: <b style="color:var(--ink)">' + esc(shortName(CO().company_name, 34)) + '</b></div>' +
    (u.kind === 'HO' ? '<div>Data rights: <b style="color:var(--ink)">' + esc(st) + '</b></div>' : '') +
    '<div style="margin-top:5px">Signed in: <b style="color:var(--ink)">' + esc(APP.login.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })) + '</b></div></div>' +
    (u.kind !== 'CUSTOMER' ? '<div class="mi" onclick="changePassword()">' + ICO.user + ' Change password</div>' : '') +
    (isHO() ? '<div class="mi" onclick="backupData()">' + ICO.dl + ' Download data backup (.json)</div><div class="mi" onclick="restoreData()">' + ICO.imp + ' Restore data from backup</div>' : '') +
    (ROLE() === 'SUPER' ? '<div class="mi" style="color:var(--dang)" onclick="resetDemo()">' + ICO.ref + ' Reset demo data</div>' : '') +
    '<div class="mi" style="color:var(--dang)" onclick="logout()">Sign out</div>';
  document.body.appendChild(p);
}
function backupData() { dl(JSON.stringify(DB.d), 'warranty-service-backup-' + today() + '.json', 'application/json'); toast('Backup downloaded', 'ok'); }
function restoreData() {
  var i = el('input', { type: 'file', accept: '.json' });
  i.addEventListener('change', function () {
    var f = this.files[0]; if (!f) return; var r = new FileReader();
    r.onload = function () {
      try { var o = JSON.parse(r.result); if (!o.t || !o.seq) throw new Error('not a backup file'); DB.adopt(o); DB.save(); route(true); toast('Data restored from backup', 'ok'); }
      catch (e) { toast('Could not read that backup — ' + e.message, 'err'); }
    };
    r.readAsText(f);
  });
  i.click();
}
function resetDemo() {
  confirmDo('Reset demo data?', 'This discards everything entered in this demo (registrations, calls, job cards, imports) and restores the original sample data. This cannot be undone.', 'Reset everything', function () {
    DB.reset(); toast('Demo data restored', 'ok'); location.hash = '#/dashboard'; route();
  }, true);
}

function refreshChrome() {
  var d = $('#notifDot');
  if (d) { var n = DB.all('notification_log').length; d.textContent = n > 99 ? '99+' : n; }
}

function buildSide() {
  var s = $('#side'), h = '';
  NAV.forEach(function (grp, gi) {
    var items = grp.items.filter(function (it) { return navVisible(it, grp); });
    if (!items.length) return;
    if (grp.items.length === 1) {
      h += '<div class="sitem" data-go="' + items[0][0] + '">' + grp.ico + '<span class="stxt">' + esc(labelFor(items[0])) + '</span></div>';
      return;
    }
    h += '<div class="sitem" data-grp="' + gi + '">' + grp.ico + '<span class="stxt">' + esc(grp.g) + '</span><span class="cnt">' + items.length + '</span>' + ICO.chev + '</div><div class="sub" id="sub' + gi + '">' +
      items.map(function (it) { return '<div class="si" data-go="' + it[0] + '">' + esc(labelFor(it)) + '</div>'; }).join('') + '</div>';
  });
  h += '<div class="side-ft"><b>Delta iERP · Warranty &amp; Service</b>' + esc(shortName(CO().company_name, 30)) + '<br>' + APP.vendor + ' · Build ' + APP.build + '</div>';
  s.innerHTML = h;
  $$('[data-go]', s).forEach(function (n) { n.addEventListener('click', function () { location.hash = this.dataset.go; }); });
  $$('[data-grp]', s).forEach(function (n) {
    n.addEventListener('click', function () {
      var sub = $('#sub' + this.dataset.grp), open = sub.classList.contains('open');
      sub.classList.toggle('open', !open); this.classList.toggle('open', !open);
    });
  });
}
function markNav() {
  var h = (location.hash.split('?')[0] || '#/dashboard'), best = null;
  $$('#side [data-go]').forEach(function (n) {
    var g = n.dataset.go; n.classList.remove('on');
    if (h === g || h.indexOf(g + '/') === 0) { if (!best || g.length > best.dataset.go.length) best = n; }
  });
  if (best) {
    best.classList.add('on');
    var sub = best.closest('.sub');
    if (sub) { sub.classList.add('open'); var gi = sub.id.replace('sub', ''); var hd = $('[data-grp="' + gi + '"]'); if (hd) hd.classList.add('open'); }
  }
}

/* ---------------- ROUTER ---------------- */
function parseHash() {
  var raw = (location.hash || '#/dashboard').replace(/^#\/?/, ''), q = {}, parts = raw.split('?');
  if (parts[1]) parts[1].split('&').forEach(function (kv) { var p = kv.split('='); q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); });
  return { path: parts[0].replace(/\/$/, '') || 'dashboard', q: q };
}
function route(keep) {
  if (!APP.user) return;
  var main = $('#main'), sc = keep ? main.scrollTop : 0, h = parseHash(), best = null;
  Object.keys(ROUTES).forEach(function (k) { if (h.path === k || h.path.indexOf(k + '/') === 0) { if (!best || k.length > best.length) best = k; } });
  var fn = best ? ROUTES[best] : null;
  if (!fn) { main.innerHTML = '<div class="wrap"><div class="empty">' + ICO.empty + '<div>Page not found</div></div></div>'; return; }
  /* menu rights */
  var denied = false;
  NAV.forEach(function (g) { g.items.forEach(function (it) { if (it[0] === '#/' + best && !navVisible(it, g)) denied = true; }); });
  if (denied) { toast('You do not have access to that screen', 'err'); location.hash = '#/dashboard'; return; }
  var args = h.path.length > best.length ? h.path.slice(best.length + 1).split('/') : [];
  var p;
  try { p = fn(args, h.q); }
  catch (e) { console.error(e); main.innerHTML = '<div class="wrap"><div class="note w"><b>Something went wrong drawing this screen.</b><br>' + esc(e.message) + '</div></div>'; return; }
  main.innerHTML = renderPage(p);
  if (p.after) { try { p.after(); } catch (e) { console.error(e); toast('Screen error: ' + e.message, 'err'); } }
  main.scrollTop = sc;
  if (window.innerWidth < 900) document.body.classList.add('mini');   /* phones: the menu is an icon rail, the burger opens it over the page */
  markNav(); refreshChrome();
}
function renderPage(p) {
  var crumb = p.crumb || '';
  return '<div class="phead">' + (crumb ? '<div class="crumb">' + crumb + '</div>' : '') +
    '<div class="ptitle"><div><h1>' + (p.title || '') + '</h1>' + (p.sub ? '<p>' + p.sub + '</p>' : '') + '</div><div class="pacts">' + (p.actions || '') + '</div></div>' +
    (p.tabs || '') + '</div><div class="wrap">' + (p.body || '') + '</div>';
}
function goBack(def) { if (history.length > 1) history.back(); else location.hash = def || '#/dashboard'; }

/* ---------------- GLOBAL SEARCH ---------------- */
function gsearch() {
  var q = $('#gq').value.toLowerCase().trim(), box = $('#gres');
  if (q.length < 2) { box.style.display = 'none'; return; }
  var out = [];
  function grp(title, rows) { if (!rows.length) return; out.push('<div class="gr-h">' + title + '</div>'); rows.slice(0, 5).forEach(function (r) { out.push(r); }); }
  var wOk = {}; Q.warranty().forEach(function (w) { wOk[w.serial_no] = 1; });
  grp('Serial numbers', DB.all('sticker').filter(function (s) { return String(s.serial_no).toLowerCase().indexOf(q) >= 0 && (isHO() || wOk[s.serial_no]); })
    .map(function (s) { return '<div class="gr-i" data-go="#/w/search?sn=' + encodeURIComponent(s.serial_no) + '"><b>' + esc(s.serial_no) + '</b><span>' + esc(catLabel(s.category)) + ' · ' + esc(modelName(s.model_id)) + ' · ' + esc(s.status) + '</span></div>'; }));
  grp('Service calls', Q.complaints().filter(function (c) { return (c.complaint_no + ' ' + c.customer_name + ' ' + c.mobile).toLowerCase().indexOf(q) >= 0; })
    .map(function (c) { return '<div class="gr-i" data-go="#/s/call/' + c.complaint_id + '"><b>' + esc(c.complaint_no) + '</b><span>' + esc(c.customer_name) + ' · ' + esc(c.status) + '</span></div>'; }));
  grp('Customers', Q.customers().filter(function (c) { return (c.customer_name + ' ' + c.mobile).toLowerCase().indexOf(q) >= 0; })
    .map(function (c) { return '<div class="gr-i" data-go="#/w/customers/' + c.customer_id + '"><b>' + esc(c.customer_name) + '</b><span>' + esc(c.mobile) + ' · ' + esc(c.district || '') + '</span></div>'; }));
  if (isStaff()) {
    grp('Job cards', Q.jobcards().filter(function (j) { return j.jobcard_no.toLowerCase().indexOf(q) >= 0; })
      .map(function (j) { return '<div class="gr-i" data-go="#/s/jobcard/' + j.jobcard_id + '"><b>' + esc(j.jobcard_no) + '</b><span>₹ ' + inr(j.grand_total) + ' · ' + esc(j.status) + '</span></div>'; }));
    grp('Dealers', Q.dealers().filter(function (d) { return (d.firm_name + ' ' + (d.dealer_code || '') + ' ' + d.mobile).toLowerCase().indexOf(q) >= 0; })
      .map(function (d) { return '<div class="gr-i" data-go="#/w/dealers"><b>' + esc(d.firm_name) + '</b><span>' + esc(d.dealer_code || 'pending') + ' · ' + esc(d.district || '') + '</span></div>'; }));
  }
  box.innerHTML = out.length ? out.join('') : '<div class="gr-i"><span>No matches</span></div>';
  box.style.display = 'block';
  $$('.gr-i[data-go]', box).forEach(function (n) { n.addEventListener('click', function (e) { e.stopPropagation(); location.hash = this.dataset.go; box.style.display = 'none'; $('#gq').value = ''; }); });
}

/* ---------------- BOOT ---------------- */
function initApp() {
  DB.init();
  SYNC.boot();
  var fav = $('#bootmark'); if (fav) fav.src = 'logo-mark.png';
  window.addEventListener('hashchange', function () { route(); });
  var go = function () {
    if (!restoreSession()) {
      showLogin();
      /* a farmer scanning the sticker QR lands here without signing in: open the registration form directly */
      var ph = parseHash();
      if (ph.path === 'reg') setTimeout(function () { if (!APP.user) openRegistration({ pub: true, sn: ph.q.sn }); }, 300);
    }
    var l = $('#loginForm'); if (l && $('#login').style.display !== 'none') paintLogin();
  };
  /* wait for the data folder decision only briefly so the login screen is quick */
  var started = false;
  var start = function () { if (started) return; started = true; go(); };
  SYNC.whenReady(start);
  setTimeout(start, 900);
  SYNC.whenReady(function () { if (!APP.user && $('#loginForm')) paintLogin(); });
}
