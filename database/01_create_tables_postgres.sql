-- ============================================================================
-- Delta iERP - Warranty & Service Module
-- Database Target: PostgreSQL 12+
-- Database Name: Solarative_Warrenty_ModuleDemo
-- Generated from app/schema.js
-- ============================================================================

BEGIN;

-- ------------------------------------------------------------------ MASTERS
-- Company Profile: Single row. Name, address and helpline appear on cards, job cards and WhatsApp messages.
CREATE TABLE IF NOT EXISTS company_profile (
    company_id SERIAL PRIMARY KEY,
    company_name VARCHAR(120) NOT NULL,
    tagline VARCHAR(160),
    address VARCHAR(250),
    city VARCHAR(60),
    state VARCHAR(60),
    pincode VARCHAR(10),
    phone VARCHAR(30),
    toll_free VARCHAR(30),
    email VARCHAR(100),
    website VARCHAR(100),
    gstin VARCHAR(20),
    whatsapp_sender VARCHAR(30),
    warranty_terms TEXT
);

-- State Master
CREATE TABLE IF NOT EXISTS state_master (
    state_id SERIAL PRIMARY KEY,
    state_code VARCHAR(2) NOT NULL CONSTRAINT uq_state_master_state_code UNIQUE,
    state_name VARCHAR(60) NOT NULL,
    short_name VARCHAR(3)
);

-- District Master
CREATE TABLE IF NOT EXISTS district_master (
    district_id SERIAL PRIMARY KEY,
    state_code VARCHAR(2) NOT NULL,
    district_name VARCHAR(60) NOT NULL
);

-- Product Model Master: Each component of a solar submersible set (pump, motor, controller) is its own model with its own warranty.
CREATE TABLE IF NOT EXISTS product_model (
    model_id SERIAL PRIMARY KEY,
    model_code VARCHAR(30) NOT NULL CONSTRAINT uq_product_model_model_code UNIQUE,
    model_name VARCHAR(120) NOT NULL,
    category VARCHAR(12) NOT NULL,
    hp NUMERIC(5,2),
    kw NUMERIC(6,3),
    technology VARCHAR(40),
    voltage_range VARCHAR(40),
    head_range VARCHAR(40),
    discharge VARCHAR(40),
    size_inch VARCHAR(20),
    warranty_months INTEGER DEFAULT 24 NOT NULL,
    is_active SMALLINT DEFAULT 1 NOT NULL,
    description VARCHAR(250),
    created_on TIMESTAMP
);

-- Project / Scheme Master
CREATE TABLE IF NOT EXISTS project (
    project_id SERIAL PRIMARY KEY,
    project_no VARCHAR(30) NOT NULL CONSTRAINT uq_project_project_no UNIQUE,
    project_name VARCHAR(120) NOT NULL,
    scheme VARCHAR(60),
    state_code VARCHAR(2),
    start_date DATE,
    end_date DATE,
    status VARCHAR(20) DEFAULT 'Active' NOT NULL,
    remarks VARCHAR(250)
);

-- Service Call Type Master
CREATE TABLE IF NOT EXISTS call_type (
    calltype_id SERIAL PRIMARY KEY,
    call_type VARCHAR(60) NOT NULL CONSTRAINT uq_call_type_call_type UNIQUE,
    valid_days INTEGER NOT NULL,
    is_warranty SMALLINT DEFAULT 0 NOT NULL,
    description VARCHAR(250),
    is_active SMALLINT DEFAULT 1 NOT NULL
);

-- Fault Master
CREATE TABLE IF NOT EXISTS fault_master (
    fault_id SERIAL PRIMARY KEY,
    category VARCHAR(12) NOT NULL,
    fault_name VARCHAR(100) NOT NULL,
    default_nature VARCHAR(250),
    is_active SMALLINT DEFAULT 1 NOT NULL
);

-- Service Center Master
CREATE TABLE IF NOT EXISTS service_center (
    sc_id SERIAL PRIMARY KEY,
    sc_code VARCHAR(20) CONSTRAINT uq_service_center_sc_code UNIQUE,
    sc_name VARCHAR(120) NOT NULL,
    contact_person VARCHAR(80),
    mobile VARCHAR(15),
    email VARCHAR(100),
    address VARCHAR(250),
    city VARCHAR(60),
    district VARCHAR(60),
    state_code VARCHAR(2),
    pincode VARCHAR(10),
    gstin VARCHAR(20),
    is_active SMALLINT DEFAULT 1 NOT NULL
);

-- Users / Engineers: HO users, service managers and field engineers. Engineers are users with role ENGINEER.
CREATE TABLE IF NOT EXISTS app_user (
    user_id SERIAL PRIMARY KEY,
    first_name VARCHAR(60) NOT NULL,
    last_name VARCHAR(60),
    username VARCHAR(40) NOT NULL CONSTRAINT uq_app_user_username UNIQUE,
    password VARCHAR(40) NOT NULL,
    phone VARCHAR(15),
    email VARCHAR(100),
    address VARCHAR(250),
    role VARCHAR(20) NOT NULL,
    state_rights VARCHAR(250),
    district_rights VARCHAR(500),
    form_rights VARCHAR(250),
    is_admin SMALLINT DEFAULT 0 NOT NULL,
    sc_id INTEGER,
    is_active SMALLINT DEFAULT 1 NOT NULL,
    last_login TIMESTAMP
);

-- Job Card Approval Rules
CREATE TABLE IF NOT EXISTS approval_rule (
    rule_id SERIAL PRIMARY KEY,
    level_no INTEGER NOT NULL CONSTRAINT uq_approval_rule_level_no UNIQUE,
    role_name VARCHAR(40) NOT NULL,
    approver_user_id INTEGER,
    amount_from NUMERIC(18,2) NOT NULL,
    is_active SMALLINT DEFAULT 1 NOT NULL
);

-- ------------------------------------------------------------------ WARRANTY
-- Dealer Master
CREATE TABLE IF NOT EXISTS dealer (
    dealer_id SERIAL PRIMARY KEY,
    dealer_code VARCHAR(10) CONSTRAINT uq_dealer_dealer_code UNIQUE,
    firm_name VARCHAR(120) NOT NULL,
    contact_person VARCHAR(80),
    mobile VARCHAR(15) NOT NULL,
    email VARCHAR(100),
    address VARCHAR(250),
    city VARCHAR(60),
    district VARCHAR(60),
    state_code VARCHAR(2),
    pincode VARCHAR(10),
    gstin VARCHAR(20),
    password VARCHAR(40),
    warranty_months INTEGER,
    status VARCHAR(20) DEFAULT 'Pending' NOT NULL,
    signup_on TIMESTAMP,
    approved_by VARCHAR(60),
    approved_on TIMESTAMP,
    remarks VARCHAR(250)
);

-- Customer (End User) Master: Created automatically at first warranty registration; mobile number is the login (OTP).
CREATE TABLE IF NOT EXISTS customer (
    customer_id SERIAL PRIMARY KEY,
    customer_name VARCHAR(100) NOT NULL,
    mobile VARCHAR(15) NOT NULL CONSTRAINT uq_customer_mobile UNIQUE,
    alt_mobile VARCHAR(15),
    email VARCHAR(100),
    address VARCHAR(250),
    village VARCHAR(80),
    city VARCHAR(60),
    district VARCHAR(60),
    state_code VARCHAR(2),
    pincode VARCHAR(10),
    language VARCHAR(10) DEFAULT 'EN',
    created_on TIMESTAMP,
    last_login TIMESTAMP
);

-- Warranty Sticker Batch: One Excel import = one batch.
CREATE TABLE IF NOT EXISTS sticker_batch (
    batch_id SERIAL PRIMARY KEY,
    batch_no VARCHAR(30) NOT NULL CONSTRAINT uq_sticker_batch_batch_no UNIQUE,
    batch_date DATE NOT NULL,
    supplier_name VARCHAR(80),
    remarks VARCHAR(250),
    total_serials INTEGER,
    created_by VARCHAR(60),
    created_on TIMESTAMP
);

-- Product Serial / Sticker: Authenticity register: a serial that is not here cannot be registered.
CREATE TABLE IF NOT EXISTS sticker (
    sticker_id SERIAL PRIMARY KEY,
    batch_id INTEGER,
    serial_no VARCHAR(40) NOT NULL CONSTRAINT uq_sticker_serial_no UNIQUE,
    model_id INTEGER NOT NULL,
    category VARCHAR(12) NOT NULL,
    supplier_name VARCHAR(80),
    product_group VARCHAR(40),
    invoice_no VARCHAR(40),
    invoice_date DATE,
    invoice_location VARCHAR(60),
    mfg_date DATE,
    status VARCHAR(20) DEFAULT 'Generated' NOT NULL,
    print_count INTEGER DEFAULT 0 NOT NULL,
    last_printed_on TIMESTAMP,
    created_on TIMESTAMP
);

-- Installation (Pump Set at Site): One solar pump set at one site: groups the pump, motor and controller warranties.
CREATE TABLE IF NOT EXISTS installation (
    install_id SERIAL PRIMARY KEY,
    install_no VARCHAR(30) NOT NULL CONSTRAINT uq_installation_install_no UNIQUE,
    customer_id INTEGER NOT NULL,
    dealer_id INTEGER,
    install_date DATE NOT NULL,
    site_address VARCHAR(250),
    village VARCHAR(80),
    district VARCHAR(60),
    state_code VARCHAR(2),
    pincode VARCHAR(10),
    latitude NUMERIC(9,6),
    longitude NUMERIC(9,6),
    borewell_depth_m INTEGER,
    dynamic_head_m INTEGER,
    panel_kwp NUMERIC(6,2),
    project_id INTEGER,
    invoice_no VARCHAR(40),
    invoice_date DATE,
    registered_by VARCHAR(20),
    registered_on TIMESTAMP,
    remarks VARCHAR(250)
);

-- Active Warranty (per component serial): Pump, motor and controller each carry their own warranty row.
CREATE TABLE IF NOT EXISTS warranty (
    warranty_id SERIAL PRIMARY KEY,
    warranty_no VARCHAR(30) NOT NULL CONSTRAINT uq_warranty_warranty_no UNIQUE,
    install_id INTEGER NOT NULL,
    serial_no VARCHAR(40) NOT NULL CONSTRAINT uq_warranty_serial_no UNIQUE,
    sticker_id INTEGER,
    category VARCHAR(12) NOT NULL,
    model_id INTEGER,
    customer_id INTEGER,
    dealer_id INTEGER,
    start_date DATE NOT NULL,
    warranty_months INTEGER NOT NULL,
    extended_months INTEGER DEFAULT 0 NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'Active' NOT NULL,
    replaced_from_serial VARCHAR(40),
    registered_by VARCHAR(20),
    registered_on TIMESTAMP,
    whatsapp_sent SMALLINT DEFAULT 0 NOT NULL,
    remarks VARCHAR(250)
);

-- Replacement (Header)
CREATE TABLE IF NOT EXISTS replacement (
    repl_id SERIAL PRIMARY KEY,
    repl_no VARCHAR(30) NOT NULL CONSTRAINT uq_replacement_repl_no UNIQUE,
    repl_date DATE NOT NULL,
    source VARCHAR(20) NOT NULL,
    complaint_id INTEGER,
    dealer_id INTEGER,
    voucher_type VARCHAR(30),
    dealer_invoice_no VARCHAR(40),
    dealer_invoice_date DATE,
    receipt_date DATE,
    transporter VARCHAR(80),
    lr_no VARCHAR(40),
    lr_date DATE,
    replacement_type VARCHAR(20),
    make_sales_invoice SMALLINT DEFAULT 0,
    no_of_articles INTEGER,
    reason VARCHAR(250),
    status VARCHAR(20) DEFAULT 'Open' NOT NULL,
    cn_no VARCHAR(30),
    cn_amount NUMERIC(18,2),
    remarks VARCHAR(250),
    created_by VARCHAR(60),
    created_on TIMESTAMP
);

-- Replacement (Lines)
CREATE TABLE IF NOT EXISTS replacement_item (
    ritem_id SERIAL PRIMARY KEY,
    repl_id INTEGER NOT NULL,
    line_no INTEGER,
    category VARCHAR(12),
    invoice_item VARCHAR(120),
    received_item VARCHAR(120),
    old_serial_no VARCHAR(40),
    new_serial_no VARCHAR(40),
    qty INTEGER DEFAULT 1 NOT NULL,
    net_value NUMERIC(18,2),
    location VARCHAR(60),
    ref_invoice_no VARCHAR(40),
    ref_invoice_date DATE,
    warranty_days_left INTEGER,
    charges NUMERIC(18,2),
    remarks VARCHAR(250)
);

-- ------------------------------------------------------------------ SERVICE
-- Service Call / Complaint
CREATE TABLE IF NOT EXISTS complaint (
    complaint_id SERIAL PRIMARY KEY,
    complaint_no VARCHAR(30) NOT NULL CONSTRAINT uq_complaint_complaint_no UNIQUE,
    call_date DATE NOT NULL,
    calltype_id INTEGER NOT NULL,
    project_id INTEGER,
    priority VARCHAR(10) DEFAULT 'Medium' NOT NULL,
    source VARCHAR(20),
    status VARCHAR(20) DEFAULT 'New' NOT NULL,
    install_id INTEGER,
    customer_id INTEGER,
    customer_name VARCHAR(100) NOT NULL,
    mobile VARCHAR(15) NOT NULL,
    address VARCHAR(250),
    village VARCHAR(80),
    district VARCHAR(60),
    state_code VARCHAR(2),
    pincode VARCHAR(10),
    dealer_id INTEGER,
    warranty_status VARCHAR(20),
    complaint_text VARCHAR(500) NOT NULL,
    sc_id INTEGER,
    engineer_id INTEGER,
    assigned_on DATE,
    due_date DATE,
    closed_on DATE,
    resolution VARCHAR(500),
    created_by VARCHAR(60),
    created_on TIMESTAMP
);

-- Complaint - Faulty Components: A call can be raised against the pump, the motor, the controller or any combination.
CREATE TABLE IF NOT EXISTS complaint_item (
    citem_id SERIAL PRIMARY KEY,
    complaint_id INTEGER NOT NULL,
    category VARCHAR(12) NOT NULL,
    serial_no VARCHAR(40),
    model_id INTEGER,
    model_name VARCHAR(120),
    warranty_status VARCHAR(20),
    warranty_end DATE,
    fault_reported VARCHAR(250)
);

-- Complaint Reminder
CREATE TABLE IF NOT EXISTS complaint_reminder (
    rem_id SERIAL PRIMARY KEY,
    complaint_id INTEGER NOT NULL,
    remind_on DATE NOT NULL,
    note VARCHAR(250),
    status VARCHAR(10) DEFAULT 'Pending' NOT NULL,
    done_on DATE,
    created_by VARCHAR(60)
);

-- Engineer Visit Report
CREATE TABLE IF NOT EXISTS visit_report (
    visit_id SERIAL PRIMARY KEY,
    visit_no VARCHAR(30) CONSTRAINT uq_visit_report_visit_no UNIQUE,
    complaint_id INTEGER NOT NULL,
    engineer_id INTEGER NOT NULL,
    visit_date DATE NOT NULL,
    start_time VARCHAR(8),
    end_time VARCHAR(8),
    from_location VARCHAR(120),
    to_location VARCHAR(120),
    travel_km INTEGER,
    travel_exp NUMERIC(18,2),
    other_exp NUMERIC(18,2),
    findings VARCHAR(500),
    action_taken VARCHAR(500),
    outcome VARCHAR(30) NOT NULL,
    customer_rating INTEGER,
    created_on TIMESTAMP
);

-- Job Card (Estimate)
CREATE TABLE IF NOT EXISTS jobcard (
    jobcard_id SERIAL PRIMARY KEY,
    jobcard_no VARCHAR(30) NOT NULL CONSTRAINT uq_jobcard_jobcard_no UNIQUE,
    jobcard_date DATE NOT NULL,
    revision_no INTEGER DEFAULT 0 NOT NULL,
    complaint_id INTEGER NOT NULL,
    sc_id INTEGER NOT NULL,
    engineer_id INTEGER,
    status VARCHAR(20) DEFAULT 'Draft' NOT NULL,
    notes VARCHAR(500),
    subtotal_spares NUMERIC(18,2),
    subtotal_labour NUMERIC(18,2),
    gst_amount NUMERIC(18,2),
    other_charges NUMERIC(18,2),
    grand_total NUMERIC(18,2),
    warranty_amount NUMERIC(18,2),
    customer_payable NUMERIC(18,2),
    levels_required INTEGER,
    current_level INTEGER,
    closed_on DATE,
    stock_posted SMALLINT DEFAULT 0 NOT NULL,
    created_by VARCHAR(60),
    created_on TIMESTAMP
);

-- Job Card Lines (Spares & Labour)
CREATE TABLE IF NOT EXISTS jobcard_item (
    jitem_id SERIAL PRIMARY KEY,
    jobcard_id INTEGER NOT NULL,
    line_no INTEGER,
    item_type VARCHAR(10) NOT NULL,
    item_id INTEGER,
    item_code VARCHAR(30),
    particulars VARCHAR(200) NOT NULL,
    category VARCHAR(12),
    serial_no VARCHAR(40),
    qty NUMERIC(18,2) DEFAULT 1 NOT NULL,
    rate NUMERIC(18,2),
    gst_pct NUMERIC(5,2),
    amount NUMERIC(18,2),
    warranty SMALLINT DEFAULT 0 NOT NULL,
    remarks VARCHAR(150)
);

-- Job Card - Fault Details
CREATE TABLE IF NOT EXISTS jobcard_fault (
    jfault_id SERIAL PRIMARY KEY,
    jobcard_id INTEGER NOT NULL,
    fault_id INTEGER,
    category VARCHAR(12),
    fault_name VARCHAR(100),
    nature VARCHAR(250)
);

-- Job Card Multi-level Approval
CREATE TABLE IF NOT EXISTS jobcard_approval (
    appr_id SERIAL PRIMARY KEY,
    jobcard_id INTEGER NOT NULL,
    level_no INTEGER NOT NULL,
    approver_role VARCHAR(40),
    approver_id INTEGER,
    status VARCHAR(12) DEFAULT 'Pending' NOT NULL,
    remarks VARCHAR(250),
    acted_on TIMESTAMP,
    revision_no INTEGER DEFAULT 0 NOT NULL
);

-- ------------------------------------------------------------------ STOCK
-- Spares Master
CREATE TABLE IF NOT EXISTS spare_master (
    spare_id SERIAL PRIMARY KEY,
    spare_code VARCHAR(30) NOT NULL CONSTRAINT uq_spare_master_spare_code UNIQUE,
    spare_name VARCHAR(120) NOT NULL,
    category VARCHAR(12) NOT NULL,
    uom VARCHAR(10) DEFAULT 'Nos' NOT NULL,
    hsn VARCHAR(10),
    gst_pct NUMERIC(5,2) DEFAULT 18 NOT NULL,
    rate NUMERIC(18,2) NOT NULL,
    effective_from DATE,
    min_stock INTEGER DEFAULT 0 NOT NULL,
    is_active SMALLINT DEFAULT 1 NOT NULL,
    description VARCHAR(250)
);

-- Spare Rate History
CREATE TABLE IF NOT EXISTS spare_rate_history (
    rate_id SERIAL PRIMARY KEY,
    spare_id INTEGER NOT NULL,
    rate NUMERIC(18,2) NOT NULL,
    effective_from DATE NOT NULL,
    changed_by VARCHAR(60),
    changed_on TIMESTAMP
);

-- Labour / Service Charge Master
CREATE TABLE IF NOT EXISTS labour_master (
    labour_id SERIAL PRIMARY KEY,
    labour_code VARCHAR(30) NOT NULL CONSTRAINT uq_labour_master_labour_code UNIQUE,
    labour_name VARCHAR(120) NOT NULL,
    description VARCHAR(250),
    category VARCHAR(12),
    rate NUMERIC(18,2) NOT NULL,
    gst_pct NUMERIC(5,2) DEFAULT 18 NOT NULL,
    effective_from DATE,
    is_active SMALLINT DEFAULT 1 NOT NULL
);

-- Stock Ledger (Service Center / Engineer): Balance = SUM(qty) per location, spare and bucket. Job card approval posts the Consume rows automatically.
CREATE TABLE IF NOT EXISTS stock_txn (
    txn_id SERIAL PRIMARY KEY,
    txn_date DATE NOT NULL,
    spare_id INTEGER NOT NULL,
    loc_type VARCHAR(3) NOT NULL,
    loc_id INTEGER NOT NULL,
    bucket VARCHAR(10) DEFAULT 'GOOD' NOT NULL,
    txn_type VARCHAR(20) NOT NULL,
    qty NUMERIC(18,2) NOT NULL,
    ref_type VARCHAR(20),
    ref_no VARCHAR(40),
    remarks VARCHAR(250),
    created_by VARCHAR(60),
    created_on TIMESTAMP,
    jitem_id INTEGER
);

-- ------------------------------------------------------------------ SYSTEM
-- WhatsApp / SMS Log: Every automatic message the system sends. The demo records it here instead of calling the gateway.
CREATE TABLE IF NOT EXISTS notification_log (
    notif_id SERIAL PRIMARY KEY,
    channel VARCHAR(10) NOT NULL,
    to_mobile VARCHAR(15),
    template VARCHAR(40),
    message TEXT NOT NULL,
    ref_type VARCHAR(30),
    ref_no VARCHAR(40),
    sent_on TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'Sent' NOT NULL
);

-- Attachments (photos / documents)
CREATE TABLE IF NOT EXISTS attachment (
    att_id SERIAL PRIMARY KEY,
    ref_type VARCHAR(30) NOT NULL,
    ref_id INTEGER NOT NULL,
    file_name VARCHAR(120),
    mime VARCHAR(60),
    size_kb INTEGER,
    data_url TEXT,
    caption VARCHAR(150),
    uploaded_by VARCHAR(60),
    uploaded_on TIMESTAMP
);

-- Document Numbering: One row per document key per financial year (seq_key + fy is unique); the next number = last_no + 1.
CREATE TABLE IF NOT EXISTS doc_sequence (
    seq_id SERIAL PRIMARY KEY,
    seq_key VARCHAR(30) NOT NULL,
    prefix VARCHAR(20),
    fy VARCHAR(7) NOT NULL,
    last_no INTEGER DEFAULT 0 NOT NULL,
    CONSTRAINT uq_doc_sequence_seq_key_fy UNIQUE (seq_key, fy)
);

-- Activity / Audit Log
CREATE TABLE IF NOT EXISTS activity_log (
    log_id SERIAL PRIMARY KEY,
    log_on TIMESTAMP NOT NULL,
    user_name VARCHAR(60),
    action VARCHAR(20),
    table_name VARCHAR(40),
    ref VARCHAR(60),
    detail VARCHAR(250)
);

-- ------------------------------------------------------------------ FOREIGN KEYS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_district_master_state_code') THEN
    ALTER TABLE district_master ADD CONSTRAINT fk_district_master_state_code FOREIGN KEY (state_code) REFERENCES state_master(state_code) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_state_code') THEN
    ALTER TABLE project ADD CONSTRAINT fk_project_state_code FOREIGN KEY (state_code) REFERENCES state_master(state_code) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_service_center_state_code') THEN
    ALTER TABLE service_center ADD CONSTRAINT fk_service_center_state_code FOREIGN KEY (state_code) REFERENCES state_master(state_code) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_app_user_sc_id') THEN
    ALTER TABLE app_user ADD CONSTRAINT fk_app_user_sc_id FOREIGN KEY (sc_id) REFERENCES service_center(sc_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_approval_rule_approver_user_id') THEN
    ALTER TABLE approval_rule ADD CONSTRAINT fk_approval_rule_approver_user_id FOREIGN KEY (approver_user_id) REFERENCES app_user(user_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dealer_state_code') THEN
    ALTER TABLE dealer ADD CONSTRAINT fk_dealer_state_code FOREIGN KEY (state_code) REFERENCES state_master(state_code) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_customer_state_code') THEN
    ALTER TABLE customer ADD CONSTRAINT fk_customer_state_code FOREIGN KEY (state_code) REFERENCES state_master(state_code) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sticker_batch_id') THEN
    ALTER TABLE sticker ADD CONSTRAINT fk_sticker_batch_id FOREIGN KEY (batch_id) REFERENCES sticker_batch(batch_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sticker_model_id') THEN
    ALTER TABLE sticker ADD CONSTRAINT fk_sticker_model_id FOREIGN KEY (model_id) REFERENCES product_model(model_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_installation_customer_id') THEN
    ALTER TABLE installation ADD CONSTRAINT fk_installation_customer_id FOREIGN KEY (customer_id) REFERENCES customer(customer_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_installation_dealer_id') THEN
    ALTER TABLE installation ADD CONSTRAINT fk_installation_dealer_id FOREIGN KEY (dealer_id) REFERENCES dealer(dealer_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_installation_state_code') THEN
    ALTER TABLE installation ADD CONSTRAINT fk_installation_state_code FOREIGN KEY (state_code) REFERENCES state_master(state_code) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_installation_project_id') THEN
    ALTER TABLE installation ADD CONSTRAINT fk_installation_project_id FOREIGN KEY (project_id) REFERENCES project(project_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_warranty_install_id') THEN
    ALTER TABLE warranty ADD CONSTRAINT fk_warranty_install_id FOREIGN KEY (install_id) REFERENCES installation(install_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_warranty_sticker_id') THEN
    ALTER TABLE warranty ADD CONSTRAINT fk_warranty_sticker_id FOREIGN KEY (sticker_id) REFERENCES sticker(sticker_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_warranty_model_id') THEN
    ALTER TABLE warranty ADD CONSTRAINT fk_warranty_model_id FOREIGN KEY (model_id) REFERENCES product_model(model_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_warranty_customer_id') THEN
    ALTER TABLE warranty ADD CONSTRAINT fk_warranty_customer_id FOREIGN KEY (customer_id) REFERENCES customer(customer_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_warranty_dealer_id') THEN
    ALTER TABLE warranty ADD CONSTRAINT fk_warranty_dealer_id FOREIGN KEY (dealer_id) REFERENCES dealer(dealer_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_replacement_complaint_id') THEN
    ALTER TABLE replacement ADD CONSTRAINT fk_replacement_complaint_id FOREIGN KEY (complaint_id) REFERENCES complaint(complaint_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_replacement_dealer_id') THEN
    ALTER TABLE replacement ADD CONSTRAINT fk_replacement_dealer_id FOREIGN KEY (dealer_id) REFERENCES dealer(dealer_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_replacement_item_repl_id') THEN
    ALTER TABLE replacement_item ADD CONSTRAINT fk_replacement_item_repl_id FOREIGN KEY (repl_id) REFERENCES replacement(repl_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_complaint_calltype_id') THEN
    ALTER TABLE complaint ADD CONSTRAINT fk_complaint_calltype_id FOREIGN KEY (calltype_id) REFERENCES call_type(calltype_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_complaint_project_id') THEN
    ALTER TABLE complaint ADD CONSTRAINT fk_complaint_project_id FOREIGN KEY (project_id) REFERENCES project(project_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_complaint_install_id') THEN
    ALTER TABLE complaint ADD CONSTRAINT fk_complaint_install_id FOREIGN KEY (install_id) REFERENCES installation(install_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_complaint_customer_id') THEN
    ALTER TABLE complaint ADD CONSTRAINT fk_complaint_customer_id FOREIGN KEY (customer_id) REFERENCES customer(customer_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_complaint_state_code') THEN
    ALTER TABLE complaint ADD CONSTRAINT fk_complaint_state_code FOREIGN KEY (state_code) REFERENCES state_master(state_code) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_complaint_dealer_id') THEN
    ALTER TABLE complaint ADD CONSTRAINT fk_complaint_dealer_id FOREIGN KEY (dealer_id) REFERENCES dealer(dealer_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_complaint_sc_id') THEN
    ALTER TABLE complaint ADD CONSTRAINT fk_complaint_sc_id FOREIGN KEY (sc_id) REFERENCES service_center(sc_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_complaint_engineer_id') THEN
    ALTER TABLE complaint ADD CONSTRAINT fk_complaint_engineer_id FOREIGN KEY (engineer_id) REFERENCES app_user(user_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_complaint_item_complaint_id') THEN
    ALTER TABLE complaint_item ADD CONSTRAINT fk_complaint_item_complaint_id FOREIGN KEY (complaint_id) REFERENCES complaint(complaint_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_complaint_item_model_id') THEN
    ALTER TABLE complaint_item ADD CONSTRAINT fk_complaint_item_model_id FOREIGN KEY (model_id) REFERENCES product_model(model_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_complaint_reminder_complaint_id') THEN
    ALTER TABLE complaint_reminder ADD CONSTRAINT fk_complaint_reminder_complaint_id FOREIGN KEY (complaint_id) REFERENCES complaint(complaint_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_visit_report_complaint_id') THEN
    ALTER TABLE visit_report ADD CONSTRAINT fk_visit_report_complaint_id FOREIGN KEY (complaint_id) REFERENCES complaint(complaint_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_visit_report_engineer_id') THEN
    ALTER TABLE visit_report ADD CONSTRAINT fk_visit_report_engineer_id FOREIGN KEY (engineer_id) REFERENCES app_user(user_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_jobcard_complaint_id') THEN
    ALTER TABLE jobcard ADD CONSTRAINT fk_jobcard_complaint_id FOREIGN KEY (complaint_id) REFERENCES complaint(complaint_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_jobcard_sc_id') THEN
    ALTER TABLE jobcard ADD CONSTRAINT fk_jobcard_sc_id FOREIGN KEY (sc_id) REFERENCES service_center(sc_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_jobcard_engineer_id') THEN
    ALTER TABLE jobcard ADD CONSTRAINT fk_jobcard_engineer_id FOREIGN KEY (engineer_id) REFERENCES app_user(user_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_jobcard_item_jobcard_id') THEN
    ALTER TABLE jobcard_item ADD CONSTRAINT fk_jobcard_item_jobcard_id FOREIGN KEY (jobcard_id) REFERENCES jobcard(jobcard_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_jobcard_fault_jobcard_id') THEN
    ALTER TABLE jobcard_fault ADD CONSTRAINT fk_jobcard_fault_jobcard_id FOREIGN KEY (jobcard_id) REFERENCES jobcard(jobcard_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_jobcard_fault_fault_id') THEN
    ALTER TABLE jobcard_fault ADD CONSTRAINT fk_jobcard_fault_fault_id FOREIGN KEY (fault_id) REFERENCES fault_master(fault_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_jobcard_approval_jobcard_id') THEN
    ALTER TABLE jobcard_approval ADD CONSTRAINT fk_jobcard_approval_jobcard_id FOREIGN KEY (jobcard_id) REFERENCES jobcard(jobcard_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_jobcard_approval_approver_id') THEN
    ALTER TABLE jobcard_approval ADD CONSTRAINT fk_jobcard_approval_approver_id FOREIGN KEY (approver_id) REFERENCES app_user(user_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_spare_rate_history_spare_id') THEN
    ALTER TABLE spare_rate_history ADD CONSTRAINT fk_spare_rate_history_spare_id FOREIGN KEY (spare_id) REFERENCES spare_master(spare_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_txn_spare_id') THEN
    ALTER TABLE stock_txn ADD CONSTRAINT fk_stock_txn_spare_id FOREIGN KEY (spare_id) REFERENCES spare_master(spare_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_txn_jitem_id') THEN
    ALTER TABLE stock_txn ADD CONSTRAINT fk_stock_txn_jitem_id FOREIGN KEY (jitem_id) REFERENCES jobcard_item(jitem_id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

-- ------------------------------------------------------------------ INDEXES
CREATE INDEX IF NOT EXISTS ix_warranty_serial_no ON warranty (serial_no);
CREATE INDEX IF NOT EXISTS ix_warranty_install_id ON warranty (install_id);
CREATE INDEX IF NOT EXISTS ix_warranty_end_date ON warranty (end_date);
CREATE INDEX IF NOT EXISTS ix_warranty_dealer_id ON warranty (dealer_id);
CREATE INDEX IF NOT EXISTS ix_sticker_status ON sticker (status);
CREATE INDEX IF NOT EXISTS ix_sticker_model_id ON sticker (model_id);
CREATE INDEX IF NOT EXISTS ix_installation_customer_id ON installation (customer_id);
CREATE INDEX IF NOT EXISTS ix_complaint_status ON complaint (status);
CREATE INDEX IF NOT EXISTS ix_complaint_call_date ON complaint (call_date);
CREATE INDEX IF NOT EXISTS ix_complaint_sc_id ON complaint (sc_id);
CREATE INDEX IF NOT EXISTS ix_complaint_engineer_id ON complaint (engineer_id);
CREATE INDEX IF NOT EXISTS ix_complaint_item_serial_no ON complaint_item (serial_no);
CREATE INDEX IF NOT EXISTS ix_jobcard_complaint_id ON jobcard (complaint_id);
CREATE INDEX IF NOT EXISTS ix_jobcard_item_jobcard_id ON jobcard_item (jobcard_id);
CREATE INDEX IF NOT EXISTS ix_stock_txn_spare_id ON stock_txn (spare_id);
CREATE INDEX IF NOT EXISTS ix_stock_txn_loc_type ON stock_txn (loc_type);
CREATE INDEX IF NOT EXISTS ix_notification_log_sent_on ON notification_log (sent_on);

COMMIT;