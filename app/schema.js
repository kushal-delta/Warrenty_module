/* ============================================================================
   Delta iERP  |  Warranty & Service (CSC) module  -  DATABASE SCHEMA
   ----------------------------------------------------------------------------
   ONE definition drives everything:
     - the in-app "Database Schema" screen (tables, columns, keys, ER view)
     - database/01_create_tables.sql  (SQL Server script)
     - database/Data-Dictionary.xlsx
   The demo stores each table as a JSON array with exactly these column names,
   so what the client sees on screen is what goes into SQL.

   Column DSL   'name  type  [flags]  | comment'
     type   int | bit | sN (NVARCHAR N) | txt (NVARCHAR MAX) | date | dt |
            dec (DECIMAL 18,2) | dP,S (DECIMAL P,S)
     flags  *  NOT NULL      u  UNIQUE      >table.col  FOREIGN KEY      =x  DEFAULT
   ============================================================================ */
(function (root) {
  'use strict';

  var S = { tables: [], by: {}, groups: ['Masters', 'Warranty', 'Service', 'Stock', 'System'] };

  function parseCol(str) {
    var comment = '', i = str.indexOf('|');
    if (i >= 0) { comment = str.slice(i + 1).trim(); str = str.slice(0, i); }
    var p = str.trim().split(/\s+/);
    var c = { n: p[0], t: p[1], req: false, uq: false, fk: null, def: null, note: comment };
    for (var k = 2; k < p.length; k++) {
      var f = p[k];
      if (f === '*') c.req = true;
      else if (f === 'u') c.uq = true;
      else if (f.charAt(0) === '>') c.fk = f.slice(1);
      else if (f.charAt(0) === '=') c.def = f.slice(1);
    }
    return c;
  }

  function T(name, group, pk, title, cols, note) {
    var t = { name: name, group: group, pk: pk, title: title, note: note || '', cols: [] };
    t.cols.push({ n: pk, t: 'pk', req: true, uq: false, fk: null, def: null, note: 'Primary key (auto number)' });
    cols.forEach(function (s) { t.cols.push(parseCol(s)); });
    S.tables.push(t); S.by[name] = t;
    return t;
  }

  /* ------------------------------------------------------------------ MASTERS */
  T('company_profile', 'Masters', 'company_id', 'Company Profile', [
    'company_name s120 *', 'tagline s160', 'address s250', 'city s60', 'state s60', 'pincode s10',
    'phone s30', 'toll_free s30 | Customer care / warranty helpline shown on WhatsApp & cards',
    'email s100', 'website s100', 'gstin s20', 'whatsapp_sender s30',
    'warranty_terms txt | Printed on the digital warranty card'
  ], 'Single row. Name, address and helpline appear on cards, job cards and WhatsApp messages.');

  T('state_master', 'Masters', 'state_id', 'State Master', [
    'state_code s2 * u', 'state_name s60 *', 'short_name s3'
  ]);
  T('district_master', 'Masters', 'district_id', 'District Master', [
    'state_code s2 * >state_master.state_code', 'district_name s60 *'
  ]);

  T('product_model', 'Masters', 'model_id', 'Product Model Master', [
    'model_code s30 * u', 'model_name s120 *',
    'category s12 * | PUMP / MOTOR / CONTROLLER',
    'hp d5,2', 'kw d6,3', 'technology s40 | DC BLDC / AC induction / MPPT / VFD',
    'voltage_range s40', 'head_range s40', 'discharge s40', 'size_inch s20 | Borewell / pump size',
    'warranty_months int * =24 | Default warranty for this component',
    'is_active bit * =1', 'description s250', 'created_on dt'
  ], 'Each component of a solar submersible set (pump, motor, controller) is its own model with its own warranty.');

  T('project', 'Masters', 'project_id', 'Project / Scheme Master', [
    'project_no s30 * u', 'project_name s120 *', 'scheme s60 | e.g. PM-KUSUM, State scheme, Retail',
    'state_code s2 >state_master.state_code', 'start_date date', 'end_date date',
    'status s20 * =Active', 'remarks s250'
  ]);

  T('call_type', 'Masters', 'calltype_id', 'Service Call Type Master', [
    'call_type s60 * u', 'valid_days int * | Call valid days (SLA) - due date = call date + valid days',
    'is_warranty bit * =0 | Chargeable to company when in warranty', 'description s250', 'is_active bit * =1'
  ]);

  T('fault_master', 'Masters', 'fault_id', 'Fault Master', [
    'category s12 * | PUMP / MOTOR / CONTROLLER', 'fault_name s100 *', 'default_nature s250', 'is_active bit * =1'
  ]);

  T('service_center', 'Masters', 'sc_id', 'Service Center Master', [
    'sc_code s20 u', 'sc_name s120 *', 'contact_person s80', 'mobile s15', 'email s100', 'address s250',
    'city s60', 'district s60', 'state_code s2 >state_master.state_code', 'pincode s10', 'gstin s20',
    'is_active bit * =1'
  ]);

  T('app_user', 'Masters', 'user_id', 'Users / Engineers', [
    'first_name s60 *', 'last_name s60', 'username s40 * u', 'password s40 * | Demo only - store a salted hash in production',
    'phone s15', 'email s100', 'address s250',
    'role s20 * | SUPER / HO / MANAGER / ENGINEER',
    'state_rights s250 | Comma separated state codes - data visibility',
    'district_rights s500 | Comma separated districts (optional)',
    'form_rights s250 | Comma separated menu groups', 'is_admin bit * =0',
    'sc_id int >service_center.sc_id | Service center of a manager / engineer', 'is_active bit * =1', 'last_login dt'
  ], 'HO users, service managers and field engineers. Engineers are users with role ENGINEER.');

  T('approval_rule', 'Masters', 'rule_id', 'Job Card Approval Rules', [
    'level_no int * u', 'role_name s40 *', 'approver_user_id int >app_user.user_id',
    'amount_from dec * | Level applies when job card total is at or above this amount', 'is_active bit * =1'
  ]);

  /* ----------------------------------------------------------------- WARRANTY */
  T('dealer', 'Warranty', 'dealer_id', 'Dealer Master', [
    'dealer_code s10 u | Generated on approval', 'firm_name s120 *', 'contact_person s80', 'mobile s15 *',
    'email s100', 'address s250', 'city s60', 'district s60', 'state_code s2 >state_master.state_code',
    'pincode s10', 'gstin s20', 'password s40',
    'warranty_months int | Override: warranty period for registrations made by this dealer',
    'status s20 * =Pending | Pending / Approved / Rejected / Blocked',
    'signup_on dt', 'approved_by s60', 'approved_on dt', 'remarks s250'
  ]);

  T('customer', 'Warranty', 'customer_id', 'Customer (End User) Master', [
    'customer_name s100 *', 'mobile s15 * u', 'alt_mobile s15', 'email s100', 'address s250', 'village s80',
    'city s60', 'district s60', 'state_code s2 >state_master.state_code', 'pincode s10',
    'language s10 =EN | EN / HI / GU', 'created_on dt', 'last_login dt'
  ], 'Created automatically at first warranty registration; mobile number is the login (OTP).');

  T('sticker_batch', 'Warranty', 'batch_id', 'Warranty Sticker Batch', [
    'batch_no s30 * u', 'batch_date date *', 'supplier_name s80', 'remarks s250',
    'total_serials int', 'created_by s60', 'created_on dt'
  ], 'One Excel import = one batch.');

  T('sticker', 'Warranty', 'sticker_id', 'Product Serial / Sticker', [
    'batch_id int >sticker_batch.batch_id', 'serial_no s40 * u | Printed on sticker and encoded in the QR',
    'model_id int * >product_model.model_id', 'category s12 * | PUMP / MOTOR / CONTROLLER',
    'supplier_name s80', 'product_group s40', 'invoice_no s40', 'invoice_date date', 'invoice_location s60',
    'mfg_date date', 'status s20 * =Generated | Generated / Printed / Registered / Replaced / Scrapped',
    'print_count int * =0', 'last_printed_on dt', 'created_on dt'
  ], 'Authenticity register: a serial that is not here cannot be registered.');

  T('installation', 'Warranty', 'install_id', 'Installation (Pump Set at Site)', [
    'install_no s30 * u', 'customer_id int * >customer.customer_id', 'dealer_id int >dealer.dealer_id',
    'install_date date *', 'site_address s250', 'village s80', 'district s60',
    'state_code s2 >state_master.state_code', 'pincode s10', 'latitude d9,6', 'longitude d9,6',
    'borewell_depth_m int', 'dynamic_head_m int', 'panel_kwp d6,2 | Solar array size',
    'project_id int >project.project_id', 'invoice_no s40', 'invoice_date date',
    'registered_by s20 | Customer / Dealer / HO', 'registered_on dt', 'remarks s250'
  ], 'One solar pump set at one site: groups the pump, motor and controller warranties.');

  T('warranty', 'Warranty', 'warranty_id', 'Active Warranty (per component serial)', [
    'warranty_no s30 * u', 'install_id int * >installation.install_id',
    'serial_no s40 * u', 'sticker_id int >sticker.sticker_id', 'category s12 *',
    'model_id int >product_model.model_id', 'customer_id int >customer.customer_id', 'dealer_id int >dealer.dealer_id',
    'start_date date *', 'warranty_months int *', 'extended_months int * =0', 'end_date date *',
    'status s20 * =Active | Active / Replaced / Void  (Expired is derived from end_date)',
    'replaced_from_serial s40 | Set when this unit replaced another in warranty',
    'registered_by s20', 'registered_on dt', 'whatsapp_sent bit * =0', 'remarks s250'
  ], 'Pump, motor and controller each carry their own warranty row.');

  T('replacement', 'Warranty', 'repl_id', 'Replacement (Header)', [
    'repl_no s30 * u', 'repl_date date *', 'source s20 * | Dealer / Service',
    'complaint_id int >complaint.complaint_id', 'dealer_id int >dealer.dealer_id',
    'voucher_type s30 | With Serial No / Without Serial No', 'dealer_invoice_no s40', 'dealer_invoice_date date',
    'receipt_date date', 'transporter s80', 'lr_no s40', 'lr_date date',
    'replacement_type s20 | Invoice / Delivery Challan / Credit Note', 'make_sales_invoice bit =0',
    'no_of_articles int', 'reason s250', 'status s20 * =Open | Open / Received / Closed / Cancelled',
    'cn_no s30', 'cn_amount dec', 'remarks s250', 'created_by s60', 'created_on dt'
  ]);
  T('replacement_item', 'Warranty', 'ritem_id', 'Replacement (Lines)', [
    'repl_id int * >replacement.repl_id', 'line_no int', 'category s12', 'invoice_item s120', 'received_item s120',
    'old_serial_no s40', 'new_serial_no s40', 'qty int * =1', 'net_value dec', 'location s60',
    'ref_invoice_no s40', 'ref_invoice_date date', 'warranty_days_left int', 'charges dec', 'remarks s250'
  ]);

  /* ------------------------------------------------------------------ SERVICE */
  T('complaint', 'Service', 'complaint_id', 'Service Call / Complaint', [
    'complaint_no s30 * u', 'call_date date *', 'calltype_id int * >call_type.calltype_id',
    'project_id int >project.project_id', 'priority s10 * =Medium', 'source s20 | Dealer / Customer / Toll Free / WhatsApp / Marketing',
    'status s20 * =New | New / Assigned / Visited / In Approval / Approved / Resolved / Closed / Cancelled',
    'install_id int >installation.install_id', 'customer_id int >customer.customer_id',
    'customer_name s100 *', 'mobile s15 *', 'address s250', 'village s80', 'district s60',
    'state_code s2 >state_master.state_code', 'pincode s10', 'dealer_id int >dealer.dealer_id',
    'warranty_status s20 | In Warranty / Out of Warranty / Partial / Not Registered',
    'complaint_text s500 *', 'sc_id int >service_center.sc_id', 'engineer_id int >app_user.user_id',
    'assigned_on date', 'due_date date', 'closed_on date', 'resolution s500', 'created_by s60', 'created_on dt'
  ]);
  T('complaint_item', 'Service', 'citem_id', 'Complaint - Faulty Components', [
    'complaint_id int * >complaint.complaint_id', 'category s12 *', 'serial_no s40', 'model_id int >product_model.model_id',
    'model_name s120', 'warranty_status s20', 'warranty_end date', 'fault_reported s250'
  ], 'A call can be raised against the pump, the motor, the controller or any combination.');
  T('complaint_reminder', 'Service', 'rem_id', 'Complaint Reminder', [
    'complaint_id int * >complaint.complaint_id', 'remind_on date *', 'note s250', 'status s10 * =Pending',
    'done_on date', 'created_by s60'
  ]);
  T('visit_report', 'Service', 'visit_id', 'Engineer Visit Report', [
    'visit_no s30 u', 'complaint_id int * >complaint.complaint_id', 'engineer_id int * >app_user.user_id',
    'visit_date date *', 'start_time s8', 'end_time s8', 'from_location s120', 'to_location s120',
    'travel_km int', 'travel_exp dec', 'other_exp dec', 'findings s500', 'action_taken s500',
    'outcome s30 * | Resolved at site / Spares required / Job card required / Replacement required / Customer not available',
    'customer_rating int | 1 to 5', 'created_on dt'
  ]);
  T('jobcard', 'Service', 'jobcard_id', 'Job Card (Estimate)', [
    'jobcard_no s30 * u', 'jobcard_date date *', 'revision_no int * =0', 'complaint_id int * >complaint.complaint_id',
    'sc_id int * >service_center.sc_id', 'engineer_id int >app_user.user_id',
    'status s20 * =Draft | Draft / In Approval / Approved / Rejected / Closed', 'notes s500',
    'subtotal_spares dec', 'subtotal_labour dec', 'gst_amount dec', 'other_charges dec', 'grand_total dec',
    'warranty_amount dec | Borne by company (in-warranty lines)', 'customer_payable dec',
    'levels_required int', 'current_level int', 'closed_on date', 'stock_posted bit * =0',
    'created_by s60', 'created_on dt'
  ]);
  T('jobcard_item', 'Service', 'jitem_id', 'Job Card Lines (Spares & Labour)', [
    'jobcard_id int * >jobcard.jobcard_id', 'line_no int', 'item_type s10 * | Spare / Labour',
    'item_id int | spare_id or labour_id', 'item_code s30', 'particulars s200 *', 'category s12',
    'serial_no s40 | Component serial the line is against', 'qty dec * =1', 'rate dec', 'gst_pct d5,2',
    'amount dec', 'warranty bit * =0 | 1 = covered by warranty', 'remarks s150'
  ]);
  T('jobcard_fault', 'Service', 'jfault_id', 'Job Card - Fault Details', [
    'jobcard_id int * >jobcard.jobcard_id', 'fault_id int >fault_master.fault_id', 'category s12',
    'fault_name s100', 'nature s250'
  ]);
  T('jobcard_approval', 'Service', 'appr_id', 'Job Card Multi-level Approval', [
    'jobcard_id int * >jobcard.jobcard_id', 'level_no int *', 'approver_role s40',
    'approver_id int >app_user.user_id', 'status s12 * =Pending | Pending / Approved / Rejected',
    'remarks s250', 'acted_on dt', 'revision_no int * =0 | Job card revision this step belongs to (earlier decisions are kept as history)'
  ]);

  /* -------------------------------------------------------------------- STOCK */
  T('spare_master', 'Stock', 'spare_id', 'Spares Master', [
    'spare_code s30 * u', 'spare_name s120 *', 'category s12 * | PUMP / MOTOR / CONTROLLER / COMMON',
    'uom s10 * =Nos', 'hsn s10', 'gst_pct d5,2 * =18', 'rate dec * | Current standard rate',
    'effective_from date', 'min_stock int * =0', 'is_active bit * =1', 'description s250'
  ]);
  T('spare_rate_history', 'Stock', 'rate_id', 'Spare Rate History', [
    'spare_id int * >spare_master.spare_id', 'rate dec *', 'effective_from date *', 'changed_by s60', 'changed_on dt'
  ]);
  T('labour_master', 'Stock', 'labour_id', 'Labour / Service Charge Master', [
    'labour_code s30 * u', 'labour_name s120 *', 'description s250',
    'category s12 | PUMP / MOTOR / CONTROLLER / COMMON / SITE', 'rate dec *', 'gst_pct d5,2 * =18',
    'effective_from date', 'is_active bit * =1'
  ]);
  T('stock_txn', 'Stock', 'txn_id', 'Stock Ledger (Service Center / Engineer)', [
    'txn_date date *', 'spare_id int * >spare_master.spare_id',
    'loc_type s3 * | SC = service center store, ENG = engineer van stock', 'loc_id int * | sc_id or user_id',
    'bucket s10 * =GOOD | GOOD / DAMAGED',
    'txn_type s20 * | Opening / Receipt / Issue-Out / Transfer-In / Consume / Return-Good / Return-Damaged / Adjust',
    'qty dec * | Signed: + adds to the location, - removes', 'ref_type s20', 'ref_no s40', 'remarks s250',
    'created_by s60', 'created_on dt', 'jitem_id int >jobcard_item.jitem_id | Job card line that consumed this stock (set automatically)'
  ], 'Balance = SUM(qty) per location, spare and bucket. Job card approval posts the Consume rows automatically.');

  /* ------------------------------------------------------------------- SYSTEM */
  T('notification_log', 'System', 'notif_id', 'WhatsApp / SMS Log', [
    'channel s10 * | WhatsApp / SMS / Email', 'to_mobile s15', 'template s40', 'message txt *',
    'ref_type s30', 'ref_no s40', 'sent_on dt *', 'status s20 * =Sent'
  ], 'Every automatic message the system sends. The demo records it here instead of calling the gateway.');
  T('attachment', 'System', 'att_id', 'Attachments (photos / documents)', [
    'ref_type s30 * | complaint / visit / jobcard', 'ref_id int *', 'file_name s120', 'mime s60', 'size_kb int',
    'data_url txt | Demo stores the image inline; production stores a file path', 'caption s150',
    'uploaded_by s60', 'uploaded_on dt'
  ]);
  T('doc_sequence', 'System', 'seq_id', 'Document Numbering', [
    'seq_key s30 *', 'prefix s20', 'fy s7 *', 'last_no int * =0'
  ], 'One row per document key per financial year (seq_key + fy is unique); the next number = last_no + 1.');
  S.by.doc_sequence.uniqueSets = [['seq_key', 'fy']];
  T('activity_log', 'System', 'log_id', 'Activity / Audit Log', [
    'log_on dt *', 'user_name s60', 'action s20', 'table_name s40', 'ref s60', 'detail s250'
  ]);

  /* ----------------------------------------------------------------- SQL OUT */
  S.sqlType = function (t) {
    if (t === 'pk') return 'INT IDENTITY(1,1)';
    if (t === 'int') return 'INT';
    if (t === 'bit') return 'BIT';
    if (t === 'txt') return 'NVARCHAR(MAX)';
    if (t === 'date') return 'DATE';
    if (t === 'dt') return 'DATETIME2(0)';
    if (t === 'dec') return 'DECIMAL(18,2)';
    if (/^d\d/.test(t)) return 'DECIMAL(' + t.slice(1) + ')';
    if (/^s\d/.test(t)) return 'NVARCHAR(' + t.slice(1) + ')';
    return 'NVARCHAR(100)';
  };

  S.toSql = function () {
    var out = [];
    out.push('/* ============================================================================');
    out.push('   Delta iERP - Warranty & Service (CSC) module  -  Solar Submersible Pump, Motor, Controller');
    out.push('   Target: Microsoft SQL Server 2016+      Generated from app/schema.js');
    out.push('   ============================================================================ */');
    out.push('SET NOCOUNT ON;');
    out.push('GO');
    S.groups.forEach(function (g) {
      out.push('');
      out.push('/* ---------------- ' + g.toUpperCase() + ' ---------------- */');
      S.tables.filter(function (t) { return t.group === g; }).forEach(function (t) {
        out.push('');
        if (t.note) out.push('-- ' + t.note);
        out.push('CREATE TABLE dbo.' + t.name + ' (');
        var lines = [];
        t.cols.forEach(function (c) {
          var s = '    ' + c.n + ' ' + S.sqlType(c.t);
          if (c.t === 'pk') s += ' NOT NULL CONSTRAINT PK_' + t.name + ' PRIMARY KEY';
          else {
            s += c.req ? ' NOT NULL' : ' NULL';
            if (c.def != null) s += ' CONSTRAINT DF_' + t.name + '_' + c.n + ' DEFAULT ' + (/^s|^txt/.test(c.t) ? "N'" + c.def + "'" : c.def);
          }
          lines.push(s);
        });
        t.cols.forEach(function (c) {
          if (c.uq && c.req) lines.push('    CONSTRAINT UQ_' + t.name + '_' + c.n + ' UNIQUE (' + c.n + ')');   /* nullable unique columns get a filtered index below (SQL Server allows only one NULL in a plain UNIQUE) */
        });
        (t.uniqueSets || []).forEach(function (u) { lines.push('    CONSTRAINT UQ_' + t.name + '_' + u.join('_') + ' UNIQUE (' + u.join(', ') + ')'); });
        out.push(lines.join(',\n'));
        out.push(');');
        out.push('GO');
        t.cols.forEach(function (c) { if (c.uq && !c.req) { out.push('CREATE UNIQUE INDEX UQ_' + t.name + '_' + c.n + ' ON dbo.' + t.name + ' (' + c.n + ') WHERE ' + c.n + ' IS NOT NULL;'); out.push('GO'); } });
      });
    });
    out.push('');
    out.push('/* ---------------- FOREIGN KEYS ---------------- */');
    S.tables.forEach(function (t) {
      t.cols.forEach(function (c) {
        if (!c.fk) return;
        var p = c.fk.split('.'), ref = S.by[p[0]];
        var col = p[1] || ref.pk;
        out.push('ALTER TABLE dbo.' + t.name + ' ADD CONSTRAINT FK_' + t.name + '_' + c.n +
          ' FOREIGN KEY (' + c.n + ') REFERENCES dbo.' + p[0] + '(' + col + ');');
      });
    });
    out.push('GO');
    out.push('');
    out.push('/* ---------------- INDEXES FOR THE SEARCHES THE SCREENS USE ---------------- */');
    var ix = [
      ['warranty', 'serial_no'], ['warranty', 'install_id'], ['warranty', 'end_date'], ['warranty', 'dealer_id'],
      ['sticker', 'status'], ['sticker', 'model_id'], ['installation', 'customer_id'],
      ['complaint', 'status'], ['complaint', 'call_date'], ['complaint', 'sc_id'], ['complaint', 'engineer_id'],
      ['complaint_item', 'serial_no'], ['jobcard', 'complaint_id'], ['jobcard_item', 'jobcard_id'],
      ['stock_txn', 'spare_id'], ['stock_txn', 'loc_type'], ['notification_log', 'sent_on']
    ];
    ix.forEach(function (p) {
      out.push('CREATE INDEX IX_' + p[0] + '_' + p[1] + ' ON dbo.' + p[0] + '(' + p[1] + ');');
    });
    out.push('GO');
    return out.join('\n');
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = S;
  else root.SCHEMA = S;
})(typeof window !== 'undefined' ? window : this);
