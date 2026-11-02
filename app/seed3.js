/* ============================================================
   Demo data - part 3 : service calls, visits, job cards + approvals, replacements, stock, logs
   ============================================================ */
'use strict';

SEED.txns2 = function () {
  var S = this, X = S.X, add = function (t, r) { return DB.add(t, r, true); }, U = function (un) { return X.u[un]; }, I = function (i) { return X.inst[i]; };
  var SCOFF = { 'SC-GNO': ['eng.gno1', 'eng.gno2'], 'SC-LKO': ['eng.lko1', 'eng.lko2'], 'SC-JAI': ['eng.jai1', 'eng.jai2'], 'SC-IND': ['eng.ind1', 'eng.ind1'] };
  var MGR = { 'SC-GNO': 'mgr.gno', 'SC-LKO': 'mgr.lko', 'SC-JAI': 'mgr.jai', 'SC-IND': 'mgr.ind' };
  var LOG = [], NOTE = [];
  function lg(day, user, action, table, ref, detail) { LOG.push({ log_on: S.at(day, 10 + (LOG.length % 7)), user_name: user, action: action, table_name: table, ref: ref, detail: detail || '' }); }
  function nl(day, channel, to, tpl, msg, refType, refNo) { NOTE.push({ channel: channel, to_mobile: to, template: tpl, message: msg, ref_type: refType, ref_no: refNo, sent_on: S.at(day, 11 + (NOTE.length % 6)), status: 'Sent (demo)' }); }
  function scFor(inst) {
    var st = inst.row[4], d = inst.row[3];
    if (st === '09') return ['Lucknow', 'Hardoi', 'Kanpur Nagar', 'Barabanki', 'Sitapur'].indexOf(d) >= 0 ? 'SC-LKO' : 'SC-GNO';
    return st === '08' ? 'SC-JAI' : (st === '23' || st === '24') ? 'SC-IND' : 'SC-GNO';
  }
  function inW(w, day) { return !!w && w.start_date <= day && day <= w.end_date; }

  /* ---------- the service calls (oldest first so document numbers run in date order) ---------- */
  var WC = 'Warranty Complaint', CS = 'Chargeable Service (Out of Warranty)';
  var CALLS = [
    { i: 18, c: ['CONTROLLER'], age: 160, text: 'Controller cooling fan making loud noise and unit heating', src: 'Dealer', pri: 'Low', st: 'Closed', eng: 1, close: 152, res: 'Cooling fan replaced; controller tested for one hour under full sun',
      v: [[158, 'Spares required', 'Fan bearing seized, heat sink dusty', 'Cleaned heat sink; fan to be replaced', 64, 5]], jc: { st: 'Closed', w: 1, age: 157, lines: [['S', 'SP-CTL-004', 1], ['L', 'LB-004', 1]], faults: ['Over-current trip'] } },
    { i: 10, c: ['PUMP'], age: 130, text: 'Water leaking back from the pipe, low discharge', src: 'Customer', pri: 'Medium', st: 'Closed', eng: 1, close: 121, res: 'Non-return valve replaced, discharge normal',
      v: [[127, 'Spares required', 'NRV stuck open', 'Pump lifted and inspected', 52, 4]], jc: { st: 'Closed', w: 1, age: 126, lines: [['S', 'SP-PMP-006', 1], ['L', 'LB-002', 1]], faults: ['Low discharge / low head'] } },
    { i: 3, c: ['PUMP', 'MOTOR', 'CONTROLLER'], t: 'Preventive Maintenance', age: 120, text: 'Yearly preventive maintenance visit', src: 'HO', pri: 'Low', st: 'Closed', eng: 2, close: 117, res: 'Preventive service done, all readings normal',
      v: [[118, 'Resolved at site', 'Pump, motor and controller checked; insulation resistance normal', 'Cleaned controller, tightened terminals', 30, 5]], jc: { st: 'Closed', w: 0, age: 118, lines: [['L', 'LB-008', 1]], faults: [] } },
    { i: 20, c: ['CONTROLLER'], age: 110, text: 'MPPT tracking low, pump runs slowly in full sun', src: 'Toll Free', pri: 'Medium', st: 'Closed', eng: 1, close: 108, res: 'Controller parameters reset at site',
      v: [[109, 'Resolved at site', 'DC voltage setting changed by mistake', 'Reset parameters, tested', 60, 5]] },
    { i: 21, c: ['MOTOR'], t: 'Replacement Request', age: 100, text: 'Motor winding burnt, motor not running', src: 'Dealer', pri: 'High', st: 'Closed', eng: 1, close: 92, res: 'Motor replaced with a new unit; balance warranty carried to the new motor',
      v: [[98, 'Replacement required', 'Winding burnt, not repairable at site', 'Motor to be replaced', 70, 4]] },
    { i: 22, c: ['MOTOR'], age: 95, text: 'Motor tripping again and again', src: 'Dealer', pri: 'High', st: 'Closed', eng: 1, close: 86, res: 'Damaged motor lead cable replaced and jointed',
      v: [[93, 'Spares required', 'Lead cable insulation damaged', 'Pump lifted, cable cut ends checked', 55, 4]], jc: { st: 'Closed', w: 1, age: 91, lines: [['S', 'SP-MOT-006', 1], ['S', 'SP-COM-002', 1], ['L', 'LB-006', 1]], faults: ['Motor lead cable damaged'] } },
    { i: 12, c: ['PUMP'], age: 80, text: 'Pump delivering less water than before', src: 'Customer', pri: 'Medium', st: 'Closed', eng: 2, close: 77, res: 'Suction strainer cleaned, discharge restored',
      v: [[78, 'Resolved at site', 'Strainer choked with silt', 'Cleaned strainer and flushed pipe', 45, 5]] },
    { i: 16, c: ['MOTOR'], t: CS, age: 75, text: 'Motor bearing noisy and heating up', src: 'Customer', pri: 'Medium', st: 'Closed', eng: 1, close: 66, res: 'Bearing and seal replaced; customer paid the estimate',
      v: [[72, 'Spares required', 'Thrust bearing worn, seal weeping', 'Quote given to the farmer', 85, 4]], jc: { st: 'Closed', w: 0, age: 71, lines: [['S', 'SP-MOT-003', 1], ['S', 'SP-MOT-004', 1], ['S', 'SP-MOT-005', 1], ['L', 'LB-003', 1]], faults: ['Bearing failure'] } },
    { i: 9, c: ['PUMP'], age: 58, text: 'Low discharge, pump not lifting water properly', src: 'Customer', pri: 'Medium', st: 'Closed', eng: 2, close: 52, res: 'NRV and strainer replaced',
      v: [[55, 'Spares required', 'NRV leaking, strainer broken', 'Pump lifted', 40, 4]], jc: { st: 'Closed', w: 1, age: 54, lines: [['S', 'SP-PMP-006', 1], ['S', 'SP-PMP-005', 1], ['L', 'LB-002', 1]], faults: ['Low discharge / low head'] } },
    { i: 25, c: ['PUMP', 'CONTROLLER'], t: 'Installation / Commissioning Support', age: 60, text: 'Controller does not detect the solar panels after installation', src: 'Customer', pri: 'Medium', st: 'Closed', eng: 1, close: 58, res: 'DC polarity corrected at the junction box and set commissioned',
      v: [[59, 'Resolved at site', 'Panel string polarity reversed at junction box', 'Re-wired, commissioned and trained the farmer', 120, 5]] },
    { i: 14, c: ['CONTROLLER'], age: 41, text: 'Controller display going blank now and then', src: 'Dealer', pri: 'Medium', st: 'Closed', eng: 2, close: 36, res: 'Display and keypad module replaced',
      v: [[39, 'Spares required', 'Display module loose connection, keypad worn', 'Spare ordered', 38, 4]], jc: { st: 'Closed', w: 1, age: 38, lines: [['S', 'SP-CTL-002', 1], ['L', 'LB-004', 1]], faults: ['Display / keypad fault'] } },
    { i: 24, c: ['PUMP'], age: 28, text: 'Pump is noisy and vibrating', src: 'Customer', pri: 'Medium', st: 'Closed', eng: 1, close: 20, res: 'Bearing bush kit replaced, vibration gone',
      v: [[25, 'Spares required', 'Bearing bush worn', 'Pump lifted and inspected', 75, 5]], jc: { st: 'Closed', w: 1, age: 24, lines: [['S', 'SP-PMP-004', 1], ['L', 'LB-002', 1]], faults: ['Excess noise / vibration'] } },
    { i: 7, c: ['PUMP'], age: 26, text: 'Pump is not lifting water', src: 'Customer', pri: 'Medium', st: 'Cancelled', close: 25, res: 'Duplicate call - the dealer has booked the same problem again' },
    { i: 5, c: ['MOTOR'], age: 22, text: 'Water found in the motor oil and motor is tripping', src: 'Dealer', pri: 'High', st: 'Closed', eng: 1, close: 15, res: 'Mechanical seal and oil replaced',
      v: [[19, 'Spares required', 'Mechanical seal leaking', 'Pump lifted, motor opened', 35, 4]], jc: { st: 'Closed', w: 1, age: 18, lines: [['S', 'SP-MOT-004', 1], ['S', 'SP-MOT-005', 1], ['L', 'LB-003', 1]], faults: ['Seal leakage'] } },
    { i: 20, c: ['PUMP'], age: 12, text: 'Pump jammed, no water coming from the borewell', src: 'Dealer', pri: 'Urgent', st: 'Resolved', eng: 1, close: 4, res: 'Impeller and bush replaced, pump running normally',
      v: [[10, 'Job card required', 'Sand locked in the stages, impeller damaged', 'Pump lifted with crane', 60, null]], jc: { st: 'Approved', w: 1, age: 9, appAge: 5, lines: [['S', 'SP-PMP-001', 1], ['S', 'SP-PMP-004', 1], ['L', 'LB-002', 1], ['L', 'LB-007', 1]], faults: ['Pump jammed / seized', 'Impeller worn / damaged'] } },
    { i: 8, c: ['CONTROLLER'], age: 11, text: 'Controller not powering on after the thunderstorm', src: 'Customer', pri: 'High', st: 'Resolved', eng: 1, close: 2, res: 'SPD and capacitor replaced, controller working',
      v: [[8, 'Spares required', 'DC SPD burnt, capacitor bulged', 'Parts to be replaced', 30, null]], jc: { st: 'Approved', w: 1, age: 7, appAge: 4, lines: [['S', 'SP-CTL-007', 1], ['S', 'SP-CTL-005', 1], ['L', 'LB-004', 1]], faults: ['No display / dead'] } },
    { i: 12, c: ['CONTROLLER'], age: 10, text: 'Dry run error even when water is available', src: 'Customer', pri: 'Medium', st: 'Approved', eng: 2,
      v: [[7, 'Spares required', 'Dry-run sensor reading wrong', 'Sensor to be replaced', 45, null]], jc: { st: 'Approved', w: 1, age: 6, appAge: 3, lines: [['S', 'SP-CTL-006', 1], ['L', 'LB-004', 1]], faults: ['Dry-run protection error'] } },
    { i: 18, c: ['PUMP'], age: 8, text: 'Low discharge and pressure drop in the pipeline', src: 'Dealer', pri: 'Medium', st: 'In Approval', eng: 1,
      v: [[5, 'Job card required', 'Impeller worn from silt, bearing bush loose', 'Estimate prepared', 50, null]], jc: { st: 'L1', w: 1, age: 4, lines: [['S', 'SP-PMP-001', 1], ['S', 'SP-PMP-004', 1], ['L', 'LB-002', 1]], faults: ['Impeller worn / damaged'] } },
    { i: 3, c: ['PUMP', 'MOTOR'], t: CS, age: 7, text: 'Motor burnt and pump shaft broken', src: 'Customer', pri: 'High', st: 'In Approval', eng: 2,
      v: [[5, 'Job card required', 'Stator winding burnt, pump shaft sheared', 'Estimate prepared for the farmer', 25, null]], jc: { st: 'L2', w: 0, age: 4, lines: [['S', 'SP-MOT-001', 1], ['S', 'SP-PMP-003', 1], ['L', 'LB-002', 1], ['L', 'LB-005', 1], ['L', 'LB-007', 1]], faults: ['Winding burnt', 'Shaft broken'], notes: 'Out of warranty - customer has accepted the estimate' } },
    { i: 6, c: ['PUMP', 'CONTROLLER'], age: 6, text: 'Controller power module failed after a power surge; pump delivering less water', src: 'Dealer', pri: 'Urgent', st: 'In Approval', eng: 1,
      v: [[4, 'Job card required', 'IGBT burnt and SPD failed; pump impeller worn', 'Estimate prepared', 40, null]], jc: { st: 'L1', w: 1, age: 3, lines: [['S', 'SP-CTL-003', 1], ['S', 'SP-CTL-007', 1], ['S', 'SP-CTL-005', 1], ['S', 'SP-PMP-001', 1], ['L', 'LB-004', 1], ['L', 'LB-002', 1]], faults: ['IGBT / power module failure', 'Low discharge / low head'] } },
    { i: 11, c: ['MOTOR'], age: 6, text: 'Motor gives burning smell and trips', src: 'Dealer', pri: 'High', st: 'Visited', eng: 1,
      v: [[3, 'Job card required', 'Winding resistance low', 'Estimate prepared', 62, null]], jc: { st: 'Rejected', w: 1, age: 2, lines: [['S', 'SP-MOT-002', 1], ['S', 'SP-MOT-001', 1], ['L', 'LB-005', 1], ['L', 'LB-007', 1]], faults: ['Winding burnt'], rej: 'Amount is too high. Check whether rewinding alone is enough - rotor replacement is not justified.' } },
    { i: 23, c: ['CONTROLLER'], age: 5, text: 'MPPT not tracking; frequency stays low even in full sun', src: 'Dealer', pri: 'Medium', st: 'Visited', eng: 2,
      v: [[2, 'Spares required', 'Main PCB MPPT stage faulty', 'Spare required', 72, null]], jc: { st: 'Draft', w: 1, age: 1, lines: [['S', 'SP-CTL-001', 1], ['L', 'LB-004', 1]], faults: ['MPPT not tracking'] } },
    { i: 4, c: ['PUMP', 'MOTOR'], age: 4, text: 'Pump delivers sand with the water and the motor is heating', src: 'Customer', pri: 'High', st: 'Assigned', eng: 1 },
    { i: 10, c: ['CONTROLLER'], age: 9, text: 'Over-current error E04 shown on the controller', src: 'Dealer', pri: 'High', st: 'Assigned', eng: 1 },
    { i: 22, c: ['PUMP'], age: 3, text: 'Pump making loud noise and vibrating', src: 'Dealer', pri: 'Medium', st: 'Assigned', eng: 2 },
    { i: 2, c: ['CONTROLLER'], age: 1, text: 'Controller display is blank and the pump does not start in the morning', src: 'Customer', pri: 'High', st: 'New' },
    { i: 19, c: ['PUMP'], age: 2, text: 'Water discharge has reduced a lot since last week', src: 'Toll Free', pri: 'Medium', st: 'New' },
    { i: 13, c: ['MOTOR'], age: 0, text: 'Motor trips after about ten minutes of running', src: 'WhatsApp', pri: 'High', st: 'New' },
    { i: 0, c: ['CONTROLLER'], age: 1, text: 'Controller is dead. Bought from a local shop, no warranty card with the farmer', src: 'Toll Free', pri: 'Medium', st: 'New',
      cust: { name: 'Pappu Lal', mobile: '9001234567', village: 'Chaksu', district: 'Jaipur', st: '08', pin: '303901' } }
  ];

  var rules = DB.all('approval_rule').filter(function (r) { return r.is_active == 1; }).sort(function (a, b) { return a.level_no - b.level_no; });
  X.calls = []; X.jcs = [];

  CALLS.sort(function (a, b) { return b.age - a.age; }).forEach(function (c) {
    var day = S.ago(c.age), inst = c.i ? I(c.i) : null, ct = X.ct[c.t || WC], scc = inst ? scFor(inst) : 'SC-JAI', sc = X.sc[scc];
    var eng = c.eng ? U(SCOFF[scc][c.eng - 1]) : null, cu = inst ? inst.cust : null, cx = c.cust, dl = inst ? inst.dl : null, row = inst ? inst.row : null;
    var inCount = 0;
    if (inst) c.c.forEach(function (cat) { if (inW(inst.w[cat], day)) inCount++; });
    var wst = !inst ? 'Not Registered' : inCount === c.c.length ? 'In Warranty' : inCount ? 'Partial' : 'Out of Warranty';
    var by = c.src === 'Customer' ? (cu ? cu.customer_name : '') : c.src === 'Dealer' ? (dl ? dl.firm_name : 'Dealer') : c.src === 'WhatsApp' ? 'WhatsApp bot' : 'Neha Agarwal';
    var open = ['New', 'Assigned', 'Visited', 'In Approval', 'Approved'].indexOf(c.st) >= 0;
    var call = add('complaint', {
      complaint_no: S.docNo('COMPLAINT', 'SC/{fy}/{n:4}', day), call_date: day, calltype_id: ct.calltype_id, project_id: inst ? inst.inst.project_id : X.pj['RETAIL-26'].project_id, priority: c.pri, source: c.src, status: c.st,
      install_id: inst ? inst.inst.install_id : null, customer_id: cu ? cu.customer_id : null, customer_name: cu ? cu.customer_name : cx.name, mobile: cu ? cu.mobile : cx.mobile,
      address: inst ? inst.inst.site_address : 'Near Gram Panchayat Bhawan', village: row ? row[2] : cx.village, district: row ? row[3] : cx.district, state_code: row ? row[4] : cx.st, pincode: row ? row[5] : cx.pin,
      dealer_id: dl ? dl.dealer_id : null, warranty_status: wst, complaint_text: c.text, sc_id: sc.sc_id, engineer_id: eng ? eng.user_id : null,
      assigned_on: eng ? (c.age >= 1 ? addDays(day, 1) : day) : null, due_date: addDays(day, ct.valid_days), closed_on: c.close != null ? S.ago(c.close) : null,
      resolution: c.res || null, created_by: by, created_on: S.at(day, 10)
    });
    X.calls.push(call);
    c.c.forEach(function (cat) {
      var w = inst ? inst.w[cat] : null;
      add('complaint_item', { complaint_id: call.complaint_id, category: cat, serial_no: w ? w.serial_no : null, model_id: w ? w.model_id : null, model_name: w ? modelName(w.model_id) : '',
        warranty_status: !w ? 'Not registered' : inW(w, day) ? 'In warranty' : 'Out of warranty', warranty_end: w ? w.end_date : null, fault_reported: c.text });
    });
    lg(day, by || 'System', 'Created', 'complaint', call.complaint_no, c.text.slice(0, 80));
    nl(day, 'WhatsApp', call.mobile, 'COMPLAINT_BOOKED', (function () { call._sla = ct.valid_days; var m = MSG.complaintBooked(call); delete call._sla; return m; })(), 'complaint', call.complaint_no);
    if (eng) { lg(call.assigned_on, 'Service Manager', 'Assigned', 'complaint', call.complaint_no, userName(eng.user_id)); if (open) nl(call.assigned_on, 'WhatsApp', call.mobile, 'ENGINEER_ASSIGNED', MSG.engineerAssigned(call, eng, sc), 'complaint', call.complaint_no); }
    if (c.close != null && c.st === 'Resolved') nl(S.ago(c.close), 'WhatsApp', call.mobile, 'CALL_RESOLVED', MSG.resolved(call), 'complaint', call.complaint_no);

    /* visits */
    (c.v || []).forEach(function (v) {
      var vday = S.ago(v[0]);
      var vr = add('visit_report', { visit_no: S.docNo('VISIT', 'VR/{fy}/{n:4}', vday), complaint_id: call.complaint_id, engineer_id: eng.user_id, visit_date: vday, start_time: '10:00', end_time: '12:30', from_location: sc.city, to_location: call.village || call.district,
        travel_km: v[4], travel_exp: v[4] * 6, other_exp: v[1] === 'Replacement required' || /crane/i.test(v[3]) ? 150 : 0, findings: v[2], action_taken: v[3], outcome: v[1], customer_rating: v[5], created_on: S.at(vday, 13) });
      lg(vday, userName(eng.user_id), 'Created', 'visit_report', vr.visit_no, v[1]);
    });

    /* job card */
    var j = c.jc;
    if (j) {
      var jday = S.ago(j.age), lines = j.lines.map(function (l) {
        var s = l[0] === 'S', rec = s ? X.sp[l[1]] : X.lb[l[1]], cat = rec.category;
        var sn = inst ? (inst.sn[cat] || inst.sn[c.c[0]]) : null;
        return { type: s ? 'Spare' : 'Labour', item_id: s ? rec.spare_id : rec.labour_id, code: s ? rec.spare_code : rec.labour_code, name: s ? rec.spare_name : rec.labour_name, cat: cat, sn: sn, qty: l[2], rate: rec.rate, gst: rec.gst_pct, warranty: j.w ? 1 : 0 };
      });
      var t = jcTotals(lines, j.other || 0), need = rules.filter(function (r) { return r.amount_from <= t.grand; });
      var stMap = { Draft: 'Draft', L1: 'In Approval', L2: 'In Approval', Approved: 'Approved', Closed: 'Closed', Rejected: 'Rejected' }, fin = j.st === 'Approved' || j.st === 'Closed';
      var jc = add('jobcard', {
        jobcard_no: S.docNo('JOBCARD', 'JC/{fy}/{n:4}', jday), jobcard_date: jday, revision_no: 0, complaint_id: call.complaint_id, sc_id: sc.sc_id, engineer_id: eng.user_id, status: stMap[j.st], notes: j.notes || null,
        subtotal_spares: t.sp, subtotal_labour: t.lb, gst_amount: t.gst, other_charges: t.other, grand_total: t.grand, warranty_amount: t.warranty, customer_payable: t.payable,
        levels_required: j.st === 'Draft' ? null : need.length, current_level: (j.st === 'L1' || j.st === 'L2') ? need[j.st === 'L1' ? 0 : 1].level_no : null,
        closed_on: j.st === 'Closed' ? S.ago(c.close) : null, stock_posted: fin ? 1 : 0, created_by: userName(eng.user_id), created_on: S.at(jday, 15)
      });
      X.jcs.push(jc);
      lines.forEach(function (l, n) {
        add('jobcard_item', { jobcard_id: jc.jobcard_id, line_no: n + 1, item_type: l.type, item_id: l.item_id, item_code: l.code, particulars: l.name, category: l.cat, serial_no: l.sn, qty: l.qty, rate: l.rate, gst_pct: l.gst, amount: l._amt, warranty: l.warranty, remarks: null });
      });
      (j.faults || []).forEach(function (fn) { var f = X.ft[fn]; add('jobcard_fault', { jobcard_id: jc.jobcard_id, fault_id: f.fault_id, category: f.category, fault_name: f.fault_name, nature: f.default_nature }); });
      var mgrU = U(MGR[scc]), appDay = fin ? S.ago(j.appAge != null ? j.appAge : (c.close != null ? c.close + 1 : j.age - 1)) : null;
      if (j.st !== 'Draft') need.forEach(function (r, k) {
        var st = 'Pending', by2 = null, on = null, rm = null;
        if (fin) { st = 'Approved'; by2 = k === 0 ? mgrU.user_id : U('ho.head').user_id; on = S.at(k === 0 ? (need.length > 1 ? addDays(appDay, -1) : appDay) : appDay, 12 + k); rm = k === 0 ? 'Checked, recommended' : 'Approved'; }
        else if (j.st === 'L2' && k === 0) { st = 'Approved'; by2 = mgrU.user_id; on = S.at(S.ago(Math.max(j.age - 1, 1)), 16); rm = 'Out of warranty, estimate accepted by the farmer'; }
        else if (j.st === 'Rejected' && k === 0) { st = 'Rejected'; by2 = mgrU.user_id; on = S.at(S.ago(1), 11); rm = j.rej; }
        add('jobcard_approval', { jobcard_id: jc.jobcard_id, level_no: r.level_no, approver_role: r.role_name, approver_id: by2, status: st, remarks: rm, acted_on: on });
      });
      lg(jday, userName(eng.user_id), 'Created', 'jobcard', jc.jobcard_no, 'Rs ' + inr(t.grand));
      if (j.st !== 'Draft') lg(jday, userName(eng.user_id), 'Submitted', 'jobcard', jc.jobcard_no, 'for approval');
      if (fin) {
        lg(appDay, 'Final approver', 'Approved', 'jobcard', jc.jobcard_no, 'final');
        nl(appDay, 'WhatsApp', call.mobile, 'JOBCARD_APPROVED', MSG.jobcardApproved(call, jc), 'jobcard', jc.jobcard_no);
        lines.filter(function (l) { return l.type === 'Spare'; }).forEach(function (l) {
          add('stock_txn', { txn_date: appDay, spare_id: l.item_id, loc_type: 'ENG', loc_id: eng.user_id, bucket: 'GOOD', txn_type: 'Consume', qty: -l.qty, ref_type: 'jobcard', ref_no: jc.jobcard_no, remarks: 'Consumed on ' + jc.jobcard_no, created_by: 'Service Manager', created_on: S.at(appDay, 17) });
          if (l.warranty) add('stock_txn', { txn_date: appDay, spare_id: l.item_id, loc_type: 'SC', loc_id: sc.sc_id, bucket: 'DAMAGED', txn_type: 'Return-Damaged', qty: l.qty, ref_type: 'jobcard', ref_no: jc.jobcard_no, remarks: 'Faulty part held for return - ' + jc.jobcard_no, created_by: 'Service Manager', created_on: S.at(appDay, 17) });
        });
      }
    }
    if (c.close != null) lg(S.ago(c.close), 'Service Manager', c.st === 'Cancelled' ? 'Cancelled' : c.st === 'Resolved' ? 'Resolved' : 'Closed', 'complaint', call.complaint_no, c.res || '');
  });

  /* ---------- reminders ---------- */
  function callNo(inst, age) { return X.calls.filter(function (x) { return x.install_id === I(inst).inst.install_id && x.call_date === S.ago(age); })[0]; }
  [[10, 9, -1, 'Pending', 'Farmer called again - send the engineer today, call is overdue'], [4, 4, 1, 'Pending', 'Confirm the visit time with the farmer'], [6, 6, 0, 'Pending', 'Ask the dealer for the failed IGBT photo'], [18, 8, -2, 'Done', 'Follow up for job card approval']].forEach(function (r) {
    var cl = callNo(r[0], r[1]); if (!cl) return;
    add('complaint_reminder', { complaint_id: cl.complaint_id, remind_on: addDays(today(), r[2]), note: r[4], status: r[3], done_on: r[3] === 'Done' ? S.ago(2) : null, created_by: 'Service Manager' });
  });

  /* ---------- replacements (balance warranty moves to the new serial) ---------- */
  function transfer(oldSn, newSn, day) {
    var ow = wBySerial(oldSn), ns = stickerBySerial(newSn), days = daysBetween(day, ow.end_date), os = DB.get('sticker', ow.sticker_id);
    ow.status = 'Replaced'; os.status = 'Replaced';
    add('warranty', { warranty_no: S.docNo('WARRANTY', 'WR/{fy}/{n:5}', day), install_id: ow.install_id, serial_no: ns.serial_no, sticker_id: ns.sticker_id, category: ow.category, model_id: ns.model_id, customer_id: ow.customer_id, dealer_id: ow.dealer_id,
      start_date: day, warranty_months: Math.max(1, Math.round(days / 30.44)), extended_months: 0, end_date: ow.end_date, status: 'Active', replaced_from_serial: oldSn, registered_by: 'HO', registered_on: S.at(day, 11), whatsapp_sent: 1, remarks: 'Balance warranty carried from ' + oldSn });
    ns.status = 'Registered'; return days;
  }
  function replacement(h, l) {
    var day = h.repl_date, old = l.old_serial_no, nw = l.new_serial_no;
    if (old && nw) l.warranty_days_left = transfer(old, nw, day);
    var r = add('replacement', Object.assign({ repl_no: S.docNo('REPL', 'REP/{n}/{fy}', day), voucher_type: 'With Serial No', make_sales_invoice: 0, no_of_articles: 1, created_by: 'Neha Agarwal', created_on: S.at(day, 15) }, h));
    add('replacement_item', Object.assign({ repl_id: r.repl_id, line_no: 1, qty: 1, charges: 0, location: 'Greater Noida HO' }, l));
    lg(day, 'Neha Agarwal', 'Created', 'replacement', r.repl_no, (old || '') + ' -> ' + (nw || ''));
    return r;
  }
  var i21 = I(21), d1 = S.ago(93), call21 = callNo(21, 100);
  var r1 = replacement({ repl_date: d1, source: 'Service', complaint_id: call21 ? call21.complaint_id : null, dealer_id: i21.dl.dealer_id, receipt_date: d1, transporter: 'VRL Logistics', lr_no: 'VRL' + (700000 + 381), lr_date: addDays(d1, -2), replacement_type: 'Delivery Challan',
    reason: 'Motor winding burnt, not repairable at site', status: 'Closed' },
    { category: 'MOTOR', invoice_item: modelName(X.pool[3][3].MOTOR.model_id), received_item: modelName(i21.w.MOTOR.model_id), old_serial_no: i21.sn.MOTOR, new_serial_no: X.pool[3][3].MOTOR.serial_no, net_value: 0 });
  nl(d1, 'WhatsApp', i21.cust.mobile, 'REPLACEMENT', MSG.replacement(r1, DB.find('replacement_item', function (x) { return x.repl_id === r1.repl_id; })), 'replacement', r1.repl_no);
  var i15 = I(15), d2 = S.ago(12);
  var r2 = replacement({ repl_date: d2, source: 'Dealer', dealer_id: i15.dl.dealer_id, dealer_invoice_no: 'DI/' + d2.slice(2, 4) + '/412', dealer_invoice_date: addDays(d2, -3), receipt_date: d2, transporter: 'Gati Ltd', lr_no: 'GT' + (550000 + 77), lr_date: addDays(d2, -2),
    replacement_type: 'Credit Note', reason: 'Pump shaft broken at commissioning', status: 'Closed', cn_no: 'CN/' + fyOf(d2) + '/0012', cn_amount: 98000 },
    { category: 'PUMP', invoice_item: modelName(X.pool[10][2].PUMP.model_id), received_item: modelName(i15.w.PUMP.model_id), old_serial_no: i15.sn.PUMP, new_serial_no: X.pool[10][2].PUMP.serial_no, net_value: 98000 });
  nl(d2, 'WhatsApp', i15.cust.mobile, 'REPLACEMENT', MSG.replacement(r2, DB.find('replacement_item', function (x) { return x.repl_id === r2.repl_id; })), 'replacement', r2.repl_no);
  var d3 = S.ago(3), r3 = replacement({ repl_date: d3, source: 'Dealer', dealer_id: X.dl['1004'].dealer_id, voucher_type: 'Without Serial No', receipt_date: null, replacement_type: 'Delivery Challan', reason: 'Two controllers failed in transit - serials not available', status: 'Open', no_of_articles: 2 },
    { category: 'CONTROLLER', invoice_item: modelName(X.m.CONTROLLER[3].model_id), received_item: modelName(X.m.CONTROLLER[3].model_id), old_serial_no: null, new_serial_no: null, qty: 2, net_value: 0 });

  /* ---------- stock : opening balances, a receipt and a transfer, a few shortages ---------- */
  var openDay = S.ago(210), spares = DB.all('spare_master');
  function stk(day, sp, lt, li, bucket, type, qty, ref, rem) { return add('stock_txn', { txn_date: day, spare_id: sp.spare_id, loc_type: lt, loc_id: li, bucket: bucket, txn_type: type, qty: qty, ref_type: ref, ref_no: null, remarks: rem, created_by: 'Delta Administrator', created_on: S.at(day, 9) }); }
  Object.keys(X.sc).forEach(function (k) { spares.forEach(function (sp) { stk(openDay, sp, 'SC', X.sc[k].sc_id, 'GOOD', 'Opening', sp.uom === 'Mtr' ? 300 : sp.min_stock * 4, 'opening', 'Opening stock'); }); });
  ['eng.gno1', 'eng.gno2', 'eng.lko1', 'eng.lko2', 'eng.jai1', 'eng.jai2', 'eng.ind1'].forEach(function (un) { spares.forEach(function (sp) { stk(openDay, sp, 'ENG', U(un).user_id, 'GOOD', 'Opening', sp.uom === 'Mtr' ? 60 : Math.max(3, Math.round(sp.min_stock * 0.6)), 'opening', 'Van stock issued'); }); });
  /* receipts to Greater Noida and a transfer to an engineer */
  var rcDay = S.ago(24);
  ['SP-PMP-001', 'SP-PMP-006', 'SP-MOT-003', 'SP-MOT-004', 'SP-CTL-004', 'SP-CTL-006'].forEach(function (c) { stk(rcDay, X.sp[c], 'SC', X.sc['SC-GNO'].sc_id, 'GOOD', 'Receipt', 8, 'receipt', 'Received from Greater Noida plant, GRN ' + S.docNo('GRN', 'GRN/{fy}/{n:4}', rcDay)); });
  var trDay = S.ago(15);
  ['SP-CTL-007', 'SP-CTL-005'].forEach(function (c, k) {
    var ref = 'TRF/' + trDay.replace(/-/g, '') + '/' + (k + 1);
    stk(trDay, X.sp[c], 'SC', X.sc['SC-GNO'].sc_id, 'GOOD', 'Issue-Out', -2, 'transfer', 'Issued to ' + userName(U('eng.gno1').user_id)).ref_no = ref;
    stk(trDay, X.sp[c], 'ENG', U('eng.gno1').user_id, 'GOOD', 'Transfer-In', 2, 'transfer', 'Received from Greater Noida store').ref_no = ref;
  });
  /* shortages so the "Low / Out of stock" flags are visible */
  stk(S.ago(40), X.sp['SP-CTL-001'], 'SC', X.sc['SC-LKO'].sc_id, 'GOOD', 'Adjust', -10, 'adjust', 'Stock audit correction');
  stk(S.ago(40), X.sp['SP-MOT-001'], 'SC', X.sc['SC-JAI'].sc_id, 'GOOD', 'Adjust', -12, 'adjust', 'Issued to a customer site without entry - corrected');
  stk(S.ago(30), X.sp['SP-PMP-001'], 'SC', X.sc['SC-IND'].sc_id, 'GOOD', 'Adjust', -10, 'adjust', 'Stock audit correction');
  stk(S.ago(30), X.sp['SP-CTL-003'], 'ENG', U('eng.lko1').user_id, 'GOOD', 'Adjust', -2, 'adjust', 'Van stock audit');

  /* ---------- messages for dealers / recent registrations / OTP ---------- */
  DB.all('dealer').forEach(function (d) {
    if (d.status === 'Pending') nl(S.ago(2), 'WhatsApp', d.mobile, 'DEALER_SIGNUP', MSG.dealerSignup(d), 'dealer', d.firm_name);
    else if (d.dealer_code) nl(d.approved_on.slice(0, 10), 'WhatsApp', d.mobile, 'DEALER_APPROVED', MSG.dealerApproved(d), 'dealer', d.dealer_code);
    if (d.status !== 'Pending') lg(d.approved_on.slice(0, 10), 'Delta Administrator', d.status === 'Blocked' ? 'Blocked' : 'Approved', 'dealer', d.dealer_code || d.firm_name, '');
  });
  Object.keys(X.inst).map(function (k) { return X.inst[k]; }).sort(function (a, b) { return a.age - b.age; }).forEach(function (o, n) {
    var day = S.ago(o.age);
    if (n < 8) nl(day, 'WhatsApp', o.cust.mobile, 'WARRANTY_REG', MSG.warrantyRegistered(o.cust, ['PUMP', 'MOTOR', 'CONTROLLER'].map(function (cat) { return { category: catLabel(cat), name: modelName(o.w[cat].model_id), serial: o.sn[cat], end: o.w[cat].end_date }; }), day), 'installation', o.inst.install_no);
    lg(day, o.inst.registered_by, 'Registered', 'warranty', o.inst.install_no, '3 serial(s) for ' + o.cust.customer_name);
  });

  /* ---------- flush logs in time order ---------- */
  NOTE.sort(function (a, b) { return a.sent_on < b.sent_on ? -1 : 1; }).forEach(function (n) { add('notification_log', n); });
  LOG.sort(function (a, b) { return a.log_on < b.log_on ? -1 : 1; }).forEach(function (l) { add('activity_log', l); });
};
