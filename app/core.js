/* ============================================================
   Delta iERP  -  core utilities, data grid, charts, Excel (xlsx) reader / writer
   ============================================================ */
'use strict';

/* ---------- DOM ---------- */
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function el(tag, attrs, html) {
  var e = document.createElement(tag);
  if (attrs) for (var k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
    else e.setAttribute(k, attrs[k]);
  }
  if (html != null) e.innerHTML = html;
  return e;
}
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ---------- NUMBER / DATE FORMAT (Indian) ---------- */
function inr(n, dec) {
  if (n == null || n === '' || isNaN(n)) return '0';
  dec = dec == null ? 0 : dec;
  var neg = n < 0; n = Math.abs(n);
  var s = n.toFixed(dec), p = s.split('.'), x = p[0];
  var last3 = x.length > 3 ? x.slice(-3) : x, rest = x.length > 3 ? x.slice(0, -3) : '';
  if (rest) last3 = ',' + last3;
  rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (neg ? '-' : '') + rest + last3 + (p[1] ? '.' + p[1] : '');
}
function cr(n, d) {
  if (n == null || isNaN(n)) return '0';
  d = d == null ? 2 : d;
  var neg = n < 0; n = Math.abs(n); var out;
  if (n >= 1e7) out = (n / 1e7).toFixed(d) + ' Cr';
  else if (n >= 1e5) out = (n / 1e5).toFixed(d) + ' L';
  else if (n >= 1e3) out = (n / 1e3).toFixed(1) + ' K';
  else out = n.toFixed(0);
  return (neg ? '-' : '') + out;
}
function rs(n, d) { return '₹ ' + inr(n, d == null ? 2 : d); }
function rs0(n) { return '₹ ' + inr(n, 0); }
var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dmy(s) {
  if (!s) return '';
  var p = String(s).slice(0, 10).split('-'); if (p.length !== 3) return s;
  return p[2] + '-' + MON[+p[1] - 1] + '-' + p[0];
}
function dmyT(s) {
  if (!s) return '';
  var d = new Date(s); if (isNaN(d)) return s;
  return dmy(ymd(d)) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function today() { return ymd(new Date()); }
function nowIso() { return new Date().toISOString(); }
function parseD(s) { var p = String(s).slice(0, 10).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function addDays(s, n) { var d = parseD(s); d.setDate(d.getDate() + n); return ymd(d); }
function addMonths(s, n) {
  var d = parseD(s), day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return ymd(d);
}
function daysBetween(a, b) { return Math.round((parseD(b) - parseD(a)) / 86400000); }
function ymKey(s) { return s ? String(s).slice(0, 7) : ''; }
function ymLbl(s) { if (!s) return ''; var p = s.split('-'); return MON[+p[1] - 1] + ' ' + p[0].slice(2); }
function fyOf(s) {
  s = s || today();
  var y = +s.slice(0, 4), m = +s.slice(5, 7), a = m >= 4 ? y : y - 1;
  return String(a).slice(2) + '-' + String(a + 1).slice(2);
}

/* ---------- MISC ---------- */
function sum(arr, f) { var t = 0; for (var i = 0; i < arr.length; i++) t += (f ? f(arr[i]) : arr[i]) || 0; return t; }
function uniq(arr) { var s = {}, o = []; for (var i = 0; i < arr.length; i++) { if (arr[i] !== '' && arr[i] != null && !s[arr[i]]) { s[arr[i]] = 1; o.push(arr[i]); } } return o; }
function shortName(s, n) { s = String(s || ''); n = n || 30; return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function pct(a, b) { return b > 0 ? (100 * a / b) : 0; }
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function toNum(v) {
  if (v == null || v === '') return 0;
  var n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
function groupBy(arr, f) { var o = {}; arr.forEach(function (r) { var k = f(r); (o[k] = o[k] || []).push(r); }); return o; }
function sortBy(arr, f, desc) {
  return arr.slice().sort(function (a, b) {
    var x = f(a), y = f(b);
    if (typeof x === 'number' && typeof y === 'number') return desc ? y - x : x - y;
    return desc ? String(y).localeCompare(String(x)) : String(x).localeCompare(String(y));
  });
}
function initials(n) { return String(n || '?').split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join(''); }

function toast(msg, kind) {
  var t = $('#toast');
  if (!t) { t = el('div', { class: 'toast', id: 'toast' }); document.body.appendChild(t); }
  t.className = 'toast ' + (kind || '');
  t.innerHTML = (kind === 'ok' ? ICO.check : kind === 'err' ? ICO.alert : ICO.info) + '<span>' + esc(msg) + '</span>';
  setTimeout(function () { t.classList.add('show'); }, 10);
  clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, kind === 'err' ? 4800 : 3000);
}

/* ---------- ICONS ---------- */
function _i(p, s, w) { return '<svg width="' + (s || 16) + '" height="' + (s || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 1.9) + '" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>'; }
var ICO = {
  search: _i('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>', 14, 2.2),
  bell: _i('<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/>', 17),
  check: _i('<path d="M20 6L9 17l-5-5"/>', 15, 2.6),
  alert: _i('<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0z"/>', 15, 2.2),
  info: _i('<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>', 15, 2.2),
  menu: _i('<path d="M3 12h18M3 6h18M3 18h18"/>', 18, 2),
  chev: '<svg class="caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M9 18l6-6-6-6"/></svg>',
  dash: _i('<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>'),
  shield: _i('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>'),
  wrench: _i('<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>'),
  box: _i('<path d="M21 16V8a2 2 0 00-1-1.7l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.7l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.3 7L12 12l8.7-5M12 22V12"/>'),
  users: _i('<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.9"/><path d="M16 3.1a4 4 0 010 7.8"/>'),
  rep: _i('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>'),
  cog: _i('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.1A1.7 1.7 0 007 19.4a1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00-1.2-2.9H1a2 2 0 110-4h.1A1.7 1.7 0 002.6 7a1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H7a1.7 1.7 0 001-1.5V1a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V7a1.7 1.7 0 001.5 1H23a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
  dl: _i('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>', 13, 2),
  prn: _i('<path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><path d="M6 14h12v8H6z"/>', 13, 2),
  plus: _i('<path d="M12 5v14M5 12h14"/>', 13, 2.4),
  eye: _i('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>', 13, 2),
  back: _i('<path d="M19 12H5M12 19l-7-7 7-7"/>', 13, 2.2),
  empty: _i('<path d="M21 16V8a2 2 0 00-1-1.7l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.7l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>', 46, 1.4),
  ref: _i('<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0114.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0020.5 15"/>', 13, 2),
  edit: _i('<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4z"/>', 13, 2),
  trash: _i('<path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/>', 13, 2),
  imp: _i('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 9l5-5 5 5M12 4v12"/>', 13, 2),
  xls: _i('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M9 13l6 6M15 13l-6 6"/>', 13, 2),
  save: _i('<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>', 13, 2),
  hist: _i('<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 106 5.3L3 8"/><path d="M12 7v5l4 2"/>'),
  arrow: _i('<path d="M5 12h14M13 6l6 6-6 6"/>', 14, 2.4),
  flow: _i('<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M9 6h4a2 2 0 012 2v7"/>'),
  db: _i('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'),
  qr: _i('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1"/>', 14, 2),
  wa: _i('<path d="M21 11.5a8.4 8.4 0 01-12.4 7.4L3 21l2.2-5.4A8.4 8.4 0 1121 11.5z"/>', 15, 2),
  phone: _i('<path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z"/>', 14, 2),
  map: _i('<path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z"/><path d="M8 2v16M16 6v16"/>'),
  cart: _i('<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M1 1h3l2.7 12.4a2 2 0 002 1.6h8.7a2 2 0 002-1.6L23 6H6"/>'),
  swap: _i('<path d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3"/>'),
  user: _i('<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  clock: _i('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', 14, 2),
  tick: _i('<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>', 14, 2),
  x: _i('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>', 14, 2),
  clip: _i('<path d="M21.4 11.1l-9.2 9.2a6 6 0 01-8.5-8.5l9.2-9.2a4 4 0 015.7 5.7l-9.2 9.2a2 2 0 01-2.8-2.8l8.5-8.5"/>', 14, 2)
};

/* ============================================================
   GRID  -  sortable / filterable / paginated data table
   ============================================================ */
function Grid(opts) {
  this.o = opts;                 // {cols, rows, pageSize, search, filters, onRow, totals, actions, onAction, title}
  this.rows = opts.rows || [];
  this.page = 1;
  this.size = opts.pageSize || 25;
  this.sortI = opts.sortI == null ? -1 : opts.sortI;
  this.sortD = opts.sortD || 'desc';
  this.q = '';
  this.fv = {};
  this.id = 'g' + (Grid._n = (Grid._n || 0) + 1);
}
Grid.prototype.filtered = function () {
  var o = this.o, q = this.q.toLowerCase().trim(), fv = this.fv, out = this.rows;
  var fk = Object.keys(fv).filter(function (k) { return fv[k] !== ''; });
  if (fk.length) {
    out = out.filter(function (r) {
      for (var i = 0; i < fk.length; i++) {
        var f = o.filters[+fk[i]];
        if (String(f.get(r)) !== fv[fk[i]]) return false;
      }
      return true;
    });
  }
  if (q) {
    var sf = o.search || function (r) { return o.cols.map(function (c) { return c.val(r); }).join(' '); };
    out = out.filter(function (r) { return String(sf(r)).toLowerCase().indexOf(q) >= 0; });
  }
  if (this.sortI >= 0) {
    var c = o.cols[this.sortI], d = this.sortD === 'asc' ? 1 : -1;
    var sv = c.sort || c.val;
    out = out.slice().sort(function (a, b) {
      var x = sv(a), y = sv(b);
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * d;
      x = String(x == null ? '' : x); y = String(y == null ? '' : y);
      return x.localeCompare(y) * d;
    });
  }
  return out;
};
Grid.prototype.render = function () {
  var self = this, o = this.o;
  var data = this.filtered();
  var tot = data.length;
  var pages = Math.max(1, Math.ceil(tot / this.size));
  if (this.page > pages) this.page = pages;
  var st = (this.page - 1) * this.size;
  var view = this.size >= 99999 ? data : data.slice(st, st + this.size);

  var h = '<div class="tbox" id="' + this.id + '">';
  h += '<div class="ttool">';
  if (o.search !== false) h += '<div class="tsearch">' + ICO.search + '<input type="text" placeholder="' +
    esc(o.searchPlaceholder || 'Search…') + '" value="' + esc(this.q) + '" data-g="q"></div>';
  (o.filters || []).forEach(function (f, i) {
    var vals = f.opts || uniq(self.rows.map(f.get)).sort();
    h += '<select data-g="f" data-i="' + i + '"><option value="">' + esc(f.label) + ': All</option>';
    vals.forEach(function (v) {
      var val = (v && v.v != null) ? v.v : v, lab = (v && v.l != null) ? v.l : v;
      h += '<option value="' + esc(val) + '"' + (self.fv[i] === String(val) ? ' selected' : '') + '>' + esc(lab) + '</option>';
    });
    h += '</select>';
  });
  h += '<div class="sp"></div>';
  if (o.toolExtra) h += o.toolExtra;
  h += '<span class="cntx">' + inr(tot) + ' record' + (tot === 1 ? '' : 's') + '</span>';
  h += '<button class="btn sm" data-g="xl" title="Download the filtered rows as an Excel file">' + ICO.xls + ' Export Excel</button>';
  h += '<button class="btn sm" data-g="print">' + ICO.prn + ' Print</button>';
  h += '</div>';

  if (!tot) {
    h += '<div class="empty">' + ICO.empty + '<div>' + esc(o.emptyText || 'No records match the selected criteria') + '</div></div>';
  } else {
    h += '<div class="tscroll"><table class="dt"><thead><tr>';
    o.cols.forEach(function (c, i) {
      var cl = (c.cls || '') + (self.sortI === i ? ' ' + self.sortD : '') + (c.nosort ? ' nos' : '');
      h += '<th class="' + cl + '"' + (c.nosort ? '' : ' data-g="s" data-i="' + i + '"') + (c.w ? ' style="width:' + c.w + '"' : '') + '>' +
        esc(c.h) + (c.nosort ? '' : '<span class="ar">' + (self.sortI === i ? (self.sortD === 'asc' ? '▲' : '▼') : '▽') + '</span>') + '</th>';
    });
    if (o.actions) h += '<th class="nos" style="width:1%;text-align:right">Actions</th>';
    h += '</tr></thead><tbody>';
    view.forEach(function (r, ri) {
      var rc = (o.onRow ? 'clk ' : '') + (o.rowClass ? o.rowClass(r) : '');
      h += '<tr class="' + rc.trim() + '" data-r="' + (st + ri) + '">';
      o.cols.forEach(function (c) {
        var v = c.cell ? c.cell(r) : esc(c.val(r));
        var tx = String(v).replace(/<[^>]*>/g, '').trim(), nw = tx.length && tx.length <= 26 && !/\s/.test(tx) ? ' nw' : '';
        h += '<td class="' + (c.cls || '') + nw + '">' + v + '</td>';
      });
      if (o.actions) h += '<td class="racts-td"><div class="racts">' + o.actions(r, st + ri) + '</div></td>';
      h += '</tr>';
    });
    h += '</tbody>';
    if (o.totals) {
      h += '<tfoot><tr>';
      o.cols.forEach(function (c, i) {
        var t = o.totals(data, i, c);
        h += '<td class="' + (c.cls || '') + '">' + (t == null ? '' : t) + '</td>';
      });
      if (o.actions) h += '<td></td>';
      h += '</tr></tfoot>';
    }
    h += '</table></div>';
    h += '<div class="tfoot"><span class="cntx">Showing ' + inr(tot ? st + 1 : 0) + ' to ' + inr(Math.min(st + this.size, tot)) +
      ' of ' + inr(tot) + ' entries</span><div class="pg">';
    h += '<button data-g="p" data-p="1"' + (this.page === 1 ? ' disabled' : '') + '>&laquo;</button>';
    h += '<button data-g="p" data-p="' + (this.page - 1) + '"' + (this.page === 1 ? ' disabled' : '') + '>&lsaquo;</button>';
    var s0 = Math.max(1, this.page - 2), e0 = Math.min(pages, s0 + 4); s0 = Math.max(1, e0 - 4);
    for (var p = s0; p <= e0; p++) h += '<button data-g="p" data-p="' + p + '" class="' + (p === this.page ? 'on' : '') + '">' + p + '</button>';
    h += '<button data-g="p" data-p="' + (this.page + 1) + '"' + (this.page === pages ? ' disabled' : '') + '>&rsaquo;</button>';
    h += '<button data-g="p" data-p="' + pages + '"' + (this.page === pages ? ' disabled' : '') + '>&raquo;</button>';
    h += '</div><select data-g="sz">';
    [10, 25, 50, 100, 250].forEach(function (n) { h += '<option value="' + n + '"' + (self.size === n ? ' selected' : '') + '>' + n + ' / page</option>'; });
    h += '<option value="99999"' + (self.size >= 99999 ? ' selected' : '') + '>All</option></select></div>';
  }
  h += '</div>';
  this._data = data; this._view = view; this._st = st;
  return h;
};
Grid.prototype.bind = function (root) {
  var self = this, box = $('#' + this.id, root || document);
  if (!box) return;
  var rerender = function () {
    var nb = el('div'); nb.innerHTML = self.render();
    box.parentNode.replaceChild(nb.firstChild, box);
    self.bind(root);
  };
  var qi = $('[data-g="q"]', box);
  if (qi) {
    qi.addEventListener('input', function () {
      self.q = this.value; self.page = 1;
      var pos = this.selectionStart; rerender();
      var n = $('[data-g="q"]', $('#' + self.id)); if (n) { n.focus(); n.setSelectionRange(pos, pos); }
    });
  }
  $$('[data-g="f"]', box).forEach(function (s) {
    s.addEventListener('change', function () { self.fv[this.dataset.i] = this.value; self.page = 1; rerender(); });
  });
  $$('[data-g="s"]', box).forEach(function (th) {
    th.addEventListener('click', function () {
      var i = +this.dataset.i;
      if (self.sortI === i) self.sortD = self.sortD === 'asc' ? 'desc' : 'asc';
      else { self.sortI = i; self.sortD = 'asc'; }
      rerender();
    });
  });
  $$('[data-g="p"]', box).forEach(function (b) {
    b.addEventListener('click', function () { self.page = +this.dataset.p; rerender(); });
  });
  $$('[data-ra]', box).forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var row = self._data[+this.dataset.ri];
      if (self.o.onAction) self.o.onAction(this.dataset.ra, row);
    });
  });
  var sz = $('[data-g="sz"]', box);
  if (sz) sz.addEventListener('change', function () { self.size = +this.value; self.page = 1; rerender(); });
  var xl = $('[data-g="xl"]', box); if (xl) xl.addEventListener('click', function () { self.xlsx(); });
  var pr = $('[data-g="print"]', box); if (pr) pr.addEventListener('click', function () { window.print(); });
  if (this.o.onRow) {
    $$('tbody tr[data-r]', box).forEach(function (tr) {
      tr.addEventListener('click', function () { self.o.onRow(self._data[+this.dataset.r]); });
    });
  }
  if (this.o.afterBind) this.o.afterBind(box, this);
};
Grid.prototype.xlsx = function () {
  var o = this.o, data = this._data || this.filtered();
  var rows = [o.cols.filter(function (c) { return !c.noexp; }).map(function (c) { return c.h; })];
  data.forEach(function (r) {
    rows.push(o.cols.filter(function (c) { return !c.noexp; }).map(function (c) {
      var v = c.csv ? c.csv(r) : c.val(r);
      return v == null ? '' : v;
    }));
  });
  XL.download((o.title || 'export').replace(/[^\w]+/g, '_') + '_' + today() + '.xlsx', [{ name: (o.title || 'Export').slice(0, 30), rows: rows }]);
  toast('Exported ' + inr(data.length) + ' records to Excel', 'ok');
};
/* mounts a Grid inside a container and returns it */
function mountGrid(sel, opts) {
  var g = new Grid(opts), host = $(sel);
  host.innerHTML = g.render(); g.bind(host);
  return g;
}
function dlBlob(blob, name) {
  var a = el('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
}
function dl(text, name, mime) { dlBlob(new Blob(['﻿' + text], { type: (mime || 'text/plain') + ';charset=utf-8' }), name); }

/* ============================================================
   CHARTS  (pure SVG)
   ============================================================ */
var PAL = ['#009694', '#FFAB40', '#2E6FD9', '#12A150', '#7B5AC4', '#E8A317', '#DC3545', '#00B7C7', '#8D6E63', '#78909C'];

function barChart(data, opt) {
  opt = opt || {};
  var W = opt.w || 720, H = opt.h || 230, ml = opt.ml || 40, mr = 14, mt = 12, mb = opt.mb || 40;
  var iw = W - ml - mr, ih = H - mt - mb;
  var series = opt.series || [{ key: 'v', color: PAL[0], label: '' }];
  var fmtY = opt.fmtY || function (v) { return v >= 1000 ? cr(v, 1) : String(Math.round(v * 10) / 10); };
  var fmtT = opt.fmtT || function (v) { return inr(v); };
  var max = 0;
  data.forEach(function (d) { series.forEach(function (s) { if (d[s.key] > max) max = d[s.key]; }); });
  if (opt.stack) { max = 0; data.forEach(function (d) { var t = 0; series.forEach(function (s) { t += d[s.key] || 0; }); if (t > max) max = t; }); }
  max = max || 1;
  var ticks = 4, step = max / ticks;
  var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">';
  for (var t = 0; t <= ticks; t++) {
    var y = mt + ih - (ih * t / ticks);
    s += '<line x1="' + ml + '" y1="' + y + '" x2="' + (W - mr) + '" y2="' + y + '" stroke="#EEF2F5" stroke-width="1"/>';
    s += '<text x="' + (ml - 7) + '" y="' + (y + 3.5) + '" text-anchor="end" font-size="9.5" fill="#7A8896">' + fmtY(step * t) + '</text>';
  }
  var n = data.length || 1, gw = iw / n, bw = Math.min(opt.bw || 26, gw * (opt.stack ? 0.62 : 0.78 / series.length));
  data.forEach(function (d, i) {
    var gx = ml + gw * i + gw / 2, acc = 0;
    series.forEach(function (se, si) {
      var v = d[se.key] || 0, bh = ih * (v / max);
      var x = opt.stack ? gx - bw / 2 : gx - (series.length * bw) / 2 + si * bw;
      var y = opt.stack ? (mt + ih - acc - bh) : (mt + ih - bh);
      if (opt.stack) acc += bh;
      if (bh > 0.3) s += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (bw - (opt.stack ? 0 : 1.5)).toFixed(1) +
        '" height="' + bh.toFixed(1) + '" fill="' + se.color + '" rx="1.5"><title>' + esc(d.l) + (se.label ? ' — ' + se.label : '') + ': ' + fmtT(v) + '</title></rect>';
    });
    if (n <= 40) {
      var rot = opt.rot || (n > 9 ? -45 : 0);
      s += '<text x="' + gx + '" y="' + (mt + ih + (rot ? 12 : 14)) + '" text-anchor="' + (rot ? 'end' : 'middle') +
        '" font-size="9.5" fill="#7A8896"' + (rot ? ' transform="rotate(' + rot + ' ' + gx + ' ' + (mt + ih + 12) + ')"' : '') + '>' + esc(d.l) + '</text>';
    }
  });
  s += '<line x1="' + ml + '" y1="' + (mt + ih) + '" x2="' + (W - mr) + '" y2="' + (mt + ih) + '" stroke="#D6DEE5"/></svg>';
  if (series.length > 1 || opt.legend) {
    s += '<div class="lgd">' + series.map(function (se) { return '<span><i style="background:' + se.color + '"></i>' + esc(se.label) + '</span>'; }).join('') + '</div>';
  }
  return s;
}

function donut(data, opt) {
  opt = opt || {};
  var fmt = opt.fmt || function (v) { return inr(v); };
  var S = opt.size || 190, R = S / 2, r0 = R * (opt.inner || .60), cx = R, cy = R;
  var tot = sum(data, function (d) { return d.v; }) || 1;
  var a = -Math.PI / 2, s = '<svg class="chart" viewBox="0 0 ' + S + ' ' + S + '" style="max-width:' + S + 'px;margin:0 auto">';
  data.forEach(function (d, i) {
    var frac = d.v / tot, a2 = a + frac * Math.PI * 2, big = frac > .5 ? 1 : 0;
    var c = d.c || PAL[i % PAL.length];
    if (frac >= 0.9999) {
      s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + ((R + r0) / 2) + '" fill="none" stroke="' + c + '" stroke-width="' + (R - r0) + '"/>';
    } else if (frac > 0.0005) {
      var x1 = cx + R * Math.cos(a), y1 = cy + R * Math.sin(a), x2 = cx + R * Math.cos(a2), y2 = cy + R * Math.sin(a2);
      var x3 = cx + r0 * Math.cos(a2), y3 = cy + r0 * Math.sin(a2), x4 = cx + r0 * Math.cos(a), y4 = cy + r0 * Math.sin(a);
      s += '<path d="M' + x1.toFixed(2) + ' ' + y1.toFixed(2) + ' A' + R + ' ' + R + ' 0 ' + big + ' 1 ' + x2.toFixed(2) + ' ' + y2.toFixed(2) +
        ' L' + x3.toFixed(2) + ' ' + y3.toFixed(2) + ' A' + r0 + ' ' + r0 + ' 0 ' + big + ' 0 ' + x4.toFixed(2) + ' ' + y4.toFixed(2) + ' Z" fill="' + c + '">' +
        '<title>' + esc(d.l) + ': ' + fmt(d.v) + ' (' + (frac * 100).toFixed(1) + '%)</title></path>';
    }
    a = a2;
  });
  if (opt.center) {
    s += '<text x="' + cx + '" y="' + (cy + 2) + '" text-anchor="middle" font-size="22" font-weight="700" fill="#15262B">' + esc(opt.center) + '</text>';
    if (opt.center2) s += '<text x="' + cx + '" y="' + (cy + 17) + '" text-anchor="middle" font-size="10" fill="#7A8896">' + esc(opt.center2) + '</text>';
  }
  s += '</svg>';
  s += '<div class="lgd">' + data.map(function (d, i) {
    return '<span><i style="background:' + (d.c || PAL[i % PAL.length]) + '"></i>' + esc(d.l) + ' &nbsp;<b>' + fmt(d.v) + '</b></span>';
  }).join('') + '</div>';
  return s;
}

function barList(data, opt) {
  opt = opt || {};
  var fmt = opt.fmt || function (v) { return inr(v); };
  var max = 0; data.forEach(function (d) { if (Math.abs(d.v) > max) max = Math.abs(d.v); });
  max = max || 1;
  return '<div class="bl">' + data.map(function (d, i) {
    var c = d.c || opt.color || PAL[i % PAL.length];
    var href = opt.href ? opt.href(d) : '';
    var label = esc(d.l);
    return '<div class="r"><div class="nm" title="' + esc(d.t || d.l) + '">' + (href ? '<a href="' + esc(href) + '">' + label + '</a>' : label) + '</div>' +
      '<div class="tr"><i style="width:' + (Math.abs(d.v) / max * 100).toFixed(1) + '%;background:' + c + '"></i></div>' +
      '<div class="vl">' + fmt(d.v, d) + '</div></div>';
  }).join('') + '</div>';
}

/* ---------- MODAL ---------- */
function modal(title, bodyHtml, footHtml, cls) {
  var m = $('#modal');
  if (!m) {
    m = el('div', { class: 'modal', id: 'modal' });
    m.innerHTML = '<div class="mbox"><h3><span id="mt"></span><span class="x">&times;</span></h3><div class="mbody" id="mb"></div><div class="mfoot" id="mf"></div></div>';
    document.body.appendChild(m);
    m.addEventListener('mousedown', function (e) { m._down = e.target === m; });
    m.addEventListener('click', function (e) { if (e.target === m && m._down && !m._sticky) closeModal(); });
    $('.x', m).addEventListener('click', closeModal);
  }
  m._sticky = /sticky/.test(cls || '');
  $('.mbox', m).className = 'mbox ' + (cls || '');
  $('#mt', m).innerHTML = title;
  $('#mb', m).innerHTML = bodyHtml;
  $('#mf', m).innerHTML = footHtml || '<button class="btn" onclick="closeModal()">Close</button>';
  m.classList.add('show');
  return m;
}
function closeModal() { var m = $('#modal'); if (m) m.classList.remove('show'); }
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

function confirmDo(title, body, okLabel, fn, danger) {
  window._confirmFn = fn;
  modal(title, '<div style="font-size:13.5px;line-height:1.6">' + body + '</div>',
    '<button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn ' + (danger ? 'dang' : 'pri') + '" onclick="var f=window._confirmFn;closeModal();if(f)f()">' + okLabel + '</button>', 'narrow');
}
/* ask for one line of text (e.g. a rejection remark) */
function promptDo(title, label, def, okLabel, fn, req) {
  window._promptFn = fn;
  modal(title, '<div class="frm"><div class="f full"><label>' + esc(label) + (req ? ' *' : '') + '</label>' +
    '<textarea id="promptTxt" rows="3">' + esc(def || '') + '</textarea></div></div>',
    '<button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn pri" onclick="var v=$(\'#promptTxt\').value.trim();' + (req ? 'if(!v){toast(\'This field is required\',\'err\');return;}' : '') +
    'var f=window._promptFn;closeModal();if(f)f(v)">' + okLabel + '</button>', 'narrow');
  setTimeout(function () { var t = $('#promptTxt'); if (t) t.focus(); }, 60);
}

/* counter tile */
function counter(o) {
  var clickable = !!o.go && canGo(o.go);
  return '<div class="kpi ' + (o.cls || '') + (clickable ? ' lnk' : '') + '"' +
    (clickable ? ' onclick="location.hash=\'' + o.go + '\'"' : '') + '>' +
    (clickable ? '<span class="kgo">' + ICO.arrow + '</span>' : '') +
    '<div class="kl">' + o.label + '</div>' +
    '<div class="krow"><div><div class="kv">' + o.value + '</div>' +
    (o.sub ? '<div class="ks">' + o.sub + '</div>' : '') + '</div>' +
    (o.qty != null ? '<div class="kqty"><i>' + esc(o.qtyLabel || 'Qty') + '</i><span>' + o.qty + '</span></div>' : '') +
    '</div></div>';
}
function tag(txt, kind) { return '<span class="tag ' + (kind || 'mut') + '">' + esc(txt) + '</span>'; }

/* ============================================================
   XL  -  minimal .xlsx reader / writer (an .xlsx is a zip of XML)
   Reads: sheets, shared strings, inline strings, numbers, dates, booleans
   Writes: header styling, column widths, frozen header row
   ============================================================ */
var XL = {
  _col: function (ref) {
    var m = /^([A-Z]+)/.exec(ref), n = 0, s = m ? m[1] : 'A';
    for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
    return n - 1;
  },
  _colName: function (i) {
    var s = ''; i++;
    while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  },
  _serialToDate: function (n) {
    var d = new Date(Math.round((n - 25569) * 86400) * 1000);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  },

  /** @returns {Promise<Array<{name:string, rows:Array<Array>}>>} */
  read: function (buf) {
    if (typeof JSZip === 'undefined') return Promise.reject(new Error('Excel library not loaded'));
    var xml = function (s) { return new DOMParser().parseFromString(s, 'application/xml'); };
    var txtOf = function (n) {
      var o = '';
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType !== 1) continue;
        if (c.nodeName === 't') o += c.textContent;
        else if (c.nodeName === 'r') o += txtOf(c);
      }
      return o;
    };
    return JSZip.loadAsync(buf).then(function (zip) {
      var need = function (p) {
        var f = zip.file(p);
        if (!f) throw new Error('This does not look like an .xlsx workbook (missing ' + p + ')');
        return f.async('string');
      };
      var opt = function (p) { var f = zip.file(p); return f ? f.async('string') : Promise.resolve(''); };
      return Promise.all([need('xl/workbook.xml'), need('xl/_rels/workbook.xml.rels'), opt('xl/sharedStrings.xml'), opt('xl/styles.xml')])
        .then(function (a) {
          var wb = xml(a[0]), rl = xml(a[1]), rels = {};
          $$('Relationship', rl).forEach(function (r) { rels[r.getAttribute('Id')] = r.getAttribute('Target'); });
          var shared = [];
          if (a[2]) { var sx = xml(a[2]); Array.prototype.forEach.call(sx.getElementsByTagName('si'), function (si) { shared.push(txtOf(si)); }); }
          /* which cell styles are dates */
          var dateXf = {};
          if (a[3]) {
            var st = xml(a[3]), fmts = {};
            Array.prototype.forEach.call(st.getElementsByTagName('numFmt'), function (n) { fmts[n.getAttribute('numFmtId')] = n.getAttribute('formatCode'); });
            var xfs = st.getElementsByTagName('cellXfs')[0];
            if (xfs) Array.prototype.forEach.call(xfs.getElementsByTagName('xf'), function (xf, i) {
              var id = +xf.getAttribute('numFmtId'), isD = false;
              if ((id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 45 && id <= 47) || (id >= 50 && id <= 58)) isD = true;
              else if (fmts[id]) {
                var code = fmts[id].replace(/\[[^\]]*\]|"[^"]*"|\\./g, '');
                isD = /[dmyhs]/i.test(code) && !/^general/i.test(code);
              }
              if (isD) dateXf[i] = 1;
            });
          }
          var sheets = Array.prototype.map.call(wb.getElementsByTagName('sheet'), function (s) {
            var rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
            var t = rels[rid] || '';
            t = t.replace(/^\//, ''); if (t.indexOf('xl/') !== 0) t = 'xl/' + t;
            return { name: s.getAttribute('name'), path: t };
          });
          return Promise.all(sheets.map(function (sh) { return need(sh.path); })).then(function (xmls) {
            return sheets.map(function (sh, si) {
              var sd = xml(xmls[si]), rows = [];
              Array.prototype.forEach.call(sd.getElementsByTagName('row'), function (rw) {
                var rn = +rw.getAttribute('r') - 1, arr = rows[rn] = rows[rn] || [], seq = 0;
                Array.prototype.forEach.call(rw.getElementsByTagName('c'), function (c) {
                  var ref = c.getAttribute('r'), ci = ref ? XL._col(ref) : seq; seq = ci + 1;
                  var t = c.getAttribute('t'), v = null;
                  var vn = c.getElementsByTagName('v')[0];
                  if (t === 'inlineStr') { var is = c.getElementsByTagName('is')[0]; v = is ? txtOf(is) : ''; }
                  else if (vn) {
                    var raw = vn.textContent;
                    if (t === 's') v = shared[+raw] == null ? '' : shared[+raw];
                    else if (t === 'str') v = raw;
                    else if (t === 'b') v = raw === '1';
                    else if (t === 'e') v = '';
                    else {
                      v = parseFloat(raw);
                      if (isNaN(v)) v = raw;
                      else if (dateXf[c.getAttribute('s')]) v = XL._serialToDate(v);
                    }
                  }
                  if (v != null) arr[ci] = v;
                });
              });
              for (var i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
              return { name: sh.name, rows: rows };
            });
          });
        });
    });
  },

  parseCsv: function (text) {
    var rows = [], row = [], cur = '', q = false;
    text = text.replace(/^﻿/, '');
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',' || ch === '\t' || ch === ';') { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); rows.push(row); row = []; cur = '';
      } else cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return [{ name: 'CSV', rows: rows }];
  },

  /** sheets: [{name, rows:[[...]], widths:[n...], header:true}] */
  write: function (sheets) {
    var X = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''); };
    var zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') + '</Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    zip.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map(function (s, i) { return '<sheet name="' + X(String(s.name).replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    zip.file('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF009694"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>');
    sheets.forEach(function (s, i) {
      var rows = s.rows || [], widths = s.widths, out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
      var hdr = s.header !== false;
      if (hdr && rows.length) out += '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
      if (!widths && rows.length) {
        widths = rows[0].map(function (h, ci) {
          var m = String(h == null ? '' : h).length;
          for (var r = 1; r < Math.min(rows.length, 40); r++) { var l = String(rows[r][ci] == null ? '' : rows[r][ci]).length; if (l > m) m = l; }
          return clamp(m + 3, 10, 50);
        });
      }
      if (widths) out += '<cols>' + widths.map(function (w, ci) { return '<col min="' + (ci + 1) + '" max="' + (ci + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>';
      out += '<sheetData>';
      rows.forEach(function (r, ri) {
        out += '<row r="' + (ri + 1) + '">';
        r.forEach(function (v, ci) {
          if (v == null || v === '') return;
          var ref = XL._colName(ci) + (ri + 1), st = (hdr && ri === 0) ? ' s="1"' : '';
          if (typeof v === 'number' && isFinite(v)) out += '<c r="' + ref + '"' + st + '><v>' + v + '</v></c>';
          else out += '<c r="' + ref + '" t="inlineStr"' + st + '><is><t xml:space="preserve">' + X(v) + '</t></is></c>';
        });
        out += '</row>';
      });
      out += '</sheetData></worksheet>';
      zip.file('xl/worksheets/sheet' + (i + 1) + '.xml', out);
    });
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
  },
  download: function (name, sheets) {
    return XL.write(sheets).then(function (b) { dlBlob(b, name); });
  }
};

/* QR code as inline SVG (Kazuhiko Arase encoder, bundled in lib/qrcode.js) */
function qrSvg(text, px) {
  try {
    var q = new QRCodeLib.QRCode(-1, QRCodeLib.ECL.M);
    q.addData(String(text)); q.make();
    var n = q.getModuleCount(), quiet = 2, size = n + quiet * 2, d = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + (c + quiet) + ' ' + (r + quiet) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + (px || 120) + '" height="' + (px || 120) + '" viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges"><rect width="' + size + '" height="' + size + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  } catch (e) { return '<div class="hint">QR unavailable</div>'; }
}
