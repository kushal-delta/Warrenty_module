/* ============================================================
   Delta iERP Warranty & Service  -  form / entity / Excel-import engine
   One entity definition gives a master or register:
     list + search + filters, New / Edit / Delete forms, delete guard
     (a record that other records use cannot be deleted), Excel template
     download, Excel import with row-by-row validation, Excel export.
   ============================================================ */
'use strict';

var ENT = {};
function defEntity(cfg) { ENT[cfg.key] = cfg; return cfg; }

/* ---------- option providers ---------- */
function optsFrom(table, label, where, valueKey) {
  return function () {
    var pk = valueKey || DB.pk(table);
    return sortBy(DB.all(table).filter(where || function () { return true; }).map(function (r) {
      return { v: r[pk], l: typeof label === 'function' ? label(r) : r[label] };
    }), function (o) { return String(o.l).toLowerCase(); });
  };
}
function stateOpts() { return optsFrom('state_master', 'state_name', null, 'state_code')(); }
function districtList(stateCode) {
  return DB.where('district_master', function (d) { return !stateCode || d.state_code === stateCode; }).map(function (d) { return d.district_name; }).sort();
}

/* ============================================================
   FORM FIELDS
   {k, l, type: text|num|date|time|tel|email|pwd|select|area|check|multi|ro,
    req, def, ro, opts[]|fn, full, hint, ph, pattern, patMsg, unique, suggest:{dep, fn}}
   ============================================================ */
function fieldHtml(f, v, p) {
  p = p || 'ff_';
  var id = p + f.k, h = '';
  if (v == null) v = (typeof f.def === 'function' ? f.def() : (f.def != null ? f.def : ''));
  h += '<div class="f' + (f.full ? ' full' : '') + (f.type === 'check' ? ' chk' : '') + '"' + (f.id ? ' id="' + f.id + '"' : '') + '>';
  if (f.type === 'check') {
    h += '<label class="cb"><input type="checkbox" id="' + id + '" data-k="' + f.k + '"' + (v == 1 || v === true || v === 'Y' ? ' checked' : '') + '> ' + esc(f.l) + '</label>';
  } else {
    h += '<label for="' + id + '">' + esc(f.l) + (f.req ? ' <span class="rq">*</span>' : '') + '</label>';
    if (f.type === 'select') {
      var opts = typeof f.opts === 'function' ? f.opts(v) : (f.opts || []);
      h += '<select id="' + id + '" data-k="' + f.k + '"' + (f.ro ? ' disabled' : '') + '>';
      if (!f.req || v === '' || v == null) h += '<option value="">' + (f.req ? '— select —' : '') + '</option>';
      opts.forEach(function (op) {
        var val = (op && op.v != null) ? op.v : op, lab = (op && op.l != null) ? op.l : op;
        h += '<option value="' + esc(val) + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + esc(lab) + '</option>';
      });
      h += '</select>';
    } else if (f.type === 'area') {
      h += '<textarea id="' + id + '" data-k="' + f.k + '" rows="' + (f.rows || 2) + '"' + (f.ro ? ' readonly' : '') + '>' + esc(v) + '</textarea>';
    } else if (f.type === 'multi') {
      var sel = String(v || '').split(',').map(function (x) { return x.trim(); });
      var mo = typeof f.opts === 'function' ? f.opts() : (f.opts || []);
      h += '<div class="multi" id="' + id + '" data-k="' + f.k + '" data-multi="1">';
      mo.forEach(function (op) {
        var val = (op && op.v != null) ? op.v : op, lab = (op && op.l != null) ? op.l : op;
        h += '<label class="cb"><input type="checkbox" value="' + esc(val) + '"' + (sel.indexOf(String(val)) >= 0 ? ' checked' : '') + '> ' + esc(lab) + '</label>';
      });
      h += '</div>';
    } else {
      var t = f.type === 'num' ? 'number' : f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : f.type === 'pwd' ? 'text' : f.type === 'email' ? 'email' : 'text';
      h += '<input id="' + id + '" data-k="' + f.k + '" type="' + t + '"' + (f.type === 'num' ? ' step="any"' : '') + (f.ro ? ' readonly' : '') +
        (f.suggest ? ' list="dl_' + id + '"' : '') + ' value="' + esc(v) + '"' + (f.ph ? ' placeholder="' + esc(f.ph) + '"' : '') +
        (f.max != null ? ' max="' + f.max + '"' : '') + (f.min != null ? ' min="' + f.min + '"' : '') + ' autocomplete="off">';
      if (f.suggest) h += '<datalist id="dl_' + id + '"></datalist>';
    }
    if (f.hint) h += '<div class="hint">' + f.hint + '</div>';
  }
  return h + '</div>';
}
function formHtml(fields, row, p, cols) {
  var h = '<div class="frm' + (cols === 3 ? ' c3' : '') + '">';
  fields.forEach(function (f) {
    if (f.sec) { h += '<div class="sec-h full">' + esc(f.sec) + '</div>'; return; }
    h += fieldHtml(f, row ? row[f.k] : null, p);
  });
  return h + '</div>';
}
/* read the typed values from a rendered form; returns {v, err} */
var EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, GSTIN_RX = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
function collectForm(fields, p, row, table) {
  p = p || 'ff_';
  var v = {}, err = null;
  fields.forEach(function (f) {
    if (f.sec || err) return;
    var e = document.getElementById(p + f.k); if (!e) return;
    var val;
    if (f.type === 'check') val = e.checked ? 1 : 0;
    else if (f.type === 'multi') val = $$('input:checked', e).map(function (i) { return i.value; }).join(',');
    else {
      val = (e.value || '').trim();
      if (f.type === 'num') val = val === '' ? null : parseFloat(val);
      else if (f.type === 'select' && (f.num || f.lk)) val = val === '' ? null : Number(val);
      else if (val === '' && f.type !== 'text' && f.type !== 'area' && f.type !== 'tel' && f.type !== 'pwd') val = null;
      else if (val === '') val = null;
    }
    if (f.req && (val === null || val === '' || (f.type === 'num' && isNaN(val)))) { err = f.l + ' is required'; return; }
    if (val != null && val !== '' && (f.type === 'email' || f.k === 'email') && !EMAIL_RX.test(String(val))) { err = 'Enter a valid email address'; return; }
    if (val != null && val !== '' && f.k === 'gstin') { val = String(val).toUpperCase(); if (!GSTIN_RX.test(val)) { err = 'GSTIN is not valid (15 characters, e.g. 09ABBCS3892H1ZZ)'; return; } }
    if (val != null && val !== '' && f.pattern && !f.pattern.test(String(val))) { err = f.patMsg || (f.l + ' is not valid'); return; }
    if (val != null && val !== '' && f.type === 'num') {
      if (f.min != null && val < f.min) { err = f.l + ' must be at least ' + f.min; return; }
      if (f.max != null && val > f.max) { err = f.l + ' must be at most ' + f.max; return; }
    }
    if (f.unique && table && val != null && val !== '') {
      var pk = DB.pk(table), dup = DB.find(table, function (r) { return String(r[f.k]).toLowerCase() === String(val).toLowerCase() && (!row || r[pk] != row[pk]); });
      if (dup) { err = f.l + ' "' + val + '" already exists'; return; }
    }
    v[f.k] = val;
  });
  return { v: v, err: err };
}
/* district suggestions follow the chosen state */
function wireSuggest(fields, p) {
  p = p || 'ff_';
  fields.forEach(function (f) {
    if (!f.suggest) return;
    var dep = document.getElementById(p + f.suggest.dep), dl = document.getElementById('dl_' + p + f.k);
    if (!dl) return;
    var fill = function () { dl.innerHTML = f.suggest.fn(dep ? dep.value : '').map(function (x) { return '<option value="' + esc(x) + '">'; }).join(''); };
    fill(); if (dep) dep.addEventListener('change', fill);
  });
}

/* ============================================================
   DELETE GUARD  -  derived from the foreign keys in schema.js
   ============================================================ */
function refsTo(table, row, ignore) {
  var out = [], parentPk = SCHEMA.by[table].pk;
  SCHEMA.tables.forEach(function (t) {
    if (ignore && ignore.indexOf(t.name) >= 0) return;
    t.cols.forEach(function (c) {
      if (!c.fk) return;
      var p = c.fk.split('.'); if (p[0] !== table) return;
      var pc = p[1] || parentPk, val = row[pc];
      if (val == null || val === '') return;
      var n = DB.all(t.name).filter(function (r) { return r[c.n] == val; }).length;
      if (n) out.push({ table: t.name, title: t.title, n: n, col: c.n });
    });
  });
  return out;
}

/* ============================================================
   ENTITY SCREEN  -  list + New / Edit / Delete + Import
   ============================================================ */
function entRows(ent) { return ent.rows ? ent.rows() : DB.all(ent.table); }

function entityScreen(key) {
  var ent = ENT[key], rows = entRows(ent);
  var can = ent.can || { add: 1, edit: 1, del: 1, imp: !!ent.imp };
  if (ent.perm) can = ent.perm();
  var acts = '';
  if (ent.headActions) acts += ent.headActions();
  if (can.imp && ent.imp) acts += '<button class="btn" onclick="Import.template(\'' + key + '\')">' + ICO.xls + ' Excel Template</button>' +
    '<button class="btn" onclick="Import.open(\'' + key + '\')">' + ICO.imp + ' Import Excel</button>';
  if (can.add !== 0 && can.add !== false) acts += '<button class="btn pri" onclick="openForm(\'' + key + '\')">' + ICO.plus + ' New ' + esc(ent.title) + '</button>';
  var sub = ent.sub ? (typeof ent.sub === 'function' ? ent.sub(rows) : ent.sub) : (inr(rows.length) + ' record' + (rows.length === 1 ? '' : 's'));
  return {
    title: ent.plural || ent.title, sub: sub, actions: acts,
    body: (ent.kpis ? ent.kpis(rows) : '') + (ent.note ? '<div class="note">' + ent.note + '</div>' : '') + '<div id="entGrid"></div>',
    after: function () {
      var cols = ent.cols.slice();
      var g = mountGrid('#entGrid', {
        title: ent.plural || ent.title, cols: cols, rows: rows, filters: ent.filters, search: ent.search, searchPlaceholder: ent.searchPh || 'Search…',
        sortI: ent.sortI, sortD: ent.sortD, rowClass: ent.rowClass,
        actions: function (r, i) {
          var h = '';
          if (ent.rowActions) ent.rowActions(r).forEach(function (a) {
            h += '<button class="ract ' + (a.cls || '') + '" data-ra="' + a.a + '" data-ri="' + i + '" title="' + esc(a.t) + '">' + (a.i || ICO.eye) + '</button>';
          });
          var ce = can.edit !== 0 && (!ent.canEdit || ent.canEdit(r)), cd = can.del !== 0 && (!ent.canDel || ent.canDel(r));
          if (ce) h += '<button class="ract" data-ra="edit" data-ri="' + i + '" title="Edit">' + ICO.edit + '</button>';
          if (cd) h += '<button class="ract del" data-ra="del" data-ri="' + i + '" title="Delete">' + ICO.trash + '</button>';
          return h;
        },
        onAction: function (a, r) {
          if (a === 'edit') openForm(key, r);
          else if (a === 'del') deleteEntity(key, r);
          else if (ent.onAction) ent.onAction(a, r);
        },
        onRow: ent.onRow ? function (r) { ent.onRow(r); } : null,
        totals: ent.totals
      });
      if (ent.afterGrid) ent.afterGrid(g);
    }
  };
}

function openForm(key, row) {
  var ent = ENT[key], isEdit = !!row;
  if (ent.openForm) { ent.openForm(row); return; }
  var fields = typeof ent.fields === 'function' ? ent.fields(row) : ent.fields;
  var data = row ? row : (ent.defaults ? ent.defaults() : {});
  window._form = { key: key, row: row, fields: fields };
  var canDel = isEdit && (!ent.can || ent.can.del !== 0) && (!ent.canDel || ent.canDel(row));
  modal((isEdit ? 'Edit ' : 'New ') + esc(ent.title) + (isEdit && ent.refLabel ? ' — ' + esc(ent.refLabel(row)) : ''),
    (ent.formNote ? '<div class="note">' + ent.formNote + '</div>' : '') + formHtml(fields, data, 'ff_', ent.formCols),
    '<button class="btn" onclick="closeModal()">Cancel</button>' +
    (canDel ? '<button class="btn dang-o" onclick="formDelete()">' + ICO.trash + ' Delete</button>' : '') +
    '<button class="btn pri" onclick="formSave()">' + ICO.save + ' ' + (isEdit ? 'Update' : 'Save') + '</button>',
    (ent.wide ? 'wide' : '') + ' sticky');
  wireSuggest(fields, 'ff_');
  if (ent.afterOpen) ent.afterOpen(row);
}
function formSave() {
  var F = window._form, ent = ENT[F.key], isEdit = !!F.row;
  var r = collectForm(F.fields, 'ff_', F.row, ent.table);
  if (r.err) { toast(r.err, 'err'); return; }
  var v = r.v;
  if (ent.validate) { var e = ent.validate(v, F.row); if (e) { toast(e, 'err'); return; } }
  if (ent.before) { var e2 = ent.before(v, F.row, isEdit); if (e2) { toast(e2, 'err'); return; } }
  var saved;
  if (isEdit) { DB.upd(ent.table, F.row[DB.pk(ent.table)], v); saved = F.row; }
  else saved = DB.add(ent.table, v);
  if (ent.after) ent.after(saved, F.row ? true : false, v);
  DB.save();
  closeModal();
  route(true);
  toast(ent.title + (isEdit ? ' updated' : ' saved') + ' — ' + DB.refOf(ent.table, saved), 'ok');
}
function formDelete() {
  var F = window._form; closeModal();
  deleteEntity(F.key, F.row);
}
function deleteEntity(key, row) {
  var ent = ENT[key], ign = (ent.cascade || []).map(function (c) { return c.table; });
  var refs = refsTo(ent.table, row, ign);
  var ref = DB.refOf(ent.table, row);
  var gmsg = ent.guard ? ent.guard(row) : null;
  if (gmsg) { modal('Cannot delete ' + esc(ent.title), '<div class="note w"><b>' + esc(ref) + '</b> — ' + gmsg + '</div>', null, 'narrow'); return; }
  if (refs.length) {
    modal('Cannot delete ' + esc(ent.title),
      '<div class="note w"><b>' + esc(ref) + '</b> is already used, so deleting it would leave orphan records. Remove or reassign these first:</div>' +
      '<table class="dt" style="margin-top:6px"><thead><tr><th>Used in</th><th class="n">Records</th></tr></thead><tbody>' +
      refs.map(function (x) { return '<tr><td>' + esc(x.title) + '</td><td class="n">' + inr(x.n) + '</td></tr>'; }).join('') + '</tbody></table>' +
      (ent.softOff ? '<div class="hint" style="margin-top:10px">Tip: set <b>' + esc(ent.softOff) + '</b> to inactive instead — history stays intact.</div>' : ''), null, 'narrow');
    return;
  }
  confirmDo('Delete ' + esc(ent.title) + '?', '<b>' + esc(ref) + '</b><br><br>This permanently removes the record' +
    ((ent.cascade && ent.cascade.length) ? ' together with its ' + ent.cascade.map(function (c) { return c.label || c.table; }).join(', ') : '') + '.', 'Delete', function () {
      if (ent.beforeDelete) ent.beforeDelete(row);   /* first, while the child rows are still there */
      (ent.cascade || []).forEach(function (c) {
        DB.where(c.table, function (r) { return r[c.fk] == row[DB.pk(ent.table)]; }).forEach(function (r) { DB.del(c.table, r[DB.pk(c.table)], true); });
      });
      DB.del(ent.table, row[DB.pk(ent.table)]);
      if (ent.afterDelete) ent.afterDelete(row);
      DB.save(); route(true); toast(ent.title + ' deleted', 'ok');
    }, true);
}

/* ============================================================
   EXCEL IMPORT
   ent.imp = { cols:[{h, k, req, type:text|num|int|date|bool, alias[], sample, note, enumv[], upper, lk:{t, f[]}}],
               key, check(obj, ctx), make(obj, ctx), after(rows), samples:[[...]] }
   ============================================================ */
var Import = {
  ent: null, key: '', res: null, fileName: '',
  _n: function (s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); },
  normDate: function (v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') { if (v > 20000 && v < 80000) return XL._serialToDate(v); return null; }
    var s = String(v).trim(), m;
    /* a real calendar date only: month 1-12, day within the month */
    var ok = function (y, mo, d) { y = +y; mo = +mo; d = +d; if (mo < 1 || mo > 12 || d < 1 || y < 1900 || y > 2200) return null; var last = new Date(y, mo, 0).getDate(); if (d > last) return null; return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0'); };
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return ok(m[1], m[2], m[3]);
    if ((m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(s))) { var y = +m[3]; if (y < 100) y += 2000; return ok(y, m[2], m[1]); }
    if ((m = /^(\d{1,2})[\-\s]([A-Za-z]{3})[A-Za-z]*[\-\s,]+(\d{2,4})$/.exec(s))) {
      var mi = MON.map(function (x) { return x.toLowerCase(); }).indexOf(m[2].toLowerCase()); if (mi < 0) return null;
      var yy = +m[3]; if (yy < 100) yy += 2000; return ok(yy, mi + 1, m[1]);
    }
    return null;
  },
  template: function (key) {
    var ent = ENT[key], imp = ent.imp, cols = imp.cols;
    var head = cols.map(function (c) { return c.h + (c.req ? ' *' : ''); });
    var rows = [head];
    var samples = imp.samples || [cols.map(function (c) { return c.sample != null ? c.sample : ''; })];
    samples.forEach(function (r) { rows.push(r); });
    var ins = [['Column', 'Required', 'Format / allowed values', 'Example']];
    cols.forEach(function (c) {
      var fmt = c.type === 'date' ? 'Date — dd-mm-yyyy, yyyy-mm-dd or an Excel date' : c.type === 'num' || c.type === 'int' ? 'Number' : c.type === 'bool' ? 'Yes / No' : 'Text';
      if (c.enumv) fmt = 'One of: ' + c.enumv.join(' / ');
      if (c.lk) fmt = 'Must match an existing ' + SCHEMA.by[c.lk.t].title + ' (' + c.lk.f.join(' or ') + ')';
      if (c.note) fmt += '. ' + c.note;
      ins.push([c.h, c.req ? 'Yes' : 'No', fmt, c.sample != null ? c.sample : '']);
    });
    ins.push([], ['Notes'], ['1. Keep the header row exactly as in the Template sheet (the * is optional).'],
      ['2. One record per row. Blank rows are ignored.'], ['3. Rows with errors are skipped and listed in the preview; correct them and import again.'],
      ['4. Save as .xlsx (Excel Workbook) or .csv before importing.']);
    XL.download(ent.title.replace(/[^\w]+/g, '_') + '_Import_Template.xlsx', [
      { name: 'Template', rows: rows }, { name: 'Instructions', rows: ins, widths: [26, 10, 70, 24] }]);
    toast('Template downloaded — fill it in and use Import Excel', 'ok');
  },

  open: function (key) {
    var ent = ENT[key]; this.ent = ent; this.key = key; this.res = null;
    var cols = ent.imp.cols;
    var body = '<div class="note">Import <b>' + esc(ent.plural || ent.title) + '</b> from an Excel workbook (.xlsx) or .csv file. Columns: ' +
      cols.map(function (c) { return '<b>' + esc(c.h) + '</b>' + (c.req ? '*' : ''); }).join(', ') + '. ' +
      '<a href="javascript:void(0)" onclick="Import.template(\'' + key + '\')">Download the template</a> to see the expected layout.</div>' +
      (ent.imp.head ? ent.imp.head() : '') +
      '<div class="imp-drop" id="impDrop"><div style="color:var(--ink4)">' + ICO.imp.replace('width="13" height="13"', 'width="34" height="34"') + '</div><b>Drop the Excel file here, or click to browse</b>' +
      '<span>.xlsx or .csv &nbsp;·&nbsp; first sheet is read &nbsp;·&nbsp; first row = column headings</span>' +
      '<input type="file" id="impFile" accept=".xlsx,.xlsm,.csv,.txt" style="display:none"></div>' +
      '<div id="impOut"></div>';
    modal('Import ' + esc(ent.plural || ent.title) + ' from Excel', body, '<button class="btn" onclick="closeModal()">Close</button>', 'wide sticky');
    var drop = $('#impDrop'), fi = $('#impFile');
    drop.addEventListener('click', function () { fi.click(); });
    fi.addEventListener('change', function () { if (this.files[0]) Import.load(this.files[0]); });
    ['dragover', 'dragenter'].forEach(function (e) { drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.style.borderColor = 'var(--brand)'; }); });
    ['dragleave', 'drop'].forEach(function (e) { drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.style.borderColor = ''; }); });
    drop.addEventListener('drop', function (ev) { var f = ev.dataTransfer.files[0]; if (f) Import.load(f); });
  },

  load: function (file) {
    var self = this; this.fileName = file.name;
    var out = $('#impOut'); out.innerHTML = '<div class="hint" style="padding:12px">Reading ' + esc(file.name) + '…</div>';
    var done = function (sheets) { self.parse(sheets); };
    var fail = function (e) { out.innerHTML = '<div class="note w">Could not read this file: ' + esc(e.message || e) + '. Save the sheet as .xlsx or .csv and try again.</div>'; };
    var rd = new FileReader();
    if (/\.(csv|txt)$/i.test(file.name)) { rd.onload = function () { done(XL.parseCsv(rd.result)); }; rd.readAsText(file); }
    else if (/\.xls$/i.test(file.name)) { out.innerHTML = '<div class="note w">This is an older <b>.xls</b> file. Open it in Excel and use <b>Save As → Excel Workbook (.xlsx)</b> (or CSV), then import that file.</div>'; }
    else { rd.onload = function () { XL.read(rd.result).then(done).catch(fail); }; rd.readAsArrayBuffer(file); }
  },

  parse: function (sheets) {
    var ent = this.ent, imp = ent.imp, cols = imp.cols, out = $('#impOut');
    var sh = null;
    for (var i = 0; i < sheets.length; i++) if (sheets[i].rows.filter(function (r) { return r && r.length; }).length > 1) { sh = sheets[i]; break; }
    if (!sh) { out.innerHTML = '<div class="note w">The file has no data rows.</div>'; return; }
    /* find the header row: first row containing most of the expected headings */
    var norm = Import._n, hi = 0, best = -1;
    for (var r = 0; r < Math.min(sh.rows.length, 8); r++) {
      var hits = 0;
      (sh.rows[r] || []).forEach(function (c) {
        var n = norm(String(c == null ? '' : c).replace(/\*/g, ''));
        cols.forEach(function (cc) { if (n === norm(cc.h) || (cc.alias || []).some(function (a) { return norm(a) === n; })) hits++; });
      });
      if (hits > best) { best = hits; hi = r; }
    }
    var head = (sh.rows[hi] || []).map(function (c) { return norm(String(c == null ? '' : c).replace(/\*/g, '')); });
    var idx = {}, missing = [];
    cols.forEach(function (c) {
      var names = [norm(c.h)].concat((c.alias || []).map(norm)), at = -1;
      for (var k = 0; k < head.length; k++) if (names.indexOf(head[k]) >= 0) { at = k; break; }
      idx[c.k] = at;
      if (at < 0 && c.req) missing.push(c.h);
    });
    if (missing.length) {
      out.innerHTML = '<div class="note w"><b>Required column' + (missing.length > 1 ? 's' : '') + ' not found:</b> ' + missing.map(esc).join(', ') +
        '.<br>Columns found in your file: ' + (sh.rows[hi] || []).map(function (c) { return esc(c); }).join(', ') + '</div>';
      return;
    }
    /* existing keys for duplicate detection */
    var existing = {};
    if (imp.key) DB.all(ent.table).forEach(function (r) { existing[String(r[imp.key]).toLowerCase()] = r; });
    var ctx = { seen: {}, existing: existing, update: false };
    var res = [];
    for (var ri = hi + 1; ri < sh.rows.length; ri++) {
      var row = sh.rows[ri] || [];
      if (!row.some(function (c) { return c != null && String(c).trim() !== ''; })) continue;
      var obj = {}, errs = [];
      cols.forEach(function (c) {
        var raw = idx[c.k] >= 0 ? row[idx[c.k]] : null, v = null;
        if (raw == null || String(raw).trim() === '') { if (c.req) errs.push(c.h + ' is required'); obj[c.k] = null; return; }
        if (c.type === 'num' || c.type === 'int') {
          var n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, ''));
          if (isNaN(n)) { errs.push(c.h + ' must be a number'); return; }
          v = c.type === 'int' ? Math.round(n) : n;
          var lo = c.min != null ? c.min : (/(^|_)(rate|price|amount|net_value|charges|months|days|gst_pct|min_stock|hp|kw|kwp|depth|head|valid_days)(_|$)/.test(c.k) || (c.k === 'qty' && ent.key !== 'stocktxn') ? 0 : null);
          var hi2 = c.max != null ? c.max : (/gst_pct/.test(c.k) ? 100 : /months/.test(c.k) ? 600 : null);
          if (lo != null && v < lo) { errs.push(c.h + ' cannot be less than ' + lo); return; }
          if (hi2 != null && v > hi2) { errs.push(c.h + ' cannot be more than ' + hi2); return; }
        } else if (c.type === 'date') {
          v = Import.normDate(raw); if (!v) { errs.push(c.h + ' is not a valid date ("' + raw + '")'); return; }
        } else if (c.type === 'bool') {
          var s = String(raw).trim().toLowerCase(); v = (s === 'yes' || s === 'y' || s === '1' || s === 'true') ? 1 : 0;
        } else {
          v = typeof raw === 'number' ? String(raw % 1 === 0 ? raw.toFixed(0) : raw) : String(raw).trim();
          if (c.upper) v = v.toUpperCase();
        }
        if (c.enumv) {
          var hit = c.enumv.filter(function (e) { return String(e).toLowerCase() === String(v).toLowerCase(); })[0];
          if (!hit) { errs.push(c.h + ' "' + v + '" must be one of: ' + c.enumv.join(' / ')); return; }
          v = hit;
        }
        var scol = (SCHEMA.by[ent.table] || { cols: [] }).cols.filter(function (z) { return z.n === c.k; })[0], mxl = scol && /^s(\d+)$/.test(scol.t) ? +scol.t.slice(1) : 0;
        if (mxl && !c.lk && typeof v === 'string' && v.length > mxl) { errs.push(c.h + ' is too long (' + v.length + ' characters, maximum ' + mxl + ')'); return; }
        if (c.k === 'email' && typeof v === 'string' && !EMAIL_RX.test(v)) { errs.push(c.h + ' "' + v + '" is not a valid email address'); return; }
        if (c.k === 'gstin' && typeof v === 'string') { v = v.toUpperCase(); if (!GSTIN_RX.test(v)) { errs.push(c.h + ' "' + v + '" is not a valid GSTIN'); return; } }
        if (c.pattern && !c.pattern.test(String(v))) { errs.push(c.h + ' "' + v + '" ' + (c.patMsg || 'is not valid')); return; }
        if (c.lk) {
          var pool = DB.all(c.lk.t), vv = String(v).trim().toLowerCase(), found = null;
          for (var q = 0; q < pool.length && !found; q++) for (var z = 0; z < c.lk.f.length; z++) if (String(pool[q][c.lk.f[z]] == null ? '' : pool[q][c.lk.f[z]]).trim().toLowerCase() === vv) { found = pool[q]; break; }
          if (!found) { errs.push(c.h + ' "' + v + '" not found in ' + SCHEMA.by[c.lk.t].title); return; }
          obj['_' + c.k] = found; v = c.lk.t === 'state_master' ? found.state_code : found[DB.pk(c.lk.t)];
        }
        obj[c.k] = v;
      });
      var action = 'add', ex = null;
      if (imp.key && obj[imp.key] != null) {
        var kk = String(obj[imp.key]).toLowerCase();
        if (ctx.seen[kk]) errs.push(imp.key.replace(/_/g, ' ') + ' "' + obj[imp.key] + '" appears more than once in the file');
        else if (existing[kk]) { action = 'update'; ex = existing[kk]; }
        ctx.seen[kk] = 1;
      }
      if (!errs.length && imp.check) { var ce = imp.check(obj, ctx, ex); if (ce) errs.push(ce); }
      res.push({ n: ri + 1, raw: row, obj: obj, errs: errs, action: action, ex: ex });
    }
    this.res = res; this.ctx = ctx; this.hasKey = !!imp.key;
    this.render();
  },

  render: function () {
    var res = this.res, imp = this.ent.imp, self = this;
    var ok = res.filter(function (r) { return !r.errs.length; }), bad = res.filter(function (r) { return r.errs.length; });
    var dupes = ok.filter(function (r) { return r.action === 'update'; }).length;
    var upd = $('#impUpd') ? $('#impUpd').checked : false;
    var ready = ok.filter(function (r) { return r.action === 'add' || upd; }).length;
    var h = '<div class="stat-strip" style="margin:14px 0 10px"><div class="s"><b>Rows read</b><span>' + res.length + '</span></div>' +
      '<div class="s"><b>Ready to import</b><span style="color:var(--ok)">' + ok.length + '</span></div>' +
      '<div class="s"><b>With errors</b><span style="color:' + (bad.length ? 'var(--dang)' : 'var(--ink3)') + '">' + bad.length + '</span></div>' +
      (this.hasKey ? '<div class="s"><b>Already exist</b><span>' + dupes + '</span></div>' : '') +
      '<div class="s" style="flex:3"><b>File</b><span style="font-size:13px">' + esc(this.fileName) + '</span></div></div>';
    if (this.hasKey && dupes) h += '<label class="cb" style="margin:0 0 10px"><input type="checkbox" id="impUpd"' + (upd ? ' checked' : '') + ' onchange="Import.render()"> Update the ' + dupes + ' existing record' + (dupes > 1 ? 's' : '') + ' that match on <b>' + esc(imp.key.replace(/_/g, ' ')) + '</b> (otherwise they are skipped)</label>';
    var show = res.slice(0, 200);
    h += '<div class="tscroll" style="max-height:290px;border:1px solid var(--line);border-radius:6px"><table class="dt"><thead><tr><th>Row</th><th>Status</th>' +
      imp.cols.slice(0, 7).map(function (c) { return '<th>' + esc(c.h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      show.map(function (r) {
        var st = r.errs.length ? '<span class="tag dang">Error</span>' : r.action === 'update' ? '<span class="tag warn">' + (upd ? 'Update' : 'Exists — skip') + '</span>' : '<span class="tag ok">New</span>';
        return '<tr' + (r.errs.length ? ' style="background:#FFF6F6"' : '') + '><td>' + r.n + '</td><td>' + st + (r.errs.length ? '<div style="color:var(--dang);font-size:11px;margin-top:2px;max-width:340px;white-space:normal">' + r.errs.map(esc).join('<br>') + '</div>' : '') + '</td>' +
          imp.cols.slice(0, 7).map(function (c) { var v = r.obj[c.k]; if (c.lk && r.obj['_' + c.k]) v = r.raw[0] != null ? (r.obj['_' + c.k][c.lk.f[0]]) : v; return '<td>' + esc(v == null ? '' : v) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>' + (res.length > 200 ? '<div class="hint">Showing the first 200 rows of ' + res.length + '.</div>' : '');
    $('#impOut').innerHTML = h;
    $('#mf').innerHTML = '<button class="btn" onclick="closeModal()">Close</button>' +
      (bad.length ? '<button class="btn" onclick="Import.errorReport()">' + ICO.dl + ' Error report (.xlsx)</button>' : '') +
      '<button class="btn pri" ' + (ready ? '' : 'disabled') + ' onclick="Import.commit()">' + ICO.imp + ' Import ' + ready + ' record' + (ready === 1 ? '' : 's') + '</button>';
  },

  errorReport: function () {
    var imp = this.ent.imp, rows = [imp.cols.map(function (c) { return c.h; }).concat(['Error'])];
    this.res.filter(function (r) { return r.errs.length; }).forEach(function (r) {
      rows.push(imp.cols.map(function (c, i) { return r.raw[i] == null ? '' : r.raw[i]; }).concat([r.errs.join('; ')]));
    });
    XL.download(this.ent.title.replace(/[^\w]+/g, '_') + '_import_errors.xlsx', [{ name: 'Errors', rows: rows }]);
  },

  commit: function () {
    var ent = this.ent, imp = ent.imp, upd = $('#impUpd') ? $('#impUpd').checked : false, added = 0, updated = 0, made = [];
    var batchNo = null;
    if (imp.begin) { try { batchNo = imp.begin(this.res.filter(function (r) { return !r.errs.length; })); } catch (e) { return toast(e.message || 'Cannot import', 'err'); } }
    this.res.forEach(function (r) {
      if (r.errs.length) return;
      var o = {}; for (var k in r.obj) if (k.charAt(0) !== '_') o[k] = r.obj[k];
      if (r.action === 'update') {
        if (!upd) return;
        var patch = imp.makeUpdate ? imp.makeUpdate(o, r) : (function () { var p = {}; for (var k2 in o) if (o[k2] != null) p[k2] = o[k2]; return p; })();   /* blank Excel cells never wipe saved data */
        DB.upd(ent.table, r.ex[DB.pk(ent.table)], patch, true); updated++;
      } else {
        var fin = imp.make ? imp.make(o, r.obj, batchNo) : o;
        made.push(DB.add(ent.table, fin, true)); added++;
      }
    });
    DB.log('Imported', ent.table, Import.fileName, added + ' added, ' + updated + ' updated');
    if (imp.after) imp.after(made, batchNo);
    DB.save(); closeModal(); route(true);
    toast('Imported ' + added + ' new' + (updated ? ' and updated ' + updated : '') + ' ' + (ent.plural || ent.title).toLowerCase(), 'ok');
  }
};

/* ============================================================
   Small shared UI helpers
   ============================================================ */
function yesno(v) { return v == 1 || v === true ? tag('Yes', 'ok') : tag('No', 'mut'); }
function activeTag(v) { return v == 1 ? tag('Active', 'ok') : tag('Inactive', 'mut'); }
var STATUS_TAG = {
  'New': 'info', 'Assigned': 'pur', 'Visited': 'acc', 'In Approval': 'warn', 'Approved': 'ok', 'Resolved': 'ok', 'Closed': 'mut', 'Cancelled': 'dang',
  'Draft': 'mut', 'Rejected': 'dang', 'Pending': 'warn', 'Active': 'ok', 'Expired': 'dang', 'Replaced': 'pur', 'Void': 'dang', 'Blocked': 'dang',
  'Generated': 'mut', 'Printed': 'info', 'Registered': 'ok', 'Scrapped': 'dang', 'Open': 'warn', 'Received': 'info'
};
function statusTag(s) { return '<span class="tag ' + (STATUS_TAG[s] || 'mut') + '">' + esc(s) + '</span>'; }
function stripCards(items) {
  return '<div class="stat-strip">' + items.map(function (i) { return '<div class="s"' + (i.go && canGo(i.go) ? ' style="cursor:pointer" onclick="location.hash=\'' + i.go + '\'"' : '') + '><b>' + esc(i.l) + '</b><span' + (i.c ? ' style="color:var(--' + i.c + ')"' : '') + '>' + i.v + '</span></div>'; }).join('') + '</div>';
}
