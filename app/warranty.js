/* ============================================================
   Warranty module  -  stickers, serials, registration, active warranty,
   replacement flow, serial search, warranty card
   ============================================================ */
'use strict';

var CATS = ['PUMP', 'MOTOR', 'CONTROLLER'];
var CAT_OPTS = [{ v: 'PUMP', l: 'Pump' }, { v: 'MOTOR', l: 'Motor' }, { v: 'CONTROLLER', l: 'Controller' }];

/* base URL a sticker QR points to */
function regUrl(sn) { return location.href.split('#')[0] + '#/reg?sn=' + encodeURIComponent(sn); }
function modelOpts(cat) { return optsFrom('product_model', function (m) { return m.model_name + ' (' + catLabel(m.category) + ')'; }, function (m) { return (!cat || m.category === cat); }); }

/* open a clean window for printing a document (works with or without a login) */
function printDoc(html, title) {
  var w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups for this page to print', 'err'); return; }
  var base = location.href.split('#')[0].replace(/[^\/]*$/, '');
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title || 'Print') + '</title><base href="' + base + '">' +
    '<link rel="stylesheet" href="app.css"><link rel="stylesheet" href="extra.css"></head><body style="overflow:auto;background:#fff;display:block"><div class="printdoc">' + html + '</div>' +
    '<script>window.onload=function(){setTimeout(function(){window.print()},500)}<\/script></body></html>');
  w.document.close();
}

/* ============================================================
   SERIAL CHECK  - the authenticity / registration validation (deck slide "Validations")
   ============================================================ */
function serialCheck(sn) {
  sn = String(sn || '').trim();
  if (!sn) return { lvl: '', msg: '' };
  var st = stickerBySerial(sn);
  if (!st) return { lvl: 'err', code: 'NF', msg: 'Not authenticated — this serial number is not in the sticker register' };
  var m = DB.get('product_model', st.model_id), w = wBySerial(st.serial_no);
  if (st.status === 'Scrapped') return { lvl: 'err', code: 'SC', st: st, m: m, msg: 'This serial is marked as scrapped' };
  if (w) {
    var s = wStatus(w);
    return { lvl: 'err', code: 'REG', st: st, m: m, w: w, msg: 'Already registered on ' + dmy(w.registered_on) + ((APP.user && !((REG && REG.pub)) && Q.warranty().some(function (x) { return x.warranty_id === w.warranty_id; })) ? ' for ' + custName(w.customer_id) : '') + ' (' + s.txt.toLowerCase() + ')' };
  }
  return { lvl: 'ok', st: st, m: m, msg: 'Authentic · ' + catLabel(st.category) + ' · ' + (m ? m.model_name : '') };
}
function warrantyMonthsFor(m, dealerId) {
  var d = dealerId ? DB.get('dealer', dealerId) : null;
  return (d && d.warranty_months) ? d.warranty_months : (m ? m.warranty_months : 12);
}

/* ============================================================
   STICKER BATCHES  +  EXCEL IMPORT
   ============================================================ */
defEntity({
  key: 'sticker', table: 'sticker', title: 'Serial', plural: 'Serial / Sticker Register',
  sub: function (rows) { var un = rows.filter(function (s) { return s.status === 'Generated' || s.status === 'Printed'; }).length; return inr(rows.length) + ' serials · ' + inr(un) + ' not yet registered'; },
  fields: function (row) {
    return [
      { k: 'serial_no', l: 'Serial number', req: 1, unique: 1, ro: row && (row.status === 'Registered' || row.status === 'Replaced'), hint: 'Printed on the sticker and encoded in the QR' },
      { k: 'model_id', l: 'Model', type: 'select', req: 1, lk: 1, opts: modelOpts() },
      { k: 'batch_id', l: 'Sticker batch', type: 'select', lk: 1, opts: optsFrom('sticker_batch', 'batch_no') },
      { k: 'status', l: 'Status', type: 'select', req: 1, opts: ['Generated', 'Printed', 'Registered', 'Replaced', 'Scrapped'], ro: row && (row.status === 'Registered' || row.status === 'Replaced'), hint: 'Registered / Replaced are set by the warranty flow' },
      { k: 'supplier_name', l: 'Supplier / plant' }, { k: 'product_group', l: 'Product group' },
      { k: 'invoice_no', l: 'Dealer invoice no' }, { k: 'invoice_date', l: 'Dealer invoice date', type: 'date' },
      { k: 'invoice_location', l: 'Invoice location' }, { k: 'mfg_date', l: 'Manufacturing date', type: 'date' }
    ];
  },
  defaults: function () { return { status: 'Generated', supplier_name: 'Solartive Greater Noida Plant', product_group: 'Solar Submersible', mfg_date: today() }; },
  before: function (v, row) {
    var m = DB.get('product_model', v.model_id); v.category = m ? m.category : 'PUMP';
    if (row && wBySerial(row.serial_no) && v.model_id !== row.model_id) return 'This serial is already registered — its model cannot be changed';
    if (!row) { v.print_count = 0; }
    return null;
  },
  canDel: function (r) { return r.status !== 'Registered' && r.status !== 'Replaced'; },
  filters: [
    { label: 'Category', get: function (r) { return r.category; }, opts: CATS },
    { label: 'Status', get: function (r) { return r.status; }, opts: ['Generated', 'Printed', 'Registered', 'Replaced', 'Scrapped'] },
    { label: 'Model', get: function (r) { return modelName(r.model_id); } },
    { label: 'Batch', get: function (r) { return nameOf('sticker_batch', r.batch_id, 'batch_no'); } }
  ],
  searchPh: 'Search serial, model, invoice…',
  search: function (r) { return [r.serial_no, modelName(r.model_id), r.invoice_no, r.invoice_location, r.supplier_name].join(' '); },
  cols: [
    { h: 'Serial No', val: function (r) { return r.serial_no; }, cell: function (r) { return '<b class="mono">' + esc(r.serial_no) + '</b>'; } },
    { h: 'Category', val: function (r) { return r.category; }, cell: function (r) { return catTag(r.category); } },
    { h: 'Model', val: function (r) { return modelName(r.model_id); } },
    { h: 'HP', val: function (r) { var m = DB.get('product_model', r.model_id); return m ? m.hp : 0; }, cls: 'n' },
    { h: 'Batch', val: function (r) { return nameOf('sticker_batch', r.batch_id, 'batch_no'); } },
    { h: 'Mfg Date', val: function (r) { return r.mfg_date || ''; }, cell: function (r) { return dmy(r.mfg_date); } },
    { h: 'Invoice No', val: function (r) { return r.invoice_no || ''; } },
    { h: 'Location', val: function (r) { return r.invoice_location || ''; } },
    { h: 'Printed', val: function (r) { return r.print_count || 0; }, cls: 'n' },
    { h: 'Status', val: function (r) { return r.status; }, cell: function (r) { return statusTag(r.status); } }
  ],
  rowActions: function (r) { return [{ a: 'print', t: 'Print sticker / warranty card', i: ICO.qr }, { a: 'search', t: 'Serial search report', i: ICO.search }]; },
  onAction: function (a, r) {
    if (a === 'print') location.hash = '#/w/print?sn=' + encodeURIComponent(r.serial_no);
    if (a === 'search') location.hash = '#/w/search?sn=' + encodeURIComponent(r.serial_no);
  },
  imp: {
    key: 'serial_no',
    head: function () {
      var next = DB.peekNo('BATCH', 'WA/{n}/{fy}');
      return '<div class="frm" style="margin-bottom:14px"><div class="f"><label>Sticker batch no *</label><input id="impBatchNo" value="' + esc(next) + '"></div>' +
        '<div class="f"><label>Batch date *</label><input id="impBatchDate" type="date" value="' + today() + '"></div></div>';
    },
    cols: [
      { h: 'Serial No', k: 'serial_no', req: 1, alias: ['SrNo', 'Sr No', 'Serial', 'Serial Number', 'Product Serial'], sample: '2610PU20001' },
      { h: 'Model Name', k: 'model_id', req: 1, alias: ['Model', 'Model Code', 'Product Model'], lk: { t: 'product_model', f: ['model_name', 'model_code'] }, sample: 'SLT-P4-3HP', note: 'Model name or model code from the Product Model master' },
      { h: 'Model Category', k: 'category', alias: ['Category'], enumv: CATS, upper: 1, sample: 'PUMP', note: 'Optional — checked against the model' },
      { h: 'Supplier Name', k: 'supplier_name', alias: ['Supplier'], sample: 'Solartive Greater Noida Plant' },
      { h: 'HP', k: 'hp', type: 'num', sample: 3, note: 'Information only' },
      { h: 'KW', k: 'kw', type: 'num', sample: 2.24, note: 'Information only' },
      { h: 'Product Group', k: 'product_group', alias: ['Group'], sample: 'Solar Submersible' },
      { h: 'Invoice No', k: 'invoice_no', alias: ['Invoice'], sample: 'INV/26-27/0412' },
      { h: 'Invoice Date', k: 'invoice_date', type: 'date', sample: '2026-10-28' },
      { h: 'Invoice Location', k: 'invoice_location', alias: ['Location'], sample: 'Jaipur' },
      { h: 'Mfg Date', k: 'mfg_date', type: 'date', alias: ['Manufacturing Date'], sample: '2026-10-20' }
    ],
    samples: [
      ['2610PU20001', 'SLT-P4-3HP', 'PUMP', 'Solartive Greater Noida Plant', 3, 2.24, 'Solar Submersible', 'INV/26-27/0412', '2026-10-28', 'Jaipur', '2026-10-20'],
      ['2610MO20001', 'SLT-M4-3HP', 'MOTOR', 'Solartive Greater Noida Plant', 3, 2.24, 'Solar Submersible', 'INV/26-27/0412', '2026-10-28', 'Jaipur', '2026-10-20'],
      ['2610CT20001', 'SLT-C-3HP', 'CONTROLLER', 'Solartive Greater Noida Plant', 3, 2.24, 'Solar Submersible', 'INV/26-27/0412', '2026-10-28', 'Jaipur', '2026-10-20']
    ],
    check: function (o) {
      var m = o._model_id;
      if (o.category && m && o.category !== m.category) return 'Model Category ' + o.category + ' does not match the model (' + m.category + ')';
      return null;
    },
    begin: function (rows) {
      if (rows && !rows.some(function (r) { return r.action === 'add'; })) return null;   /* nothing new -> no empty batch */
      var no = ($('#impBatchNo').value || '').trim(), dt = $('#impBatchDate').value;
      if (!no) throw new Error('Enter a batch number');
      if (!dt) throw new Error('Enter the batch date'); if (dt > today()) throw new Error('Batch date cannot be in the future');
      var ex = DB.find('sticker_batch', function (b) { return b.batch_no === no; });
      if (ex) return ex;
      var b = DB.add('sticker_batch', { batch_no: no, batch_date: dt || today(), supplier_name: 'Excel import', remarks: 'Imported from ' + Import.fileName, total_serials: 0, created_by: myName() }, true);
      var m = /^WA\/(\d+)\//.exec(no);
      if (m) { var row = DB.find('doc_sequence', function (s) { return s.seq_key === 'BATCH' && s.fy === fyOf(); }); if (!row) row = DB.add('doc_sequence', { seq_key: 'BATCH', prefix: 'WA/{n}/{fy}', fy: fyOf(), last_no: 0 }, true); row.last_no = Math.max(row.last_no, +m[1]); }
      return b;
    },
    make: function (o, raw, batch) {
      var m = raw._model_id;
      return {
        batch_id: batch ? batch.batch_id : null, serial_no: o.serial_no, model_id: o.model_id, category: m.category,
        supplier_name: o.supplier_name || 'Solartive Greater Noida Plant', product_group: o.product_group || 'Solar Submersible',
        invoice_no: o.invoice_no || null, invoice_date: o.invoice_date || null, invoice_location: o.invoice_location || null,
        mfg_date: o.mfg_date || today(), status: 'Generated', print_count: 0, created_on: nowIso()
      };
    },
    makeUpdate: function (o, r) {
      var p = {}; ['invoice_no', 'invoice_date', 'invoice_location', 'product_group', 'supplier_name', 'mfg_date'].forEach(function (k) { if (o[k]) p[k] = o[k]; });
      return p;
    },
    after: function (made, batch) {
      if (batch) { batch.total_serials = DB.where('sticker', function (s) { return s.batch_id === batch.batch_id; }).length; }
    }
  }
});

/* the "Warranty Sticker Entry" screen: import box + batch list */
ROUTES['w/stickers'] = function () {
  var batches = DB.all('sticker_batch');
  var n = DB.all('sticker'), un = n.filter(function (s) { return s.status === 'Generated' || s.status === 'Printed'; }).length;
  return {
    title: 'Warranty Sticker Entry', sub: 'Import the serial numbers produced at the plant, then print QR stickers and digital warranty cards',
    crumb: 'Home › Warranty › <b>Sticker Entry</b>',
    actions: '<button class="btn" onclick="location.hash=\'#/w/serials\'">' + ICO.search + ' Serial Register</button><button class="btn" onclick="Import.template(\'sticker\')">' + ICO.xls + ' Excel Template</button>' +
      '<button class="btn pri" onclick="Import.open(\'sticker\')">' + ICO.imp + ' Import Serials (Excel)</button>',
    body: stripCards([{ l: 'Batches', v: inr(batches.length) }, { l: 'Total serials', v: inr(n.length) }, { l: 'Registered', v: inr(n.filter(function (s) { return s.status === 'Registered'; }).length), c: 'ok' },
      { l: 'Available / unregistered', v: inr(un), c: 'info' }, { l: 'Never printed', v: inr(n.filter(function (s) { return s.status === 'Generated'; }).length), c: 'warn' }]) +
      '<div class="note"><b>Step 1 of the warranty flow.</b> Each batch is one Excel import (columns: Serial No, Model Name, Model Category, Supplier, HP, KW, Product Group, Invoice No, Invoice Date, Invoice Location). ' +
      'Every serial becomes a QR sticker; a serial that is not in this register can never be registered — that is how counterfeits are caught.</div><div id="entGrid"></div>',
    after: function () {
      mountGrid('#entGrid', {
        title: 'Sticker Batches', rows: batches,
        cols: [
          { h: 'Batch No', val: function (r) { return r.batch_no; }, cell: function (r) { return '<b>' + esc(r.batch_no) + '</b>'; } },
          { h: 'Date', val: function (r) { return r.batch_date; }, cell: function (r) { return dmy(r.batch_date); } },
          { h: 'Supplier', val: function (r) { return r.supplier_name || ''; } },
          { h: 'Serials', val: function (r) { return DB.where('sticker', function (s) { return s.batch_id === r.batch_id; }).length; }, cls: 'n' },
          { h: 'Registered', val: function (r) { return DB.where('sticker', function (s) { return s.batch_id === r.batch_id && s.status === 'Registered'; }).length; }, cls: 'n' },
          { h: 'Printed', val: function (r) { return DB.where('sticker', function (s) { return s.batch_id === r.batch_id && s.print_count > 0; }).length; }, cls: 'n' },
          { h: 'Remarks', val: function (r) { return r.remarks || ''; }, cls: 'mu el' },
          { h: 'Created by', val: function (r) { return r.created_by || ''; } }
        ],
        sortI: 1, sortD: 'desc',
        actions: function (r, i) {
          return '<button class="ract" data-ra="serials" data-ri="' + i + '" title="View serials">' + ICO.eye + '</button><button class="ract" data-ra="print" data-ri="' + i + '" title="Print stickers / cards">' + ICO.qr + '</button>' +
            '<button class="ract" data-ra="edit" data-ri="' + i + '" title="Edit">' + ICO.edit + '</button><button class="ract del" data-ra="del" data-ri="' + i + '" title="Delete">' + ICO.trash + '</button>';
        },
        onAction: function (a, r) {
          if (a === 'serials') location.hash = '#/w/serials?batch=' + r.batch_id;
          if (a === 'print') location.hash = '#/w/print?batch=' + r.batch_id;
          if (a === 'edit') openForm('batch', r);
          if (a === 'del') deleteEntity('batch', r);
        }
      });
    }
  };
};
defEntity({
  key: 'batch', table: 'sticker_batch', title: 'Sticker Batch', plural: 'Sticker Batches',
  fields: [
    { k: 'batch_no', l: 'Batch no', req: 1, unique: 1 }, { k: 'batch_date', l: 'Batch date', type: 'date', req: 1 },
    { k: 'supplier_name', l: 'Supplier / plant' }, { k: 'remarks', l: 'Remarks', type: 'area', full: 1 }
  ],
  defaults: function () { return { batch_no: DB.peekNo('BATCH', 'WA/{n}/{fy}'), batch_date: today(), supplier_name: 'Solartive Greater Noida Plant' }; },
  guard: function (b) { var n = DB.where('sticker', function (s) { return s.batch_id === b.batch_id && (s.status === 'Registered' || s.status === 'Replaced'); }).length; return n ? n + ' serial(s) of this batch are already registered, so the batch cannot be deleted.' : null; },
  cascade: [{ table: 'sticker', fk: 'batch_id', label: 'unregistered serials' }],
  after: function (row, isEdit) { if (!isEdit) { var m = /^WA\/(\d+)\//.exec(row.batch_no), sq = DB.find('doc_sequence', function (x) { return x.seq_key === 'BATCH' && x.fy === fyOf(); }); if (!sq) sq = DB.add('doc_sequence', { seq_key: 'BATCH', prefix: 'WA/{n}/{fy}', fy: fyOf(), last_no: 0 }, true); if (m) sq.last_no = Math.max(sq.last_no, +m[1]); row.total_serials = 0; row.created_by = myName(); } },
  cols: []
});

/* serial register (with ?batch= filter) */
ROUTES['w/serials'] = function (a, q) {
  var ent = ENT.sticker, keep = ent.rows, b = null, subset = null;
  if (q.batch) { b = DB.get('sticker_batch', q.batch); subset = DB.where('sticker', function (s) { return s.batch_id == q.batch; }); ent.rows = function () { return subset; }; }
  var p = entityScreen('sticker');
  if (keep) ent.rows = keep; else delete ent.rows;
  p.crumb = 'Home › Warranty › <b>Serial Register</b>';
  if (b) {
    p.sub = 'Batch ' + esc(b.batch_no) + ' · ' + subset.length + ' serials · <a href="#/w/serials">show all serials</a>';
    p.actions = '<button class="btn" onclick="location.hash=\'#/w/print?batch=' + q.batch + '\'">' + ICO.qr + ' Print this batch</button>' + p.actions;
  } else p.actions = '<button class="btn" onclick="location.hash=\'#/w/print?status=unprinted\'">' + ICO.qr + ' Print unprinted stickers</button>' + p.actions;
  return p;
};

/* ---------- sticker / warranty-card print page ---------- */
ROUTES['w/print'] = function (a, q) {
  var rows;
  if (q.sn) rows = DB.where('sticker', function (s) { return s.serial_no === q.sn; });
  else if (q.batch) rows = DB.where('sticker', function (s) { return s.batch_id == q.batch; });
  else if (q.status === 'unprinted') rows = DB.where('sticker', function (s) { return s.status === 'Generated'; }).slice(0, 60);
  else rows = DB.all('sticker').slice(0, 12);
  var layout = q.layout || 'sticker', c = CO();
  var toggle = '<div class="seg"><a class="' + (layout === 'sticker' ? 'on' : '') + '" href="' + hashWith(q, { layout: 'sticker' }) + '">Sticker sheet</a><a class="' + (layout === 'card' ? 'on' : '') + '" href="' + hashWith(q, { layout: 'card' }) + '">Digital warranty card</a></div>';
  var items = rows.map(function (s) {
    var m = DB.get('product_model', s.model_id) || {};
    if (layout === 'card') {
      return '<div class="wcard"><div class="wc-h"><img src="solartive-logo-sm.png"><span>Digital Warranty Card</span></div>' +
        '<div class="wc-b"><div class="wc-qr">' + qrSvg(regUrl(s.serial_no), 118) + '<small>Scan for E-warranty registration</small></div>' +
        '<div class="wc-i"><div class="k">' + esc(catLabel(s.category)) + '</div><div class="v">' + esc(m.model_name || '') + '</div>' +
        '<div class="k">Serial number</div><div class="v mono big">' + esc(s.serial_no) + '</div><div class="k">Warranty</div><div class="v">' + (m.warranty_months || 12) + ' months from installation</div>' +
        '<div class="k">Rating</div><div class="v">' + (m.hp || '') + ' HP / ' + (m.kw || '') + ' kW · ' + esc(m.technology || '') + '</div></div></div>' +
        '<div class="wc-f">' + esc(c.company_name) + (c.toll_free ? ' · ' + esc(c.toll_free) : '') + '</div></div>';
    }
    return '<div class="stk"><div class="stk-qr">' + qrSvg(regUrl(s.serial_no), 86) + '</div><div class="stk-i"><img src="solartive-logo-sm.png"><b class="mono">' + esc(s.serial_no) + '</b>' +
      '<span>' + esc(m.model_name || '') + '</span><span>' + esc(catLabel(s.category)) + ' · ' + (m.hp || '') + ' HP · ' + (m.warranty_months || 12) + ' mth warranty</span>' +
      '<em>Scan to register warranty</em></div></div>';
  }).join('');
  return {
    title: 'Print Stickers / Warranty Cards', crumb: 'Home › Warranty › <b>Print</b>',
    sub: rows.length + ' item' + (rows.length === 1 ? '' : 's') + ' · every QR opens the warranty registration page for that serial',
    actions: toggle + '<button class="btn" onclick="goBack(\'#/w/stickers\')">' + ICO.back + ' Back</button><button class="btn pri" onclick="doPrintStickers(\'' + rows.map(function (s) { return s.sticker_id; }).join(',') + '\')">' + ICO.prn + ' Print</button>',
    body: '<div class="' + (layout === 'card' ? 'cards-sheet' : 'stk-sheet') + '">' + (items || '<div class="empty">Nothing to print</div>') + '</div>'
  };
};
function hashWith(q, patch) {
  var o = {}; for (var k in q) o[k] = q[k]; for (var k2 in patch) o[k2] = patch[k2];
  return '#/w/print?' + Object.keys(o).map(function (k) { return k + '=' + encodeURIComponent(o[k]); }).join('&');
}
function doPrintStickers(ids) {
  ids.split(',').forEach(function (id) { var s = DB.get('sticker', id); if (s) { s.print_count = (s.print_count || 0) + 1; s.last_printed_on = nowIso(); if (s.status === 'Generated') s.status = 'Printed'; } });
  DB.log('Printed', 'sticker', ids.split(',').length + ' stickers', ''); DB.save();
  window.print();
}

/* ============================================================
   REGISTER WARRANTY  (customer / dealer / HO / public via QR)
   ============================================================ */
var REG = { pub: false, rows: [], dealerLocked: null, done: null };

ROUTES['reg'] = function (a, q) { location.replace('#/w/register' + (q.sn ? '?sn=' + encodeURIComponent(q.sn) : '')); return { title: '', body: '' }; };

ROUTES['w/register'] = function (a, q) {
  var u = APP.user, mine = Q.warranty().slice().sort(function (x, y) { return String(y.registered_on).localeCompare(String(x.registered_on)); }).slice(0, 8);
  var avail = DB.all('sticker').filter(function (s) { return s.status === 'Generated' || s.status === 'Printed'; });
  var demo = '';
  if (isHO() || ROLE() === 'DEALER' || ROLE() === 'CUSTOMER') {
    var sets = {};
    avail.forEach(function (s) { var m = DB.get('product_model', s.model_id); if (m) { var k = m.hp; (sets[k] = sets[k] || {})[s.category] = sets[k][s.category] || s; } });
    var full = Object.keys(sets).filter(function (k) { return sets[k].PUMP && sets[k].MOTOR && sets[k].CONTROLLER; }).slice(0, 4);
    demo = full.length ? '<div class="hint" style="margin-top:12px"><b>Demo shortcut</b> — unregistered sets (pump + motor + controller of the same HP). Click to start a registration:</div><div class="chips">' +
      full.map(function (k) { var s = sets[k]; return '<span class="chip" onclick="openRegistration({sns:[\'' + s.PUMP.serial_no + '\',\'' + s.MOTOR.serial_no + '\',\'' + s.CONTROLLER.serial_no + '\']})">' + k + ' HP set · ' + esc(s.PUMP.serial_no) + ' / ' + esc(s.MOTOR.serial_no) + ' / ' + esc(s.CONTROLLER.serial_no) + '</span>'; }).join('') + '</div>' : '';
  }
  return {
    title: ROLE() === 'CUSTOMER' ? 'Register Product (Scan QR)' : 'Register Warranty', crumb: 'Home › Warranty › <b>Register</b>',
    sub: 'Scan the QR on the pump, motor and controller stickers, or type the serial numbers',
    actions: '<button class="btn pri" onclick="openRegistration({})">' + ICO.qr + ' New Registration</button>',
    body: '<div class="card"><div class="cbody"><div class="reghero"><div class="rq">' + ICO.qr.replace(/width="14" height="14"/, 'width="44" height="44"') + '</div><div style="flex:1"><h2 style="font-size:17px">Active warranty registration</h2>' +
      '<p style="color:var(--ink3);margin:3px 0 10px">One form registers the whole set. Each serial is validated against the sticker register; the customer is created from the mobile number and gets a WhatsApp confirmation.</p>' +
      '<div style="display:flex;gap:8px;max-width:520px"><input id="regSn" class="big-in" placeholder="Scan / type a serial number" list="dl_unreg" value="' + esc(q.sn || '') + '" autocomplete="off"><button class="btn pri" onclick="openRegistration({sn:$(\'#regSn\').value})">Start</button></div>' +
      '<datalist id="dl_unreg">' + avail.slice(0, 150).map(function (s) { return '<option value="' + esc(s.serial_no) + '">' + esc(catLabel(s.category) + ' · ' + modelName(s.model_id)) + '</option>'; }).join('') + '</datalist>' + demo + '</div></div></div></div>' +
      '<div class="card"><h3>Recent registrations <span class="sm2">' + (isHO() ? 'all' : 'yours') + '</span></h3><div id="regRecent"></div></div>',
    after: function () {
      var h = '<table class="dt"><thead><tr><th>Warranty No</th><th>Serial</th><th>Category</th><th>Customer</th><th>Registered</th><th>Valid till</th><th>Status</th></tr></thead><tbody>';
      mine.forEach(function (w) { var s = wStatus(w); h += '<tr class="clk" onclick="location.hash=\'#/w/search?sn=' + encodeURIComponent(w.serial_no) + '\'"><td>' + esc(w.warranty_no) + '</td><td class="mono">' + esc(w.serial_no) + '</td><td>' + catTag(w.category) + '</td><td>' + esc(custName(w.customer_id)) + '</td><td>' + dmy(w.registered_on) + '</td><td>' + dmy(w.end_date) + '</td><td><span class="tag ' + s.cls + '">' + s.txt + '</span></td></tr>'; });
      $('#regRecent').innerHTML = h + '</tbody></table>';
      if (q.sn && !window._regOpened) { window._regOpened = 1; openRegistration({ sn: q.sn }); setTimeout(function () { window._regOpened = 0; }, 800); }
    }
  };
};

function openRegistration(o) {
  o = o || {};
  var u = APP.user;
  REG = { pub: !!o.pub || !u, rows: [], dealerLocked: (u && u.kind === 'DEALER') ? u.id : null, done: null };
  var sns = o.sns || (o.sn ? [o.sn] : []);
  for (var i = 0; i < Math.max(3, sns.length); i++) REG.rows.push({ sn: sns[i] || '' });
  regRender();
}
function regRender(keepVals) {
  var u = APP.user, dealers = DB.where('dealer', function (d) { return d.status === 'Approved'; });
  var avail = DB.all('sticker').filter(function (s) { return s.status === 'Generated' || s.status === 'Printed'; });
  var cust = (u && u.kind === 'CUSTOMER') ? u.rec : null;
  var v = keepVals || {};
  var dealerHtml;
  if (REG.dealerLocked) dealerHtml = '<div class="f"><label>Dealer</label><input id="rg_dealer_txt" readonly value="' + esc(dealerName(REG.dealerLocked)) + ' (' + esc(u.rec.dealer_code) + ')"><div class="hint">Filled automatically from the dealer login</div></div>';
  else dealerHtml = '<div class="f"><label>Purchased from dealer</label><select id="rg_dealer"><option value="">— direct / not listed —</option>' + dealers.map(function (d) { return '<option value="' + d.dealer_id + '"' + (v.dealer == d.dealer_id ? ' selected' : '') + '>' + esc(d.firm_name + ' (' + d.dealer_code + ') — ' + (d.district || '')) + '</option>'; }).join('') + '</select></div>';
  var rowsHtml = REG.rows.map(function (r, i) {
    return '<div class="rgrow" data-i="' + i + '"><div class="rgn">' + (i + 1) + '</div><input class="rgsn" data-i="' + i + '" placeholder="Scan / type serial no" list="dl_unreg2" value="' + esc(r.sn) + '" autocomplete="off">' +
      '<div class="rgres" id="rgres' + i + '"></div>' + (REG.rows.length > 1 ? '<button class="ract del" title="Remove" onclick="regRemove(' + i + ')">' + ICO.trash + '</button>' : '<span></span>') + '</div>';
  }).join('');
  var cf = function (k, l, extra) { return '<div class="f' + ((extra && extra.full) ? ' full' : '') + '"><label>' + l + ((extra && extra.req) ? ' <span class="rq">*</span>' : '') + '</label>' + extra.html + '</div>'; };
  var body = '<div class="sec-h">1 · Product serial numbers <span class="sm2">pump, motor and controller of the set — each has its own warranty</span></div>' +
    '<div id="rgRows">' + rowsHtml + '</div><datalist id="dl_unreg2">' + avail.slice(0, 200).map(function (s) { return '<option value="' + esc(s.serial_no) + '">' + esc(catLabel(s.category) + ' · ' + modelName(s.model_id)) + '</option>'; }).join('') + '</datalist>' +
    '<button class="btn sm" style="margin-top:6px" onclick="regAdd()">' + ICO.plus + ' Add another serial</button>' +
    '<div class="sec-h">2 · Customer details</div><div class="frm c3">' +
    '<div class="f"><label>Mobile number <span class="rq">*</span></label><input id="rg_mobile" type="tel" maxlength="10" value="' + esc(v.mobile || (cust ? cust.mobile : '')) + '"' + (cust ? ' readonly' : '') + ' autocomplete="off"><div class="hint" id="rgCustHint">Existing customers are filled in automatically</div></div>' +
    '<div class="f"><label>Customer name <span class="rq">*</span></label><input id="rg_name" value="' + esc(v.name || (cust ? cust.customer_name : '')) + '"></div>' +
    '<div class="f"><label>Preferred language</label><select id="rg_lang">' + [['EN', 'English'], ['HI', 'हिन्दी (Hindi)'], ['GU', 'ગુજરાતી (Gujarati)']].map(function (l) { return '<option value="' + l[0] + '"' + ((v.lang || (cust && cust.language) || 'EN') === l[0] ? ' selected' : '') + '>' + l[1] + '</option>'; }).join('') + '</select></div>' +
    '<div class="f full"><label>Address <span class="rq">*</span></label><input id="rg_addr" value="' + esc(v.addr || (cust ? cust.address : '')) + '"></div>' +
    '<div class="f"><label>Village / area</label><input id="rg_village" value="' + esc(v.village || (cust ? cust.village : '')) + '"></div>' +
    '<div class="f"><label>State <span class="rq">*</span></label><select id="rg_state"><option value="">— select —</option>' + stateOpts().map(function (s) { return '<option value="' + s.v + '"' + ((v.state || (cust && cust.state_code) || '09') === s.v ? ' selected' : '') + '>' + esc(s.l) + '</option>'; }).join('') + '</select></div>' +
    '<div class="f"><label>District <span class="rq">*</span></label><input id="rg_district" list="dl_rg_district" value="' + esc(v.district || (cust ? cust.district : '')) + '"><datalist id="dl_rg_district"></datalist></div>' +
    '<div class="f"><label>Pincode <span class="rq">*</span></label><input id="rg_pin" maxlength="6" value="' + esc(v.pin || (cust ? cust.pincode : '')) + '"></div>' +
    '<div class="f"><label>Email</label><input id="rg_email" type="email" value="' + esc(v.email || (cust ? cust.email || '' : '')) + '"></div></div>' +
    '<div class="sec-h">3 · Installation</div><div class="frm c3">' +
    '<div class="f"><label>Date of installation / invoice <span class="rq">*</span></label><input id="rg_date" type="date" max="' + today() + '" value="' + esc(v.date || today()) + '"><div class="hint">Warranty starts from this date</div></div>' +
    '<div class="f"><label>Invoice no</label><input id="rg_inv" value="' + esc(v.inv || '') + '"></div>' + dealerHtml +
    '<div class="f"><label>Borewell depth (m)</label><input id="rg_bore" type="number" value="' + esc(v.bore || '') + '"></div>' +
    '<div class="f"><label>Dynamic head (m)</label><input id="rg_head" type="number" value="' + esc(v.head || '') + '"></div>' +
    '<div class="f"><label>Solar array (kWp)</label><input id="rg_kwp" type="number" step="0.1" value="' + esc(v.kwp || '') + '"></div>' +
    (isHO() ? '<div class="f"><label>Project / scheme</label><select id="rg_proj"><option value="">—</option>' + DB.all('project').map(function (p) { return '<option value="' + p.project_id + '">' + esc(p.project_name) + '</option>'; }).join('') + '</select></div>' : '') +
    '</div><label class="cb" style="margin-top:12px"><input type="checkbox" id="rg_consent" checked> I agree to the privacy policy and want warranty updates on WhatsApp / SMS</label>';
  modal('<span id="rgTitle">Register product warranty</span>', '<div id="rgBody">' + body + '</div>',
    '<button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" id="rgSave" onclick="regSave()">' + ICO.shield + ' Activate warranty</button>', 'wide sticky');
  $$('.rgsn').forEach(function (i) { i.addEventListener('input', function () { REG.rows[+this.dataset.i].sn = this.value; regCheck(+this.dataset.i); }); i.addEventListener('change', function () { regCheckAll(); }); });
  var mob = $('#rg_mobile'); if (mob) mob.addEventListener('input', regLookup);
  var st = $('#rg_state'), dl = $('#dl_rg_district'); var fill = function () { dl.innerHTML = districtList(st.value).map(function (d) { return '<option value="' + esc(d) + '">'; }).join(''); }; fill(); st.addEventListener('change', fill);
  regCheckAll();
}
function regVals() {
  var g = function (id) { var e = document.getElementById(id); return e ? e.value : ''; };
  return { mobile: g('rg_mobile'), name: g('rg_name'), lang: g('rg_lang'), addr: g('rg_addr'), village: g('rg_village'), state: g('rg_state'), district: g('rg_district'), pin: g('rg_pin'), email: g('rg_email'), date: g('rg_date'), inv: g('rg_inv'), dealer: g('rg_dealer'), bore: g('rg_bore'), head: g('rg_head'), kwp: g('rg_kwp') };
}
function regAdd() { var v = regVals(); REG.rows.push({ sn: '' }); regRender(v); regCheckAll(); }
function regRemove(i) { var v = regVals(); REG.rows.splice(i, 1); regRender(v); regCheckAll(); }
function regCheckAll() { REG.rows.forEach(function (r, i) { regCheck(i); }); }
function regCheck(i) {
  var r = REG.rows[i], res = serialCheck(r.sn), box = document.getElementById('rgres' + i);
  r.res = res;
  if (res.lvl === 'ok') {
    var dup = REG.rows.some(function (o, j) { return j !== i && o.sn && o.sn.trim().toUpperCase() === r.sn.trim().toUpperCase(); });
    if (dup) { res = r.res = { lvl: 'err', msg: 'Entered twice in this form' }; }
  }
  if (box) {
    if (!r.sn.trim()) box.innerHTML = '<span class="hint">Pump, motor or controller serial</span>';
    else if (res.lvl === 'ok') {
      var mon = warrantyMonthsFor(res.m, REG.dealerLocked || (+(document.getElementById('rg_dealer') || {}).value || null));
      box.innerHTML = '<span class="tag ok">✓ ' + esc(res.msg) + '</span> <span class="hint">' + (res.m ? res.m.hp + ' HP · ' : '') + mon + ' months warranty</span>';
    } else box.innerHTML = '<span class="tag dang">✗ ' + esc(res.msg) + '</span>';
  }
  /* HP consistency across the set */
  var hps = {}; REG.rows.forEach(function (o) { if (o.res && o.res.lvl === 'ok' && o.res.m && o.res.m.hp) hps[o.res.m.hp] = 1; });
  var warn = document.getElementById('rgHpWarn');
  if (Object.keys(hps).length > 1) {
    if (!warn) { warn = el('div', { id: 'rgHpWarn', class: 'note w', style: 'margin-top:8px' }); $('#rgRows').appendChild(warn); }
    warn.innerHTML = '<b>Check the set:</b> the serials belong to different HP ratings (' + Object.keys(hps).join(' / ') + ' HP). A pump, motor and controller of one installation normally have the same HP.';
  } else if (warn) warn.remove();
}
function regLookup() {
  var m = this.value.trim(), hint = $('#rgCustHint');
  if (!/^\d{10}$/.test(m)) { hint.textContent = 'Existing customers are filled in automatically'; return; }
  /* a public (QR) visitor never gets another person's saved details; dealers only see their own customers */
  var pool = REG.pub ? [] : (ROLE() === 'DEALER' || ROLE() === 'CUSTOMER') ? Q.customers() : DB.all('customer');
  var c = pool.filter(function (x) { return x.mobile === m; })[0];
  if (!c) { hint.innerHTML = '<span style="color:var(--info)">' + (REG.pub ? 'Enter your details — if this number is already with us, the warranty is added to the same account' : 'New customer — an account is created on registration') + '</span>'; return; }
  hint.innerHTML = '<span style="color:var(--ok)">✓ Existing customer — details loaded</span>';
  var set = function (id, val) { var e = document.getElementById(id); if (e && val != null) e.value = val; };
  set('rg_name', c.customer_name); set('rg_addr', c.address); set('rg_village', c.village); set('rg_state', c.state_code); set('rg_district', c.district); set('rg_pin', c.pincode); set('rg_email', c.email); set('rg_lang', c.language || 'EN');
  var st = $('#rg_state'); if (st) st.dispatchEvent(new Event('change'));
}

function regSave() {
  var v = regVals(), u = APP.user;
  var sel = REG.rows.filter(function (r) { return r.sn && r.sn.trim(); });
  if (!sel.length) return toast('Enter at least one serial number', 'err');
  regCheckAll();
  var bad = sel.filter(function (r) { return !r.res || r.res.lvl !== 'ok'; });
  if (bad.length) return toast('Serial ' + bad[0].sn + ': ' + bad[0].res.msg, 'err');
  var cats = {}, hpset = {}; for (var q = 0; q < sel.length; q++) { var st0 = sel[q].res.st; if (st0) { if (cats[st0.category]) return toast('Only one ' + catLabel(st0.category).toLowerCase() + ' per registration — register a second set separately', 'err'); cats[st0.category] = 1; } if (sel[q].res.m && sel[q].res.m.hp) hpset[sel[q].res.m.hp] = 1; }
  if (Object.keys(hpset).length > 1 && !isHO()) return toast('The serials belong to different HP ratings (' + Object.keys(hpset).join(' / ') + ' HP) — please check the stickers', 'err');
  if (!/^[6-9]\d{9}$/.test(v.mobile)) return toast('Enter a valid 10-digit mobile number', 'err');
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return toast('Enter a valid email address', 'err');
  if (!v.name.trim()) return toast('Customer name is required', 'err');
  if (!v.addr.trim()) return toast('Address is required', 'err');
  if (!v.state) return toast('Select the state', 'err');
  if (!v.district.trim()) return toast('District is required', 'err');
  if (!/^\d{6}$/.test(v.pin)) return toast('Pincode must be 6 digits', 'err');
  if (!v.date) return toast('Installation / invoice date is required', 'err');
  if (v.date > today()) return toast('Installation date cannot be in the future', 'err');
  if (!isHO() && daysBetween(v.date, today()) > 365) return toast('Registrations older than 12 months must be done by the head office', 'err');
  if (!$('#rg_consent').checked) return toast('Please accept the privacy policy to continue', 'err');
  var dealerId = REG.dealerLocked || (v.dealer ? +v.dealer : null);
  var by = isHO() ? 'HO' : ROLE() === 'DEALER' ? 'Dealer' : 'Customer';
  var res = registerSet({
    cust: { customer_name: v.name.trim(), mobile: v.mobile, email: v.email || null, address: v.addr.trim(), village: v.village || null, district: v.district.trim(), state_code: v.state, pincode: v.pin, language: v.lang },
    serials: sel.map(function (r) { return r.sn.trim(); }), date: v.date, invoice_no: v.inv || null, dealer_id: dealerId, by: by,
    bore: v.bore ? +v.bore : null, head: v.head ? +v.head : null, kwp: v.kwp ? +v.kwp : null, project_id: ($('#rg_proj') && $('#rg_proj').value) ? +$('#rg_proj').value : null
  });
  REG.done = res;
  regDone(res);
}

/** the registration transaction: customer -> installation -> one warranty row per serial */
function registerSet(o) {
  var cust = DB.find('customer', function (c) { return c.mobile === o.cust.mobile; }), isNew = !cust;
  if (!cust) { o.cust.created_on = nowIso(); cust = DB.add('customer', o.cust, true); }
  else {
    /* head office / dealer may correct the customer's details; a public or customer self-registration only fills gaps */
    var trusted = o.by === 'HO' || o.by === 'Dealer', patch = {};
    for (var k in o.cust) if (o.cust[k] != null && o.cust[k] !== '' && k !== 'mobile' && (trusted || cust[k] == null || cust[k] === '')) patch[k] = o.cust[k];
    DB.upd('customer', cust.customer_id, patch, true);
  }
  var inst = DB.add('installation', {
    install_no: DB.nextNo('INSTALL', 'INS/{fy}/{n:4}'), customer_id: cust.customer_id, dealer_id: o.dealer_id || null, install_date: o.date,
    site_address: o.cust.address, village: o.cust.village, district: o.cust.district, state_code: o.cust.state_code, pincode: o.cust.pincode,
    borewell_depth_m: o.bore || null, dynamic_head_m: o.head || null, panel_kwp: o.kwp || null, project_id: o.project_id || null,
    invoice_no: o.invoice_no, invoice_date: o.date, registered_by: o.by, registered_on: nowIso(), remarks: null
  }, true);
  var items = [], rows = [];
  o.serials.forEach(function (sn) {
    var st = stickerBySerial(sn), m = DB.get('product_model', st.model_id), months = warrantyMonthsFor(m, o.dealer_id);
    var w = DB.add('warranty', {
      warranty_no: DB.nextNo('WARRANTY', 'WR/{fy}/{n:5}'), install_id: inst.install_id, serial_no: st.serial_no, sticker_id: st.sticker_id, category: st.category, model_id: st.model_id,
      customer_id: cust.customer_id, dealer_id: o.dealer_id || null, start_date: o.date, warranty_months: months, extended_months: 0, end_date: addMonths(o.date, months),
      status: 'Active', replaced_from_serial: null, registered_by: o.by, registered_on: nowIso(), whatsapp_sent: 1, remarks: null
    }, true);
    st.status = 'Registered';
    rows.push(w); items.push({ category: catLabel(st.category), name: m ? m.model_name : '', serial: st.serial_no, end: w.end_date });
  });
  DB.log('Registered', 'warranty', inst.install_no, rows.length + ' serial(s) for ' + cust.customer_name);
  var wa = notify({ channel: 'WhatsApp', to: cust.mobile, tpl: 'WARRANTY_REG', msg: MSG.warrantyRegistered(cust, items, today()), refType: 'installation', refNo: inst.install_no });
  DB.save();
  return { cust: cust, inst: inst, rows: rows, isNew: isNew, wa: wa };
}

function regDone(res) {
  var body = '<div class="reg-ok"><div class="tick">' + ICO.check.replace(/width="15" height="15"/, 'width="30" height="30"') + '</div><h2>Warranty activated</h2>' +
    '<p>' + esc(res.cust.customer_name) + ' · ' + esc(res.cust.mobile) + (res.isNew ? ' · <span class="tag info">new customer account created</span>' : '') + '</p>' +
    '<div class="hint" style="margin-bottom:10px">Installation ' + esc(res.inst.install_no) + ' · a WhatsApp confirmation was sent (see the corner of the screen)</div>' +
    '<table class="dt" style="max-width:720px;margin:0 auto"><thead><tr><th>Warranty No</th><th>Component</th><th>Serial</th><th>Model</th><th>Valid till</th></tr></thead><tbody>' +
    res.rows.map(function (w) { return '<tr><td>' + esc(w.warranty_no) + '</td><td>' + catTag(w.category) + '</td><td class="mono">' + esc(w.serial_no) + '</td><td>' + esc(modelName(w.model_id)) + '</td><td><b>' + dmy(w.end_date) + '</b> <span class="hint">(' + w.warranty_months + ' months)</span></td></tr>'; }).join('') + '</tbody></table></div>';
  $('#rgBody').innerHTML = body; $('#rgTitle').textContent = 'Registration complete';
  $('#mf').innerHTML = '<button class="btn" onclick="closeModal();openRegistration({pub:' + (REG.pub ? 'true' : 'false') + '})">Register another</button>' +
    '<button class="btn" onclick="printWarrantyCard(' + res.inst.install_id + ',true)">' + ICO.prn + ' Print warranty card</button>' +
    (REG.pub ? '<button class="btn pri" onclick="closeModal()">Done</button>' : '<button class="btn pri" onclick="closeModal();location.hash=\'#/w/search?sn=' + encodeURIComponent(res.rows[0].serial_no) + '\'">View warranty status</button>');
  if (!REG.pub) route(true);
}

/* ============================================================
   DIGITAL WARRANTY CARD
   ============================================================ */
function warrantyCardHtml(inst) {
  var c = CO(), cust = DB.get('customer', inst.customer_id) || {}, ws = wByInstall(inst.install_id);
  return '<div class="paper wpaper"><div class="lh"><img src="solartive-logo-sm.png" style="height:44px;width:auto"><div class="co"><h1 style="font-size:19px">' + esc(c.company_name) + '</h1><div class="adr">' + esc(c.address) + ', ' + esc(c.city) + ' - ' + esc(c.pincode) + ', ' + esc(c.state) + (c.gstin ? '<br>GSTIN: ' + esc(c.gstin) : '') + (c.toll_free ? ' · Customer care: ' + esc(c.toll_free) : '') + '</div></div>' +
    '<div class="rt">' + qrSvg(location.href.split('#')[0] + '#/w/search?sn=' + encodeURIComponent((ws[0] || {}).serial_no || ''), 74) + '<br><small>Scan to check status</small></div></div>' +
    '<div class="dt-title"><h2>Digital Warranty Card</h2></div>' +
    '<div class="pmeta"><div><div class="hd">Customer</div><b>' + esc(cust.customer_name) + '</b><br>' + esc(cust.mobile) + '<br>' + esc(inst.site_address || '') + (inst.village ? ', ' + esc(inst.village) : '') + '<br>' + esc(inst.district || '') + ', ' + esc(stateName(inst.state_code)) + ' - ' + esc(inst.pincode || '') + '</div>' +
    '<div><div class="hd">Installation</div>Installation no: <b>' + esc(inst.install_no) + '</b><br>Date: <b>' + dmy(inst.install_date) + '</b><br>Dealer: <b>' + esc(dealerName(inst.dealer_id) || 'Direct') + '</b><br>' + (inst.borewell_depth_m ? 'Borewell ' + inst.borewell_depth_m + ' m · ' : '') + (inst.dynamic_head_m ? 'Head ' + inst.dynamic_head_m + ' m · ' : '') + (inst.panel_kwp ? 'Array ' + inst.panel_kwp + ' kWp' : '') + '</div></div>' +
    '<table class="ptab"><thead><tr><th>Component</th><th>Model</th><th>Serial no</th><th>Warranty from</th><th>Valid till</th><th class="c">Status</th></tr></thead><tbody>' +
    ws.map(function (w) { var s = wStatus(w); return '<tr><td>' + esc(catLabel(w.category)) + '</td><td>' + esc(modelName(w.model_id)) + '</td><td class="mono">' + esc(w.serial_no) + '</td><td>' + dmy(w.start_date) + '</td><td><b>' + dmy(w.end_date) + '</b></td><td class="c">' + s.txt + '</td></tr>'; }).join('') + '</tbody></table>' +
    '<div class="ptc"><h4>Warranty terms</h4><div style="white-space:pre-line">' + esc(c.warranty_terms || '') + '</div></div>' +
    '<div class="pfoot"><span>This is a computer generated card and needs no signature.</span><span>Printed ' + dmy(today()) + '</span></div></div>';
}
ROUTES['w/card'] = function (a) {
  var inst = DB.get('installation', a[0]);
  if (!inst || Q.install().indexOf(inst) < 0) return { title: 'Warranty card', crumb: 'Home › Warranty', body: '<div class="card"><div class="empty">Warranty card not found, or you do not have access to it.</div></div>' };
  return { title: 'Digital Warranty Card', crumb: 'Home › Warranty › <b>Card</b>', sub: esc(inst.install_no), actions: '<button class="btn" onclick="goBack()">' + ICO.back + ' Back</button><button class="btn pri" onclick="window.print()">' + ICO.prn + ' Print</button>', body: warrantyCardHtml(inst) };
};
function printWarrantyCard(id, popup) {
  var inst = DB.get('installation', id); if (!inst) return;
  if (popup) printDoc(warrantyCardHtml(inst), 'Warranty card ' + inst.install_no); else location.hash = '#/w/card/' + id;
}

/* ============================================================
   ACTIVE WARRANTY LIST  (update / delete scope for HO and dealers)
   ============================================================ */
function wRowView(w) {
  var inst = DB.get('installation', w.install_id) || {}, cust = DB.get('customer', w.customer_id) || {}, s = wStatus(w);
  return { w: w, inst: inst, cust: cust, s: s };
}
defEntity({
  key: 'warranty', table: 'warranty', title: 'Warranty', plural: 'Active Warranty List',
  rows: function () { return Q.warranty(); },
  sub: function (rows) { return inr(rows.length) + ' component warranties · pump, motor and controller each carry their own period'; },
  kpis: function (rows) {
    var sx = rows.map(wStatus), c = function (k) { return sx.filter(function (s) { return s.k === k; }).length; };
    return stripCards([{ l: 'Active', v: inr(c('active')), c: 'ok' }, { l: 'Expiring ≤ 45 days', v: inr(c('expiring')), c: 'warn' }, { l: 'Expired', v: inr(c('expired')), c: 'dang' }, { l: 'Replaced', v: inr(c('replaced')) },
      { l: 'Installations', v: inr(uniq(rows.map(function (w) { return w.install_id; })).length) }]);
  },
  filters: [
    { label: 'Status', get: function (w) { return wStatus(w).txt; }, opts: ['Active', 'Expiring', 'Expired', 'Replaced', 'Void'] },
    { label: 'Category', get: function (w) { return w.category; }, opts: CATS },
    { label: 'State', get: function (w) { return stateName((DB.get('installation', w.install_id) || {}).state_code); } },
    { label: 'Dealer', get: function (w) { return dealerName(w.dealer_id) || 'Direct'; } }
  ],
  searchPh: 'Search serial, customer, mobile, warranty no…',
  search: function (w) { var v = wRowView(w); return [w.serial_no, w.warranty_no, v.cust.customer_name, v.cust.mobile, v.inst.install_no, v.inst.district].join(' '); },
  sortI: 8, sortD: 'desc',
  cols: [
    { h: 'Warranty No', val: function (w) { return w.warranty_no; } },
    { h: 'Serial No', val: function (w) { return w.serial_no; }, cell: function (w) { return '<a class="mono" href="#/w/search?sn=' + encodeURIComponent(w.serial_no) + '"><b>' + esc(w.serial_no) + '</b></a>'; } },
    { h: 'Component', val: function (w) { return w.category; }, cell: function (w) { return catTag(w.category); } },
    { h: 'Model', val: function (w) { return modelName(w.model_id); } },
    { h: 'Customer', val: function (w) { return custName(w.customer_id); }, cell: function (w) { return '<b>' + esc(custName(w.customer_id)) + '</b><div class="hint" style="margin:0">' + esc((DB.get('customer', w.customer_id) || {}).mobile || '') + '</div>'; } },
    { h: 'Place', val: function (w) { var i = DB.get('installation', w.install_id) || {}; return (i.district || '') + ', ' + stateShort(i.state_code); } },
    { h: 'Dealer', val: function (w) { return dealerName(w.dealer_id) || 'Direct'; } },
    { h: 'Registered', val: function (w) { return w.registered_on || ''; }, cell: function (w) { return dmy(w.registered_on) + '<div class="hint" style="margin:0">by ' + esc(w.registered_by || '') + '</div>'; } },
    { h: 'Valid till', val: function (w) { return w.end_date; }, cell: function (w) { return dmy(w.end_date); } },
    { h: 'Balance', val: function (w) { return wStatus(w).days; }, cls: 'n', cell: function (w) { var s = wStatus(w); return s.k === 'active' || s.k === 'expiring' ? s.days + ' d' : '—'; } },
    { h: 'Status', val: function (w) { return wStatus(w).txt; }, cell: function (w) { var s = wStatus(w); return '<span class="tag ' + s.cls + '">' + s.txt + '</span>'; } }
  ],
  rowActions: function (w) {
    var a = [{ a: 'view', t: 'Serial search report', i: ICO.search }, { a: 'card', t: 'Digital warranty card', i: ICO.prn }];
    if (ROLE() !== 'CUSTOMER' && wStatus(w).k !== 'replaced') a.push({ a: 'call', t: 'Book service call', i: ICO.wrench });
    return a;
  },
  onAction: function (a, w) {
    if (a === 'view') location.hash = '#/w/search?sn=' + encodeURIComponent(w.serial_no);
    if (a === 'card') location.hash = '#/w/card/' + w.install_id;
    if (a === 'call') location.hash = '#/s/calls?new=' + w.install_id + '&sn=' + encodeURIComponent(w.serial_no);
  },
  afterDelete: function (w) {
    var st = DB.get('sticker', w.sticker_id); if (st) st.status = 'Printed';
    if (!wByInstall(w.install_id).length) { var inst = DB.get('installation', w.install_id); if (inst && !refsTo('installation', inst).length) DB.del('installation', w.install_id, true); }
  },
  guard: function (w) { var n = DB.where('complaint_item', function (ci) { return ci.serial_no === w.serial_no; }).length; return n ? 'has ' + n + ' service call line(s). Delete those service calls first, or set the warranty status to <b>Void</b> instead.' : null; },
  perm: function () { var r = ROLE(); return { add: 0, edit: (r === 'SUPER' || r === 'HO' || r === 'DEALER') ? 1 : 0, del: (r === 'SUPER' || r === 'HO' || r === 'DEALER') ? 1 : 0, imp: (r === 'SUPER' || r === 'HO') }; },
  headActions: function () { return (ROLE() !== 'CUSTOMER' ? '<button class="btn" onclick="location.hash=\'#/w/register\'">' + ICO.shield + ' Register Warranty</button>' : ''); },
  /* customised edit form: customer + site + warranty period */
  openForm: function (w) { wEdit(w); },
  imp: {
    key: 'serial_no', noUpdate: true,
    begin: function () { return { inst: {} }; },
    cols: [
      { h: 'Serial No', k: 'serial_no', req: 1, alias: ['SrNo', 'Serial'], sample: '2610PU20001' },
      { h: 'Customer Name', k: 'customer_name', req: 1, alias: ['Customer'], sample: 'Ramesh Patel' },
      { h: 'Mobile', k: 'mobile', req: 1, alias: ['Customer Mobile', 'Phone'], pattern: /^[6-9]\d{9}$/, patMsg: 'must be a 10-digit mobile number', sample: '9000099001' },
      { h: 'Address', k: 'address', sample: 'Near Primary School' },
      { h: 'Village', k: 'village', alias: ['Village / Area', 'Area'], sample: 'Rampur' },
      { h: 'District', k: 'district', req: 1, sample: 'Jaipur' },
      { h: 'State', k: 'state_code', req: 1, lk: { t: 'state_master', f: ['state_name', 'short_name', 'state_code'] }, sample: 'Rajasthan', note: 'State name, 2-letter code or GST code' },
      { h: 'Pincode', k: 'pincode', pattern: /^\d{6}$/, patMsg: 'must be 6 digits', sample: '302001' },
      { h: 'Dealer Code', k: 'dealer_id', alias: ['Dealer'], lk: { t: 'dealer', f: ['dealer_code', 'firm_name'] }, sample: '1001' },
      { h: 'Install Date', k: 'install_date', type: 'date', req: 1, alias: ['Installation Date', 'Invoice Date', 'Date'], sample: '2026-10-25' },
      { h: 'Invoice No', k: 'invoice_no', sample: 'INV/26-27/0412' }
    ],
    samples: [['2610PU20001', 'Ramesh Patel', '9000099001', 'Near Primary School', 'Rampur', 'Jaipur', 'Rajasthan', '302001', '1001', '2026-10-25', 'INV/26-27/0412'],
      ['2610MO20001', 'Ramesh Patel', '9000099001', 'Near Primary School', 'Rampur', 'Jaipur', 'Rajasthan', '302001', '1001', '2026-10-25', 'INV/26-27/0412']],
    check: function (o) {
      var st = stickerBySerial(o.serial_no);
      if (!st) return 'Serial ' + o.serial_no + ' is not in the sticker register';
      if (wBySerial(o.serial_no)) return 'Serial ' + o.serial_no + ' is already registered';
      if (st.status === 'Scrapped') return 'Serial is scrapped';
      if (o.install_date > today()) return 'Install Date cannot be in the future';
      return null;
    },
    make: function (o, raw, ctx) {
      var st = stickerBySerial(o.serial_no), dealerId = o.dealer_id || null, key = [o.mobile, o.install_date, dealerId].join('|');
      var cust = DB.find('customer', function (c) { return c.mobile === o.mobile; });
      if (!cust) cust = DB.add('customer', { customer_name: o.customer_name, mobile: o.mobile, address: o.address, village: o.village, district: o.district, state_code: o.state_code, pincode: o.pincode, language: 'EN', created_on: nowIso() }, true);
      var inst = ctx.inst[key];
      if (!inst) {
        inst = ctx.inst[key] = DB.add('installation', { install_no: DB.nextNo('INSTALL', 'INS/{fy}/{n:4}'), customer_id: cust.customer_id, dealer_id: dealerId, install_date: o.install_date, site_address: o.address, village: o.village, district: o.district, state_code: o.state_code, pincode: o.pincode, invoice_no: o.invoice_no, invoice_date: o.install_date, registered_by: 'HO', registered_on: nowIso() }, true);
      }
      var m = DB.get('product_model', st.model_id), months = warrantyMonthsFor(m, dealerId);
      st.status = 'Registered';
      return { warranty_no: DB.nextNo('WARRANTY', 'WR/{fy}/{n:5}'), install_id: inst.install_id, serial_no: st.serial_no, sticker_id: st.sticker_id, category: st.category, model_id: st.model_id, customer_id: cust.customer_id, dealer_id: dealerId, start_date: o.install_date, warranty_months: months, extended_months: 0, end_date: addMonths(o.install_date, months), status: 'Active', registered_by: 'HO', registered_on: nowIso(), whatsapp_sent: 0 };
    }
  }
});

function wEdit(w) {
  var inst = DB.get('installation', w.install_id) || {}, cust = DB.get('customer', w.customer_id) || {};
  var ho = isHO(), s = wStatus(w);
  var F = [
    { sec: 'Product' },
    { k: 'serial_no', l: 'Serial number', ro: 1 }, { k: 'model', l: 'Model', ro: 1 },
    { sec: 'Customer & site' },
    { k: 'customer_name', l: 'Customer name', req: 1 }, { k: 'mobile', l: 'Mobile', type: 'tel', req: 1, pattern: /^[6-9]\d{9}$/, patMsg: 'Enter a valid 10-digit mobile number' },
    { k: 'address', l: 'Address', full: 1 }, { k: 'village', l: 'Village / area' },
    { k: 'state_code', l: 'State', type: 'select', req: 1, opts: stateOpts }, { k: 'district', l: 'District', req: 1, suggest: { dep: 'state_code', fn: districtList } },
    { k: 'pincode', l: 'Pincode', pattern: /^\d{6}$/, patMsg: 'Pincode must be 6 digits' },
    { k: 'dealer_id', l: 'Dealer', type: 'select', lk: 1, ro: ROLE() === 'DEALER', opts: optsFrom('dealer', function (d) { return d.firm_name + ' (' + (d.dealer_code || '') + ')'; }, function (d) { return d.status === 'Approved'; }) },
    { sec: 'Warranty' },
    { k: 'install_date', l: 'Warranty start date', type: 'date', req: 1, ro: !ho && !(ROLE() === 'DEALER'), max: today() },
    { k: 'warranty_months', l: 'Warranty period (months)', type: 'num', req: 1, min: 1, max: 120, ro: !ho, hint: ho ? 'Warranty period change scope — head office only' : 'Only the head office can change the period' },
    { k: 'extended_months', l: 'Extended months', type: 'num', min: 0, max: 60, ro: !ho },
    { k: 'status', l: 'Warranty status', type: 'select', req: 1, ro: !ho || w.status === 'Replaced', opts: w.status === 'Replaced' ? ['Replaced'] : ['Active', 'Void'], hint: w.status === 'Replaced' ? 'Set automatically by a replacement — delete the replacement to undo' : '' },
    { k: 'remarks', l: 'Remarks', type: 'area', full: 1 }
  ];
  var data = { serial_no: w.serial_no, model: modelName(w.model_id), customer_name: cust.customer_name, mobile: cust.mobile, address: inst.site_address, village: inst.village, state_code: inst.state_code, district: inst.district, pincode: inst.pincode, dealer_id: w.dealer_id, install_date: w.start_date, warranty_months: w.warranty_months, extended_months: w.extended_months, status: w.status, remarks: w.remarks };
  window._wEdit = { w: w, F: F };
  modal('Edit warranty — ' + esc(w.serial_no), '<div class="note">Valid till <b>' + dmy(w.end_date) + '</b> (' + s.txt.toLowerCase() + '). Changing the start date or period recalculates the end date.</div>' + formHtml(F, data, 'we_', 3),
    '<button class="btn" onclick="closeModal()">Cancel</button><button class="btn dang-o" onclick="wDelete()">' + ICO.trash + ' Delete</button><button class="btn pri" onclick="wSave()">' + ICO.save + ' Update</button>', 'wide sticky');
  wireSuggest(F, 'we_');
}
function wSave() {
  var E = window._wEdit, w = E.w, r = collectForm(E.F, 'we_');
  if (r.err) return toast(r.err, 'err');
  var v = r.v, inst = DB.get('installation', w.install_id), cust = DB.get('customer', w.customer_id);
  var dup = DB.find('customer', function (c) { return c.mobile === v.mobile && c.customer_id !== cust.customer_id; });
  if (dup) return toast('Mobile ' + v.mobile + ' already belongs to customer ' + dup.customer_name, 'err');
  DB.upd('customer', cust.customer_id, { customer_name: v.customer_name, mobile: v.mobile, address: v.address, village: v.village, state_code: v.state_code, district: v.district, pincode: v.pincode });
  var ip = { site_address: v.address, village: v.village, state_code: v.state_code, district: v.district, pincode: v.pincode, dealer_id: v.dealer_id };
  if (v.install_date && v.install_date !== w.start_date) { ip.install_date = v.install_date; ip.invoice_date = v.install_date; }
  DB.upd('installation', inst.install_id, ip, true);
  var wp = { dealer_id: v.dealer_id, remarks: v.remarks };
  if (isHO()) {
    wp.warranty_months = v.warranty_months; wp.extended_months = v.extended_months || 0; wp.status = v.status;
  }
  var start = v.install_date || w.start_date;
  var recalc = start !== w.start_date || (isHO() && (v.warranty_months !== w.warranty_months || (v.extended_months || 0) !== (w.extended_months || 0)));
  if (recalc) { wp.start_date = start; wp.end_date = addMonths(start, (wp.warranty_months || w.warranty_months) + (wp.extended_months != null ? wp.extended_months : w.extended_months || 0)); }
  DB.upd('warranty', w.warranty_id, wp);
  DB.save(); closeModal(); route(true); toast('Warranty updated — valid till ' + dmy(DB.get('warranty', w.warranty_id).end_date), 'ok');
}
function wDelete() { var w = window._wEdit.w; closeModal(); deleteEntity('warranty', w); }
ROUTES['w/active'] = function () { var p = entityScreen('warranty'); p.crumb = 'Home › Warranty › <b>Active Warranty</b>'; return p; };

/* ============================================================
   SERIAL NO SEARCH REPORT  -  balance warranty + full history of a serial
   ============================================================ */
ROUTES['w/search'] = function (a, q) {
  var sn = (q.sn || '').trim();
  var form = '<div class="card"><div class="cbody" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input id="srSn" class="big-in" style="flex:1;min-width:260px" list="dl_allsn" placeholder="Enter or scan a serial number" value="' + esc(sn) + '" autocomplete="off">' +
    '<datalist id="dl_allsn">' + Q.warranty().slice(0, 300).map(function (w) { return '<option value="' + esc(w.serial_no) + '">'; }).join('') + '</datalist>' +
    '<button class="btn pri" onclick="location.hash=\'#/w/search?sn=\'+encodeURIComponent($(\'#srSn\').value.trim())">' + ICO.search + ' Search</button></div></div>';
  var res = sn ? serialReportHtml(sn) : '<div id="srGrid"></div>';
  return {
    title: 'Serial No. Search Report', sub: 'Balance warranty period, customer, dealer and service history of any serial number', crumb: 'Home › Warranty › <b>Serial Search</b>',
    body: form + res,
    after: function () {
      var i = $('#srSn'); if (i) i.addEventListener('keydown', function (e) { if (e.key === 'Enter') location.hash = '#/w/search?sn=' + encodeURIComponent(this.value.trim()); });
      if (!sn) mountGrid('#srGrid', {
        title: 'Serial search', rows: Q.warranty(), searchPlaceholder: 'Search any serial, customer or place…', sortI: 7, sortD: 'asc',
        search: function (w) { return [w.serial_no, custName(w.customer_id), modelName(w.model_id)].join(' '); },
        cols: [
          { h: 'Type', val: function (w) { return w.replaced_from_serial ? 'Replacement' : 'Sale'; }, cell: function (w) { return w.replaced_from_serial ? tag('Replacement', 'pur') : tag('Sale', 'mut'); } },
          { h: 'Date', val: function (w) { return w.start_date; }, cell: function (w) { return dmy(w.start_date); } },
          { h: 'Customer', val: function (w) { return custName(w.customer_id); } },
          { h: 'Place', val: function (w) { var i = DB.get('installation', w.install_id) || {}; return (i.village || i.district || '') + ' · ' + stateShort(i.state_code); } },
          { h: 'Model', val: function (w) { return modelName(w.model_id); } },
          { h: 'Serial No', val: function (w) { return w.serial_no; }, cell: function (w) { return '<b class="mono">' + esc(w.serial_no) + '</b>'; } },
          { h: 'Due days', val: function (w) { return wStatus(w).days; }, cls: 'n', cell: function (w) { var s = wStatus(w); return (s.k === 'active' || s.k === 'expiring') ? '<b>' + s.days + '</b>' : '—'; } },
          { h: 'Warranty status', val: function (w) { return wStatus(w).txt; }, cell: function (w) { var s = wStatus(w); return '<span class="tag ' + s.cls + '">' + s.txt + '</span>'; } }
        ],
        onRow: function (w) { location.hash = '#/w/search?sn=' + encodeURIComponent(w.serial_no); }
      });
    }
  };
};

function serialReportHtml(sn) {
  var st = stickerBySerial(sn);
  if (!st) return '<div class="card"><div class="cbody"><div class="verdict bad"><div class="vi">' + ICO.x.replace(/width="14" height="14"/, 'width="34" height="34"') + '</div><div><h2>Not authenticated</h2><p>Serial number <b class="mono">' + esc(sn) + '</b> is not in the sticker register. The product may be counterfeit or the number was mistyped.</p></div></div></div></div>';
  var m = DB.get('product_model', st.model_id) || {}, w = wBySerial(st.serial_no), s = wStatus(w), inst = w ? DB.get('installation', w.install_id) : null, cust = w ? DB.get('customer', w.customer_id) : null;
  var h = '';
  if (!w) {
    h += '<div class="card"><div class="cbody"><div class="verdict info"><div class="vi">' + ICO.shield.replace(/width="16" height="16"/, 'width="34" height="34"') + '</div><div style="flex:1"><h2>Authentic — not yet registered</h2>' +
      '<p><b class="mono">' + esc(st.serial_no) + '</b> · ' + esc(catLabel(st.category)) + ' · ' + esc(m.model_name || '') + ' · ' + (m.hp || '') + ' HP. Warranty is activated when the customer or dealer registers it (' + (m.warranty_months || '') + ' months).</p></div>' +
      (ROLE() !== 'CUSTOMER' || true ? '<button class="btn pri" onclick="openRegistration({sn:\'' + esc(st.serial_no) + '\'})">' + ICO.shield + ' Register warranty</button>' : '') + '</div></div></div>';
    return h;
  }
  var total = Math.max(1, daysBetween(w.start_date, w.end_date)), used = clamp(daysBetween(w.start_date, today()), 0, total);
  var isOk = s.k === 'active' || s.k === 'expiring';
  /* a dealer / customer / state-limited HO user may verify any serial, but sees the owner's details only for their own units */
  if (!Q.warranty().some(function (x) { return x.warranty_id === w.warranty_id; })) {
    return '<div class="card"><div class="cbody"><div class="verdict ' + (isOk ? 'good' : s.k === 'replaced' ? 'info' : 'bad') + '"><div class="vi">' + (isOk ? ICO.tick : ICO.x).replace(/width="14" height="14"/, 'width="34" height="34"') + '</div><div><h2>Warranty ' + s.txt.toLowerCase() + '</h2>' +
      '<p><b class="mono">' + esc(w.serial_no) + '</b> · ' + esc(catLabel(w.category)) + ' · ' + esc(m.model_name || '') + ' is registered and authentic' + (isOk ? ' — <b>' + s.days + ' days</b> of warranty left (valid till ' + dmy(w.end_date) + ')' : '') + '.</p>' +
      '<p class="hint">Customer, site and service history are shown only to the dealer / office that owns this installation.</p></div></div></div></div>';
  }
  h += '<div class="grid2" style="grid-template-columns:1.1fr 1fr"><div class="card" style="margin:0"><div class="cbody"><div class="verdict ' + (isOk ? 'good' : s.k === 'replaced' ? 'info' : 'bad') + '"><div class="vi">' + (isOk ? ICO.tick : ICO.x).replace(/width="14" height="14"/, 'width="34" height="34"') + '</div><div style="flex:1">' +
    '<h2>Warranty ' + s.txt.toLowerCase() + '</h2><p>This product is registered and authenticated.</p></div></div>' +
    '<div class="bal"><div><div class="bl2">Balance warranty</div><div class="bv ' + (isOk ? '' : 'dn') + '">' + (isOk ? s.days : 0) + '<small> days</small></div></div><div style="flex:1"><div class="pbar" style="height:10px"><i class="' + (isOk ? (s.k === 'expiring' ? 'a' : 'g') : 'r') + '" style="width:' + (used / total * 100).toFixed(1) + '%"></i></div>' +
    '<div class="hint" style="display:flex;justify-content:space-between"><span>' + dmy(w.start_date) + '</span><span>' + (used / total * 100).toFixed(0) + '% elapsed</span><span>' + dmy(w.end_date) + '</span></div></div></div>' +
    '<dl class="dl" style="margin-top:14px"><dt>Serial number</dt><dd class="mono">' + esc(w.serial_no) + '</dd><dt>Component</dt><dd>' + catTag(w.category) + '</dd><dt>Model</dt><dd>' + esc(m.model_name || '') + '</dd><dt>Rating</dt><dd>' + (m.hp || '') + ' HP / ' + (m.kw || '') + ' kW</dd>' +
    '<dt>Warranty no</dt><dd>' + esc(w.warranty_no) + '</dd><dt>Period</dt><dd>' + w.warranty_months + ' months' + (w.extended_months ? ' + ' + w.extended_months + ' extended' : '') + '</dd><dt>Registered on</dt><dd>' + dmy(w.registered_on) + ' by ' + esc(w.registered_by || '') + '</dd>' +
    (w.replaced_from_serial ? '<dt>Replaced serial</dt><dd><a class="mono" href="#/w/search?sn=' + encodeURIComponent(w.replaced_from_serial) + '">' + esc(w.replaced_from_serial) + '</a></dd>' : '') + '</dl></div></div>' +
    '<div class="card" style="margin:0"><h3>Customer &amp; site</h3><div class="cbody"><dl class="dl"><dt>Customer</dt><dd>' + esc(cust ? cust.customer_name : '') + '</dd><dt>Mobile</dt><dd>' + esc(cust ? cust.mobile : '') + '</dd>' +
    '<dt>Site</dt><dd style="max-width:260px">' + esc(inst ? [inst.village, inst.district, stateName(inst.state_code), inst.pincode].filter(Boolean).join(', ') : '') + '</dd><dt>Installation</dt><dd>' + esc(inst ? inst.install_no : '') + ' · ' + dmy(inst ? inst.install_date : '') + '</dd>' +
    '<dt>Dealer</dt><dd>' + esc(dealerName(w.dealer_id) || 'Direct') + '</dd>' + (inst && inst.borewell_depth_m ? '<dt>Borewell / head</dt><dd>' + inst.borewell_depth_m + ' m / ' + (inst.dynamic_head_m || '—') + ' m</dd>' : '') + '</dl>' +
    '<div style="display:flex;gap:7px;margin-top:14px;flex-wrap:wrap">' + (ROLE() !== 'CUSTOMER' || true ? '<button class="btn pri" onclick="location.hash=\'#/s/calls?new=' + w.install_id + '&sn=' + encodeURIComponent(w.serial_no) + '\'">' + ICO.wrench + ' Book service call</button>' : '') +
    '<button class="btn" onclick="location.hash=\'#/w/card/' + w.install_id + '\'">' + ICO.prn + ' Warranty card</button>' +
    (isOk && (isHO() || ROLE() === 'DEALER') ? '<button class="btn" onclick="location.hash=\'#/w/replace?old=' + encodeURIComponent(w.serial_no) + '\'">' + ICO.swap + ' Replace in warranty</button>' : '') + '</div></div></div></div>';
  /* other components of the set */
  var set = wByInstall(w.install_id);
  h += '<div class="card" style="margin-top:16px"><h3>Components of this installation <span class="sm2">each has its own serial and warranty</span></h3><table class="dt"><thead><tr><th>Component</th><th>Serial</th><th>Model</th><th>Valid till</th><th class="n">Balance</th><th>Status</th></tr></thead><tbody>' +
    set.map(function (x) { var sx = wStatus(x); return '<tr class="clk' + (x.serial_no === w.serial_no ? '" style="background:var(--brand-lt)' : '') + '" onclick="location.hash=\'#/w/search?sn=' + encodeURIComponent(x.serial_no) + '\'"><td>' + catTag(x.category) + '</td><td class="mono"><b>' + esc(x.serial_no) + '</b></td><td>' + esc(modelName(x.model_id)) + '</td><td>' + dmy(x.end_date) + '</td><td class="n">' + ((sx.k === 'active' || sx.k === 'expiring') ? sx.days + ' d' : '—') + '</td><td><span class="tag ' + sx.cls + '">' + sx.txt + '</span></td></tr>'; }).join('') + '</tbody></table></div>';
  /* history */
  var ev = [];
  ev.push({ d: w.registered_on, t: 'Warranty registered', s: 'by ' + (w.registered_by || '') + ' · valid till ' + dmy(w.end_date), c: 'g' });
  DB.where('complaint_item', function (ci) { return ci.serial_no === sn; }).forEach(function (ci) { var c = DB.get('complaint', ci.complaint_id); if (c) ev.push({ d: c.call_date, t: 'Service call ' + c.complaint_no, s: (ci.fault_reported || c.complaint_text) + ' · ' + c.status, c: 'a', go: '#/s/call/' + c.complaint_id }); });
  DB.where('replacement_item', function (ri) { return ri.old_serial_no === sn || ri.new_serial_no === sn; }).forEach(function (ri) { var r = DB.get('replacement', ri.repl_id); if (r) ev.push({ d: r.repl_date, t: 'Replacement ' + r.repl_no, s: ri.old_serial_no + ' → ' + ri.new_serial_no, c: 'a' }); });
  ev.sort(function (x, y) { return String(y.d).localeCompare(String(x.d)); });
  h += '<div class="card"><h3>History</h3><div class="cbody"><div class="tl">' + ev.map(function (e) { return '<div class="ti ' + (e.c || '') + '"><b>' + (e.go ? '<a href="' + e.go + '">' + esc(e.t) + '</a>' : esc(e.t)) + '</b><span>' + dmy(String(e.d).slice(0, 10)) + ' · ' + esc(e.s) + '</span></div>'; }).join('') + '</div></div></div>';
  return h;
}

/* ============================================================
   REPLACEMENT FLOW (IN WARRANTY)  - dealer / HO
   ============================================================ */
ROUTES['w/replace'] = function (a, q) {
  var rows = Q.repl().filter(function (r) { return r.source === 'Dealer'; });
  return {
    title: 'Replacement Flow (In Warranty)', crumb: 'Home › Warranty › <b>Replacement</b>', sub: 'Replace a faulty unit with a new serial — the balance warranty moves to the new unit',
    body: '<div class="card"><div class="cbody"><div class="repl-grid">' +
      '<div class="rbox"><div class="rh">1 · Faulty unit (in warranty)</div><input id="rpOld" class="big-in" placeholder="Scan / type the OLD serial number" value="' + esc(q.old || '') + '" list="dl_allsn2" autocomplete="off"><div id="rpOldRes" class="rres"></div></div>' +
      '<div class="rarrow">' + ICO.arrow.replace(/width="14" height="14"/, 'width="30" height="30"') + '</div>' +
      '<div class="rbox"><div class="rh">2 · Replacement unit (new sticker)</div><input id="rpNew" class="big-in" placeholder="Scan / type the NEW serial number" list="dl_unreg3" autocomplete="off"><div id="rpNewRes" class="rres"></div></div></div>' +
      '<datalist id="dl_allsn2">' + Q.warranty().filter(function (w) { return wStatus(w).k === 'active' || wStatus(w).k === 'expiring'; }).slice(0, 300).map(function (w) { return '<option value="' + esc(w.serial_no) + '">'; }).join('') + '</datalist>' +
      '<datalist id="dl_unreg3">' + DB.all('sticker').filter(function (s) { return s.status === 'Generated' || s.status === 'Printed'; }).slice(0, 200).map(function (s) { return '<option value="' + esc(s.serial_no) + '">' + esc(catLabel(s.category) + ' · ' + modelName(s.model_id)) + '</option>'; }).join('') + '</datalist>' +
      '<div class="frm" style="margin-top:12px"><div class="f full"><label>Reason for replacement</label><input id="rpReason" placeholder="e.g. Motor winding burnt, controller dead on arrival…"></div></div>' +
      '<div style="margin-top:12px;text-align:right"><button class="btn pri" id="rpGo" onclick="doReplace()">' + ICO.swap + ' Replace &amp; transfer warranty</button></div></div></div>' +
      '<div class="card"><h3>Replacements done <span class="sm2">' + rows.length + '</span></h3><div id="rpList"></div></div>',
    after: function () {
      var f = function () { wrpCheck(); };
      $('#rpOld').addEventListener('input', f); $('#rpNew').addEventListener('input', f); wrpCheck();
      mountGrid('#rpList', {
        title: 'Replacements', rows: rows, sortI: 1, sortD: 'desc',
        cols: [
          { h: 'Replacement No', val: function (r) { return r.repl_no; }, cell: function (r) { return '<b>' + esc(r.repl_no) + '</b>'; } },
          { h: 'Date', val: function (r) { return r.repl_date; }, cell: function (r) { return dmy(r.repl_date); } },
          { h: 'Old serial', val: function (r) { return (replItem(r) || {}).old_serial_no || ''; }, cell: function (r) { return '<span class="mono">' + esc((replItem(r) || {}).old_serial_no || '') + '</span>'; } },
          { h: 'New serial', val: function (r) { return (replItem(r) || {}).new_serial_no || ''; }, cell: function (r) { return '<span class="mono"><b>' + esc((replItem(r) || {}).new_serial_no || '') + '</b></span>'; } },
          { h: 'Component', val: function (r) { return (replItem(r) || {}).category || ''; }, cell: function (r) { return catTag((replItem(r) || {}).category); } },
          { h: 'Customer', val: function (r) { var it = replItem(r) || {}, w = wBySerial(it.old_serial_no); return w ? custName(w.customer_id) : ''; } },
          { h: 'Dealer', val: function (r) { return dealerName(r.dealer_id); } },
          { h: 'Balance days', val: function (r) { return (replItem(r) || {}).warranty_days_left || 0; }, cls: 'n' },
          { h: 'Reason', val: function (r) { return r.reason || ''; }, cls: 'mu el' }
        ],
        actions: function (r, i) { return '<button class="ract del" data-ra="del" data-ri="' + i + '" title="Delete / undo replacement">' + ICO.trash + '</button>'; },
        onAction: function (act, r) { if (act === 'del') undoReplacement(r); }
      });
    }
  };
};
function replItem(r) { return DB.find('replacement_item', function (i) { return i.repl_id === r.repl_id; }); }
function wrpCheck() {
  var o = $('#rpOld').value.trim(), n = $('#rpNew').value.trim(), ok = true;
  var ob = $('#rpOldRes'), nb = $('#rpNewRes'), ow = null, ns = null;
  if (!o) { ob.innerHTML = ''; ok = false; }
  else {
    var st = stickerBySerial(o); ow = wBySerial(o);
    if (!st) { ob.innerHTML = '<div class="verdict bad sm">✗ Not authenticated — serial not in the sticker register</div>'; ok = false; }
    else if (!ow) { ob.innerHTML = '<div class="verdict bad sm">✗ This product is not registered, so it has no warranty to replace. <a href="javascript:void(0)" onclick="openRegistration({sn:\'' + esc(o) + '\'})">Register it first</a></div>'; ok = false; }
    else {
      var s = wStatus(ow);
      if (ROLE() === 'DEALER' && ow.dealer_id !== APP.user.id) { ob.innerHTML = '<div class="verdict bad sm">✗ This unit was sold by another dealer</div>'; ok = false; }
      else if (s.k === 'replaced') { ob.innerHTML = '<div class="verdict bad sm">✗ Already replaced earlier</div>'; ok = false; }
      else if (s.k === 'expired' || s.k === 'void') { ob.innerHTML = '<div class="verdict bad sm">✗ Warranty ' + s.txt.toLowerCase() + ' on ' + dmy(ow.end_date) + ' — cannot be replaced in warranty</div>'; ok = false; }
      else ob.innerHTML = '<div class="verdict good sm">✓ In warranty · ' + esc(catLabel(ow.category)) + ' · ' + esc(modelName(ow.model_id)) + ' · ' + esc(custName(ow.customer_id)) + ' · <b>' + s.days + ' days balance</b> (till ' + dmy(ow.end_date) + ')</div>';
    }
  }
  if (!n) { nb.innerHTML = ''; ok = false; }
  else {
    ns = serialCheck(n);
    if (ns.lvl !== 'ok') { nb.innerHTML = '<div class="verdict bad sm">✗ ' + esc(ns.msg) + '</div>'; ok = false; }
    else if (ow && ns.st.category !== ow.category) { nb.innerHTML = '<div class="verdict bad sm">✗ This is a ' + catLabel(ns.st.category).toLowerCase() + ' — the faulty unit is a ' + catLabel(ow.category).toLowerCase() + '</div>'; ok = false; }
    else {
      var om = ow ? DB.get('product_model', ow.model_id) : null, warn = (om && ns.m && om.hp !== ns.m.hp) ? '<div style="color:var(--warn);margin-top:3px">⚠ Rating differs: ' + om.hp + ' HP → ' + ns.m.hp + ' HP</div>' : '';
      nb.innerHTML = '<div class="verdict good sm">✓ Authentic · ' + esc(catLabel(ns.st.category)) + ' · ' + esc(ns.m ? ns.m.model_name : '') + ' · available for registration' + warn + '</div>';
    }
  }
  $('#rpGo').disabled = !ok;
}
function doReplace() {
  var o = $('#rpOld').value.trim(), n = $('#rpNew').value.trim();
  var r = replaceInWarranty({ oldSn: o, newSn: n, reason: $('#rpReason').value.trim(), source: 'Dealer', dealerId: ROLE() === 'DEALER' ? APP.user.id : (wBySerial(o) || {}).dealer_id });
  if (typeof r === 'string') return toast(r, 'err');
  toast('Replaced ' + o + ' with ' + n + ' — ' + r.it.warranty_days_left + ' days of warranty carried over', 'ok');
  route(true);
}
/** core replacement transaction */
function replaceInWarranty(o) {
  var ow = wBySerial(o.oldSn), ns = serialCheck(o.newSn);
  if (!ow) return 'The old serial is not registered';
  if (ROLE() === 'DEALER' && ow.dealer_id !== APP.user.id) return 'This unit was sold by another dealer — you can only replace your own sales';
  if (String(o.oldSn).trim() === String(o.newSn).trim()) return 'Old and new serial numbers are the same';
  var s = wStatus(ow); if (s.k !== 'active' && s.k !== 'expiring') return 'The old unit is not in warranty (' + s.txt.toLowerCase() + ')';
  if (ns.lvl !== 'ok') return ns.msg;
  if (ns.st.category !== ow.category) return 'The replacement must be a ' + catLabel(ow.category).toLowerCase();
  var days = daysBetween(today(), ow.end_date), cust = DB.get('customer', ow.customer_id), oldM = DB.get('product_model', ow.model_id);
  var rep = DB.add('replacement', {
    repl_no: DB.nextNo('REPL', 'REP/{n}/{fy}'), repl_date: today(), source: o.source || 'Dealer', complaint_id: o.complaintId || null, dealer_id: o.dealerId || ow.dealer_id || null,
    voucher_type: 'With Serial No', warranty_status: 'In Warranty', dealer_invoice_no: null, receipt_date: today(), replacement_type: o.type || 'Invoice', make_sales_invoice: 0, no_of_articles: 1,
    reason: o.reason || null, status: 'Closed', created_by: myName(), created_on: nowIso()
  }, true);
  var it = DB.add('replacement_item', {
    repl_id: rep.repl_id, line_no: 1, category: ow.category, invoice_item: ns.m ? ns.m.model_name : '', received_item: oldM ? oldM.model_name : '', old_serial_no: ow.serial_no, new_serial_no: ns.st.serial_no,
    qty: 1, net_value: 0, location: 'Greater Noida HO', warranty_days_left: days, charges: 0, remarks: o.reason || null
  }, true);
  ow.status = 'Replaced'; var oldSt = DB.get('sticker', ow.sticker_id); if (oldSt) oldSt.status = 'Replaced';
  var nw = DB.add('warranty', {
    warranty_no: DB.nextNo('WARRANTY', 'WR/{fy}/{n:5}'), install_id: ow.install_id, serial_no: ns.st.serial_no, sticker_id: ns.st.sticker_id, category: ow.category, model_id: ns.st.model_id,
    customer_id: ow.customer_id, dealer_id: ow.dealer_id, start_date: today(), warranty_months: Math.max(1, Math.round(days / 30.44)), extended_months: 0, end_date: ow.end_date,
    status: 'Active', replaced_from_serial: ow.serial_no, registered_by: o.source === 'Service' ? 'HO' : 'Dealer', registered_on: nowIso(), whatsapp_sent: 1, remarks: 'Balance warranty carried from ' + ow.serial_no
  }, true);
  ns.st.status = 'Registered';
  DB.log('Replaced', 'replacement', rep.repl_no, ow.serial_no + ' → ' + ns.st.serial_no);
  if (cust) notify({ channel: 'WhatsApp', to: cust.mobile, tpl: 'REPLACEMENT', msg: MSG.replacement(rep, it), refType: 'replacement', refNo: rep.repl_no });
  DB.save();
  return { rep: rep, it: it, nw: nw };
}
function undoReplacement(r) {
  var it = replItem(r); if (!it) return;
  confirmDo('Delete replacement ' + esc(r.repl_no) + '?', 'The old unit <b class="mono">' + esc(it.old_serial_no) + '</b> becomes active again and the new serial <b class="mono">' + esc(it.new_serial_no) + '</b> is released for registration.', 'Undo replacement', function () {
    var nw = wBySerial(it.new_serial_no);
    if (nw && DB.where('complaint_item', function (ci) { return ci.serial_no === nw.serial_no; }).length) { toast('The new serial already has service calls — cannot undo', 'err'); return; }
    warrantyUntransfer(it);
    DB.where('replacement_item', function (i) { return i.repl_id === r.repl_id; }).forEach(function (i) { DB.del('replacement_item', i.ritem_id, true); });
    DB.del('replacement', r.repl_id); DB.save(); route(true); toast('Replacement undone', 'ok');
  }, true);
}
