/* ============================================================
   MASTERS  -  every master has New / Edit / Delete (guarded) and Excel import
   ============================================================ */
'use strict';

var CATEGORIES = ['PUMP', 'MOTOR', 'CONTROLLER'], SPARE_CATS = ['PUMP', 'MOTOR', 'CONTROLLER', 'COMMON'], LABOUR_CATS = ['PUMP', 'MOTOR', 'CONTROLLER', 'COMMON', 'SITE'];
function masterPage(key, crumb, extra) { var p = entityScreen(key); p.crumb = 'Home › Masters › <b>' + crumb + '</b>'; if (extra) Object.assign(p, extra(p)); return p; }
function boolDefault(o, k, v) { if (o[k] == null) o[k] = v; return o; }
function rateOf(table, id, f) { var r = DB.get(table, id); return r ? r[f || 'rate'] : 0; }
function usedInJobcards(type, id) { return DB.where('jobcard_item', function (i) { return i.item_type === type && i.item_id === id; }).length; }

/* ---------------- company profile (single record: edit only) ---------------- */
ROUTES['m/company'] = function () {
  var c = CO(), f = [
    { k: 'company_name', l: 'Company name', req: 1, full: 1 }, { k: 'tagline', l: 'Tag line', full: 1 }, { k: 'address', l: 'Address', req: 1, full: 1 },
    { k: 'city', l: 'City', req: 1 }, { k: 'state', l: 'State', req: 1 }, { k: 'pincode', l: 'Pin code', pattern: /^\d{6}$/, patMsg: 'Pin code must be 6 digits' },
    { k: 'gstin', l: 'GSTIN', pattern: /^[0-9A-Z]{15}$/, patMsg: 'GSTIN must be 15 characters' }, { k: 'phone', l: 'Phone' }, { k: 'toll_free', l: 'Toll-free / customer care no.', hint: 'Shown on warranty cards and WhatsApp messages' },
    { k: 'email', l: 'E-mail', type: 'email' }, { k: 'website', l: 'Website' }, { k: 'whatsapp_sender', l: 'WhatsApp sender number' },
    { k: 'warranty_terms', l: 'Warranty terms (printed on the digital warranty card)', type: 'area', rows: 8, full: 1 }
  ];
  window._coFields = f;
  return {
    title: 'Company Profile', crumb: 'Home › Masters › <b>Company Profile</b>', sub: 'One record. Name, address, GSTIN and helpline appear on warranty cards, job cards and every WhatsApp message.',
    actions: '<button class="btn pri" onclick="companySave()">' + ICO.save + ' Save changes</button>',
    body: '<div class="grid2" style="grid-template-columns:2fr 1fr;align-items:start"><div class="card" style="margin:0"><div class="cbody">' + formHtml(f, c, 'co_', 3) + '</div></div>' +
      '<div class="card" style="margin:0"><h3>Logo &amp; preview</h3><div class="cbody"><img src="solartive-logo.png" style="max-width:100%;height:auto;margin-bottom:12px"><div class="hint">The logo is placed on printed cards and job cards.</div>' +
      '<div class="note" style="margin-top:12px">Single-record master: it can be edited but not added to or deleted, because every document refers to it.</div></div></div></div>'
  };
};
function companySave() {
  var r = collectForm(window._coFields, 'co_', null, null); if (r.err) return toast(r.err, 'err');
  DB.upd('company_profile', CO().company_id, r.v); DB.save(); route(true); toast('Company profile saved', 'ok');
}

/* ---------------- product models ---------------- */
defEntity({
  key: 'model', table: 'product_model', title: 'Product Model', plural: 'Product Models (Pump · Motor · Controller)', refLabel: function (r) { return r.model_code; }, softOff: 'Active',
  sub: function (rows) { return inr(rows.length) + ' models · each component of a solar submersible set has its own model, HP and warranty period'; },
  formCols: 3, wide: 1, searchPh: 'Search model code or name…', search: function (r) { return [r.model_code, r.model_name, r.technology, r.category].join(' '); }, sortI: 2, sortD: 'asc',
  filters: [{ label: 'Component', get: function (r) { return catLabel(r.category); } }, { label: 'HP', get: function (r) { return r.hp ? r.hp + ' HP' : ''; } }, { label: 'Status', get: function (r) { return r.is_active == 1 ? 'Active' : 'Inactive'; } }],
  defaults: function () { return { category: 'PUMP', warranty_months: 24, is_active: 1 }; },
  fields: [
    { k: 'model_code', l: 'Model code', req: 1, unique: 1 }, { k: 'model_name', l: 'Model name', req: 1 }, { k: 'category', l: 'Component', type: 'select', req: 1, opts: CATEGORIES.map(function (c) { return { v: c, l: catLabel(c) }; }) },
    { k: 'hp', l: 'HP', type: 'num', min: 0 }, { k: 'kw', l: 'kW', type: 'num', min: 0 }, { k: 'technology', l: 'Technology' },
    { k: 'voltage_range', l: 'Voltage range' }, { k: 'head_range', l: 'Head range' }, { k: 'discharge', l: 'Discharge' }, { k: 'size_inch', l: 'Size (inch)' },
    { k: 'warranty_months', l: 'Warranty (months)', type: 'num', req: 1, min: 1, max: 120, hint: 'Default for this component; a dealer can override' },
    { k: 'is_active', l: 'Active', type: 'check' }, { k: 'description', l: 'Description', type: 'area', full: 1 }
  ],
  cols: [
    { h: 'Model code', val: function (r) { return r.model_code; }, cell: function (r) { return '<b>' + esc(r.model_code) + '</b>'; } }, { h: 'Model name', val: function (r) { return r.model_name; } },
    { h: 'Component', val: function (r) { return catLabel(r.category); }, cell: function (r) { return catTag(r.category); } }, { h: 'HP', val: function (r) { return r.hp || 0; }, cls: 'n' }, { h: 'Technology', val: function (r) { return r.technology || ''; }, cls: 'mu el' },
    { h: 'Voltage', val: function (r) { return r.voltage_range || ''; }, cls: 'mu' }, { h: 'Warranty', val: function (r) { return r.warranty_months; }, cls: 'n', cell: function (r) { return r.warranty_months + ' m'; } },
    { h: 'Serials', val: function (r) { return DB.where('sticker', function (s) { return s.model_id === r.model_id; }).length; }, cls: 'n' }, { h: 'Status', val: function (r) { return r.is_active == 1 ? 'Active' : 'Inactive'; }, cell: function (r) { return activeTag(r.is_active); } }
  ],
  imp: {
    key: 'model_code',
    cols: [
      { h: 'Model Code', k: 'model_code', req: 1, sample: 'SSP-30-DC' }, { h: 'Model Name', k: 'model_name', req: 1, sample: 'Solartive SolarFlow 3 HP DC Submersible Pump (4")' },
      { h: 'Component', k: 'category', req: 1, enumv: CATEGORIES, upper: 1, sample: 'PUMP', note: 'PUMP / MOTOR / CONTROLLER' }, { h: 'HP', k: 'hp', type: 'num', sample: 3 }, { h: 'kW', k: 'kw', type: 'num', sample: 2.2 },
      { h: 'Technology', k: 'technology', sample: 'Multistage centrifugal, DC' }, { h: 'Voltage Range', k: 'voltage_range', sample: '150 - 380 V DC' }, { h: 'Head Range', k: 'head_range', sample: '40 - 100 m' },
      { h: 'Discharge', k: 'discharge', sample: '60,000 - 95,000 L/day' }, { h: 'Size Inch', k: 'size_inch', sample: '4"' }, { h: 'Warranty Months', k: 'warranty_months', type: 'int', sample: 24 }, { h: 'Active', k: 'is_active', type: 'bool', sample: 'Yes' }
    ],
    make: function (o) { boolDefault(o, 'is_active', 1); boolDefault(o, 'warranty_months', 24); o.created_on = nowIso(); return o; }
  }
});
ROUTES['m/models'] = function () { return masterPage('model', 'Product Models'); };

/* ---------------- spares (with rate history) ---------------- */
var _spChg = null;
defEntity({
  key: 'spare', table: 'spare_master', title: 'Spare', plural: 'Spares & Rates', refLabel: function (r) { return r.spare_code; }, softOff: 'Active',
  sub: function (rows) { return inr(rows.length) + ' spares · a rate change is kept in the rate history; job cards pick the current rate'; },
  formCols: 3, wide: 1, searchPh: 'Search spare code or name…', search: function (r) { return [r.spare_code, r.spare_name, r.hsn, r.category].join(' '); }, sortI: 0, sortD: 'asc',
  filters: [{ label: 'Category', get: function (r) { return catLabel(r.category); } }, { label: 'Status', get: function (r) { return r.is_active == 1 ? 'Active' : 'Inactive'; } }],
  defaults: function () { return { category: 'PUMP', uom: 'Nos', gst_pct: 18, min_stock: 0, is_active: 1, effective_from: today() }; },
  fields: [
    { k: 'spare_code', l: 'Spare code', req: 1, unique: 1 }, { k: 'spare_name', l: 'Spare name', req: 1 }, { k: 'category', l: 'Category', type: 'select', req: 1, opts: SPARE_CATS.map(function (c) { return { v: c, l: catLabel(c) }; }) },
    { k: 'uom', l: 'Unit', req: 1 }, { k: 'hsn', l: 'HSN code' }, { k: 'gst_pct', l: 'GST %', type: 'num', req: 1, min: 0, max: 28 },
    { k: 'rate', l: 'Rate ₹', type: 'num', req: 1, min: 0 }, { k: 'effective_from', l: 'Rate effective from', type: 'date' }, { k: 'min_stock', l: 'Minimum stock', type: 'num', min: 0 },
    { k: 'is_active', l: 'Active', type: 'check' }, { k: 'description', l: 'Description', type: 'area', full: 1 }
  ],
  before: function (v, row) { _spChg = { isNew: !row, changed: row ? row.rate !== v.rate : true }; },
  after: function (saved) {
    if (_spChg && (_spChg.isNew || _spChg.changed)) add_rate(saved);
    _spChg = null;
  },
  cascade: [{ table: 'spare_rate_history', fk: 'spare_id', label: 'rate history' }],
  guard: function (r) { var n = usedInJobcards('Spare', r.spare_id); return n ? 'it is used on ' + n + ' job card line(s). Mark it inactive instead.' : null; },
  rowActions: function () { return [{ a: 'hist', t: 'Rate history', i: ICO.clock }]; },
  onAction: function (a, r) { if (a === 'hist') rateHistory(r); },
  cols: [
    { h: 'Spare code', val: function (r) { return r.spare_code; }, cell: function (r) { return '<b>' + esc(r.spare_code) + '</b>'; } }, { h: 'Spare name', val: function (r) { return r.spare_name; } },
    { h: 'Category', val: function (r) { return catLabel(r.category); }, cell: function (r) { return catTag(r.category); } }, { h: 'HSN', val: function (r) { return r.hsn || ''; }, cls: 'mu' },
    { h: 'Unit', val: function (r) { return r.uom; } }, { h: 'Rate ₹', val: function (r) { return r.rate; }, cls: 'n', cell: function (r) { return '<b>' + inr(r.rate, 2) + '</b>'; } }, { h: 'GST %', val: function (r) { return r.gst_pct; }, cls: 'n' },
    { h: 'Min stock', val: function (r) { return r.min_stock; }, cls: 'n' }, { h: 'Rate from', val: function (r) { return r.effective_from || ''; }, cell: function (r) { return dmy(r.effective_from); } },
    { h: 'Status', val: function (r) { return r.is_active == 1 ? 'Active' : 'Inactive'; }, cell: function (r) { return activeTag(r.is_active); } }
  ],
  imp: {
    key: 'spare_code',
    cols: [
      { h: 'Spare Code', k: 'spare_code', req: 1, sample: 'SP-PMP-001' }, { h: 'Spare Name', k: 'spare_name', req: 1, sample: 'Pump impeller set' }, { h: 'Category', k: 'category', req: 1, enumv: SPARE_CATS, upper: 1, sample: 'PUMP', note: 'PUMP / MOTOR / CONTROLLER / COMMON' },
      { h: 'Unit', k: 'uom', sample: 'Nos' }, { h: 'HSN', k: 'hsn', sample: '84139190' }, { h: 'GST %', k: 'gst_pct', type: 'num', sample: 18 }, { h: 'Rate', k: 'rate', type: 'num', req: 1, sample: 1850 },
      { h: 'Rate Effective From', k: 'effective_from', type: 'date', sample: '2026-04-01' }, { h: 'Min Stock', k: 'min_stock', type: 'int', sample: 5 }, { h: 'Active', k: 'is_active', type: 'bool', sample: 'Yes' }
    ],
    make: function (o) { boolDefault(o, 'uom', 'Nos'); boolDefault(o, 'gst_pct', 18); boolDefault(o, 'min_stock', 0); boolDefault(o, 'is_active', 1); if (!o.effective_from) o.effective_from = today(); return o; },
    makeUpdate: function (o, r) {
      var p = {}; for (var k in o) if (o[k] != null) p[k] = o[k];          /* blank cells keep the saved value */
      if (p.rate != null && +p.rate !== +r.ex.rate) { p.effective_from = p.effective_from || today(); add_rate({ spare_id: r.ex.spare_id, rate: p.rate, effective_from: p.effective_from }); }   /* rate change -> history row */
      else delete p.effective_from;
      return p;
    },
    after: function (made) { made.forEach(add_rate); }
  }
});
function add_rate(sp) { DB.add('spare_rate_history', { spare_id: sp.spare_id, rate: sp.rate, effective_from: sp.effective_from || today(), changed_by: myName(), changed_on: nowIso() }, true); }
ROUTES['m/spares'] = function () { return masterPage('spare', 'Spares & Rates'); };
function rateHistory(sp) {
  var rows = DB.where('spare_rate_history', function (h) { return h.spare_id === sp.spare_id; }).sort(function (a, b) { return String(b.effective_from).localeCompare(a.effective_from) || b.rate_id - a.rate_id; });
  modal('Rate history — ' + esc(sp.spare_code), '<div class="hint" style="margin-bottom:8px">' + esc(sp.spare_name) + ' · current rate <b>₹ ' + inr(sp.rate, 2) + '</b></div><table class="dt"><thead><tr><th>Effective from</th><th class="n">Rate ₹</th><th>Changed by</th><th>Changed on</th><th></th></tr></thead><tbody>' +
    (rows.map(function (h) { return '<tr><td>' + dmy(h.effective_from) + '</td><td class="n">' + inr(h.rate, 2) + '</td><td>' + esc(h.changed_by || '') + '</td><td>' + dmyT(h.changed_on) + '</td><td><button class="ract del" onclick="rateDel(' + h.rate_id + ',' + sp.spare_id + ')" title="Delete">' + ICO.trash + '</button></td></tr>'; }).join('') || '<tr><td colspan="5" class="muted">No history</td></tr>') + '</tbody></table>', '<button class="btn" onclick="closeModal()">Close</button>', 'narrow sticky');
}
function rateDel(id, spId) { DB.del('spare_rate_history', id); DB.save(); rateHistory(DB.get('spare_master', spId)); }

/* ---------------- labour ---------------- */
defEntity({
  key: 'labour', table: 'labour_master', title: 'Labour Charge', plural: 'Labour / Service Charges', refLabel: function (r) { return r.labour_code; }, softOff: 'Active',
  sub: function (rows) { return inr(rows.length) + ' charge heads used on job cards'; }, formCols: 3, wide: 1, searchPh: 'Search code or name…', search: function (r) { return [r.labour_code, r.labour_name, r.category].join(' '); },
  filters: [{ label: 'Category', get: function (r) { return r.category || ''; } }, { label: 'Status', get: function (r) { return r.is_active == 1 ? 'Active' : 'Inactive'; } }],
  defaults: function () { return { category: 'SITE', gst_pct: 18, is_active: 1, effective_from: today() }; },
  fields: [
    { k: 'labour_code', l: 'Code', req: 1, unique: 1 }, { k: 'labour_name', l: 'Charge / work description', req: 1 }, { k: 'category', l: 'Category', type: 'select', opts: LABOUR_CATS },
    { k: 'rate', l: 'Rate ₹', type: 'num', req: 1, min: 0 }, { k: 'gst_pct', l: 'GST %', type: 'num', req: 1, min: 0, max: 28 }, { k: 'effective_from', l: 'Effective from', type: 'date' },
    { k: 'is_active', l: 'Active', type: 'check' }, { k: 'description', l: 'Remarks', type: 'area', full: 1 }
  ],
  guard: function (r) { var n = usedInJobcards('Labour', r.labour_id); return n ? 'it is used on ' + n + ' job card line(s). Mark it inactive instead.' : null; },
  cols: [
    { h: 'Code', val: function (r) { return r.labour_code; }, cell: function (r) { return '<b>' + esc(r.labour_code) + '</b>'; } }, { h: 'Charge', val: function (r) { return r.labour_name; } }, { h: 'Category', val: function (r) { return r.category || ''; } },
    { h: 'Rate ₹', val: function (r) { return r.rate; }, cls: 'n', cell: function (r) { return '<b>' + inr(r.rate, 2) + '</b>'; } }, { h: 'GST %', val: function (r) { return r.gst_pct; }, cls: 'n' }, { h: 'From', val: function (r) { return r.effective_from || ''; }, cell: function (r) { return dmy(r.effective_from); } },
    { h: 'Status', val: function (r) { return r.is_active == 1 ? 'Active' : 'Inactive'; }, cell: function (r) { return activeTag(r.is_active); } }
  ],
  imp: {
    key: 'labour_code',
    cols: [{ h: 'Code', k: 'labour_code', req: 1, sample: 'LB-009' }, { h: 'Charge Name', k: 'labour_name', req: 1, sample: 'Panel cleaning & alignment' }, { h: 'Category', k: 'category', enumv: LABOUR_CATS, upper: 1, sample: 'SITE' },
      { h: 'Rate', k: 'rate', type: 'num', req: 1, sample: 700 }, { h: 'GST %', k: 'gst_pct', type: 'num', sample: 18 }, { h: 'Effective From', k: 'effective_from', type: 'date', sample: '2026-04-01' }, { h: 'Active', k: 'is_active', type: 'bool', sample: 'Yes' }],
    make: function (o) { boolDefault(o, 'gst_pct', 18); boolDefault(o, 'is_active', 1); if (!o.effective_from) o.effective_from = today(); return o; }
  }
});
ROUTES['m/labour'] = function () { return masterPage('labour', 'Labour / Service Charges'); };

/* ---------------- faults ---------------- */
defEntity({
  key: 'fault', table: 'fault_master', title: 'Fault', plural: 'Fault Master', refLabel: function (r) { return r.fault_name; }, softOff: 'Active',
  sub: function (rows) { return inr(rows.length) + ' faults · picked on the job card to record what was found'; }, searchPh: 'Search fault…', search: function (r) { return [r.fault_name, r.default_nature, r.category].join(' '); },
  filters: [{ label: 'Component', get: function (r) { return catLabel(r.category); } }, { label: 'Status', get: function (r) { return r.is_active == 1 ? 'Active' : 'Inactive'; } }],
  defaults: function () { return { category: 'PUMP', is_active: 1 }; },
  fields: [{ k: 'category', l: 'Component', type: 'select', req: 1, opts: CATEGORIES.map(function (c) { return { v: c, l: catLabel(c) }; }) }, { k: 'fault_name', l: 'Fault', req: 1 }, { k: 'default_nature', l: 'Nature of fault / what to check', type: 'area', full: 1 }, { k: 'is_active', l: 'Active', type: 'check' }],
  cols: [{ h: 'Component', val: function (r) { return catLabel(r.category); }, cell: function (r) { return catTag(r.category); } }, { h: 'Fault', val: function (r) { return r.fault_name; }, cell: function (r) { return '<b>' + esc(r.fault_name) + '</b>'; } },
    { h: 'Nature', val: function (r) { return r.default_nature || ''; }, cls: 'mu el' }, { h: 'Used on job cards', val: function (r) { return DB.where('jobcard_fault', function (f) { return f.fault_id === r.fault_id; }).length; }, cls: 'n' }, { h: 'Status', val: function (r) { return r.is_active == 1 ? 'Active' : 'Inactive'; }, cell: function (r) { return activeTag(r.is_active); } }],
  imp: { cols: [{ h: 'Component', k: 'category', req: 1, enumv: CATEGORIES, upper: 1, sample: 'PUMP' }, { h: 'Fault', k: 'fault_name', req: 1, sample: 'Low discharge / low head' }, { h: 'Nature', k: 'default_nature', sample: 'Water output below rated' }, { h: 'Active', k: 'is_active', type: 'bool', sample: 'Yes' }],
    check: function (o) { return DB.find('fault_master', function (f) { return f.category === o.category && f.fault_name.toLowerCase() === String(o.fault_name).toLowerCase(); }) ? 'This fault already exists for ' + catLabel(o.category) : null; },
    make: function (o) { boolDefault(o, 'is_active', 1); return o; } }
});
ROUTES['m/faults'] = function () { return masterPage('fault', 'Fault Master'); };

/* ---------------- call types ---------------- */
defEntity({
  key: 'calltype', table: 'call_type', title: 'Call Type', plural: 'Call Types & Valid Days', refLabel: function (r) { return r.call_type; }, softOff: 'Active',
  sub: function (rows) { return inr(rows.length) + ' call types · due date of a call = call date + valid days'; }, search: function (r) { return r.call_type + ' ' + (r.description || ''); }, searchPh: 'Search call type…',
  defaults: function () { return { valid_days: 3, is_warranty: 0, is_active: 1 }; },
  fields: [{ k: 'call_type', l: 'Call type', req: 1, unique: 1, full: 1 }, { k: 'valid_days', l: 'Valid days (SLA)', type: 'num', req: 1, min: 1, max: 365, hint: 'Calls older than this are shown as overdue' },
    { k: 'is_warranty', l: 'Warranty call (cost borne by company)', type: 'check' }, { k: 'is_active', l: 'Active', type: 'check' }, { k: 'description', l: 'Description', type: 'area', full: 1 }],
  cols: [{ h: 'Call type', val: function (r) { return r.call_type; }, cell: function (r) { return '<b>' + esc(r.call_type) + '</b>'; } }, { h: 'Valid days', val: function (r) { return r.valid_days; }, cls: 'n' },
    { h: 'Warranty call', val: function (r) { return r.is_warranty == 1 ? 'Yes' : 'No'; }, cell: function (r) { return yesno(r.is_warranty); } }, { h: 'Description', val: function (r) { return r.description || ''; }, cls: 'mu el' },
    { h: 'Calls', val: function (r) { return DB.where('complaint', function (c) { return c.calltype_id === r.calltype_id; }).length; }, cls: 'n' }, { h: 'Status', val: function (r) { return r.is_active == 1 ? 'Active' : 'Inactive'; }, cell: function (r) { return activeTag(r.is_active); } }],
  imp: { key: 'call_type', cols: [{ h: 'Call Type', k: 'call_type', req: 1, sample: 'Warranty Complaint' }, { h: 'Valid Days', k: 'valid_days', type: 'int', req: 1, sample: 3 }, { h: 'Warranty Call', k: 'is_warranty', type: 'bool', sample: 'Yes' }, { h: 'Description', k: 'description', sample: 'Fault under warranty' }, { h: 'Active', k: 'is_active', type: 'bool', sample: 'Yes' }],
    make: function (o) { boolDefault(o, 'is_warranty', 0); boolDefault(o, 'is_active', 1); return o; } }
});
ROUTES['m/calltypes'] = function () { return masterPage('calltype', 'Call Types & Valid Days'); };

/* ---------------- projects / schemes ---------------- */
defEntity({
  key: 'project', table: 'project', title: 'Project', plural: 'Projects / Schemes', refLabel: function (r) { return r.project_no; }, softOff: 'Status',
  sub: function (rows) { return inr(rows.length) + ' projects · installations and calls can be tagged to a project / scheme'; }, formCols: 3, wide: 1, search: function (r) { return [r.project_no, r.project_name, r.scheme].join(' '); }, searchPh: 'Search project…',
  filters: [{ label: 'Scheme', get: function (r) { return r.scheme || ''; } }, { label: 'Status', get: function (r) { return r.status; } }, { label: 'State', get: function (r) { return stateName(r.state_code); } }],
  defaults: function () { return { status: 'Active', start_date: today() }; },
  fields: [{ k: 'project_no', l: 'Project no.', req: 1, unique: 1 }, { k: 'project_name', l: 'Project name', req: 1 }, { k: 'scheme', l: 'Scheme' },
    { k: 'state_code', l: 'State', type: 'select', opts: stateOpts }, { k: 'start_date', l: 'Start date', type: 'date' }, { k: 'end_date', l: 'End date', type: 'date' },
    { k: 'status', l: 'Status', type: 'select', req: 1, opts: ['Active', 'On hold', 'Closed'] }, { k: 'remarks', l: 'Remarks', type: 'area', full: 1 }],
  validate: function (v) { return v.start_date && v.end_date && v.end_date < v.start_date ? 'End date cannot be before the start date' : null; },
  cols: [{ h: 'Project no', val: function (r) { return r.project_no; }, cell: function (r) { return '<b>' + esc(r.project_no) + '</b>'; } }, { h: 'Project', val: function (r) { return r.project_name; } }, { h: 'Scheme', val: function (r) { return r.scheme || ''; } },
    { h: 'State', val: function (r) { return stateName(r.state_code); } }, { h: 'Start', val: function (r) { return r.start_date || ''; }, cell: function (r) { return dmy(r.start_date); } }, { h: 'End', val: function (r) { return r.end_date || ''; }, cell: function (r) { return dmy(r.end_date); } },
    { h: 'Installations', val: function (r) { return DB.where('installation', function (i) { return i.project_id === r.project_id; }).length; }, cls: 'n' }, { h: 'Status', val: function (r) { return r.status; }, cell: function (r) { return statusTag(r.status); } }],
  imp: { key: 'project_no', cols: [{ h: 'Project No', k: 'project_no', req: 1, sample: 'KUSUM-UP-26' }, { h: 'Project Name', k: 'project_name', req: 1, sample: 'PM-KUSUM Component B - Uttar Pradesh 2026' }, { h: 'Scheme', k: 'scheme', sample: 'PM-KUSUM' },
    { h: 'State', k: 'state_code', lk: { t: 'state_master', f: ['state_name', 'short_name', 'state_code'] }, sample: 'Uttar Pradesh' }, { h: 'Start Date', k: 'start_date', type: 'date', sample: '2026-04-01' }, { h: 'End Date', k: 'end_date', type: 'date', sample: '' }, { h: 'Status', k: 'status', enumv: ['Active', 'On hold', 'Closed'], sample: 'Active' }],
    make: function (o, raw) { o.state_code = raw._state_code ? raw._state_code.state_code : null; boolDefault(o, 'status', 'Active'); return o; } }
});
ROUTES['m/projects'] = function () { return masterPage('project', 'Projects / Schemes'); };

/* ---------------- service centers ---------------- */
defEntity({
  key: 'center', table: 'service_center', title: 'Service Center', plural: 'Service Centers', refLabel: function (r) { return r.sc_name; }, softOff: 'Active',
  sub: function (rows) { return inr(rows.length) + ' service centers · calls are routed by state; stock is held per center'; }, formCols: 3, wide: 1, search: function (r) { return [r.sc_code, r.sc_name, r.city, r.district, r.contact_person].join(' '); }, searchPh: 'Search service center…',
  filters: [{ label: 'State', get: function (r) { return stateName(r.state_code); } }, { label: 'Status', get: function (r) { return r.is_active == 1 ? 'Active' : 'Inactive'; } }],
  defaults: function () { return { is_active: 1 }; },
  fields: [{ k: 'sc_code', l: 'Center code', req: 1, unique: 1 }, { k: 'sc_name', l: 'Center name', req: 1 }, { k: 'contact_person', l: 'Contact person' },
    { k: 'mobile', l: 'Mobile', type: 'tel', pattern: /^[6-9]\d{9}$/, patMsg: 'Enter a valid 10-digit mobile number' }, { k: 'email', l: 'E-mail', type: 'email' }, { k: 'gstin', l: 'GSTIN' },
    { k: 'address', l: 'Address', full: 1 }, { k: 'city', l: 'City' }, { k: 'state_code', l: 'State', type: 'select', req: 1, opts: stateOpts }, { k: 'district', l: 'District', suggest: { dep: 'state_code', fn: districtList } },
    { k: 'pincode', l: 'Pin code', pattern: /^\d{6}$/, patMsg: 'Pin code must be 6 digits' }, { k: 'is_active', l: 'Active', type: 'check' }],
  cols: [{ h: 'Code', val: function (r) { return r.sc_code || ''; }, cls: 'mono' }, { h: 'Service center', val: function (r) { return r.sc_name; }, cell: function (r) { return '<b>' + esc(r.sc_name) + '</b>'; } }, { h: 'Contact', val: function (r) { return r.contact_person || ''; } },
    { h: 'Mobile', val: function (r) { return r.mobile || ''; } }, { h: 'City', val: function (r) { return r.city || ''; } }, { h: 'State', val: function (r) { return stateName(r.state_code); } },
    { h: 'Engineers', val: function (r) { return DB.where('app_user', function (u) { return u.role === 'ENGINEER' && u.sc_id === r.sc_id; }).length; }, cls: 'n' },
    { h: 'Open calls', val: function (r) { return DB.where('complaint', function (c) { return c.sc_id === r.sc_id && callOpen(c); }).length; }, cls: 'n' }, { h: 'Status', val: function (r) { return r.is_active == 1 ? 'Active' : 'Inactive'; }, cell: function (r) { return activeTag(r.is_active); } }],
  imp: { key: 'sc_code', cols: [{ h: 'Center Code', k: 'sc_code', req: 1, sample: 'SC-PUN' }, { h: 'Center Name', k: 'sc_name', req: 1, sample: 'Pune Service Center' }, { h: 'Contact Person', k: 'contact_person', sample: 'Ajay Patil' }, { h: 'Mobile', k: 'mobile', sample: '9822012345', pattern: /^[6-9]\d{9}$/, patMsg: 'is not a valid mobile number' },
    { h: 'Email', k: 'email', sample: 'pune@solartive.example' }, { h: 'Address', k: 'address', sample: 'Bhosari MIDC' }, { h: 'City', k: 'city', sample: 'Pune' }, { h: 'District', k: 'district', sample: 'Pune' }, { h: 'State', k: 'state_code', req: 1, lk: { t: 'state_master', f: ['state_name', 'short_name', 'state_code'] }, sample: 'Maharashtra' }, { h: 'Pincode', k: 'pincode', sample: '411026' }],
    make: function (o, raw) { o.state_code = raw._state_code.state_code; o.is_active = 1; return o; } }
});
ROUTES['m/centers'] = function () { return masterPage('center', 'Service Centers'); };

/* ---------------- engineers + users ---------------- */
var FORM_GROUPS = [{ v: 'Warranty', l: 'Warranty' }, { v: 'Service', l: 'Service' }, { v: 'Stock', l: 'Stock' }, { v: 'Masters', l: 'Masters' }];
function userFields(engOnly) {
  var f = [{ k: 'first_name', l: 'First name', req: 1 }, { k: 'last_name', l: 'Last name' },
    { k: 'username', l: 'User name (login)', req: 1, unique: 1, hint: 'Used to sign in' }, { k: 'password', l: 'Password', req: 1, type: 'pwd', hint: 'Demo only — stored as a salted hash in production' },
    { k: 'phone', l: 'Mobile', type: 'tel', pattern: /^[6-9]\d{9}$/, patMsg: 'Enter a valid 10-digit mobile number' }, { k: 'email', l: 'E-mail', type: 'email' }];
  if (!engOnly) f.push({ k: 'role', l: 'Role', type: 'select', req: 1, opts: ['SUPER', 'HO', 'MANAGER', 'ENGINEER'] });
  f.push({ k: 'sc_id', l: 'Service center', type: 'select', lk: 1, opts: optsFrom('service_center', 'sc_name', function (s) { return s.is_active == 1; }), hint: 'Required for service managers and engineers' });
  f.push({ k: 'state_rights', l: 'State rights', type: 'multi', full: 1, opts: function () { return stateOpts().filter(function (s) { return ['09', '08', '23', '24', '06', '07', '05', '27', '03', '10'].indexOf(s.v) >= 0; }).concat(stateOpts().filter(function (s) { return ['09', '08', '23', '24', '06', '07', '05', '27', '03', '10'].indexOf(s.v) < 0; })); }, hint: 'Blank = all states. Data is limited to the ticked states.' });
  if (!engOnly) f.push({ k: 'form_rights', l: 'Menu rights (HO users)', type: 'multi', full: 1, opts: FORM_GROUPS, hint: 'Blank = all menus' });
  f.push({ k: 'address', l: 'Address', full: 1 });
  if (!engOnly) f.push({ k: 'is_admin', l: 'Administrator', type: 'check' });
  f.push({ k: 'is_active', l: 'Active', type: 'check' });
  return f;
}
function userGuard(r) { return APP.user && r.user_id === APP.user.id ? 'you cannot delete the user you are signed in as.' : (r.username === 'admin' ? 'the main administrator account cannot be deleted.' : null); }
function userCols(withRole) {
  var c = [{ h: 'User', val: function (r) { return userName(r.user_id); }, cell: function (r) { return '<b>' + esc(userName(r.user_id)) + '</b>'; } }, { h: 'Login', val: function (r) { return r.username; }, cls: 'mono' }];
  if (withRole) c.push({ h: 'Role', val: function (r) { return r.role; }, cell: function (r) { return tag(r.role, r.role === 'SUPER' ? 'dang' : r.role === 'HO' ? 'pur' : r.role === 'MANAGER' ? 'info' : 'acc'); } });
  c.push({ h: 'Service center', val: function (r) { return scName(r.sc_id); } }, { h: 'Mobile', val: function (r) { return r.phone || ''; } },
    { h: 'States', val: function (r) { return r.state_rights ? r.state_rights.split(',').map(stateShort).join(', ') : 'All'; }, cls: 'mu' });
  c.push({ h: 'Open calls', val: function (r) { return r.role === 'ENGINEER' ? DB.where('complaint', function (x) { return x.engineer_id === r.user_id && callOpen(x); }).length : 0; }, cls: 'n', cell: function (r) { return r.role === 'ENGINEER' ? DB.where('complaint', function (x) { return x.engineer_id === r.user_id && callOpen(x); }).length : '—'; } });
  c.push({ h: 'Status', val: function (r) { return r.is_active == 1 ? 'Active' : 'Inactive'; }, cell: function (r) { return activeTag(r.is_active); } });
  return c;
}
defEntity({
  key: 'engineer', table: 'app_user', title: 'Engineer', plural: 'Service Engineers', refLabel: function (r) { return userName(r.user_id); }, softOff: 'Active',
  rows: function () { return DB.where('app_user', function (u) { return u.role === 'ENGINEER'; }); }, sub: function (rows) { return inr(rows.length) + ' field engineers · each carries van stock and is assigned calls'; }, formCols: 3, wide: 1,
  search: function (r) { return [userName(r.user_id), r.username, r.phone, scName(r.sc_id)].join(' '); }, searchPh: 'Search engineer…',
  filters: [{ label: 'Service center', get: function (r) { return scName(r.sc_id); } }, { label: 'Status', get: function (r) { return r.is_active == 1 ? 'Active' : 'Inactive'; } }],
  defaults: function () { return { role: 'ENGINEER', is_active: 1, password: 'delta@2026' }; }, fields: function () { return userFields(true); },
  before: function (v, row) { if (!v.sc_id) return 'Select the service center of this engineer'; v.role = 'ENGINEER'; if (!row) { v.is_admin = 0; } return null; },
  guard: userGuard, cols: userCols(false),
  imp: { key: 'username', cols: [{ h: 'First Name', k: 'first_name', req: 1, sample: 'Ajay' }, { h: 'Last Name', k: 'last_name', sample: 'Patil' }, { h: 'User Name', k: 'username', req: 1, sample: 'eng.pun1' }, { h: 'Password', k: 'password', sample: 'delta@2026' },
    { h: 'Mobile', k: 'phone', sample: '9822098220', pattern: /^[6-9]\d{9}$/, patMsg: 'is not a valid mobile number' }, { h: 'Service Center', k: 'sc_id', req: 1, lk: { t: 'service_center', f: ['sc_code', 'sc_name'] }, sample: 'SC-GNO' }, { h: 'State Rights', k: 'state_rights', sample: '09' }],
    make: function (o) { o.role = 'ENGINEER'; o.is_admin = 0; o.is_active = 1; if (!o.password) o.password = 'delta@2026'; return o; } }
});
ROUTES['m/engineers'] = function () { return masterPage('engineer', 'Engineers'); };
defEntity({
  key: 'user', table: 'app_user', title: 'User', plural: 'Users & Rights', refLabel: function (r) { return userName(r.user_id); }, softOff: 'Active',
  sub: function (rows) { return inr(rows.length) + ' users · role, state rights and menu rights decide what each person can see'; }, formCols: 3, wide: 1,
  search: function (r) { return [userName(r.user_id), r.username, r.role, scName(r.sc_id)].join(' '); }, searchPh: 'Search user…',
  filters: [{ label: 'Role', get: function (r) { return r.role; } }, { label: 'Service center', get: function (r) { return scName(r.sc_id); } }, { label: 'Status', get: function (r) { return r.is_active == 1 ? 'Active' : 'Inactive'; } }],
  defaults: function () { return { role: 'HO', is_active: 1, password: 'delta@2026' }; }, fields: function () { return userFields(false); },
  before: function (v) { if ((v.role === 'MANAGER' || v.role === 'ENGINEER') && !v.sc_id) return 'Select the service center for a ' + v.role.toLowerCase(); return null; },
  guard: userGuard, cols: userCols(true),
  imp: { key: 'username', cols: [{ h: 'First Name', k: 'first_name', req: 1, sample: 'Neha' }, { h: 'Last Name', k: 'last_name', sample: 'Agarwal' }, { h: 'User Name', k: 'username', req: 1, sample: 'ho.mh' }, { h: 'Password', k: 'password', sample: 'delta@2026' },
    { h: 'Role', k: 'role', req: 1, enumv: ['SUPER', 'HO', 'MANAGER', 'ENGINEER'], upper: 1, sample: 'HO' }, { h: 'Mobile', k: 'phone', sample: '9810012345' }, { h: 'Service Center', k: 'sc_id', lk: { t: 'service_center', f: ['sc_code', 'sc_name'] }, sample: '' },
    { h: 'State Rights', k: 'state_rights', sample: '27,24' }, { h: 'Menu Rights', k: 'form_rights', sample: 'Warranty,Service' }],
    check: function (o) { return (o.role === 'MANAGER' || o.role === 'ENGINEER') && !o.sc_id ? 'Service center is required for a ' + o.role.toLowerCase() : null; },
    make: function (o) { o.is_admin = o.role === 'SUPER' ? 1 : 0; o.is_active = 1; if (!o.password) o.password = 'delta@2026'; return o; } }
});
ROUTES['m/users'] = function () { return masterPage('user', 'Users & Rights'); };

/* ---------------- approval rules ---------------- */
defEntity({
  key: 'rule', table: 'approval_rule', title: 'Approval Level', plural: 'Job Card Approval Rules', refLabel: function (r) { return 'Level ' + r.level_no + ' — ' + r.role_name; }, softOff: 'Active',
  sub: 'A job card needs every level whose “amount from” is at or below its total. Level 1 has ₹ 0, so every job card goes to the service manager; larger ones also go to the next level.',
  defaults: function () { var m = 0; DB.all('approval_rule').forEach(function (r) { m = Math.max(m, r.level_no); }); return { level_no: m + 1, is_active: 1, amount_from: 0 }; },
  fields: [{ k: 'level_no', l: 'Level no.', type: 'num', req: 1, min: 1, max: 9, unique: 1 }, { k: 'role_name', l: 'Approver role / designation', req: 1, hint: 'Use words such as “Service Manager” or “HO Head” — they decide who can act' },
    { k: 'approver_user_id', l: 'Named approver (optional)', type: 'select', lk: 1, opts: optsFrom('app_user', function (u) { return userName(u.user_id) + ' (' + u.role + ')'; }, function (u) { return u.role !== 'ENGINEER' && u.is_active == 1; }) },
    { k: 'amount_from', l: 'Applies when job card total is at or above ₹', type: 'num', req: 1, min: 0 }, { k: 'is_active', l: 'Active', type: 'check' }],
  cols: [{ h: 'Level', val: function (r) { return r.level_no; }, cls: 'n', cell: function (r) { return '<b>' + r.level_no + '</b>'; } }, { h: 'Approver role', val: function (r) { return r.role_name; } }, { h: 'Named approver', val: function (r) { return userName(r.approver_user_id) || 'Anyone with this role'; } },
    { h: 'From amount ₹', val: function (r) { return r.amount_from; }, cls: 'n', cell: function (r) { return inr(r.amount_from, 2); } }, { h: 'Status', val: function (r) { return r.is_active == 1 ? 'Active' : 'Inactive'; }, cell: function (r) { return activeTag(r.is_active); } }],
  sortI: 0, sortD: 'asc',
  imp: { key: 'level_no', cols: [{ h: 'Level No', k: 'level_no', type: 'int', req: 1, sample: 3 }, { h: 'Approver Role', k: 'role_name', req: 1, sample: 'Director' }, { h: 'Named Approver (user name)', k: 'approver_user_id', lk: { t: 'app_user', f: ['username'] }, sample: '' }, { h: 'Amount From', k: 'amount_from', type: 'num', req: 1, sample: 50000 }],
    make: function (o) { o.is_active = 1; return o; } }
});
ROUTES['m/rules'] = function () {
  var p = masterPage('rule', 'Approval Rules'), rules = DB.all('approval_rule').filter(function (r) { return r.is_active == 1; }).sort(function (a, b) { return a.level_no - b.level_no; });
  var ex = [1000, 6000, 15000, 40000].map(function (v) { var n = rules.filter(function (r) { return r.amount_from <= v; }); return '<tr><td class="n">₹ ' + inr(v) + '</td><td>' + (n.map(function (r) { return 'L' + r.level_no + ' ' + esc(r.role_name); }).join(' → ') || 'No approval needed') + '</td></tr>'; }).join('');
  p.body = '<div class="card" style="max-width:640px"><h3>How it works today <span class="sm2">live from the rules below</span></h3><table class="dt"><thead><tr><th class="n" style="width:130px">Job card total</th><th>Goes to</th></tr></thead><tbody>' + ex + '</tbody></table></div>' + p.body;
  return p;
};

/* ---------------- states & districts ---------------- */
defEntity({
  key: 'state', table: 'state_master', title: 'State', plural: 'States', refLabel: function (r) { return r.state_name; },
  sub: function (rows) { return inr(rows.length) + ' states · the code is the GST state code'; }, search: function (r) { return r.state_name + ' ' + r.state_code + ' ' + r.short_name; }, searchPh: 'Search state…',
  fields: [{ k: 'state_code', l: 'State code (GST)', req: 1, unique: 1, pattern: /^\d{2}$/, patMsg: 'State code is 2 digits, e.g. 09' }, { k: 'state_name', l: 'State name', req: 1, unique: 1 }, { k: 'short_name', l: 'Short name', req: 1, pattern: /^[A-Z]{2,3}$/, patMsg: 'Short name is 2–3 capital letters' }],
  cols: [{ h: 'Code', val: function (r) { return r.state_code; }, cls: 'mono' }, { h: 'State', val: function (r) { return r.state_name; }, cell: function (r) { return '<b>' + esc(r.state_name) + '</b>'; } }, { h: 'Short', val: function (r) { return r.short_name; } },
    { h: 'Districts', val: function (r) { return DB.where('district_master', function (d) { return d.state_code === r.state_code; }).length; }, cls: 'n' }, { h: 'Installations', val: function (r) { return DB.where('installation', function (i) { return i.state_code === r.state_code; }).length; }, cls: 'n' }],
  sortI: 0, sortD: 'asc',
  imp: { key: 'state_code', cols: [{ h: 'State Code', k: 'state_code', req: 1, sample: '27', pattern: /^\d{2}$/, patMsg: 'must be 2 digits' }, { h: 'State Name', k: 'state_name', req: 1, sample: 'Maharashtra' }, { h: 'Short Name', k: 'short_name', req: 1, sample: 'MH' }] }
});
defEntity({
  key: 'district', table: 'district_master', title: 'District', plural: 'Districts', refLabel: function (r) { return r.district_name; },
  sub: function (rows) { return inr(rows.length) + ' districts'; }, search: function (r) { return r.district_name + ' ' + stateName(r.state_code); }, searchPh: 'Search district…',
  filters: [{ label: 'State', get: function (r) { return stateName(r.state_code); } }],
  fields: [{ k: 'state_code', l: 'State', type: 'select', req: 1, opts: stateOpts }, { k: 'district_name', l: 'District name', req: 1 }],
  validate: function (v, row) { return DB.find('district_master', function (d) { return d.state_code === v.state_code && d.district_name.toLowerCase() === v.district_name.toLowerCase() && (!row || d.district_id !== row.district_id); }) ? 'This district already exists in the state' : null; },
  guard: function (r) { var n = DB.all('customer').filter(function (c) { return c.district === r.district_name && c.state_code === r.state_code; }).length; return n ? n + ' customer(s) are in this district.' : null; },
  cols: [{ h: 'State', val: function (r) { return stateName(r.state_code); } }, { h: 'District', val: function (r) { return r.district_name; }, cell: function (r) { return '<b>' + esc(r.district_name) + '</b>'; } },
    { h: 'Installations', val: function (r) { return DB.where('installation', function (i) { return i.district === r.district_name && i.state_code === r.state_code; }).length; }, cls: 'n' }],
  imp: { cols: [{ h: 'State', k: 'state_code', req: 1, lk: { t: 'state_master', f: ['state_name', 'short_name', 'state_code'] }, sample: 'Uttar Pradesh' }, { h: 'District Name', k: 'district_name', req: 1, sample: 'Etawah' }],
    check: function (o, ctx) { var k = o.state_code + '|' + String(o.district_name).toLowerCase(); if (ctx.dk && ctx.dk[k]) return 'District repeated in the file'; (ctx.dk = ctx.dk || {})[k] = 1; return DB.find('district_master', function (d) { return d.state_code === o.state_code && d.district_name.toLowerCase() === String(o.district_name).toLowerCase(); }) ? 'District already exists in this state' : null; },
    make: function (o, raw) { o.state_code = raw._state_code.state_code; return o; } }
});
ROUTES['m/states'] = function (a, q) {
  var dist = q.t === 'districts', p = entityScreen(dist ? 'district' : 'state');
  p.crumb = 'Home › Masters › <b>States &amp; Districts</b>';
  p.tabs = '<div class="tabs"><a class="tab' + (dist ? '' : ' on') + '" href="#/m/states">States</a><a class="tab' + (dist ? ' on' : '') + '" href="#/m/states?t=districts">Districts</a></div>';
  return p;
};
