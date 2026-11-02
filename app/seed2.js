/* ============================================================
   Demo data - part 2 : sticker register, customers, installations, warranties
   ============================================================ */
'use strict';

SEED.txns = function () {
  var S = this, X = S.X, add = function (t, r) { return DB.add(t, r, true); };
  var CODE = { PUMP: 'PU', MOTOR: 'MO', CONTROLLER: 'CT' }, CATS = ['PUMP', 'MOTOR', 'CONTROLLER'], hpc = {};
  X.HPS.forEach(function (h) { hpc[h.hp] = h.c; });
  X.CATS = CATS;

  /* ---------- sticker batches (one Excel import = one batch) ---------- */
  X.bAges = [1260, 900, 660, 460, 300, 160, 4];
  X.batches = X.bAges.map(function (age) {
    var day = S.ago(age);
    return add('sticker_batch', { batch_no: S.docNo('STKBATCH', 'STK/{fy}/{n:4}', day), batch_date: day, supplier_name: 'Solartive Techno Industries - Plant 1', remarks: 'Serial numbers loaded from the production Excel sheet', total_serials: 0, created_by: 'Delta Administrator', created_on: S.at(day, 11) });
  });
  function batchForAge(a) { var k = X.bAges.length - 1; for (var i = X.bAges.length - 1; i >= 0; i--) if (X.bAges[i] >= a) { k = i; break; } if (a > X.bAges[0]) k = 0; return X.batches[k]; }

  function sticker(cat, hp, n, mfgDay, status, batch) {
    var m = X.m[cat][hp], sn = mfgDay.slice(2, 4) + mfgDay.slice(5, 7) + CODE[cat] + hpc[hp] + String(n).padStart(3, '0');
    return add('sticker', { batch_id: batch.batch_id, serial_no: sn, model_id: m.model_id, category: cat, supplier_name: 'Solartive Techno Industries', product_group: 'Solar Submersible Pump Set',
      invoice_no: 'SI/' + mfgDay.slice(2, 4) + '/' + (2000 + batch.batch_id * 31 + n), invoice_date: addDays(mfgDay, 3), invoice_location: 'Greater Noida HO', mfg_date: mfgDay, status: status,
      print_count: status === 'Generated' ? 0 : 1, last_printed_on: status === 'Generated' ? null : S.at(addDays(mfgDay, 4), 14), created_on: S.at(batch.batch_date, 11) });
  }
  X.sticker = sticker;

  /* ---------- installations: [name, mobile, village, district, state, pin, dealer, hp, age(days), project, borewell, head, kWp] ---------- */
  var INST = [
    ['Ramesh Kumar', '9810101001', 'Sikri Kalan', 'Meerut', '09', '250103', '1001', 3, 120, 'KUSUM-UP-25', 180, 75, 4.5],
    ['Sunita Devi', '9810101002', 'Bhainsa', 'Muzaffarnagar', '09', '251001', '1001', 5, 45, 'KUSUM-UP-25', 220, 95, 7.5],
    ['Mohan Singh', '9810101003', 'Rasoolpur', 'Gautam Buddh Nagar', '09', '203207', '1001', 2, 760, 'KUSUM-UP-25', 150, 60, 3.0],
    ['Lakhan Pal', '9415101004', 'Bakshi Ka Talab', 'Lucknow', '09', '227202', '1002', 3, 300, 'KUSUM-UP-25', 190, 80, 4.5],
    ['Geeta Rani', '9415101005', 'Malihabad', 'Lucknow', '09', '226102', '1002', 5, 520, 'KUSUM-UP-25', 240, 100, 7.5],
    ['Harish Chandra', '9415101006', 'Mohanlalganj', 'Lucknow', '09', '226301', '1002', 7.5, 706, 'KUSUM-UP-25', 260, 120, 11.0],
    ['Om Prakash', '9415101007', 'Sandila', 'Hardoi', '09', '241204', '1002', 3, 33, 'KUSUM-UP-25', 170, 70, 4.5],
    ['Dharmveer', '9810101008', 'Dankaur', 'Gautam Buddh Nagar', '09', '203201', '1001', 5, 15, 'KUSUM-UP-25', 230, 90, 7.5],
    ['Shiv Kumar', '9450101009', 'Sarsaul', 'Kanpur Nagar', '09', '209402', null, 2, 210, 'RETAIL-26', 140, 55, 3.0],
    ['Bhanwar Lal', '9829101010', 'Dhod', 'Sikar', '08', '332701', '1006', 5, 380, 'KUSUM-RJ-25', 250, 110, 7.5],
    ['Kailash Choudhary', '9829101011', 'Neem Ka Thana', 'Sikar', '08', '332713', '1006', 7.5, 90, 'KUSUM-RJ-25', 280, 130, 11.0],
    ['Ramdev Jat', '9414101012', 'Mundwa', 'Nagaur', '08', '341026', '1003', 3, 170, 'KUSUM-RJ-25', 200, 85, 4.5],
    ['Suresh Meena', '9414101013', 'Bassi', 'Jaipur', '08', '303301', '1003', 2, 60, 'KUSUM-RJ-25', 160, 65, 3.0],
    ['Narayan Gurjar', '9414101014', 'Chomu', 'Jaipur', '08', '303702', '1003', 5, 690, 'KUSUM-RJ-25', 235, 100, 7.5],
    ['Prabhu Dayal', '9829101015', 'Kotputli', 'Jaipur', '08', '303108', '1006', 10, 25, 'KUSUM-RJ-25', 300, 150, 14.0],
    ['Hanuman Ram', '9414101016', 'Shergarh', 'Jodhpur', '08', '342013', null, 3, 905, 'RETAIL-26', 210, 90, 4.5],
    ['Gopal Sharma', '9414101017', 'Phagi', 'Jaipur', '08', '303904', '1003', 2, 1180, 'KUSUM-RJ-25', 145, 58, 3.0],
    ['Mangilal Patidar', '9893101018', 'Depalpur', 'Indore', '23', '453115', '1004', 5, 200, 'KUSUM-MP-26', 245, 105, 7.5],
    ['Bhagirath Verma', '9893101019', 'Sanwer', 'Indore', '23', '453551', '1004', 3, 75, 'KUSUM-MP-26', 185, 78, 4.5],
    ['Kamal Singh Chouhan', '9425101020', 'Ichhawar', 'Sehore', '23', '466115', '1004', 7.5, 410, 'KUSUM-MP-26', 270, 125, 11.0],
    ['Dilip Mandloi', '9425101021', 'Mhow', 'Indore', '23', '453441', '1004', 3, 715, 'KUSUM-MP-26', 195, 82, 4.5],
    ['Balwan Singh', '9896101022', 'Nilokheri', 'Karnal', '06', '132117', '1005', 5, 250, 'KUSUM-HR-24', 225, 92, 7.5],
    ['Jagdish Mann', '9896101023', 'Barwala', 'Hisar', '06', '125121', '1005', 3, 100, 'KUSUM-HR-24', 175, 72, 4.5],
    ['Vijay Patel', '9825101024', 'Becharaji', 'Mehsana', '24', '384210', null, 5, 140, 'RETAIL-26', 215, 88, 7.5],
    ['Dinesh Chaudhary', '9825101025', 'Palanpur', 'Banaskantha', '24', '385001', null, 7.5, 65, 'RETAIL-26', 265, 118, 11.0],
    ['Ramesh Kumar', '9810101001', 'Sikri Kalan (second well)', 'Meerut', '09', '250103', '1001', 2, 500, 'KUSUM-UP-25', 140, 58, 3.0]
  ];
  var ADDR = ['Near Gram Panchayat Bhawan', 'Main Road, near Primary School', 'Khet No. 114, Mandi Road', 'Behind Bus Stand', 'Near Shiv Mandir', 'Ward 3, Station Road', 'Near Canal Pump House', 'Dhani No. 7, Link Road'];
  var GEO = { '09': [26.8, 80.9], '08': [26.9, 75.8], '23': [23.2, 77.4], '06': [29.0, 76.0], '24': [23.2, 72.6] };
  X.inst = {}; X.cust = {}; X.nseq = {};
  INST.map(function (r, i) { return { r: r, i: i + 1 }; }).sort(function (a, b) { return b.r[8] - a.r[8] || a.i - b.i; }).forEach(function (o) {
    var r = o.r, day = S.ago(r[8]), dl = r[6] ? X.dl[r[6]] : null, mfg = addDays(day, -25), n = (X.nseq[r[7]] = (X.nseq[r[7]] || 0) + 1), by = dl ? 'Dealer' : (o.i % 2 ? 'Customer' : 'HO');
    var cust = DB.find('customer', function (c) { return c.mobile === r[1]; });
    if (!cust) cust = add('customer', { customer_name: r[0], mobile: r[1], alt_mobile: null, email: null, address: ADDR[o.i % ADDR.length], village: r[2], city: r[3], district: r[3], state_code: r[4], pincode: r[5], language: r[4] === '24' ? 'GU' : 'HI', created_on: S.at(day, 12), last_login: null });
    var g = GEO[r[4]] || [26.8, 80.9], batch = batchForAge(r[8]);
    var inst = add('installation', { install_no: S.docNo('INSTALL', 'INS/{fy}/{n:4}', day), customer_id: cust.customer_id, dealer_id: dl ? dl.dealer_id : null, install_date: day, site_address: cust.address,
      village: r[2], district: r[3], state_code: r[4], pincode: r[5], latitude: Math.round((g[0] + (S.rnd() - 0.5) * 1.6) * 1e6) / 1e6, longitude: Math.round((g[1] + (S.rnd() - 0.5) * 1.6) * 1e6) / 1e6,
      borewell_depth_m: r[10], dynamic_head_m: r[11], panel_kwp: r[12], project_id: X.pj[r[9]].project_id, invoice_no: 'DI/' + day.slice(2, 4) + '/' + (300 + o.i * 7), invoice_date: day,
      registered_by: by, registered_on: S.at(day, 16), remarks: null });
    var ws = {}, sn = {};
    CATS.forEach(function (cat) {
      var st = sticker(cat, r[7], n, mfg, 'Registered', batch), m = X.m[cat][r[7]], months = warrantyMonthsFor(m, dl ? dl.dealer_id : null);
      ws[cat] = add('warranty', { warranty_no: S.docNo('WARRANTY', 'WR/{fy}/{n:5}', day), install_id: inst.install_id, serial_no: st.serial_no, sticker_id: st.sticker_id, category: cat, model_id: m.model_id, customer_id: cust.customer_id,
        dealer_id: dl ? dl.dealer_id : null, start_date: day, warranty_months: months, extended_months: 0, end_date: addMonths(day, months), status: 'Active', replaced_from_serial: null, registered_by: by, registered_on: S.at(day, 16), whatsapp_sent: 1, remarks: null });
      sn[cat] = st.serial_no;
    });
    X.inst[o.i] = { inst: inst, cust: cust, w: ws, sn: sn, hp: r[7], dl: dl, age: r[8], row: r };
    X.cust[r[1]] = cust;
  });

  /* ---------- fresh, unregistered serial sets : used live for the registration demo ---------- */
  X.pool = {};
  var pday = S.ago(6);
  X.HPS.forEach(function (h) {
    var cnt = (h.hp === 3 || h.hp === 5) ? 5 : 3; X.pool[h.hp] = [];
    for (var k = 0; k < cnt; k++) {
      var set = {}; CATS.forEach(function (c) { set[c] = sticker(c, h.hp, 901 + k, pday, k < 2 ? 'Printed' : 'Generated', X.batches[X.batches.length - 1]); });
      X.pool[h.hp].push(set);
    }
  });
  /* a few serials that were scrapped in production (cannot be registered) */
  [['PUMP', 2], ['CONTROLLER', 3]].forEach(function (p) { var s = sticker(p[0], p[1], 990, pday, 'Scrapped', X.batches[X.batches.length - 1]); s.print_count = 1; });

  if (this.txns2) this.txns2();

  /* batch totals */
  X.batches.forEach(function (b) { b.total_serials = DB.where('sticker', function (s) { return s.batch_id === b.batch_id; }).length; });
};
