/**
 * server/migrate_json_to_nextjs_db.js
 * Migrates data from data/warranty-service-data.json into the PostgreSQL Warrenty_Module_Nextjs database.
 * Maps legacy numeric IDs to UUIDs with strict referential integrity and audit tracking.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:Delta%401010@localhost:5432/Warrenty_Module_Nextjs';

const ADMIN_USER_ID = '242b2d94-7e53-4b78-8ee0-f31c9ddb7056';

// Helper to generate deterministic UUIDs from legacy keys so reruns are idempotent
function deterministicUuid(namespace, id) {
  const hash = crypto.createHash('md5').update(`${namespace}:${id}`).digest('hex');
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-4${hash.substring(13, 16)}-a${hash.substring(17, 20)}-${hash.substring(20, 32)}`;
}

async function runMigration() {
  const jsonPath = path.join(__dirname, '..', 'data', 'warranty-service-data.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('Data file not found:', jsonPath);
    process.exit(1);
  }

  const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const tables = rawData.t || rawData;

  const client = new Client({ connectionString });
  await client.connect();
  console.log('Connected to PostgreSQL Warrenty_Module_Nextjs for JSON data migration.');

  try {
    await client.query('BEGIN');

    // 1. Companies
    console.log('Seeding Companies...');
    const companies = tables.company_profile || [];
    for (const c of companies) {
      const companyId = deterministicUuid('company', c.company_id || 1);
      await client.query(
        `INSERT INTO "Companies" (
          "CompanyId", "CompanyName", "Tagline", "Address", "City", "State", "Pincode",
          "Phone", "TollFree", "Email", "Website", "Gstin", "WhatsappSender", "WarrantyTerms",
          "InsertedByUserId", "LastUpdatedByUserId"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
        ON CONFLICT ("CompanyId") DO NOTHING`,
        [
          companyId,
          c.company_name || 'Solartive Techno Industries',
          c.tagline,
          c.address,
          c.city,
          c.state,
          c.pincode,
          c.phone,
          c.toll_free,
          c.email,
          c.website,
          c.gstin,
          c.whatsapp_sender,
          c.warranty_terms,
          ADMIN_USER_ID,
        ]
      );
    }

    // 2. States
    console.log('Seeding States...');
    const states = tables.state_master || [];
    const stateCodeToIdMap = new Map();
    for (const s of states) {
      const stateId = deterministicUuid('state', s.state_code || s.state_id);
      stateCodeToIdMap.set(String(s.state_code), stateId);
      await client.query(
        `INSERT INTO "States" ("StateId", "StateCode", "StateName", "ShortName", "InsertedByUserId", "LastUpdatedByUserId")
         VALUES ($1, $2, $3, $4, $5, $5)
         ON CONFLICT ("StateCode") DO UPDATE SET "StateName" = EXCLUDED."StateName"`,
        [stateId, String(s.state_code).padStart(2, '0'), s.state_name, s.short_name, ADMIN_USER_ID]
      );
    }

    // 3. Districts
    console.log('Seeding Districts...');
    const districts = tables.district_master || [];
    for (const d of districts) {
      const districtId = deterministicUuid('district', d.district_id || `${d.state_code}_${d.district_name}`);
      const stateId = stateCodeToIdMap.get(String(d.state_code));
      if (stateId) {
        await client.query(
          `INSERT INTO "Districts" ("DistrictId", "StateId", "DistrictName", "InsertedByUserId", "LastUpdatedByUserId")
           VALUES ($1, $2, $3, $4, $4)
           ON CONFLICT DO NOTHING`,
          [districtId, stateId, d.district_name, ADMIN_USER_ID]
        );
      }
    }

    // 4. Product Models
    console.log('Seeding ProductModels...');
    const models = tables.product_model || [];
    const modelIdMap = new Map();
    for (const m of models) {
      const modelId = deterministicUuid('model', m.model_id || m.model_code);
      modelIdMap.set(Number(m.model_id), modelId);
      await client.query(
        `INSERT INTO "ProductModels" (
          "ProductModelId", "ModelCode", "ModelName", "Category", "Hp", "Kw", "Technology",
          "VoltageRange", "HeadRange", "Discharge", "SizeInch", "WarrantyMonths", "Description",
          "IsActive", "InsertedByUserId", "LastUpdatedByUserId"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
        ON CONFLICT ("ModelCode") DO NOTHING`,
        [
          modelId,
          m.model_code,
          m.model_name,
          m.category,
          m.hp ? String(m.hp) : null,
          m.kw ? String(m.kw) : null,
          m.technology,
          m.voltage_range,
          m.head_range,
          m.discharge,
          m.size_inch,
          m.warranty_months || 24,
          m.description,
          Boolean(m.is_active ?? true),
          ADMIN_USER_ID,
        ]
      );
    }

    // 5. Projects
    console.log('Seeding Projects...');
    const projects = tables.project || [];
    const projectIdMap = new Map();
    for (const p of projects) {
      const projId = deterministicUuid('project', p.project_id || p.project_no);
      projectIdMap.set(Number(p.project_id), projId);
      const stateId = p.state_code ? stateCodeToIdMap.get(String(p.state_code)) : null;
      await client.query(
        `INSERT INTO "Projects" (
          "ProjectId", "ProjectNo", "ProjectName", "Scheme", "StateId", "StartDate", "EndDate",
          "Status", "Remarks", "InsertedByUserId", "LastUpdatedByUserId"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
        ON CONFLICT ("ProjectNo") DO NOTHING`,
        [
          projId,
          p.project_no,
          p.project_name,
          p.scheme,
          stateId || null,
          p.start_date ? new Date(p.start_date) : new Date(),
          p.end_date ? new Date(p.end_date) : null,
          p.status || 'Active',
          p.remarks,
          ADMIN_USER_ID,
        ]
      );
    }

    // 6. Call Types
    console.log('Seeding CallTypes...');
    const callTypes = tables.call_type || [];
    const callTypeIdMap = new Map();
    for (const ct of callTypes) {
      const ctId = deterministicUuid('call_type', ct.calltype_id || ct.call_type);
      callTypeIdMap.set(Number(ct.calltype_id), ctId);
      await client.query(
        `INSERT INTO "CallTypes" (
          "CallTypeId", "CallTypeName", "ValidDays", "IsWarranty", "Description", "IsActive",
          "InsertedByUserId", "LastUpdatedByUserId"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
        ON CONFLICT ("CallTypeName") DO NOTHING`,
        [
          ctId,
          ct.call_type,
          ct.valid_days || 3,
          Boolean(ct.is_warranty ?? true),
          ct.description,
          Boolean(ct.is_active ?? true),
          ADMIN_USER_ID,
        ]
      );
    }

    // 7. Fault Masters
    console.log('Seeding FaultMasters...');
    const faults = tables.fault_master || [];
    const faultIdMap = new Map();
    for (const f of faults) {
      const fId = deterministicUuid('fault', f.fault_id || `${f.category}_${f.fault_name}`);
      faultIdMap.set(Number(f.fault_id), fId);
      await client.query(
        `INSERT INTO "FaultMasters" (
          "FaultMasterId", "Category", "FaultName", "DefaultNature", "IsActive",
          "InsertedByUserId", "LastUpdatedByUserId"
        ) VALUES ($1, $2, $3, $4, $5, $6, $6)
        ON CONFLICT DO NOTHING`,
        [fId, f.category, f.fault_name, f.default_nature, Boolean(f.is_active ?? true), ADMIN_USER_ID]
      );
    }

    // 8. Service Centers
    console.log('Seeding ServiceCenters...');
    const scs = tables.service_center || [];
    const scIdMap = new Map();
    for (const sc of scs) {
      const scId = deterministicUuid('service_center', sc.sc_id || sc.sc_code);
      scIdMap.set(Number(sc.sc_id), scId);
      const stateId = sc.state_code ? stateCodeToIdMap.get(String(sc.state_code)) : null;
      await client.query(
        `INSERT INTO "ServiceCenters" (
          "ServiceCenterId", "ServiceCenterCode", "ServiceCenterName", "ContactPerson",
          "Mobile", "Email", "Address", "City", "District", "StateId", "Pincode", "Gstin",
          "IsActive", "InsertedByUserId", "LastUpdatedByUserId"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
        ON CONFLICT ("ServiceCenterCode") DO NOTHING`,
        [
          scId,
          sc.sc_code,
          sc.sc_name,
          sc.contact_person,
          sc.mobile,
          sc.email,
          sc.address,
          sc.city,
          sc.district,
          stateId || null,
          sc.pincode,
          sc.gstin,
          Boolean(sc.is_active ?? true),
          ADMIN_USER_ID,
        ]
      );
    }

    // 9. Users
    console.log('Seeding Users...');
    const users = tables.app_user || [];
    const userIdMap = new Map();
    userIdMap.set(1, ADMIN_USER_ID); // Admin is mapped to our known root user ID

    for (const u of users) {
      if (u.user_id === 1 || u.username === 'admin') {
        continue; // Admin is already created
      }
      const uId = deterministicUuid('user', u.user_id || u.username);
      userIdMap.set(Number(u.user_id), uId);
      const scId = u.sc_id ? scIdMap.get(Number(u.sc_id)) : null;

      await client.query(
        `INSERT INTO "Users" (
          "UserId", "Username", "Password", "FirstName", "LastName", "Email", "Phone",
          "Address", "Role", "StateRights", "DistrictRights", "FormRights", "ServiceCenterId",
          "IsActive", "IsAdmin", "InsertedByUserId", "LastUpdatedByUserId"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16)
        ON CONFLICT ("Username") DO NOTHING`,
        [
          uId,
          u.username,
          u.password || 'delta@2026',
          u.first_name,
          u.last_name,
          u.email,
          u.phone,
          u.address,
          u.role,
          u.state_rights,
          u.district_rights,
          u.form_rights,
          scId || null,
          Boolean(u.is_active ?? true),
          Boolean(u.is_admin ?? false),
          ADMIN_USER_ID,
        ]
      );
    }

    // 10. Spares & Labour
    console.log('Seeding Spares...');
    const spares = tables.spares_master || [
      { spare_code: 'SPR-IMP-4', spare_name: 'Impeller Stage 4 Inch Noryl', category: 'PUMP', uom: 'NOS', current_rate: 650, min_stock: 20 },
      { spare_code: 'SPR-DIF-4', spare_name: 'Diffuser Bowl 4 Inch', category: 'PUMP', uom: 'NOS', current_rate: 450, min_stock: 20 },
      { spare_code: 'SPR-TB-4', spare_name: 'Thrust Bearing Pad Set 4 Inch', category: 'MOTOR', uom: 'SET', current_rate: 1200, min_stock: 15 },
      { spare_code: 'SPR-MECH-SEAL', spare_name: 'Mechanical Seal SiC-SiC 4 Inch', category: 'MOTOR', uom: 'NOS', current_rate: 850, min_stock: 25 },
      { spare_code: 'SPR-PCB-MPPT-3', spare_name: 'MPPT Main Board 3 HP', category: 'CONTROLLER', uom: 'NOS', current_rate: 3400, min_stock: 10 },
      { spare_code: 'SPR-IGBT-MOD', spare_name: 'IGBT Module 1200V 25A', category: 'CONTROLLER', uom: 'NOS', current_rate: 2200, min_stock: 15 },
    ];
    const spareIdMap = new Map();
    for (let i = 0; i < spares.length; i++) {
      const sp = spares[i];
      const spId = deterministicUuid('spare', sp.spare_id || sp.spare_code);
      spareIdMap.set(sp.spare_code, spId);
      await client.query(
        `INSERT INTO "Spares" (
          "SpareId", "SpareCode", "SpareName", "Category", "Uom", "CurrentRate", "MinStock",
          "IsActive", "InsertedByUserId", "LastUpdatedByUserId"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
        ON CONFLICT ("SpareCode") DO NOTHING`,
        [spId, sp.spare_code, sp.spare_name, sp.category, sp.uom || 'NOS', sp.current_rate || 0, sp.min_stock || 0, true, ADMIN_USER_ID]
      );
    }

    // 11. Dealers
    console.log('Seeding Dealers...');
    const dealers = tables.dealer || [];
    const dealerIdMap = new Map();
    for (const d of dealers) {
      const dId = deterministicUuid('dealer', d.dealer_id || d.dealer_code || d.firm_name);
      dealerIdMap.set(Number(d.dealer_id), dId);
      const stateId = d.state_code ? stateCodeToIdMap.get(String(d.state_code)) : null;

      await client.query(
        `INSERT INTO "Dealers" (
          "DealerId", "DealerCode", "FirmName", "ContactPerson", "Mobile", "Email", "Password",
          "Address", "City", "District", "StateId", "Pincode", "Gstin", "WarrantyMonths",
          "Status", "SignupOn", "ApprovedBy", "ApprovedOn", "Remarks",
          "InsertedByUserId", "LastUpdatedByUserId"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $20)
        ON CONFLICT ("DealerCode") DO NOTHING`,
        [
          dId,
          d.dealer_code || null,
          d.firm_name,
          d.contact_person,
          d.mobile,
          d.email,
          d.password || '123',
          d.address,
          d.city,
          d.district,
          stateId || null,
          d.pincode,
          d.gstin,
          d.warranty_months ? Number(d.warranty_months) : null,
          d.status || 'Approved',
          d.signup_on ? new Date(d.signup_on) : null,
          d.approved_by,
          d.approved_on ? new Date(d.approved_on) : null,
          d.remarks,
          ADMIN_USER_ID,
        ]
      );
    }

    // 12. Customers
    console.log('Seeding Customers...');
    const customers = tables.customer || [];
    const customerIdMap = new Map();
    for (const c of customers) {
      const cId = deterministicUuid('customer', c.customer_id || c.mobile);
      customerIdMap.set(Number(c.customer_id), cId);
      const stateId = c.state_code ? stateCodeToIdMap.get(String(c.state_code)) : null;

      await client.query(
        `INSERT INTO "Customers" (
          "CustomerId", "CustomerName", "Mobile", "AltMobile", "Email", "Address", "Village",
          "City", "District", "StateId", "Pincode", "Language", "LastLogin",
          "InsertedByUserId", "LastUpdatedByUserId"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
        ON CONFLICT ("Mobile") DO NOTHING`,
        [
          cId,
          c.customer_name,
          c.mobile,
          c.alt_mobile,
          c.email,
          c.address,
          c.village,
          c.city,
          c.district,
          stateId || null,
          c.pincode,
          c.language || 'HI',
          c.last_login ? new Date(c.last_login) : null,
          ADMIN_USER_ID,
        ]
      );
    }

    // 13. Sticker Batches
    console.log('Seeding StickerBatches...');
    const batches = tables.sticker_batch || [];
    const batchIdMap = new Map();
    for (const b of batches) {
      const bId = deterministicUuid('batch', b.batch_id || b.batch_no);
      batchIdMap.set(Number(b.batch_id), bId);

      await client.query(
        `INSERT INTO "StickerBatches" (
          "StickerBatchId", "BatchNo", "BatchDate", "SupplierName", "Remarks", "TotalSerials",
          "CreatedBy", "InsertedByUserId", "LastUpdatedByUserId"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
        ON CONFLICT ("BatchNo") DO NOTHING`,
        [
          bId,
          b.batch_no,
          b.batch_date ? new Date(b.batch_date) : new Date(),
          b.supplier_name,
          b.remarks,
          b.total_serials || 0,
          b.created_by,
          ADMIN_USER_ID,
        ]
      );
    }

    // 14. Stickers
    console.log('Seeding Stickers...');
    const stickers = tables.sticker || [];
    const stickerIdMap = new Map();
    for (const st of stickers) {
      const stId = deterministicUuid('sticker', st.sticker_id || st.serial_no);
      stickerIdMap.set(Number(st.sticker_id), stId);
      const batchId = st.batch_id ? batchIdMap.get(Number(st.batch_id)) : null;
      const modelId = modelIdMap.get(Number(st.model_id));

      if (modelId) {
        await client.query(
          `INSERT INTO "Stickers" (
            "StickerId", "StickerBatchId", "SerialNo", "ProductModelId", "Category",
            "SupplierName", "ProductGroup", "InvoiceNo", "InvoiceDate", "InvoiceLocation",
            "MfgDate", "Status", "PrintCount", "LastPrintedOn",
            "InsertedByUserId", "LastUpdatedByUserId"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
          ON CONFLICT ("SerialNo") DO NOTHING`,
          [
            stId,
            batchId || null,
            st.serial_no,
            modelId,
            st.category,
            st.supplier_name,
            st.product_group,
            st.invoice_no,
            st.invoice_date ? new Date(st.invoice_date) : null,
            st.invoice_location,
            st.mfg_date ? new Date(st.mfg_date) : null,
            st.status || 'Generated',
            st.print_count || 0,
            st.last_printed_on ? new Date(st.last_printed_on) : null,
            ADMIN_USER_ID,
          ]
        );
      }
    }

    // 15. Installations
    console.log('Seeding Installations...');
    const installs = tables.installation || [];
    const installIdMap = new Map();
    for (const inst of installs) {
      const instId = deterministicUuid('installation', inst.installation_id || inst.install_no);
      installIdMap.set(Number(inst.installation_id), instId);
      const customerId = customerIdMap.get(Number(inst.customer_id));
      const dealerId = inst.dealer_id ? dealerIdMap.get(Number(inst.dealer_id)) : null;
      const projectId = inst.project_id ? projectIdMap.get(Number(inst.project_id)) : null;
      const stateId = inst.state_code ? stateCodeToIdMap.get(String(inst.state_code)) : null;

      if (customerId) {
        await client.query(
          `INSERT INTO "Installations" (
            "InstallationId", "InstallNo", "CustomerId", "DealerId", "InstallDate",
            "SiteAddress", "Village", "District", "StateId", "Pincode", "Latitude", "Longitude",
            "BorewellDepthM", "DynamicHeadM", "PanelKwp", "ProjectId", "InvoiceNo", "InvoiceDate",
            "RegisteredBy", "RegisteredOn", "Remarks", "InsertedByUserId", "LastUpdatedByUserId"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $22)
          ON CONFLICT ("InstallNo") DO NOTHING`,
          [
            instId,
            inst.install_no,
            customerId,
            dealerId || null,
            inst.install_date ? new Date(inst.install_date) : new Date(),
            inst.site_address,
            inst.village,
            inst.district,
            stateId || null,
            inst.pincode,
            inst.latitude ? String(inst.latitude) : null,
            inst.longitude ? String(inst.longitude) : null,
            inst.borewell_depth_m || null,
            inst.dynamic_head_m || null,
            inst.panel_kwp ? String(inst.panel_kwp) : null,
            projectId || null,
            inst.invoice_no,
            inst.invoice_date ? new Date(inst.invoice_date) : null,
            inst.registered_by,
            inst.registered_on ? new Date(inst.registered_on) : null,
            inst.remarks,
            ADMIN_USER_ID,
          ]
        );
      }
    }

    // 16. Warranties
    console.log('Seeding Warranties...');
    const warranties = tables.warranty || [];
    const warrantyIdMap = new Map();
    for (const w of warranties) {
      const wId = deterministicUuid('warranty', w.warranty_id || w.warranty_no || w.serial_no);
      warrantyIdMap.set(Number(w.warranty_id), wId);
      const installId = installIdMap.get(Number(w.installation_id));
      const modelId = w.model_id ? modelIdMap.get(Number(w.model_id)) : null;
      const customerId = w.customer_id ? customerIdMap.get(Number(w.customer_id)) : null;
      const dealerId = w.dealer_id ? dealerIdMap.get(Number(w.dealer_id)) : null;
      const stickerId = w.sticker_id ? stickerIdMap.get(Number(w.sticker_id)) : null;

      if (installId && w.serial_no) {
        await client.query(
          `INSERT INTO "Warranties" (
            "WarrantyId", "WarrantyNo", "InstallationId", "SerialNo", "StickerId", "Category",
            "ProductModelId", "CustomerId", "DealerId", "StartDate", "WarrantyMonths",
            "ExtendedMonths", "EndDate", "Status", "ReplacedFromSerial", "RegisteredBy",
            "RegisteredOn", "WhatsappSent", "Remarks", "InsertedByUserId", "LastUpdatedByUserId"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $20)
          ON CONFLICT ("SerialNo") DO NOTHING`,
          [
            wId,
            w.warranty_no || `WR-${w.serial_no}`,
            installId,
            w.serial_no,
            stickerId || null,
            w.category || 'PUMP',
            modelId || null,
            customerId || null,
            dealerId || null,
            w.start_date ? new Date(w.start_date) : new Date(),
            w.warranty_months || 24,
            w.extended_months || 0,
            w.end_date ? new Date(w.end_date) : new Date(Date.now() + 2 * 365 * 24 * 3600 * 1000),
            w.status || 'Active',
            w.replaced_from_serial,
            w.registered_by,
            w.registered_on ? new Date(w.registered_on) : null,
            Boolean(w.whatsapp_sent ?? false),
            w.remarks,
            ADMIN_USER_ID,
          ]
        );
      }
    }

    // 17. Complaints
    console.log('Seeding Complaints...');
    const complaints = tables.complaint || [];
    const complaintIdMap = new Map();
    for (const cmp of complaints) {
      const cmpId = deterministicUuid('complaint', cmp.complaint_id || cmp.complaint_no);
      complaintIdMap.set(Number(cmp.complaint_id), cmpId);
      const callTypeId = callTypeIdMap.get(Number(cmp.calltype_id)) || Array.from(callTypeIdMap.values())[0];
      const projectId = cmp.project_id ? projectIdMap.get(Number(cmp.project_id)) : null;
      const installId = cmp.installation_id ? installIdMap.get(Number(cmp.installation_id)) : null;
      const customerId = cmp.customer_id ? customerIdMap.get(Number(cmp.customer_id)) : null;
      const dealerId = cmp.dealer_id ? dealerIdMap.get(Number(cmp.dealer_id)) : null;
      const stateId = cmp.state_code ? stateCodeToIdMap.get(String(cmp.state_code)) : null;
      const scId = cmp.sc_id ? scIdMap.get(Number(cmp.sc_id)) : null;
      const engId = cmp.engineer_user_id ? userIdMap.get(Number(cmp.engineer_user_id)) : null;

      if (callTypeId) {
        await client.query(
          `INSERT INTO "Complaints" (
            "ComplaintId", "ComplaintNo", "CallDate", "CallTypeId", "ProjectId", "Priority",
            "Source", "Status", "InstallationId", "CustomerId", "CustomerName", "Mobile",
            "Address", "Village", "District", "StateId", "Pincode", "DealerId", "WarrantyStatus",
            "ComplaintText", "ServiceCenterId", "EngineerUserId", "AssignedOn", "DueDate",
            "ClosedOn", "Resolution", "CreatedBy", "InsertedByUserId", "LastUpdatedByUserId"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $28)
          ON CONFLICT ("ComplaintNo") DO NOTHING`,
          [
            cmpId,
            cmp.complaint_no,
            cmp.call_date ? new Date(cmp.call_date) : new Date(),
            callTypeId,
            projectId || null,
            cmp.priority || 'Medium',
            cmp.source || 'Portal',
            cmp.status || 'New',
            installId || null,
            customerId || null,
            cmp.customer_name || 'Customer',
            cmp.mobile || '9999999999',
            cmp.address,
            cmp.village,
            cmp.district,
            stateId || null,
            cmp.pincode,
            dealerId || null,
            cmp.warranty_status,
            cmp.complaint_text || 'Issue reported',
            scId || null,
            engId || null,
            cmp.assigned_on ? new Date(cmp.assigned_on) : null,
            cmp.due_date ? new Date(cmp.due_date) : null,
            cmp.closed_on ? new Date(cmp.closed_on) : null,
            cmp.resolution,
            cmp.created_by,
            ADMIN_USER_ID,
          ]
        );
      }
    }

    await client.query('COMMIT');
    console.log('JSON Migration to PostgreSQL Warrenty_Module_Nextjs completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed, rolled back:', err);
    throw err;
  } finally {
    await client.end();
  }
}

runMigration().catch((e) => {
  console.error(e);
  process.exit(1);
});
