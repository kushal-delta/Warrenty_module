/* ============================================================
   Excel template sample rows
   The sample rows written into every downloaded template are built from the live
   data (real model codes, real engineer / service-centre codes, real unregistered
   serial numbers) so that a template can be imported exactly as it is downloaded.
   ============================================================ */
'use strict';
(function () {
  function setSamples(key, fn) {
    var ent = ENT[key]; if (!ent || !ent.imp) return;
    Object.defineProperty(ent.imp, 'samples', { configurable: true, enumerable: true, get: function () { try { return fn(); } catch (e) { return null; } } });
  }
  function firstEng() { return DB.find('app_user', function (u) { return u.role === 'ENGINEER' && u.is_active !== 0; }) || {}; }
  function free() { return DB.all('sticker').filter(function (s) { return s.status === 'Generated' || s.status === 'Printed'; }); }
  function modelOf(cat, hp) { return DB.find('product_model', function (m) { return m.category === cat && +m.hp === hp; }); }
  function ymd(off) { var d = new Date(); d.setDate(d.getDate() + off); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function yymm() { var d = new Date(); return String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0'); }

  /* a free set of serial numbers for the sticker template (never collides with the register) */
  setSamples('sticker', function () {
    var hp = 5, n = 951, out = [], codes = { PUMP: 'PU', MOTOR: 'MO', CONTROLLER: 'CT' };
    while (['PUMP', 'MOTOR', 'CONTROLLER'].some(function (c) { return stickerBySerial(yymm() + codes[c] + (hp * 10) + n); })) n++;
    ['PUMP', 'MOTOR', 'CONTROLLER'].forEach(function (c) {
      var m = modelOf(c, hp); if (!m) return;
      out.push([yymm() + codes[c] + (hp * 10) + n, m.model_code, c, 'Solartive Greater Noida Plant', hp, 3.7, 'Solar Submersible Pump Set', 'INV/26-27/0612', ymd(-1), 'Greater Noida', ymd(-3)]);
    });
    return out;
  });
  /* warranty bulk registration: two serials of the same unregistered set */
  setSamples('warranty', function () {
    var f = free().filter(function (s) { return s.category === 'PUMP' || s.category === 'MOTOR'; }).sort(function (a, b) { return a.serial_no < b.serial_no ? -1 : 1; });
    var p = f.filter(function (s) { return s.category === 'PUMP'; })[0]; if (!p) return null;
    var mp = DB.get('product_model', p.model_id), m = f.filter(function (s) { return s.category === 'MOTOR' && DB.get('product_model', s.model_id).hp === mp.hp; })[0];
    var rows = [[p.serial_no, 'Ramesh Patel', '9000099001', 'Near Primary School', 'Rampur', 'Jaipur', 'Rajasthan', '302001', '1001', ymd(-2), 'INV/26-27/0412']];
    if (m) rows.push([m.serial_no, 'Ramesh Patel', '9000099001', 'Near Primary School', 'Rampur', 'Jaipur', 'Rajasthan', '302001', '1001', ymd(-2), 'INV/26-27/0412']);
    return rows;
  });
  setSamples('complaint', function () {
    var w = DB.find('warranty', function (x) { return x.category === 'PUMP' && wStatus(x).k !== 'expired'; }) || DB.all('warranty')[0], c = DB.get('customer', w.customer_id), st = DB.find('state_master', function (x) { return x.state_code === c.state_code; });
    return [[ymd(0), 'Warranty Complaint', c.customer_name, c.mobile, c.address, c.village || '', c.district || '', st ? st.state_name : '', w.serial_no, 'Pump not delivering water', 'Medium', 'Toll Free']];
  });
  setSamples('visit', function () {
    var c = DB.find('complaint', function (x) { return x.status === 'Assigned' || x.status === 'New'; }) || DB.all('complaint')[0], e = firstEng();
    return [[c.complaint_no, e.username, ymd(0), 'Job card required', 'Motor winding burnt', 'Motor lifted, job card raised', 42, 450]];
  });
  setSamples('reminder', function () {
    var c = DB.find('complaint', function (x) { return x.status !== 'Closed' && x.status !== 'Cancelled'; }) || DB.all('complaint')[0];
    return [[c.complaint_no, ymd(2), 'Call customer to confirm visit', 'Pending']];
  });
  setSamples('stocktxn', function () {
    var e = firstEng(), sp = DB.all('spare_master')[0];
    return [[ymd(0), sp.spare_code, 'ENG', e.username, 'GOOD', 'Opening', 5, 'Opening stock'], [ymd(0), sp.spare_code, 'SC', (DB.all('service_center')[0] || {}).sc_code, 'GOOD', 'Receipt', 20, 'Received from plant']];
  });
  setSamples('servrepl', function () {
    var w = DB.find('warranty', function (x) { return x.category === 'PUMP' && x.status === 'Active' && wStatus(x).k !== 'expired'; }); if (!w) return null;
    var hp = DB.get('product_model', w.model_id).hp;
    var n = DB.find('sticker', function (s) { return (s.status === 'Generated' || s.status === 'Printed') && s.category === 'PUMP' && DB.get('product_model', s.model_id).hp === hp; });
    if (!n) return null;
    return [[ymd(0), '', '', w.serial_no, n.serial_no, 'Invoice', 0, 'Pump jammed']];
  });
  setSamples('fault', function () { return [['PUMP', 'Cable gland leakage', 'Water seeping at the cable entry', 'Yes']]; });
})();
