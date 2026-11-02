/* ============================================================
   Demo data - part 1 : masters.  (part 2 = seed2.js : stickers, installs, calls, job cards, stock)
   Everything is dated relative to TODAY so the demo always looks live:
   expiring warranties, overdue calls, this-month activity, etc.
   Runs with DB.d pointed at the new data set, so it uses the same DB helpers as the screens.
   ============================================================ */
'use strict';

var SEED = {
  X: {},
  /* small deterministic random generator so every reset gives the same demo */
  _r: 20261031,
  rnd: function () { this._r = (this._r * 1664525 + 1013904223) % 4294967296; return this._r / 4294967296; },
  pick: function (a) { return a[Math.floor(this.rnd() * a.length)]; },
  /** timestamp at a given calendar day */
  at: function (day, hh) { return day + 'T' + String(hh == null ? 10 : hh).padStart(2, '0') + ':' + String(Math.floor(this.rnd() * 50) + 5).padStart(2, '0') + ':00'; },
  ago: function (n) { return addDays(today(), -n); },
  /** document number using the financial year of the document date (not of today) */
  docNo: function (key, fmt, day) {
    var fy = fyOf(day), row = DB.find('doc_sequence', function (r) { return r.seq_key === key && r.fy === fy; });
    if (!row) row = DB.add('doc_sequence', { seq_key: key, prefix: fmt, fy: fy, last_no: 0 }, true);
    row.last_no++;
    return fmt.replace(/\{n(?::(\d+))?\}/, function (m, w) { return w ? String(row.last_no).padStart(+w, '0') : String(row.last_no); }).replace('{fy}', fy);
  },

  build: function () {
    var d = { v: 1, t: {}, seq: {}, built: nowIso() };
    SCHEMA.tables.forEach(function (t) { d.t[t.name] = []; d.seq[t.name] = 0; });
    var prev = DB.d, prevUser = window.APP ? APP.user : null;
    DB.d = d; this._r = 20261031; this.X = {};
    try {
      this.masters();
      if (this.txns) this.txns();
    } finally { DB.d = prev; }
    return d;
  },

  masters: function () {
    var S = this, X = S.X, add = function (t, r) { return DB.add(t, r, true); }, T0 = S.ago(400);

    /* ---------------- company ---------------- */
    add('company_profile', {
      company_name: 'SOLARTIVE TECHNO INDUSTRIES PRIVATE LIMITED', tagline: 'Solar submersible pumps · motors · controllers',
      address: 'Plot Number - 32, Ecotech - 1, Extension - 1', city: 'Greater Noida', state: 'Uttar Pradesh', pincode: '201310',
      phone: '0120-0000000', toll_free: '1800-000-0000', email: 'service@solartive.example', website: 'www.solartive.example',
      gstin: '09ABBCS3892H1ZZ', whatsapp_sender: '+91 90000 00000',
      warranty_terms: '1. Warranty is given on each component separately (pump, motor and controller) from the date of installation / registration.\n' +
        '2. The warranty covers manufacturing defects only. Damage due to dry running, low or high voltage, lightning, flooding, sand / silt in water, wrong wiring, tampering or use of non-genuine spares is not covered.\n' +
        '3. The product serial numbers on the stickers must match this card. Warranty is void if a sticker is removed or damaged.\n' +
        '4. A defective unit found in warranty is repaired or replaced free of charge; the balance warranty of a replaced unit is carried to the new unit.\n' +
        '5. Transport, rig / crane hire for lifting the pump from the borewell and site charges are as per the service charge list unless agreed otherwise.\n' +
        '6. For service, call the toll-free number or raise a call from the Solartive warranty portal with the pump serial number.'
    });

    /* ---------------- states & districts ---------------- */
    var STATES = [['01', 'Jammu & Kashmir', 'JK'], ['02', 'Himachal Pradesh', 'HP'], ['03', 'Punjab', 'PB'], ['04', 'Chandigarh', 'CH'], ['05', 'Uttarakhand', 'UK'], ['06', 'Haryana', 'HR'], ['07', 'Delhi', 'DL'], ['08', 'Rajasthan', 'RJ'],
      ['09', 'Uttar Pradesh', 'UP'], ['10', 'Bihar', 'BR'], ['11', 'Sikkim', 'SK'], ['12', 'Arunachal Pradesh', 'AR'], ['13', 'Nagaland', 'NL'], ['14', 'Manipur', 'MN'], ['15', 'Mizoram', 'MZ'], ['16', 'Tripura', 'TR'], ['17', 'Meghalaya', 'ML'],
      ['18', 'Assam', 'AS'], ['19', 'West Bengal', 'WB'], ['20', 'Jharkhand', 'JH'], ['21', 'Odisha', 'OD'], ['22', 'Chhattisgarh', 'CG'], ['23', 'Madhya Pradesh', 'MP'], ['24', 'Gujarat', 'GJ'], ['26', 'Dadra & Nagar Haveli and Daman & Diu', 'DD'],
      ['27', 'Maharashtra', 'MH'], ['29', 'Karnataka', 'KA'], ['30', 'Goa', 'GA'], ['32', 'Kerala', 'KL'], ['33', 'Tamil Nadu', 'TN'], ['36', 'Telangana', 'TS'], ['37', 'Andhra Pradesh', 'AP']];
    STATES.forEach(function (s) { add('state_master', { state_code: s[0], state_name: s[1], short_name: s[2] }); });
    var DIST = {
      '09': ['Gautam Buddh Nagar', 'Meerut', 'Lucknow', 'Agra', 'Kanpur Nagar', 'Aligarh', 'Bareilly', 'Sitapur', 'Hardoi', 'Barabanki', 'Mathura', 'Bulandshahr', 'Muzaffarnagar', 'Prayagraj', 'Varanasi', 'Gorakhpur', 'Jhansi', 'Ghaziabad', 'Hapur', 'Shamli'],
      '08': ['Jaipur', 'Sikar', 'Alwar', 'Jodhpur', 'Bikaner', 'Nagaur', 'Churu', 'Jhunjhunu', 'Ajmer', 'Kota', 'Bharatpur', 'Barmer', 'Sri Ganganagar'],
      '23': ['Indore', 'Bhopal', 'Ujjain', 'Dewas', 'Sehore', 'Gwalior', 'Jabalpur', 'Ratlam', 'Khargone', 'Rewa'],
      '24': ['Ahmedabad', 'Mehsana', 'Rajkot', 'Surat', 'Banaskantha', 'Kutch', 'Patan'],
      '06': ['Karnal', 'Hisar', 'Rohtak', 'Sirsa', 'Kurukshetra', 'Jind', 'Sonipat', 'Fatehabad'],
      '27': ['Pune', 'Nashik', 'Aurangabad', 'Nagpur', 'Ahmednagar'], '03': ['Ludhiana', 'Bathinda', 'Patiala', 'Sangrur'], '10': ['Patna', 'Gaya', 'Muzaffarpur', 'Bhagalpur'],
      '05': ['Dehradun', 'Haridwar', 'Udham Singh Nagar'], '07': ['New Delhi', 'North West Delhi'], '22': ['Raipur', 'Bilaspur'], '29': ['Bengaluru Rural', 'Belagavi'], '36': ['Hyderabad', 'Medak']
    };
    Object.keys(DIST).forEach(function (sc) { DIST[sc].forEach(function (n) { add('district_master', { state_code: sc, district_name: n }); }); });

    /* ---------------- product models : pump + motor + controller for each HP ---------------- */
    var HPS = [
      { hp: 2, kw: 1.5, c: '20', ac: false, head: '30 - 80 m', q: '40,000 - 70,000 L/day', sz: '4"', dcv: '120 - 300 V DC' },
      { hp: 3, kw: 2.2, c: '30', ac: false, head: '40 - 100 m', q: '60,000 - 95,000 L/day', sz: '4"', dcv: '150 - 380 V DC' },
      { hp: 5, kw: 3.7, c: '50', ac: true, head: '50 - 120 m', q: '90,000 - 1,40,000 L/day', sz: '6"', dcv: '250 - 600 V DC' },
      { hp: 7.5, kw: 5.5, c: '75', ac: true, head: '60 - 150 m', q: '1,30,000 - 2,00,000 L/day', sz: '6"', dcv: '300 - 750 V DC' },
      { hp: 10, kw: 7.5, c: '100', ac: true, head: '70 - 180 m', q: '1,80,000 - 2,70,000 L/day', sz: '6"', dcv: '350 - 800 V DC' }
    ];
    X.HPS = HPS; X.m = { PUMP: {}, MOTOR: {}, CONTROLLER: {} };
    HPS.forEach(function (h) {
      var kind = h.ac ? 'AC' : 'DC', hpTxt = h.hp + ' HP';
      X.m.PUMP[h.hp] = add('product_model', { model_code: 'SSP-' + h.c + '-' + kind, model_name: 'Solartive SolarFlow ' + hpTxt + ' ' + kind + ' Submersible Pump (' + h.sz + ')', category: 'PUMP', hp: h.hp, kw: h.kw, technology: h.ac ? 'Multistage centrifugal, AC drive' : 'Multistage centrifugal, DC', voltage_range: h.dcv, head_range: h.head, discharge: h.q, size_inch: h.sz, warranty_months: 24, is_active: 1, description: 'Stainless steel shaft, mixed-flow impellers, built-in NRV', created_on: S.at(T0, 9) });
      X.m.MOTOR[h.hp] = add('product_model', { model_code: 'SSM-' + h.c + '-' + (h.ac ? 'AC' : 'BL'), model_name: 'Solartive ' + (h.ac ? 'AC Induction' : 'BLDC') + ' Submersible Motor ' + hpTxt, category: 'MOTOR', hp: h.hp, kw: h.kw, technology: h.ac ? 'AC induction, oil filled' : 'DC BLDC, water filled', voltage_range: h.ac ? '415 V 3-phase (VFD driven)' : h.dcv, head_range: null, discharge: null, size_inch: h.sz, warranty_months: 24, is_active: 1, description: 'IP68, thrust bearing with mechanical seal', created_on: S.at(T0, 9) });
      X.m.CONTROLLER[h.hp] = add('product_model', { model_code: 'SSC-' + h.c + '-' + (h.ac ? 'VFD' : 'MPPT'), model_name: 'Solartive SolarDrive ' + (h.ac ? 'MPPT VFD' : 'MPPT') + ' Controller ' + hpTxt, category: 'CONTROLLER', hp: h.hp, kw: h.kw, technology: h.ac ? 'MPPT + VFD' : 'MPPT DC', voltage_range: h.dcv, head_range: null, discharge: null, size_inch: null, warranty_months: 36, is_active: 1, description: 'IP65, dry-run and over-current protection, LCD display, GSM / IoT ready', created_on: S.at(T0, 9) });
    });

    /* ---------------- projects, call types, faults ---------------- */
    X.pj = {};
    [['KUSUM-UP-25', 'PM-KUSUM Component B - Uttar Pradesh', 'PM-KUSUM', '09', 'Active'], ['KUSUM-RJ-25', 'PM-KUSUM Component B - Rajasthan', 'PM-KUSUM', '08', 'Active'],
      ['KUSUM-MP-26', 'PM-KUSUM Component B - Madhya Pradesh', 'PM-KUSUM', '23', 'Active'], ['RETAIL-26', 'Retail / Dealer Sales', 'Retail', null, 'Active'], ['KUSUM-HR-24', 'PM-KUSUM Haryana (completed)', 'PM-KUSUM', '06', 'Closed']
    ].forEach(function (p, i) { X.pj[p[0]] = add('project', { project_no: p[0], project_name: p[1], scheme: p[2], state_code: p[3], start_date: S.ago(700 - i * 60), end_date: p[4] === 'Closed' ? S.ago(120) : null, status: p[4], remarks: null }); });

    X.ct = {};
    [['Warranty Complaint', 3, 1, 'Fault in a product still under warranty - repair / replacement at company cost'], ['Chargeable Service (Out of Warranty)', 7, 0, 'Product out of warranty - estimate approved and billed to the customer'],
      ['Installation / Commissioning Support', 5, 0, 'Site support for wiring, panel alignment or commissioning'], ['Preventive Maintenance', 15, 0, 'Scheduled yearly health check'],
      ['Replacement Request', 5, 1, 'Unit to be replaced; balance warranty is carried to the new serial'], ['Spares Supply', 10, 0, 'Customer / dealer asks for spares only']
    ].forEach(function (c) { X.ct[c[0]] = add('call_type', { call_type: c[0], valid_days: c[1], is_warranty: c[2], description: c[3], is_active: 1 }); });

    X.ft = {};
    [['PUMP', 'Low discharge / low head', 'Water output below rated; check impeller wear, NRV and pipe leakage'], ['PUMP', 'Impeller worn / damaged', 'Sand or silt wear on impeller and diffuser'], ['PUMP', 'Pump jammed / seized', 'Shaft not rotating; sand locked in stages'],
      ['PUMP', 'Shaft broken', 'Shaft or coupling sheared'], ['PUMP', 'Excess noise / vibration', 'Bearing bush wear'], ['MOTOR', 'Winding burnt', 'Insulation failure, phase short'], ['MOTOR', 'Bearing failure', 'Thrust bearing worn, motor heating'],
      ['MOTOR', 'Seal leakage', 'Water entered the motor through the mechanical seal'], ['MOTOR', 'Motor lead cable damaged', 'Cable cut / insulation damaged during lifting'], ['MOTOR', 'Motor not starting', 'No rotation, current drawn normal'],
      ['CONTROLLER', 'No display / dead', 'No power on the controller; check fuse, SPD and main PCB'], ['CONTROLLER', 'Over-current trip', 'Frequent over-current fault'], ['CONTROLLER', 'MPPT not tracking', 'Output frequency low in full sun'],
      ['CONTROLLER', 'Dry-run protection error', 'Dry-run sensor fault / false trip'], ['CONTROLLER', 'IGBT / power module failure', 'Power module burnt after surge'], ['CONTROLLER', 'Display / keypad fault', 'Keys not responding']
    ].forEach(function (f) { X.ft[f[1]] = add('fault_master', { category: f[0], fault_name: f[1], default_nature: f[2], is_active: 1 }); });

    /* ---------------- service centers, users, approval rules ---------------- */
    X.sc = {};
    [['SC-GNO', 'Greater Noida Service Center', 'Mukesh Sharma', '9810090001', 'Plot 32, Ecotech-1 Extension-1', 'Greater Noida', 'Gautam Buddh Nagar', '09', '201310'],
      ['SC-LKO', 'Lucknow Service Center', 'Anil Srivastava', '9415090002', 'Transport Nagar, Kanpur Road', 'Lucknow', 'Lucknow', '09', '226012'],
      ['SC-JAI', 'Jaipur Service Center', 'Vikram Rathore', '9829090003', 'Sitapura Industrial Area', 'Jaipur', 'Jaipur', '08', '302022'],
      ['SC-IND', 'Indore Service Center', 'Hemant Joshi', '9893090004', 'Pithampur Road, Sector 3', 'Indore', 'Indore', '23', '452001']
    ].forEach(function (c) { X.sc[c[0]] = add('service_center', { sc_code: c[0], sc_name: c[1], contact_person: c[2], mobile: c[3], email: c[0].toLowerCase() + '@solartive.example', address: c[4], city: c[5], district: c[6], state_code: c[7], pincode: c[8], gstin: null, is_active: 1 }); });

    X.u = {}; var PW = 'delta@2026';
    function user(un, fn, ln, role, ph, extra) { X.u[un] = add('app_user', Object.assign({ first_name: fn, last_name: ln, username: un, password: PW, phone: ph, email: un.replace('.', '') + '@solartive.example', address: null, role: role, state_rights: null, district_rights: null, form_rights: null, is_admin: 0, sc_id: null, is_active: 1, last_login: null }, extra || {})); }
    user('admin', 'Delta', 'Administrator', 'SUPER', '9810000001', { is_admin: 1 });
    user('ho.up', 'Neha', 'Agarwal', 'HO', '9810000002', { state_rights: '09,07,06,05' });
    user('ho.rj', 'Ravi', 'Khandelwal', 'HO', '9810000003', { state_rights: '08,24' });
    user('ho.head', 'Sanjay', 'Mehta', 'HO', '9810000004', { is_admin: 1 });
    user('mgr.gno', 'Mukesh', 'Sharma', 'MANAGER', '9810090001', { sc_id: X.sc['SC-GNO'].sc_id });
    user('mgr.lko', 'Anil', 'Srivastava', 'MANAGER', '9415090002', { sc_id: X.sc['SC-LKO'].sc_id });
    user('mgr.jai', 'Vikram', 'Rathore', 'MANAGER', '9829090003', { sc_id: X.sc['SC-JAI'].sc_id });
    user('mgr.ind', 'Hemant', 'Joshi', 'MANAGER', '9893090004', { sc_id: X.sc['SC-IND'].sc_id });
    user('eng.gno1', 'Pradeep', 'Kumar', 'ENGINEER', '9811010011', { sc_id: X.sc['SC-GNO'].sc_id, state_rights: '09' });
    user('eng.gno2', 'Rahul', 'Chauhan', 'ENGINEER', '9811010012', { sc_id: X.sc['SC-GNO'].sc_id, state_rights: '09' });
    user('eng.lko1', 'Sandeep', 'Yadav', 'ENGINEER', '9415010013', { sc_id: X.sc['SC-LKO'].sc_id, state_rights: '09' });
    user('eng.lko2', 'Imran', 'Ansari', 'ENGINEER', '9415010014', { sc_id: X.sc['SC-LKO'].sc_id, state_rights: '09' });
    user('eng.jai1', 'Mohan', 'Lal Saini', 'ENGINEER', '9829010015', { sc_id: X.sc['SC-JAI'].sc_id, state_rights: '08' });
    user('eng.jai2', 'Dinesh', 'Meena', 'ENGINEER', '9829010016', { sc_id: X.sc['SC-JAI'].sc_id, state_rights: '08' });
    user('eng.ind1', 'Rakesh', 'Patidar', 'ENGINEER', '9893010017', { sc_id: X.sc['SC-IND'].sc_id, state_rights: '23' });

    add('approval_rule', { level_no: 1, role_name: 'Service Manager', approver_user_id: null, amount_from: 0, is_active: 1 });
    add('approval_rule', { level_no: 2, role_name: 'HO Head', approver_user_id: X.u['ho.head'].user_id, amount_from: 10000, is_active: 1 });

    /* ---------------- spares, rates, labour ---------------- */
    X.sp = {};
    var SP = [
      ['SP-PMP-001', 'Pump impeller set', 'PUMP', 1850, '84139190', 6], ['SP-PMP-002', 'Diffuser / bowl assembly', 'PUMP', 2400, '84139190', 4], ['SP-PMP-003', 'Pump shaft with coupling', 'PUMP', 1650, '84139190', 4],
      ['SP-PMP-004', 'Bearing bush kit', 'PUMP', 780, '84839000', 10], ['SP-PMP-005', 'Suction strainer', 'PUMP', 420, '84139190', 6], ['SP-PMP-006', 'Non-return valve (NRV)', 'PUMP', 1350, '84818030', 6],
      ['SP-MOT-001', 'Stator winding set (rewound)', 'MOTOR', 7800, '85030090', 3], ['SP-MOT-002', 'Rotor assembly', 'MOTOR', 5400, '85030090', 2], ['SP-MOT-003', 'Thrust bearing set', 'MOTOR', 1250, '84821090', 6],
      ['SP-MOT-004', 'Mechanical seal', 'MOTOR', 980, '84842000', 8], ['SP-MOT-005', 'Motor oil / filling kit', 'MOTOR', 380, '27101980', 10], ['SP-MOT-006', 'Motor lead cable (3 m)', 'MOTOR', 640, '85444999', 6],
      ['SP-CTL-001', 'MPPT main PCB', 'CONTROLLER', 6900, '85371000', 3], ['SP-CTL-002', 'Display & keypad module', 'CONTROLLER', 1450, '85371000', 4], ['SP-CTL-003', 'IGBT power module', 'CONTROLLER', 4200, '85412900', 3],
      ['SP-CTL-004', 'Cooling fan', 'CONTROLLER', 520, '84145990', 6], ['SP-CTL-005', 'DC link capacitor set', 'CONTROLLER', 1750, '85322990', 4], ['SP-CTL-006', 'Dry-run / level sensor', 'CONTROLLER', 890, '90261090', 6],
      ['SP-CTL-007', 'DC surge protection device (SPD)', 'CONTROLLER', 1100, '85363090', 5], ['SP-COM-001', 'Submersible cable 3-core (per metre)', 'COMMON', 145, '85444999', 100], ['SP-COM-002', 'Cable jointing kit', 'COMMON', 460, '85469090', 10],
      ['SP-COM-003', 'Safety rope (per metre)', 'COMMON', 38, '56079090', 100], ['SP-COM-004', 'Float switch / tank level sensor', 'COMMON', 780, '90261090', 4], ['SP-COM-005', 'Clamp & hardware kit', 'COMMON', 320, '73182990', 10]
    ];
    SP.forEach(function (s) {
      var uom = /per metre/.test(s[1]) ? 'Mtr' : 'Nos';
      X.sp[s[0]] = add('spare_master', { spare_code: s[0], spare_name: s[1], category: s[2], uom: uom, hsn: s[4], gst_pct: 18, rate: s[3], effective_from: S.ago(200), min_stock: s[5], is_active: 1, description: null });
      add('spare_rate_history', { spare_id: X.sp[s[0]].spare_id, rate: s[3], effective_from: S.ago(200), changed_by: 'Delta Administrator', changed_on: S.at(S.ago(200), 11) });
    });
    /* three spares had an earlier rate - shows the rate history screen */
    ['SP-MOT-001', 'SP-CTL-001', 'SP-PMP-001'].forEach(function (c, i) {
      var sp = X.sp[c], old = Math.round(sp.rate * (0.94 - i * 0.02) / 10) * 10;
      add('spare_rate_history', { spare_id: sp.spare_id, rate: old, effective_from: S.ago(520), changed_by: 'Delta Administrator', changed_on: S.at(S.ago(520), 11) });
    });
    X.lb = {};
    [['LB-001', 'Site visit & fault diagnosis', 'SITE', 600], ['LB-002', 'Pump lifting & refitting (borewell)', 'PUMP', 2500], ['LB-003', 'Motor removal, refit & testing', 'MOTOR', 1800], ['LB-004', 'Controller replacement & commissioning', 'CONTROLLER', 1200],
      ['LB-005', 'Motor rewinding labour', 'MOTOR', 3200], ['LB-006', 'Cable jointing / splicing', 'COMMON', 450], ['LB-007', 'Crane / rig hire (per visit)', 'SITE', 4500], ['LB-008', 'Preventive maintenance service', 'SITE', 900]
    ].forEach(function (l) { X.lb[l[0]] = add('labour_master', { labour_code: l[0], labour_name: l[1], description: null, category: l[2], rate: l[3], gst_pct: 18, effective_from: S.ago(200), is_active: 1 }); });

    /* ---------------- dealers (part 1) ---------------- */
    X.dl = {};
    var DLR = [
      ['1001', 'Kisan Solar Systems', 'Rajesh Tyagi', '9810011001', 'Meerut', 'Meerut', '09', '250001', 'Approved', null],
      ['1002', 'Agri Power Solutions', 'Sunil Verma', '9415022002', 'Lucknow', 'Lucknow', '09', '226010', 'Approved', null],
      ['1003', 'Marudhar Solar Agencies', 'Mahendra Singh', '9829033003', 'Jaipur', 'Jaipur', '08', '302001', 'Approved', 30],
      ['1004', 'Narmada Solar Pumps', 'Prakash Patidar', '9893044004', 'Indore', 'Indore', '23', '452010', 'Approved', null],
      ['1005', 'Hariyali Agro Tech', 'Deepak Malik', '9896055005', 'Karnal', 'Karnal', '06', '132001', 'Approved', null],
      ['1006', 'Shekhawati Solar Hub', 'Ramesh Choudhary', '9414066006', 'Sikar', 'Sikar', '08', '332001', 'Approved', null],
      [null, 'Bharat Urja Traders', 'Amit Gupta', '9760077007', 'Agra', 'Agra', '09', '282002', 'Pending', null],
      ['1007', 'Sunrise Pumps & Motors', 'Faizan Khan', '9935088008', 'Kanpur', 'Kanpur Nagar', '09', '208001', 'Blocked', null]
    ];
    DLR.forEach(function (r, i) {
      var day = S.ago(380 - i * 25), isPend = r[8] === 'Pending';
      var rec = add('dealer', { dealer_code: r[0], firm_name: r[1], contact_person: r[2], mobile: r[3], email: r[2].split(' ')[0].toLowerCase() + '@dealer.example', address: 'Main Market, ' + r[4], city: r[4], district: r[5], state_code: r[6], pincode: r[7],
        gstin: null, password: r[0] ? '123' : '123', warranty_months: r[9], status: r[8], signup_on: S.at(isPend ? S.ago(2) : day, 12), approved_by: isPend ? null : 'Delta Administrator', approved_on: isPend ? null : S.at(addDays(day, 2), 15),
        remarks: r[8] === 'Blocked' ? 'Blocked - unregistered sales found; pending review' : null });
      X.dl[r[0] || 'P'] = rec;
    });
  }
};
