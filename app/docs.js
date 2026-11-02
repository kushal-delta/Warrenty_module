/* ============================================================
   GUIDE & SYSTEM : end-to-end flow, database schema, import center, message log, activity log
   ============================================================ */
'use strict';

/* ---------------- End-to-end flow ---------------- */
function flowStep(n, t, d, go, who) { return '<div class="fs"><span class="n">' + n + '</span><h4>' + t + '</h4><p>' + d + '</p>' + (who ? '<div class="who">' + who + '</div>' : '') + (go ? '<a class="go" href="' + go[0] + '">' + go[1] + ' →</a>' : '') + '</div>'; }
function demoSerialRows() {
  var g = {};
  DB.all('sticker').forEach(function (s) {
    if (s.status !== 'Printed' && s.status !== 'Generated') return;
    var m = DB.get('product_model', s.model_id) || {}, k = (m.hp || 0) + '|' + s.serial_no.slice(-3), o = g[k] = g[k] || { hp: m.hp, n: s.serial_no.slice(-3) };
    o[s.category] = s.serial_no;
  });
  return Object.keys(g).map(function (k) { return g[k]; }).filter(function (o) { return o.PUMP && o.MOTOR && o.CONTROLLER; }).sort(function (a, b) { return a.hp - b.hp || a.n - b.n; });
}
var SCREEN_LIST = [
  ['Warranty', 'Warranty Sticker Entry (batches)', '#/w/stickers', 'batch', 1], ['Warranty', 'Serial / Sticker Register', '#/w/serials', 'sticker'], ['Warranty', 'Register Warranty (dealer / customer / HO)', '#/w/register', null, 0, 'Add · edit and delete from the Active Warranty list'],
  ['Warranty', 'Active Warranty List', '#/w/active', 'warranty'], ['Warranty', 'Replacement Flow (in warranty)', '#/w/replace', null, 0, 'Replace · undo replacement'], ['Warranty', 'Dealer Approval & Master', '#/w/dealers', 'dealer'], ['Warranty', 'Customers', '#/w/customers', 'customer'],
  ['Service', 'Service Calls', '#/s/calls', 'complaint'], ['Service', 'Call Reminders', '#/s/reminders', 'reminder'], ['Service', 'Visit Reports', '#/s/visits', 'visit'], ['Service', 'Job Cards (spares + labour lines)', '#/s/jobcards', 'jobcard', 1],
  ['Service', 'Replacement / Return Pump', '#/s/replacements', 'servrepl'], ['Stock', 'Stock Ledger & Entry', '#/k/txns', 'stocktxn'],
  ['Masters', 'Product Models', '#/m/models', 'model'], ['Masters', 'Spares & Rates', '#/m/spares', 'spare'], ['Masters', 'Labour / Service Charges', '#/m/labour', 'labour'], ['Masters', 'Fault Master', '#/m/faults', 'fault'], ['Masters', 'Call Types & Valid Days', '#/m/calltypes', 'calltype'],
  ['Masters', 'Projects / Schemes', '#/m/projects', 'project'], ['Masters', 'Service Centers', '#/m/centers', 'center'], ['Masters', 'Engineers', '#/m/engineers', 'engineer'], ['Masters', 'Users & Rights', '#/m/users', 'user'], ['Masters', 'Approval Rules', '#/m/rules', 'rule'],
  ['Masters', 'States', '#/m/states', 'state'], ['Masters', 'Districts', '#/m/states?t=districts', 'district'], ['Masters', 'Company Profile', '#/m/company', null, 0, 'Single record — edit only']
];
ROUTES['flow'] = function () {
  var rows = demoSerialRows().slice(0, 8), dealers = DB.all('dealer').filter(function (d) { return d.status === 'Approved'; }).slice(0, 3), cust = DB.all('customer').slice(0, 2);
  var ck = '<span style="color:var(--ok);font-weight:700">✓</span>', no = '<span style="color:var(--ink4)">—</span>';
  var screens = SCREEN_LIST.map(function (s) {
    var e = s[3] ? ENT[s[3]] : null, imp = e ? !!e.imp || !!s[4] : false;
    return '<tr><td>' + esc(s[0]) + '</td><td><a href="' + s[2] + '">' + esc(s[1]) + '</a>' + (s[5] ? ' <span class="hint">' + esc(s[5]) + '</span>' : '') + '</td><td class="c">' + ck + '</td><td class="c">' + ck + '</td><td class="c">' + (s[1] === 'Company Profile' ? no : ck) + '</td><td class="c">' + (imp ? ck : no) + '</td></tr>';
  }).join('');
  return {
    title: 'End-to-End Flow', crumb: 'Home › Guide › <b>End-to-End Flow</b>', sub: 'Warranty + Service for a solar submersible <b>pump · motor · controller</b> set — each component carries its own serial number and warranty',
    actions: '<a class="btn" href="../Demo-Runbook.html" target="_blank" rel="noopener">' + ICO.flow + ' Demo runbook ↗</a><button class="btn" onclick="location.hash=\'#/db\'">' + ICO.db + ' Database schema</button><button class="btn pri" onclick="location.hash=\'#/w/register\'">' + ICO.shield + ' Start the demo</button>',
    body:
      '<div class="card"><h3>One installation, three warranties</h3><div class="cbody"><div class="setdiag">' +
      '<div class="sd-site"><b>Installation</b><span>site · farmer · dealer · project</span></div>' +
      ['Pump|PUMP', 'Motor|MOTOR', 'Controller|CONTROLLER'].map(function (x) { var p = x.split('|'); return '<div class="sd-c ' + p[1].toLowerCase() + '"><b>' + p[0] + '</b><span>own serial no.</span><span>own model &amp; HP</span><span>own warranty period</span></div>'; }).join('') +
      '</div><p class="hint" style="margin-top:10px">A service call can be raised against any one of them or all three. Spares and labour on a job card are tracked against the component serial, so the company knows exactly which unit is in warranty and which is not. A replaced unit hands its balance warranty to the new serial.</p></div></div>' +

      '<div class="card"><h3>A · Warranty flow</h3><div class="cbody"><div class="fl">' +
      flowStep(1, 'Load serial numbers', 'Production sends the serial list in Excel. Import it as a batch — only serials in this register can ever be registered.', ['#/w/stickers', 'Sticker entry'], 'HO · Excel import') +
      flowStep(2, 'Print stickers + QR', 'Sticker sheet with a QR per serial. The QR opens the registration page on the farmer’s phone.', ['#/w/serials', 'Serial register'], 'HO') +
      flowStep(3, 'Dealer sign-up', 'Dealer signs up from the login page. HO approves; dealer code and password go by WhatsApp.', ['#/w/dealers', 'Dealer approval'], 'Dealer → HO') +
      flowStep(4, 'Register the set', 'Dealer, customer (QR + OTP) or HO enters the pump, motor and controller serials with site details. Checks: authentic · not already registered · HP matches · date not in future.', ['#/w/register', 'Register warranty'], 'Dealer / Customer / HO') +
      flowStep(5, 'Warranty starts', 'One warranty row per serial; dealer-specific warranty period is applied. WhatsApp confirmation and a digital warranty card.', ['#/w/active', 'Active warranty'], 'Automatic') +
      flowStep(6, 'Find any serial', 'Search by serial number to see warranty, owner, calls and replacements. Geo-graphical report by state.', ['#/w/search', 'Serial search'], 'All') +
      flowStep(7, 'Replace in warranty', 'Swap a faulty unit; balance warranty days move to the new serial. Can be undone.', ['#/w/replace', 'Replacement'], 'HO / Dealer') + '</div></div></div>' +

      '<div class="card"><h3>B · Service flow</h3><div class="cbody"><div class="fl">' +
      flowStep(1, 'Book a call', 'Customer, dealer, toll-free or WhatsApp. Pick the installation and the faulty component(s); warranty status is checked per serial. Due date = call date + valid days.', ['#/s/calls', 'Service calls'], 'Anyone') +
      flowStep(2, 'Assign', 'Service center and engineer are assigned; the farmer gets a WhatsApp with the engineer’s name. Reminders for follow-up.', ['#/s/calls', 'Assign'], 'Manager') +
      flowStep(3, 'Visit report', 'Engineer records findings, action, travel and expenses, and the outcome — resolved at site, spares required, replacement required.', ['#/s/visits', 'Visit reports'], 'Engineer') +
      flowStep(4, 'Job card (estimate)', 'Faults found, spares and labour with component serial, rate, GST. Warranty lines are charged to the company, the rest to the customer.', ['#/s/jobcards', 'Job cards'], 'Engineer') +
      flowStep(5, 'Multi-level approval', 'Level 1 service manager for every card; larger amounts continue to the HO head. Reject sends it back for revision.', ['#/s/approvals', 'Approvals'], 'Manager → HO') +
      flowStep(6, 'Stock moves', 'On final approval the spares are deducted from the engineer’s van; faulty warranty parts are held as damaged stock for return.', ['#/k/stock', 'Stock'], 'Automatic') +
      flowStep(7, 'Resolve and close', 'Mark the work done, close the call. Replacement / return pump and credit notes where a unit is swapped.', ['#/s/replacements', 'Return pump'], 'Manager') +
      flowStep(8, 'Reports', 'Call summary by type, engineer and center; job card detail; warranty claim cost; parts consumption.', ['#/s/summary', 'Reports'], 'HO') + '</div></div></div>' +

      '<div class="grid2"><div class="card" style="margin:0"><h3>Live demo — unregistered serial sets <span class="sm2">type into Register Warranty</span></h3><div class="tscroll"><table class="dt"><thead><tr><th class="n">HP</th><th>Pump</th><th>Motor</th><th>Controller</th></tr></thead><tbody>' +
      (rows.map(function (o) { return '<tr><td class="n"><b>' + o.hp + '</b></td><td class="mono">' + o.PUMP + '</td><td class="mono">' + o.MOTOR + '</td><td class="mono">' + o.CONTROLLER + '</td></tr>'; }).join('') || '<tr><td colspan="4" class="muted">All sets are registered — import new serials in Sticker Entry</td></tr>') + '</tbody></table></div></div>' +
      '<div class="card" style="margin:0"><h3>Sign-in details</h3><div class="cbody"><table class="dt"><thead><tr><th>Role</th><th>User</th><th>Password</th></tr></thead><tbody>' +
      '<tr><td>Super admin</td><td class="mono">admin</td><td class="mono">delta@2026</td></tr><tr><td>HO user (UP rights)</td><td class="mono">ho.up</td><td class="mono">delta@2026</td></tr><tr><td>HO head (level-2 approver)</td><td class="mono">ho.head</td><td class="mono">delta@2026</td></tr>' +
      '<tr><td>Service manager</td><td class="mono">mgr.gno / mgr.lko / mgr.jai / mgr.ind</td><td class="mono">delta@2026</td></tr><tr><td>Engineer</td><td class="mono">eng.gno1 · eng.lko1 · eng.jai1 · eng.ind1</td><td class="mono">delta@2026</td></tr>' +
      dealers.map(function (d) { return '<tr><td>Dealer</td><td class="mono">' + esc(d.dealer_code) + ' <span class="hint">' + esc(d.firm_name) + '</span></td><td class="mono">' + esc(d.password) + '</td></tr>'; }).join('') +
      cust.map(function (c) { return '<tr><td>Customer</td><td class="mono">' + esc(c.mobile) + ' <span class="hint">' + esc(c.customer_name) + '</span></td><td class="mono">OTP shown on screen</td></tr>'; }).join('') + '</tbody></table></div></div></div>' +

      '<div class="card" style="margin-top:16px"><h3>Add · Edit · Delete · Excel import on every form</h3><div class="tscroll"><table class="dt"><thead><tr><th>Module</th><th>Screen</th><th class="c">Add</th><th class="c">Edit</th><th class="c">Delete (guarded)</th><th class="c">Excel import</th></tr></thead><tbody>' + screens + '</tbody></table></div>' +
      '<div class="cbody"><div class="hint">Delete is blocked when other records use the item (for example a model with registered serials), and the screen lists what uses it. Every import validates row by row, shows errors in a preview, offers an error report, and can update existing records where a key (code / mobile / serial) matches.</div></div></div>'
  };
};

/* ---------------- Database schema ---------------- */
var ER_NODES = {
  product_model: [20, 20], sticker_batch: [20, 150], sticker: [20, 280], warranty: [270, 280], installation: [520, 150], customer: [770, 20], dealer: [770, 150], project: [770, 280], state_master: [1020, 150],
  complaint: [520, 400], complaint_item: [270, 400], visit_report: [770, 420], app_user: [1020, 420], service_center: [1020, 290], jobcard: [520, 540], jobcard_item: [270, 540], jobcard_approval: [770, 560],
  replacement: [20, 420], replacement_item: [20, 560], spare_master: [270, 660], stock_txn: [520, 680]
};
function erSvg() {
  var W = 1200, H = 760, bw = 158, bh = 40, h = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="er" xmlns="http://www.w3.org/2000/svg"><defs><marker id="ar" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#78909C"/></marker></defs>';
  var c = function (n) { var p = ER_NODES[n]; return [p[0] + bw / 2, p[1] + bh / 2]; }, edge = function (a, b) {
    var pa = c(a), pb = c(b), dx = pb[0] - pa[0], dy = pb[1] - pa[1], f = function (p, s) { var t = Math.min(Math.abs((bw / 2) / (dx || .001)), Math.abs((bh / 2) / (dy || .001))); return [p[0] + s * dx * t, p[1] + s * dy * t]; };
    var s = f(pa, 1), e = f(pb, -1); return [s, e];
  };
  SCHEMA.tables.forEach(function (t) {
    if (!ER_NODES[t.name]) return;
    t.cols.forEach(function (col) {
      if (!col.fk) return; var p = col.fk.split('.')[0]; if (!ER_NODES[p]) return;
      var e = edge(t.name, p); h += '<line x1="' + e[0][0] + '" y1="' + e[0][1] + '" x2="' + e[1][0] + '" y2="' + e[1][1] + '" stroke="#90A4AE" stroke-width="1.2" marker-end="url(#ar)"><title>' + t.name + '.' + col.n + ' → ' + p + '</title></line>';
    });
  });
  var col = { Masters: '#E0F2F1', Warranty: '#E3F2FD', Service: '#FFF3E0', Stock: '#F3E5F5', System: '#ECEFF1' };
  Object.keys(ER_NODES).forEach(function (n) {
    var t = SCHEMA.by[n], p = ER_NODES[n];
    h += '<a href="#/db?t=' + n + '"><g><rect x="' + p[0] + '" y="' + p[1] + '" width="' + bw + '" height="' + bh + '" rx="6" fill="' + col[t.group] + '" stroke="#78909C"/><text x="' + (p[0] + bw / 2) + '" y="' + (p[1] + 17) + '" text-anchor="middle" font-size="11.5" font-weight="700" fill="#263238">' + n + '</text><text x="' + (p[0] + bw / 2) + '" y="' + (p[1] + 31) + '" text-anchor="middle" font-size="10" fill="#607D8B">' + esc(shortName(t.title, 28)) + ' · ' + DB.all(n).length + '</text></g></a>';
  });
  return h + '</svg>';
}
function tableRefs(name) {
  var out = [], t = SCHEMA.by[name];
  t.cols.forEach(function (c) { if (c.fk) out.push({ dir: 'to', col: c.n, table: c.fk.split('.')[0] }); });
  SCHEMA.tables.forEach(function (x) { x.cols.forEach(function (c) { if (c.fk && c.fk.split('.')[0] === name) out.push({ dir: 'from', col: c.n, table: x.name }); }); });
  return out;
}
function dictXlsx() {
  var tabs = [['Group', 'Table', 'Description', 'Rows in demo', 'Notes']], cols = [['Table', 'Column', 'SQL type', 'Null?', 'Key', 'Default', 'Description']], rel = [['Child table', 'Column', 'Parent table', 'Parent column']];
  SCHEMA.tables.forEach(function (t) {
    tabs.push([t.group, t.name, t.title, DB.all(t.name).length, t.note]);
    t.cols.forEach(function (c) { cols.push([t.name, c.n, SCHEMA.sqlType(c.t), c.req ? 'NOT NULL' : 'NULL', c.t === 'pk' ? 'PK' : c.fk ? 'FK' : c.uq ? 'UNIQUE' : '', c.def != null ? c.def : '', c.note]); if (c.fk) { var p = c.fk.split('.'); rel.push([t.name, c.n, p[0], p[1] || SCHEMA.by[p[0]].pk]); } });
  });
  XL.download('Warranty_Service_Data_Dictionary.xlsx', [{ name: 'Tables', rows: tabs, widths: [12, 24, 40, 12, 70] }, { name: 'Columns', rows: cols, widths: [24, 24, 20, 10, 10, 10, 70] }, { name: 'Relationships', rows: rel, widths: [24, 22, 24, 20] }]);
}
function sqlVal(c, v) {
  if (v == null || v === '') return 'NULL';
  if (c.t === 'pk' || c.t === 'int' || c.t === 'bit' || c.t === 'dec' || /^d\d/.test(c.t)) return isNaN(+v) ? 'NULL' : String(+v);
  if (c.t === 'dt') return "'" + String(v).replace('T', ' ').replace(/\.\d+/, '').replace('Z', '') + "'";
  if (c.t === 'date') return "'" + String(v).slice(0, 10) + "'";
  return "N'" + String(v).replace(/'/g, "''") + "'";
}
function dataSql() {
  var o = ['/* Demo data for the Warranty & Service module — generated ' + nowIso().slice(0, 10) + ' from the running demo */', 'SET NOCOUNT ON;', "EXEC sp_MSforeachtable 'ALTER TABLE ? NOCHECK CONSTRAINT ALL';", 'GO'];
  SCHEMA.tables.forEach(function (t) {
    var rows = DB.all(t.name); if (!rows.length) return;
    o.push('', '-- ' + t.title + ' (' + rows.length + ')', 'SET IDENTITY_INSERT dbo.' + t.name + ' ON;');
    rows.forEach(function (r) {
      var cs = t.cols.filter(function (c) { return r[c.n] !== undefined; });
      o.push('INSERT INTO dbo.' + t.name + ' (' + cs.map(function (c) { return c.n; }).join(', ') + ') VALUES (' + cs.map(function (c) { return sqlVal(c, r[c.n]); }).join(', ') + ');');
    });
    o.push('SET IDENTITY_INSERT dbo.' + t.name + ' OFF;', 'GO');
  });
  o.push('', "EXEC sp_MSforeachtable 'ALTER TABLE ? WITH CHECK CHECK CONSTRAINT ALL';", 'GO');
  return o.join('\n');
}
function dbDownload(kind) {
  if (kind === 'ddl') dl(SCHEMA.toSql(), 'Warranty_Service_01_create_tables.sql', 'text/plain');
  else if (kind === 'data') dl(dataSql(), 'Warranty_Service_02_demo_data.sql', 'text/plain');
  else if (kind === 'json') dl(JSON.stringify(DB.d, null, 1), 'warranty-service-data.json', 'application/json');
  else if (kind === 'dict') dictXlsx();
}
ROUTES['db'] = function (a, q) {
  var view = q.v || 'tables', sel = SCHEMA.by[q.t] ? q.t : 'installation', t = SCHEMA.by[sel];
  var tab = function (v, l) { return '<a class="tab' + (view === v ? ' on' : '') + '" href="#/db' + (v === 'tables' ? '' : '?v=' + v) + '">' + l + '</a>'; };
  var body = '';
  if (view === 'er') {
    body = '<div class="card"><h3>Entity relationship — core tables <span class="sm2">arrow = foreign key to the parent table · click a box to open it</span></h3><div class="cbody er-wrap">' + erSvg() + '</div></div>';
  } else if (view === 'sql') {
    body = '<div class="card"><h3>SQL Server script <span class="sm2">generated from the same definition the screens use</span><span style="margin-left:auto"><button class="btn sm" onclick="dbDownload(\'ddl\')">' + ICO.dl + ' Download .sql</button></span></h3><pre class="sqlbox">' + esc(SCHEMA.toSql()) + '</pre></div>';
  } else {
    var refs = tableRefs(sel), n = DB.all(sel).length, sample = DB.all(sel).slice(0, 5);
    body = '<div class="dbwrap"><div class="dbnav">' + SCHEMA.groups.map(function (g) { return '<div class="dbg">' + g + '</div>' + SCHEMA.tables.filter(function (x) { return x.group === g; }).map(function (x) { return '<a class="dbt' + (x.name === sel ? ' on' : '') + '" href="#/db?t=' + x.name + '">' + x.name + '<i>' + DB.all(x.name).length + '</i></a>'; }).join(''); }).join('') + '</div>' +
      '<div><div class="card"><h3>' + esc(t.title) + ' <span class="mono sm2">dbo.' + t.name + '</span><span style="margin-left:auto" class="sm2">' + inr(n) + ' rows · ' + t.cols.length + ' columns</span></h3><div class="cbody">' + (t.note ? '<div class="note">' + esc(t.note) + '</div>' : '') +
      '<div class="tscroll"><table class="dt"><thead><tr><th>Column</th><th>SQL type</th><th>Null?</th><th>Key</th><th>Default</th><th>Description</th></tr></thead><tbody>' +
      t.cols.map(function (c) { return '<tr><td class="mono"><b>' + esc(c.n) + '</b></td><td class="mono">' + esc(SCHEMA.sqlType(c.t)) + '</td><td>' + (c.req ? 'NOT NULL' : 'null') + '</td><td>' + (c.t === 'pk' ? tag('PK', 'ok') : c.fk ? '<a href="#/db?t=' + c.fk.split('.')[0] + '">' + tag('FK → ' + c.fk.split('.')[0], 'info') + '</a>' : c.uq ? tag('UNIQUE', 'pur') : '') + '</td><td class="mono">' + esc(c.def != null ? c.def : '') + '</td><td class="mu">' + esc(c.note) + '</td></tr>'; }).join('') + '</tbody></table></div></div></div>' +
      '<div class="grid2"><div class="card" style="margin:0"><h3>References (parents)</h3><div class="cbody">' + (refs.filter(function (r) { return r.dir === 'to'; }).map(function (r) { return '<div><a href="#/db?t=' + r.table + '" class="mono">' + r.table + '</a> <span class="hint">via ' + r.col + '</span></div>'; }).join('') || '<span class="muted">None — a master table</span>') + '</div></div>' +
      '<div class="card" style="margin:0"><h3>Referenced by (children)</h3><div class="cbody">' + (refs.filter(function (r) { return r.dir === 'from'; }).map(function (r) { return '<div><a href="#/db?t=' + r.table + '" class="mono">' + r.table + '</a> <span class="hint">via ' + r.col + '</span></div>'; }).join('') || '<span class="muted">Nothing refers to this table</span>') + '</div></div></div>' +
      '<div class="card" style="margin-top:16px"><h3>First rows in the demo data</h3><div class="tscroll"><table class="dt"><thead><tr>' + t.cols.slice(0, 9).map(function (c) { return '<th>' + esc(c.n) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (sample.map(function (r) { return '<tr>' + t.cols.slice(0, 9).map(function (c) { var v = r[c.n]; return '<td class="el">' + esc(v == null ? '' : String(v).slice(0, 60)) + '</td>'; }).join('') + '</tr>'; }).join('') || '<tr><td colspan="9" class="muted">No rows</td></tr>') + '</tbody></table></div></div></div></div>';
  }
  return {
    title: 'Database Schema', crumb: 'Home › Guide › <b>Database Schema</b>', sub: SCHEMA.tables.length + ' tables · SQL Server · every screen reads and writes exactly these tables and columns',
    actions: '<button class="btn" onclick="dbDownload(\'dict\')">' + ICO.xls + ' Data dictionary</button><button class="btn" onclick="dbDownload(\'data\')">' + ICO.dl + ' Demo data (SQL)</button><button class="btn pri" onclick="dbDownload(\'ddl\')">' + ICO.dl + ' Create-tables script</button>',
    tabs: '<div class="tabs">' + tab('tables', 'Tables &amp; columns') + tab('er', 'ER diagram') + tab('sql', 'SQL script') + '</div>', body: body
  };
};

/* ---------------- Import center ---------------- */
ROUTES['sys/import'] = function () {
  var groups = {};
  Object.keys(ENT).forEach(function (k) { var e = ENT[k]; if (!e.imp) return; var g = (SCHEMA.by[e.table] || {}).group || 'Other'; (groups[g] = groups[g] || []).push(k); });
  var body = '<div class="note">Every list in the system can be filled from Excel. Download the template, paste your rows, and import: each row is checked, errors are listed with the row number, and good rows are saved. Where a code or mobile number already exists you can choose to update it.</div>';
  ['Masters', 'Warranty', 'Service', 'Stock'].forEach(function (g) {
    if (!groups[g]) return;
    body += '<div class="card"><h3>' + g + '</h3><table class="dt"><thead><tr><th>List</th><th>Columns in the sheet</th><th class="n">Key</th><th style="width:240px"></th></tr></thead><tbody>' +
      groups[g].map(function (k) { var e = ENT[k]; return '<tr><td><b>' + esc(e.plural || e.title) + '</b></td><td class="mu el" style="max-width:520px">' + e.imp.cols.map(function (c) { return esc(c.h) + (c.req ? '*' : ''); }).join(', ') + '</td><td class="n mono">' + esc(e.imp.key || '—') + '</td>' +
        '<td style="text-align:right"><button class="btn sm" onclick="Import.template(\'' + k + '\')">' + ICO.xls + ' Template</button> <button class="btn sm pri" onclick="Import.open(\'' + k + '\')">' + ICO.imp + ' Import</button></td></tr>'; }).join('') + '</tbody></table></div>';
  });
  body += '<div class="card"><h3>Other imports</h3><div class="cbody"><div class="hint">Job card spare and labour lines can be imported inside the job card editor (“Import lines”). The Warranty Sticker Entry screen imports a whole serial batch and records the batch header.</div></div></div>';
  return { title: 'Import Center (Excel)', crumb: 'Home › Guide › <b>Import Center</b>', sub: 'All Excel imports in one place — templates carry sample rows and an Instructions sheet', body: body };
};

/* ---------------- WhatsApp / SMS log ---------------- */
ROUTES['sys/notifications'] = function () {
  var rows = DB.all('notification_log');
  return {
    title: 'WhatsApp / SMS Log', crumb: 'Home › Guide › <b>Message Log</b>', sub: inr(rows.length) + ' automatic messages · the demo records each message here instead of calling the WhatsApp / SMS gateway · click a row to see it as the farmer would',
    body: '<div id="ntGrid"></div>',
    after: function () {
      mountGrid('#ntGrid', {
        title: 'Message_log', rows: rows, sortI: 0, sortD: 'desc', searchPlaceholder: 'Search mobile, template, text…', search: function (r) { return [r.to_mobile, r.template, r.message, r.ref_no].join(' '); },
        filters: [{ label: 'Channel', get: function (r) { return r.channel; } }, { label: 'Template', get: function (r) { return r.template; } }],
        onRow: function (r) { showWa(r); },
        cols: [{ h: 'Sent', val: function (r) { return r.sent_on; }, cell: function (r) { return dmyT(r.sent_on); } }, { h: 'Channel', val: function (r) { return r.channel; }, cell: function (r) { return tag(r.channel, r.channel === 'SMS' ? 'info' : 'ok'); } },
          { h: 'To', val: function (r) { return r.to_mobile; }, cls: 'mono' }, { h: 'Template', val: function (r) { return r.template; } }, { h: 'Reference', val: function (r) { return r.ref_no || ''; } },
          { h: 'Message', val: function (r) { return String(r.message).replace(/\n+/g, ' '); }, cls: 'mu el' }, { h: 'Status', val: function (r) { return r.status; }, cell: function (r) { return tag(r.status, 'ok'); } }]
      });
    }
  };
};

/* ---------------- Activity log ---------------- */
ROUTES['sys/activity'] = function () {
  var rows = DB.all('activity_log');
  return {
    title: 'Activity Log', crumb: 'Home › Guide › <b>Activity Log</b>', sub: inr(rows.length) + ' entries · who created, changed, approved or deleted what',
    body: '<div id="acGrid"></div>',
    after: function () {
      mountGrid('#acGrid', {
        title: 'Activity_log', rows: rows, sortI: 0, sortD: 'desc', pageSize: 50, searchPlaceholder: 'Search user, record, detail…', search: function (r) { return [r.user_name, r.action, r.table_name, r.ref, r.detail].join(' '); },
        filters: [{ label: 'Action', get: function (r) { return r.action; } }, { label: 'Table', get: function (r) { return r.table_name; } }, { label: 'User', get: function (r) { return r.user_name; } }],
        cols: [{ h: 'When', val: function (r) { return r.log_on; }, cell: function (r) { return dmyT(r.log_on); } }, { h: 'User', val: function (r) { return r.user_name; } },
          { h: 'Action', val: function (r) { return r.action; }, cell: function (r) { return tag(r.action, /Delete|Reject|Cancel|Block/.test(r.action) ? 'dang' : /Approv|Created|Regist/.test(r.action) ? 'ok' : 'info'); } },
          { h: 'Table', val: function (r) { return r.table_name; }, cls: 'mono' }, { h: 'Record', val: function (r) { return r.ref; }, cell: function (r) { return '<b>' + esc(r.ref) + '</b>'; } }, { h: 'Detail', val: function (r) { return r.detail; }, cls: 'mu el' }]
      });
    }
  };
};
