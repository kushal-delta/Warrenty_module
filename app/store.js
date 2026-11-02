/* ============================================================
   Delta iERP Warranty & Service  -  data layer
   Every table in schema.js is held as a JSON array here. DB.save() writes
   the whole set to the browser and (when started with the launcher) to
   data\warranty-service-data.json in the project folder.
   ============================================================ */
'use strict';

var DB = {
  KEY: 'delta.warranty.solartive.v1',
  d: null,

  init: function () {
    var o = null;
    try { var raw = localStorage.getItem(this.KEY); o = raw ? JSON.parse(raw) : null; } catch (e) { o = null; }
    return this.adopt(o);
  },
  /** take a data set from anywhere (browser, data folder, backup) and make it live */
  adopt: function (o) {
    if (o && o.t && o.seq) this.d = o;
    else this.d = SEED.build();
    var self = this;
    SCHEMA.tables.forEach(function (t) {
      if (!self.d.t[t.name]) self.d.t[t.name] = [];
      if (self.d.seq[t.name] == null) self.d.seq[t.name] = 0;
    });
    return this.d;
  },
  save: function () {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.d)); }
    catch (e) { toast('Browser storage is full or blocked — ' + e.message, 'err'); }
    if (window.SYNC) SYNC.push();
  },
  reset: function () {
    this.d = SEED.build();
    this.save();
  },

  all: function (t) { return this.d.t[t] || []; },
  pk: function (t) { return SCHEMA.by[t].pk; },
  get: function (t, id) {
    if (id == null || id === '') return null;
    var pk = this.pk(t), a = this.all(t);
    for (var i = 0; i < a.length; i++) if (a[i][pk] == id) return a[i];
    return null;
  },
  find: function (t, pred) {
    var a = this.all(t);
    for (var i = 0; i < a.length; i++) if (pred(a[i])) return a[i];
    return null;
  },
  where: function (t, pred) { return this.all(t).filter(pred); },
  /** insert; assigns the primary key and the created_on stamp */
  add: function (t, row, noLog) {
    var pk = this.pk(t);
    row[pk] = ++this.d.seq[t];
    var cols = SCHEMA.by[t].cols;
    for (var i = 0; i < cols.length; i++) {
      var c = cols[i];
      if (c.n === 'created_on' && !row.created_on) row.created_on = nowIso();
      /* columns declared NOT NULL with a default get that default, exactly as the SQL table would */
      if (c.req && c.def != null && c.def !== '' && row[c.n] === undefined) row[c.n] = /^-?\d+(\.\d+)?$/.test(c.def) ? +c.def : c.def;
    }
    this.d.t[t].push(row);
    if (!noLog && t !== 'activity_log' && t !== 'notification_log') this.log('Created', t, this.refOf(t, row), '');
    return row;
  },
  upd: function (t, id, patch, noLog) {
    var row = this.get(t, id); if (!row) return null;
    var ch = [];
    for (var k in patch) if (patch.hasOwnProperty(k) && row[k] !== patch[k]) { row[k] = patch[k]; ch.push(k); }
    if (ch.length && !noLog) this.log('Modified', t, this.refOf(t, row), ch.join(', '));
    return row;
  },
  del: function (t, id, noLog) {
    var pk = this.pk(t), a = this.all(t);
    for (var i = 0; i < a.length; i++) if (a[i][pk] == id) {
      var r = a[i];
      a.splice(i, 1);
      if (!noLog) this.log('Deleted', t, this.refOf(t, r), '');
      return r;
    }
    return null;
  },
  /** human reference for the audit log */
  refOf: function (t, r) {
    var keys = ['complaint_no', 'jobcard_no', 'warranty_no', 'install_no', 'repl_no', 'batch_no', 'serial_no', 'visit_no',
      'dealer_code', 'model_code', 'spare_code', 'labour_code', 'username', 'sc_name', 'firm_name', 'customer_name', 'project_no', 'call_type', 'fault_name', 'state_name', 'district_name', 'company_name'];
    for (var i = 0; i < keys.length; i++) if (r[keys[i]]) return String(r[keys[i]]);
    return '#' + r[SCHEMA.by[t].pk];
  },
  log: function (action, table, ref, detail) {
    var u = (window.APP && APP.user) ? APP.user.name : 'System';
    var a = this.d.t.activity_log;
    a.push({ log_id: ++this.d.seq.activity_log, log_on: nowIso(), user_name: u, action: action, table_name: table, ref: ref || '', detail: detail || '' });
    if (a.length > 1500) a.splice(0, a.length - 1500);
  },

  /**
   * Next document number.  fmt tokens: {n} or {n:4} (zero padded), {fy} (26-27)
   * e.g. nextNo('COMPLAINT','SC/{fy}/{n:4}')  ->  SC/26-27/0001
   */
  peekNo: function (key, fmt) {
    var fy = fyOf(), row = this.find('doc_sequence', function (r) { return r.seq_key === key && r.fy === fy; }), n = (row ? row.last_no : 0) + 1;
    return fmt.replace(/\{n(?::(\d+))?\}/, function (m, w) { return w ? String(n).padStart(+w, '0') : String(n); }).replace('{fy}', fy);
  },
  nextNo: function (key, fmt) {
    var fy = fyOf(), row = this.find('doc_sequence', function (r) { return r.seq_key === key && r.fy === fy; });
    if (!row) row = this.add('doc_sequence', { seq_key: key, prefix: fmt, fy: fy, last_no: 0 }, true);
    row.last_no++;
    return fmt.replace(/\{n(?::(\d+))?\}/, function (m, w) { return w ? String(row.last_no).padStart(+w, '0') : String(row.last_no); }).replace('{fy}', fy);
  }
};

/* the single company-profile row */
function CO() { return DB.all('company_profile')[0] || { company_name: 'Company' }; }

/* ----------------------------------------------------------------------------
   Folder sync - keeps the data in data\warranty-service-data.json so every
   browser on the machine sees the same copy. Falls back to this browser only
   when the app is opened by double-clicking index.html.
   ---------------------------------------------------------------------------- */
var SYNC = {
  URL: '/api/data', MODE: 'local', ready: false, saving: false, dirty: false, file: '', at: '', err: '',
  _waiters: [], _timer: null,

  boot: function () {
    var self = this;
    if (location.protocol === 'file:') {
      this._findService(function (port) {
        if (port) { location.replace('http://localhost:' + port + '/app/index.html' + location.search + location.hash); return; }
        self._settle('local', 'Opened directly from the folder');
      });
      return;
    }
    var done = false;
    var bail = setTimeout(function () { if (!done) { done = true; self._settle('local', 'The data service did not answer'); } }, 2500);
    fetch(this.URL, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        if (done) return; done = true; clearTimeout(bail);
        var has = j && j.data && j.data.t;
        var hadLocal = false;
        try { hadLocal = !!localStorage.getItem(DB.KEY); } catch (e) { }
        if (has && !hadLocal) {
          DB.adopt(j.data);
          try { localStorage.setItem(DB.KEY, JSON.stringify(DB.d)); } catch (e) { }
        }
        self.file = (j && j.file) || ''; self.at = (j && j.saved) || '';
        self._settle('folder', '');
        if (!has || hadLocal) self.push();           /* sync to server if local had prior work or server had no data */
      })
      .catch(function (e) { if (done) return; done = true; clearTimeout(bail); self._settle('local', e.message); });
  },
  _findService: function (done) {
    var lo = 8700, hi = 8720, left = hi - lo + 1, settled = false;
    function finish(p) { if (settled) return; settled = true; done(p); }
    var bail = setTimeout(function () { finish(0); }, 1800);
    function miss() { if (--left <= 0) { clearTimeout(bail); finish(0); } }
    for (var p = lo; p <= hi; p++) {
      (function (port) {
        fetch('http://localhost:' + port + '/api/ping', { mode: 'cors', cache: 'no-store' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) { if (j && j.app === 'delta-warranty') { clearTimeout(bail); finish(port); } else miss(); })
          .catch(miss);
      })(p);
    }
  },
  _settle: function (mode, err) {
    this.MODE = mode; this.err = mode === 'folder' ? '' : (err || ''); this.ready = true; this.paint();
    var w = this._waiters; this._waiters = []; w.forEach(function (fn) { try { fn(); } catch (e) { } });
  },
  whenReady: function (fn) { if (this.ready) fn(); else this._waiters.push(fn); },
  push: function () {
    if (this.MODE !== 'folder') return;
    var self = this; this.dirty = true; this.paint();
    clearTimeout(this._timer); this._timer = setTimeout(function () { self._post(); }, 350);
  },
  _post: function () {
    var self = this, body;
    try { body = JSON.stringify(DB.d); } catch (e) { toast('Could not prepare the data for saving — ' + e.message, 'err'); return; }
    this.saving = true; this.paint();
    fetch(this.URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { self.saving = false; self.dirty = false; self.err = ''; self.at = (j && j.saved) || ''; if (j && j.file) self.file = j.file; self.paint(); })
      .catch(function (e) { self.saving = false; self.err = e.message; self.paint(); toast('Could not write to the data store — ' + e.message + '. Your change is still held in this browser.', 'err'); });
  },
  pull: function (loud) {
    var self = this;
    var isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (this.MODE !== 'folder') {
      if (loud) toast(isLocal ? 'This browser is holding its own copy. Start the demo with "Start Warranty Service Demo.cmd" to keep one shared copy in the folder.' : 'Running in browser storage mode — changes are saved locally.', 'err');
      return;
    }
    if (this.dirty || this.saving) { clearTimeout(this._timer); this._post(); if (loud) toast('Saving your latest change first…'); return; }
    fetch(this.URL, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        if (j && j.data && j.data.t) { DB.adopt(j.data); try { localStorage.setItem(DB.KEY, JSON.stringify(DB.d)); } catch (e) { } }
        self.at = (j && j.saved) || ''; self.err = ''; self.paint();
        if (window.route) route(true);
        if (loud) toast('Reloaded demo data from server', 'ok');
      })
      .catch(function (e) { self.err = e.message; self.paint(); if (loud) toast('Could not read demo data — ' + e.message, 'err'); });
  },
  state: function () {
    var isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (this.MODE !== 'folder') {
      return {
        txt: 'Local only',
        tone: 'warn',
        tip: (isLocal ? 'This browser keeps its own copy of the demo data. Use "Start Warranty Service Demo.cmd" to keep it in the project folder instead.' : 'This browser keeps its own copy of the demo data (offline storage).') + (this.err ? '\n(' + this.err + ')' : '')
      };
    }
    if (this.saving || this.dirty) return { txt: 'Saving…', tone: '', tip: 'Writing to ' + (this.file || 'storage') };
    if (this.err) return { txt: 'Not saved', tone: 'dang', tip: 'The last write failed: ' + this.err };
    return {
      txt: 'Synced',
      tone: 'ok',
      tip: (isLocal ? 'Saved in the project folder' : 'Saved in cloud & browser storage') + (this.file ? ':\n' + this.file : '') + (this.at ? '\nLast written ' + this.at : '')
    };
  },
  paint: function () {
    var b = $('#btnSync'), t = $('#syncTxt');
    if (b && t) { var s = this.state(); t.textContent = s.txt; b.className = 'btn sm' + (s.tone ? ' sync-' + s.tone : ''); b.title = s.tip; }
    this.banner();
  },
  banner: function () {
    var bar = document.getElementById('syncBar');
    if (this.MODE === 'folder' || !document.getElementById('shell') || getComputedStyle(document.getElementById('shell')).display === 'none') { if (bar) bar.parentNode.removeChild(bar); return; }
    if (bar) return;
    var isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    bar = document.createElement('div'); bar.id = 'syncBar';
    bar.innerHTML = isLocal
      ? '<b>Local only —</b> this browser keeps its own copy of the data. For the demo, close this tab and start with <b>Start Warranty Service Demo.cmd</b> so entries are saved in the folder.<span class="x" title="Hide">&times;</span>'
      : '<b>Browser storage mode —</b> your entries are saved in this browser.<span class="x" title="Hide">&times;</span>';
    bar.querySelector('.x').onclick = function () { bar.style.display = 'none'; };
    document.body.appendChild(bar);
  }
};

/* ============================================================
   WhatsApp / SMS simulation - every automatic message is written to
   notification_log and shown as a phone-style card so the audience sees it.
   ============================================================ */
function notify(o) {
  var row = DB.add('notification_log', {
    channel: o.channel || 'WhatsApp', to_mobile: o.to || '', template: o.tpl || '', message: o.msg,
    ref_type: o.refType || '', ref_no: o.refNo || '', sent_on: nowIso(), status: 'Sent (demo)'
  }, true);
  showWa(row);
  return row;
}
function showWa(n) {
  var card = $('#waCard');
  if (!card) { card = el('div', { id: 'waCard', class: 'wa-card' }); document.body.appendChild(card); }
  var isSms = n.channel === 'SMS';
  card.innerHTML = '<div class="wa-h ' + (isSms ? 'sms' : '') + '"><span class="wa-ic">' + (isSms ? ICO.phone : ICO.wa) + '</span><div><b>' + esc(n.channel) + ' sent</b><span>to ' + esc(n.to_mobile || '—') + ' · just now</span></div>' +
    '<span class="wa-x" onclick="$(\'#waCard\').classList.remove(\'show\')">&times;</span></div>' +
    '<div class="wa-b"><div class="wa-bub">' + esc(n.message).replace(/\n/g, '<br>') + '<i>' + (isSms ? '' : '✓✓') + '</i></div></div>' +
    '<div class="wa-f" onclick="location.hash=\'#/sys/notifications\';$(\'#waCard\').classList.remove(\'show\')">Open message log →</div>';
  setTimeout(function () { card.classList.add('show'); }, 20);
  clearTimeout(card._h); card._h = setTimeout(function () { card.classList.remove('show'); }, 11000);
}

/* message templates - wording follows the Warranty Flow deck */
var MSG = {
  warrantyRegistered: function (cust, items, regDate) {
    var c = CO();
    return 'Warranty Registration Confirmation\nDear ' + cust.customer_name + ',\n\nThank you for registering your ' + items.map(function (i) { return i.name; }).join(' + ') +
      '. We are pleased to confirm that your warranty is now active.\n\n' + items.map(function (i) { return i.category + ': ' + i.name + '\nSerial No: ' + i.serial + '\nValid till: ' + dmy(i.end); }).join('\n\n') +
      '\n\nRegistration Date: ' + dmy(regDate) + '\nFor any support, call ' + (c.toll_free || 'customer care') + '.\n\nBest regards,\n' + c.company_name;
  },
  dealerSignup: function (d) {
    return 'Dealer Signup Confirmation\nHi ' + d.firm_name + ',\n\nYour signup has been successfully completed. We are currently reviewing your submission and awaiting approval.\nYou will receive a notification once your registration is fully approved.\n\nThank you for your patience!\n\nBest regards,\n' + CO().company_name;
  },
  dealerApproved: function (d) {
    var c = CO();
    return 'Dealer Approval\nDear ' + d.firm_name + ',\n\nCongratulations! Your warranty dealer signup has been successfully approved. You can now log in to your dealer account.\n\nLogin Details:\nUsername: ' + d.dealer_code + '\nPassword: ' + d.password + '\n\n' + (c.toll_free ? 'For any assistance, please reach out to us at ' + c.toll_free + '.\n\n' : '') + 'Thank you for partnering with us!\n\nBest regards,\n' + c.company_name;
  },
  dealerRejected: function (d, why) { return 'Dear ' + d.firm_name + ',\nWe are unable to approve your dealer signup at this time. ' + (why ? 'Reason: ' + why + '. ' : '') + 'Please contact the company for details.\n\n' + CO().company_name; },
  otp: function (otp) { return 'Your One Time Password for ' + CO().company_name + ' warranty portal is ' + otp + '. Do not share it with anyone. Valid for 10 minutes.'; },
  forgot: function (d) { return 'Dealer Code: ' + d.dealer_code + '\nPassword: ' + d.password + '\nPlease log in and change your password.\n- ' + CO().company_name; },
  complaintBooked: function (c) {
    return 'Service Call Registered\nDear ' + c.customer_name + ',\n\nYour service request ' + c.complaint_no + ' has been registered on ' + dmy(c.call_date) + '.\nOur team will contact you within ' + (c._sla || 3) + ' working days.\n\nBest regards,\n' + CO().company_name;
  },
  engineerAssigned: function (c, eng, sc) {
    return 'Service Call ' + c.complaint_no + ' assigned\nEngineer: ' + eng.first_name + ' ' + (eng.last_name || '') + (eng.phone ? ' (' + eng.phone + ')' : '') + '\nService center: ' + sc.sc_name + '\nExpected by: ' + dmy(c.due_date) + '\n\n' + CO().company_name;
  },
  jobcardApproved: function (c, j) { return 'Dear ' + c.customer_name + ', the repair estimate ' + j.jobcard_no + ' for service call ' + c.complaint_no + ' has been approved' + (j.customer_payable > 0 ? '. Chargeable amount: ₹ ' + inr(j.customer_payable, 2) : '. Covered under warranty — no charge') + '.\n\n' + CO().company_name; },
  resolved: function (c) { return 'Dear ' + c.customer_name + ', your service call ' + c.complaint_no + ' has been resolved on ' + dmy(c.closed_on) + '. Thank you for choosing ' + CO().company_name + '.'; },
  replacement: function (r, it) { return 'Replacement ' + r.repl_no + '\nSerial ' + it.old_serial_no + ' replaced with ' + it.new_serial_no + '. Balance warranty of ' + (it.warranty_days_left || 0) + ' days is carried to the new unit.\n\n' + CO().company_name; },
  expiry: function (cust, w, days) { return 'Dear ' + cust.customer_name + ', the warranty of serial ' + w.serial_no + ' ends on ' + dmy(w.end_date) + ' (' + days + ' days left).'; }
};

/* ============================================================
   Q  -  what the signed-in user is allowed to see
   HO users see data by state rights; dealers see their own sales; customers
   see their own pumps; engineers see their own calls; managers their center.
   ============================================================ */
var Q = {
  u: function () { return window.APP && APP.user; },
  states: function () {
    var u = Q.u(); if (!u || u.kind !== 'HO' || u.role === 'SUPER') return null;
    var s = String(u.rec.state_rights || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    return s.length ? s : null;
  },
  stateOk: function (code) { var s = Q.states(); return !s || (code && s.indexOf(code) >= 0); },
  install: function () {
    var u = Q.u(), a = DB.all('installation');
    if (!u) return a;
    if (u.kind === 'DEALER') return a.filter(function (r) { return r.dealer_id == u.id; });
    if (u.kind === 'CUSTOMER') return a.filter(function (r) { return r.customer_id == u.id; });
    var s = Q.states(); if (s) return a.filter(function (r) { return s.indexOf(r.state_code) >= 0; });
    return a;
  },
  warranty: function () {
    var ok = {}; Q.install().forEach(function (i) { ok[i.install_id] = 1; });
    return DB.all('warranty').filter(function (w) { return ok[w.install_id]; });
  },
  complaints: function () {
    var u = Q.u(), a = DB.all('complaint');
    if (!u) return a;
    if (u.kind === 'DEALER') return a.filter(function (r) { return r.dealer_id == u.id; });
    if (u.kind === 'CUSTOMER') return a.filter(function (r) { return r.customer_id == u.id; });
    if (u.role === 'ENGINEER') return a.filter(function (r) { return r.engineer_id == u.id; });
    if (u.role === 'MANAGER' && u.rec.sc_id) return a.filter(function (r) { return r.sc_id == u.rec.sc_id || !r.sc_id; });
    var s = Q.states(); if (s) return a.filter(function (r) { return s.indexOf(r.state_code) >= 0; });
    return a;
  },
  jobcards: function () {
    var ok = {}; Q.complaints().forEach(function (c) { ok[c.complaint_id] = 1; });
    var u = Q.u();
    return DB.all('jobcard').filter(function (j) {
      if (u && u.role === 'ENGINEER') return j.engineer_id == u.id;
      if (u && u.role === 'MANAGER' && u.rec.sc_id) return j.sc_id == u.rec.sc_id;
      return ok[j.complaint_id];
    });
  },
  visits: function () {
    var ok = {}; Q.complaints().forEach(function (c) { ok[c.complaint_id] = 1; });
    var u = Q.u();
    return DB.all('visit_report').filter(function (v) { return (u && u.role === 'ENGINEER') ? v.engineer_id == u.id : ok[v.complaint_id]; });
  },
  dealers: function () {
    var u = Q.u(), a = DB.all('dealer');
    if (u && u.kind === 'DEALER') return a.filter(function (r) { return r.dealer_id == u.id; });
    var s = Q.states(); if (s) return a.filter(function (r) { return s.indexOf(r.state_code) >= 0; });
    return a;
  },
  customers: function () {
    var u = Q.u(), a = DB.all('customer');
    if (u && u.kind === 'CUSTOMER') return a.filter(function (r) { return r.customer_id == u.id; });
    if (u && u.kind === 'DEALER') { var ids = {}; Q.install().forEach(function (i) { ids[i.customer_id] = 1; }); return a.filter(function (r) { return ids[r.customer_id]; }); }
    var s = Q.states(); if (s) return a.filter(function (r) { return s.indexOf(r.state_code) >= 0; });
    return a;
  },
  repl: function () {
    var u = Q.u(), a = DB.all('replacement');
    if (u && u.kind === 'DEALER') return a.filter(function (r) { return r.dealer_id == u.id; });
    return a;
  }
};

/* ---------- lookups used everywhere ---------- */
function stateName(code) { var s = DB.find('state_master', function (r) { return r.state_code === code; }); return s ? s.state_name : (code || ''); }
function stateShort(code) { var s = DB.find('state_master', function (r) { return r.state_code === code; }); return s ? s.short_name : (code || ''); }
function nameOf(table, id, f) { var r = DB.get(table, id); return r ? (typeof f === 'function' ? f(r) : r[f]) : ''; }
function userName(id) { var u = DB.get('app_user', id); return u ? (u.first_name + ' ' + (u.last_name || '')).trim() : ''; }
function modelName(id) { return nameOf('product_model', id, 'model_name'); }
function dealerName(id) { return nameOf('dealer', id, 'firm_name'); }
function custName(id) { return nameOf('customer', id, 'customer_name'); }
function scName(id) { return nameOf('service_center', id, 'sc_name'); }

/* ---------- warranty status ---------- */
function wStatus(w) {
  if (!w) return { k: 'none', txt: 'Not registered', cls: 'mut', days: 0 };
  if (w.status === 'Replaced') return { k: 'replaced', txt: 'Replaced', cls: 'pur', days: 0 };
  if (w.status === 'Void') return { k: 'void', txt: 'Void', cls: 'dang', days: 0 };
  var left = daysBetween(today(), w.end_date);
  if (left < 0) return { k: 'expired', txt: 'Expired', cls: 'dang', days: left };
  if (left <= 45) return { k: 'expiring', txt: 'Expiring', cls: 'warn', days: left };
  return { k: 'active', txt: 'Active', cls: 'ok', days: left };
}
function wByInstall(installId) { return DB.where('warranty', function (w) { return w.install_id == installId; }); }
function wBySerial(sn) { sn = String(sn || '').trim().toUpperCase(); return DB.find('warranty', function (w) { return String(w.serial_no).toUpperCase() === sn; }); }
function stickerBySerial(sn) { sn = String(sn || '').trim().toUpperCase(); return DB.find('sticker', function (s) { return String(s.serial_no).toUpperCase() === sn; }); }
function catLabel(c) { return c === 'PUMP' ? 'Pump' : c === 'MOTOR' ? 'Motor' : c === 'CONTROLLER' ? 'Controller' : (c === 'COMMON' ? 'Common' : c || ''); }
function catTag(c) { return '<span class="tag ' + (c === 'PUMP' ? 'info' : c === 'MOTOR' ? 'acc' : c === 'CONTROLLER' ? 'pur' : 'mut') + '">' + esc(catLabel(c)) + '</span>'; }
