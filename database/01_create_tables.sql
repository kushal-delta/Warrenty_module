/* ============================================================================
   Delta iERP - Warranty & Service (CSC) module  -  Solar Submersible Pump, Motor, Controller
   Target: Microsoft SQL Server 2016+      Generated from app/schema.js
   ============================================================================ */
SET NOCOUNT ON;
GO

/* ---------------- MASTERS ---------------- */

-- Single row. Name, address and helpline appear on cards, job cards and WhatsApp messages.
CREATE TABLE dbo.company_profile (
    company_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_company_profile PRIMARY KEY,
    company_name NVARCHAR(120) NOT NULL,
    tagline NVARCHAR(160) NULL,
    address NVARCHAR(250) NULL,
    city NVARCHAR(60) NULL,
    state NVARCHAR(60) NULL,
    pincode NVARCHAR(10) NULL,
    phone NVARCHAR(30) NULL,
    toll_free NVARCHAR(30) NULL,
    email NVARCHAR(100) NULL,
    website NVARCHAR(100) NULL,
    gstin NVARCHAR(20) NULL,
    whatsapp_sender NVARCHAR(30) NULL,
    warranty_terms NVARCHAR(MAX) NULL
);
GO

CREATE TABLE dbo.state_master (
    state_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_state_master PRIMARY KEY,
    state_code NVARCHAR(2) NOT NULL,
    state_name NVARCHAR(60) NOT NULL,
    short_name NVARCHAR(3) NULL,
    CONSTRAINT UQ_state_master_state_code UNIQUE (state_code)
);
GO

CREATE TABLE dbo.district_master (
    district_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_district_master PRIMARY KEY,
    state_code NVARCHAR(2) NOT NULL,
    district_name NVARCHAR(60) NOT NULL
);
GO

-- Each component of a solar submersible set (pump, motor, controller) is its own model with its own warranty.
CREATE TABLE dbo.product_model (
    model_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_product_model PRIMARY KEY,
    model_code NVARCHAR(30) NOT NULL,
    model_name NVARCHAR(120) NOT NULL,
    category NVARCHAR(12) NOT NULL,
    hp DECIMAL(5,2) NULL,
    kw DECIMAL(6,3) NULL,
    technology NVARCHAR(40) NULL,
    voltage_range NVARCHAR(40) NULL,
    head_range NVARCHAR(40) NULL,
    discharge NVARCHAR(40) NULL,
    size_inch NVARCHAR(20) NULL,
    warranty_months INT NOT NULL CONSTRAINT DF_product_model_warranty_months DEFAULT 24,
    is_active BIT NOT NULL CONSTRAINT DF_product_model_is_active DEFAULT 1,
    description NVARCHAR(250) NULL,
    created_on DATETIME2(0) NULL,
    CONSTRAINT UQ_product_model_model_code UNIQUE (model_code)
);
GO

CREATE TABLE dbo.project (
    project_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_project PRIMARY KEY,
    project_no NVARCHAR(30) NOT NULL,
    project_name NVARCHAR(120) NOT NULL,
    scheme NVARCHAR(60) NULL,
    state_code NVARCHAR(2) NULL,
    start_date DATE NULL,
    end_date DATE NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_project_status DEFAULT N'Active',
    remarks NVARCHAR(250) NULL,
    CONSTRAINT UQ_project_project_no UNIQUE (project_no)
);
GO

CREATE TABLE dbo.call_type (
    calltype_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_call_type PRIMARY KEY,
    call_type NVARCHAR(60) NOT NULL,
    valid_days INT NOT NULL,
    is_warranty BIT NOT NULL CONSTRAINT DF_call_type_is_warranty DEFAULT 0,
    description NVARCHAR(250) NULL,
    is_active BIT NOT NULL CONSTRAINT DF_call_type_is_active DEFAULT 1,
    CONSTRAINT UQ_call_type_call_type UNIQUE (call_type)
);
GO

CREATE TABLE dbo.fault_master (
    fault_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_fault_master PRIMARY KEY,
    category NVARCHAR(12) NOT NULL,
    fault_name NVARCHAR(100) NOT NULL,
    default_nature NVARCHAR(250) NULL,
    is_active BIT NOT NULL CONSTRAINT DF_fault_master_is_active DEFAULT 1
);
GO

CREATE TABLE dbo.service_center (
    sc_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_service_center PRIMARY KEY,
    sc_code NVARCHAR(20) NULL,
    sc_name NVARCHAR(120) NOT NULL,
    contact_person NVARCHAR(80) NULL,
    mobile NVARCHAR(15) NULL,
    email NVARCHAR(100) NULL,
    address NVARCHAR(250) NULL,
    city NVARCHAR(60) NULL,
    district NVARCHAR(60) NULL,
    state_code NVARCHAR(2) NULL,
    pincode NVARCHAR(10) NULL,
    gstin NVARCHAR(20) NULL,
    is_active BIT NOT NULL CONSTRAINT DF_service_center_is_active DEFAULT 1
);
GO
CREATE UNIQUE INDEX UQ_service_center_sc_code ON dbo.service_center (sc_code) WHERE sc_code IS NOT NULL;
GO

-- HO users, service managers and field engineers. Engineers are users with role ENGINEER.
CREATE TABLE dbo.app_user (
    user_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_app_user PRIMARY KEY,
    first_name NVARCHAR(60) NOT NULL,
    last_name NVARCHAR(60) NULL,
    username NVARCHAR(40) NOT NULL,
    password NVARCHAR(40) NOT NULL,
    phone NVARCHAR(15) NULL,
    email NVARCHAR(100) NULL,
    address NVARCHAR(250) NULL,
    role NVARCHAR(20) NOT NULL,
    state_rights NVARCHAR(250) NULL,
    district_rights NVARCHAR(500) NULL,
    form_rights NVARCHAR(250) NULL,
    is_admin BIT NOT NULL CONSTRAINT DF_app_user_is_admin DEFAULT 0,
    sc_id INT NULL,
    is_active BIT NOT NULL CONSTRAINT DF_app_user_is_active DEFAULT 1,
    last_login DATETIME2(0) NULL,
    CONSTRAINT UQ_app_user_username UNIQUE (username)
);
GO

CREATE TABLE dbo.approval_rule (
    rule_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_approval_rule PRIMARY KEY,
    level_no INT NOT NULL,
    role_name NVARCHAR(40) NOT NULL,
    approver_user_id INT NULL,
    amount_from DECIMAL(18,2) NOT NULL,
    is_active BIT NOT NULL CONSTRAINT DF_approval_rule_is_active DEFAULT 1,
    CONSTRAINT UQ_approval_rule_level_no UNIQUE (level_no)
);
GO

/* ---------------- WARRANTY ---------------- */

CREATE TABLE dbo.dealer (
    dealer_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_dealer PRIMARY KEY,
    dealer_code NVARCHAR(10) NULL,
    firm_name NVARCHAR(120) NOT NULL,
    contact_person NVARCHAR(80) NULL,
    mobile NVARCHAR(15) NOT NULL,
    email NVARCHAR(100) NULL,
    address NVARCHAR(250) NULL,
    city NVARCHAR(60) NULL,
    district NVARCHAR(60) NULL,
    state_code NVARCHAR(2) NULL,
    pincode NVARCHAR(10) NULL,
    gstin NVARCHAR(20) NULL,
    password NVARCHAR(40) NULL,
    warranty_months INT NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_dealer_status DEFAULT N'Pending',
    signup_on DATETIME2(0) NULL,
    approved_by NVARCHAR(60) NULL,
    approved_on DATETIME2(0) NULL,
    remarks NVARCHAR(250) NULL
);
GO
CREATE UNIQUE INDEX UQ_dealer_dealer_code ON dbo.dealer (dealer_code) WHERE dealer_code IS NOT NULL;
GO

-- Created automatically at first warranty registration; mobile number is the login (OTP).
CREATE TABLE dbo.customer (
    customer_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_customer PRIMARY KEY,
    customer_name NVARCHAR(100) NOT NULL,
    mobile NVARCHAR(15) NOT NULL,
    alt_mobile NVARCHAR(15) NULL,
    email NVARCHAR(100) NULL,
    address NVARCHAR(250) NULL,
    village NVARCHAR(80) NULL,
    city NVARCHAR(60) NULL,
    district NVARCHAR(60) NULL,
    state_code NVARCHAR(2) NULL,
    pincode NVARCHAR(10) NULL,
    language NVARCHAR(10) NULL CONSTRAINT DF_customer_language DEFAULT N'EN',
    created_on DATETIME2(0) NULL,
    last_login DATETIME2(0) NULL,
    CONSTRAINT UQ_customer_mobile UNIQUE (mobile)
);
GO

-- One Excel import = one batch.
CREATE TABLE dbo.sticker_batch (
    batch_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_sticker_batch PRIMARY KEY,
    batch_no NVARCHAR(30) NOT NULL,
    batch_date DATE NOT NULL,
    supplier_name NVARCHAR(80) NULL,
    remarks NVARCHAR(250) NULL,
    total_serials INT NULL,
    created_by NVARCHAR(60) NULL,
    created_on DATETIME2(0) NULL,
    CONSTRAINT UQ_sticker_batch_batch_no UNIQUE (batch_no)
);
GO

-- Authenticity register: a serial that is not here cannot be registered.
CREATE TABLE dbo.sticker (
    sticker_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_sticker PRIMARY KEY,
    batch_id INT NULL,
    serial_no NVARCHAR(40) NOT NULL,
    model_id INT NOT NULL,
    category NVARCHAR(12) NOT NULL,
    supplier_name NVARCHAR(80) NULL,
    product_group NVARCHAR(40) NULL,
    invoice_no NVARCHAR(40) NULL,
    invoice_date DATE NULL,
    invoice_location NVARCHAR(60) NULL,
    mfg_date DATE NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_sticker_status DEFAULT N'Generated',
    print_count INT NOT NULL CONSTRAINT DF_sticker_print_count DEFAULT 0,
    last_printed_on DATETIME2(0) NULL,
    created_on DATETIME2(0) NULL,
    CONSTRAINT UQ_sticker_serial_no UNIQUE (serial_no)
);
GO

-- One solar pump set at one site: groups the pump, motor and controller warranties.
CREATE TABLE dbo.installation (
    install_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_installation PRIMARY KEY,
    install_no NVARCHAR(30) NOT NULL,
    customer_id INT NOT NULL,
    dealer_id INT NULL,
    install_date DATE NOT NULL,
    site_address NVARCHAR(250) NULL,
    village NVARCHAR(80) NULL,
    district NVARCHAR(60) NULL,
    state_code NVARCHAR(2) NULL,
    pincode NVARCHAR(10) NULL,
    latitude DECIMAL(9,6) NULL,
    longitude DECIMAL(9,6) NULL,
    borewell_depth_m INT NULL,
    dynamic_head_m INT NULL,
    panel_kwp DECIMAL(6,2) NULL,
    project_id INT NULL,
    invoice_no NVARCHAR(40) NULL,
    invoice_date DATE NULL,
    registered_by NVARCHAR(20) NULL,
    registered_on DATETIME2(0) NULL,
    remarks NVARCHAR(250) NULL,
    CONSTRAINT UQ_installation_install_no UNIQUE (install_no)
);
GO

-- Pump, motor and controller each carry their own warranty row.
CREATE TABLE dbo.warranty (
    warranty_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_warranty PRIMARY KEY,
    warranty_no NVARCHAR(30) NOT NULL,
    install_id INT NOT NULL,
    serial_no NVARCHAR(40) NOT NULL,
    sticker_id INT NULL,
    category NVARCHAR(12) NOT NULL,
    model_id INT NULL,
    customer_id INT NULL,
    dealer_id INT NULL,
    start_date DATE NOT NULL,
    warranty_months INT NOT NULL,
    extended_months INT NOT NULL CONSTRAINT DF_warranty_extended_months DEFAULT 0,
    end_date DATE NOT NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_warranty_status DEFAULT N'Active',
    replaced_from_serial NVARCHAR(40) NULL,
    registered_by NVARCHAR(20) NULL,
    registered_on DATETIME2(0) NULL,
    whatsapp_sent BIT NOT NULL CONSTRAINT DF_warranty_whatsapp_sent DEFAULT 0,
    remarks NVARCHAR(250) NULL,
    CONSTRAINT UQ_warranty_warranty_no UNIQUE (warranty_no),
    CONSTRAINT UQ_warranty_serial_no UNIQUE (serial_no)
);
GO

CREATE TABLE dbo.replacement (
    repl_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_replacement PRIMARY KEY,
    repl_no NVARCHAR(30) NOT NULL,
    repl_date DATE NOT NULL,
    source NVARCHAR(20) NOT NULL,
    complaint_id INT NULL,
    dealer_id INT NULL,
    voucher_type NVARCHAR(30) NULL,
    dealer_invoice_no NVARCHAR(40) NULL,
    dealer_invoice_date DATE NULL,
    receipt_date DATE NULL,
    transporter NVARCHAR(80) NULL,
    lr_no NVARCHAR(40) NULL,
    lr_date DATE NULL,
    replacement_type NVARCHAR(20) NULL,
    make_sales_invoice BIT NULL CONSTRAINT DF_replacement_make_sales_invoice DEFAULT 0,
    no_of_articles INT NULL,
    reason NVARCHAR(250) NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_replacement_status DEFAULT N'Open',
    cn_no NVARCHAR(30) NULL,
    cn_amount DECIMAL(18,2) NULL,
    remarks NVARCHAR(250) NULL,
    created_by NVARCHAR(60) NULL,
    created_on DATETIME2(0) NULL,
    CONSTRAINT UQ_replacement_repl_no UNIQUE (repl_no)
);
GO

CREATE TABLE dbo.replacement_item (
    ritem_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_replacement_item PRIMARY KEY,
    repl_id INT NOT NULL,
    line_no INT NULL,
    category NVARCHAR(12) NULL,
    invoice_item NVARCHAR(120) NULL,
    received_item NVARCHAR(120) NULL,
    old_serial_no NVARCHAR(40) NULL,
    new_serial_no NVARCHAR(40) NULL,
    qty INT NOT NULL CONSTRAINT DF_replacement_item_qty DEFAULT 1,
    net_value DECIMAL(18,2) NULL,
    location NVARCHAR(60) NULL,
    ref_invoice_no NVARCHAR(40) NULL,
    ref_invoice_date DATE NULL,
    warranty_days_left INT NULL,
    charges DECIMAL(18,2) NULL,
    remarks NVARCHAR(250) NULL
);
GO

/* ---------------- SERVICE ---------------- */

CREATE TABLE dbo.complaint (
    complaint_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_complaint PRIMARY KEY,
    complaint_no NVARCHAR(30) NOT NULL,
    call_date DATE NOT NULL,
    calltype_id INT NOT NULL,
    project_id INT NULL,
    priority NVARCHAR(10) NOT NULL CONSTRAINT DF_complaint_priority DEFAULT N'Medium',
    source NVARCHAR(20) NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_complaint_status DEFAULT N'New',
    install_id INT NULL,
    customer_id INT NULL,
    customer_name NVARCHAR(100) NOT NULL,
    mobile NVARCHAR(15) NOT NULL,
    address NVARCHAR(250) NULL,
    village NVARCHAR(80) NULL,
    district NVARCHAR(60) NULL,
    state_code NVARCHAR(2) NULL,
    pincode NVARCHAR(10) NULL,
    dealer_id INT NULL,
    warranty_status NVARCHAR(20) NULL,
    complaint_text NVARCHAR(500) NOT NULL,
    sc_id INT NULL,
    engineer_id INT NULL,
    assigned_on DATE NULL,
    due_date DATE NULL,
    closed_on DATE NULL,
    resolution NVARCHAR(500) NULL,
    created_by NVARCHAR(60) NULL,
    created_on DATETIME2(0) NULL,
    CONSTRAINT UQ_complaint_complaint_no UNIQUE (complaint_no)
);
GO

-- A call can be raised against the pump, the motor, the controller or any combination.
CREATE TABLE dbo.complaint_item (
    citem_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_complaint_item PRIMARY KEY,
    complaint_id INT NOT NULL,
    category NVARCHAR(12) NOT NULL,
    serial_no NVARCHAR(40) NULL,
    model_id INT NULL,
    model_name NVARCHAR(120) NULL,
    warranty_status NVARCHAR(20) NULL,
    warranty_end DATE NULL,
    fault_reported NVARCHAR(250) NULL
);
GO

CREATE TABLE dbo.complaint_reminder (
    rem_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_complaint_reminder PRIMARY KEY,
    complaint_id INT NOT NULL,
    remind_on DATE NOT NULL,
    note NVARCHAR(250) NULL,
    status NVARCHAR(10) NOT NULL CONSTRAINT DF_complaint_reminder_status DEFAULT N'Pending',
    done_on DATE NULL,
    created_by NVARCHAR(60) NULL
);
GO

CREATE TABLE dbo.visit_report (
    visit_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_visit_report PRIMARY KEY,
    visit_no NVARCHAR(30) NULL,
    complaint_id INT NOT NULL,
    engineer_id INT NOT NULL,
    visit_date DATE NOT NULL,
    start_time NVARCHAR(8) NULL,
    end_time NVARCHAR(8) NULL,
    from_location NVARCHAR(120) NULL,
    to_location NVARCHAR(120) NULL,
    travel_km INT NULL,
    travel_exp DECIMAL(18,2) NULL,
    other_exp DECIMAL(18,2) NULL,
    findings NVARCHAR(500) NULL,
    action_taken NVARCHAR(500) NULL,
    outcome NVARCHAR(30) NOT NULL,
    customer_rating INT NULL,
    created_on DATETIME2(0) NULL
);
GO
CREATE UNIQUE INDEX UQ_visit_report_visit_no ON dbo.visit_report (visit_no) WHERE visit_no IS NOT NULL;
GO

CREATE TABLE dbo.jobcard (
    jobcard_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_jobcard PRIMARY KEY,
    jobcard_no NVARCHAR(30) NOT NULL,
    jobcard_date DATE NOT NULL,
    revision_no INT NOT NULL CONSTRAINT DF_jobcard_revision_no DEFAULT 0,
    complaint_id INT NOT NULL,
    sc_id INT NOT NULL,
    engineer_id INT NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_jobcard_status DEFAULT N'Draft',
    notes NVARCHAR(500) NULL,
    subtotal_spares DECIMAL(18,2) NULL,
    subtotal_labour DECIMAL(18,2) NULL,
    gst_amount DECIMAL(18,2) NULL,
    other_charges DECIMAL(18,2) NULL,
    grand_total DECIMAL(18,2) NULL,
    warranty_amount DECIMAL(18,2) NULL,
    customer_payable DECIMAL(18,2) NULL,
    levels_required INT NULL,
    current_level INT NULL,
    closed_on DATE NULL,
    stock_posted BIT NOT NULL CONSTRAINT DF_jobcard_stock_posted DEFAULT 0,
    created_by NVARCHAR(60) NULL,
    created_on DATETIME2(0) NULL,
    CONSTRAINT UQ_jobcard_jobcard_no UNIQUE (jobcard_no)
);
GO

CREATE TABLE dbo.jobcard_item (
    jitem_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_jobcard_item PRIMARY KEY,
    jobcard_id INT NOT NULL,
    line_no INT NULL,
    item_type NVARCHAR(10) NOT NULL,
    item_id INT NULL,
    item_code NVARCHAR(30) NULL,
    particulars NVARCHAR(200) NOT NULL,
    category NVARCHAR(12) NULL,
    serial_no NVARCHAR(40) NULL,
    qty DECIMAL(18,2) NOT NULL CONSTRAINT DF_jobcard_item_qty DEFAULT 1,
    rate DECIMAL(18,2) NULL,
    gst_pct DECIMAL(5,2) NULL,
    amount DECIMAL(18,2) NULL,
    warranty BIT NOT NULL CONSTRAINT DF_jobcard_item_warranty DEFAULT 0,
    remarks NVARCHAR(150) NULL
);
GO

CREATE TABLE dbo.jobcard_fault (
    jfault_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_jobcard_fault PRIMARY KEY,
    jobcard_id INT NOT NULL,
    fault_id INT NULL,
    category NVARCHAR(12) NULL,
    fault_name NVARCHAR(100) NULL,
    nature NVARCHAR(250) NULL
);
GO

CREATE TABLE dbo.jobcard_approval (
    appr_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_jobcard_approval PRIMARY KEY,
    jobcard_id INT NOT NULL,
    level_no INT NOT NULL,
    approver_role NVARCHAR(40) NULL,
    approver_id INT NULL,
    status NVARCHAR(12) NOT NULL CONSTRAINT DF_jobcard_approval_status DEFAULT N'Pending',
    remarks NVARCHAR(250) NULL,
    acted_on DATETIME2(0) NULL,
    revision_no INT NOT NULL CONSTRAINT DF_jobcard_approval_revision_no DEFAULT 0
);
GO

/* ---------------- STOCK ---------------- */

CREATE TABLE dbo.spare_master (
    spare_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_spare_master PRIMARY KEY,
    spare_code NVARCHAR(30) NOT NULL,
    spare_name NVARCHAR(120) NOT NULL,
    category NVARCHAR(12) NOT NULL,
    uom NVARCHAR(10) NOT NULL CONSTRAINT DF_spare_master_uom DEFAULT N'Nos',
    hsn NVARCHAR(10) NULL,
    gst_pct DECIMAL(5,2) NOT NULL CONSTRAINT DF_spare_master_gst_pct DEFAULT 18,
    rate DECIMAL(18,2) NOT NULL,
    effective_from DATE NULL,
    min_stock INT NOT NULL CONSTRAINT DF_spare_master_min_stock DEFAULT 0,
    is_active BIT NOT NULL CONSTRAINT DF_spare_master_is_active DEFAULT 1,
    description NVARCHAR(250) NULL,
    CONSTRAINT UQ_spare_master_spare_code UNIQUE (spare_code)
);
GO

CREATE TABLE dbo.spare_rate_history (
    rate_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_spare_rate_history PRIMARY KEY,
    spare_id INT NOT NULL,
    rate DECIMAL(18,2) NOT NULL,
    effective_from DATE NOT NULL,
    changed_by NVARCHAR(60) NULL,
    changed_on DATETIME2(0) NULL
);
GO

CREATE TABLE dbo.labour_master (
    labour_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_labour_master PRIMARY KEY,
    labour_code NVARCHAR(30) NOT NULL,
    labour_name NVARCHAR(120) NOT NULL,
    description NVARCHAR(250) NULL,
    category NVARCHAR(12) NULL,
    rate DECIMAL(18,2) NOT NULL,
    gst_pct DECIMAL(5,2) NOT NULL CONSTRAINT DF_labour_master_gst_pct DEFAULT 18,
    effective_from DATE NULL,
    is_active BIT NOT NULL CONSTRAINT DF_labour_master_is_active DEFAULT 1,
    CONSTRAINT UQ_labour_master_labour_code UNIQUE (labour_code)
);
GO

-- Balance = SUM(qty) per location, spare and bucket. Job card approval posts the Consume rows automatically.
CREATE TABLE dbo.stock_txn (
    txn_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_stock_txn PRIMARY KEY,
    txn_date DATE NOT NULL,
    spare_id INT NOT NULL,
    loc_type NVARCHAR(3) NOT NULL,
    loc_id INT NOT NULL,
    bucket NVARCHAR(10) NOT NULL CONSTRAINT DF_stock_txn_bucket DEFAULT N'GOOD',
    txn_type NVARCHAR(20) NOT NULL,
    qty DECIMAL(18,2) NOT NULL,
    ref_type NVARCHAR(20) NULL,
    ref_no NVARCHAR(40) NULL,
    remarks NVARCHAR(250) NULL,
    created_by NVARCHAR(60) NULL,
    created_on DATETIME2(0) NULL,
    jitem_id INT NULL
);
GO

/* ---------------- SYSTEM ---------------- */

-- Every automatic message the system sends. The demo records it here instead of calling the gateway.
CREATE TABLE dbo.notification_log (
    notif_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_notification_log PRIMARY KEY,
    channel NVARCHAR(10) NOT NULL,
    to_mobile NVARCHAR(15) NULL,
    template NVARCHAR(40) NULL,
    message NVARCHAR(MAX) NOT NULL,
    ref_type NVARCHAR(30) NULL,
    ref_no NVARCHAR(40) NULL,
    sent_on DATETIME2(0) NOT NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_notification_log_status DEFAULT N'Sent'
);
GO

CREATE TABLE dbo.attachment (
    att_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_attachment PRIMARY KEY,
    ref_type NVARCHAR(30) NOT NULL,
    ref_id INT NOT NULL,
    file_name NVARCHAR(120) NULL,
    mime NVARCHAR(60) NULL,
    size_kb INT NULL,
    data_url NVARCHAR(MAX) NULL,
    caption NVARCHAR(150) NULL,
    uploaded_by NVARCHAR(60) NULL,
    uploaded_on DATETIME2(0) NULL
);
GO

-- One row per document key per financial year (seq_key + fy is unique); the next number = last_no + 1.
CREATE TABLE dbo.doc_sequence (
    seq_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_doc_sequence PRIMARY KEY,
    seq_key NVARCHAR(30) NOT NULL,
    prefix NVARCHAR(20) NULL,
    fy NVARCHAR(7) NOT NULL,
    last_no INT NOT NULL CONSTRAINT DF_doc_sequence_last_no DEFAULT 0,
    CONSTRAINT UQ_doc_sequence_seq_key_fy UNIQUE (seq_key, fy)
);
GO

CREATE TABLE dbo.activity_log (
    log_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_activity_log PRIMARY KEY,
    log_on DATETIME2(0) NOT NULL,
    user_name NVARCHAR(60) NULL,
    action NVARCHAR(20) NULL,
    table_name NVARCHAR(40) NULL,
    ref NVARCHAR(60) NULL,
    detail NVARCHAR(250) NULL
);
GO

/* ---------------- FOREIGN KEYS ---------------- */
ALTER TABLE dbo.district_master ADD CONSTRAINT FK_district_master_state_code FOREIGN KEY (state_code) REFERENCES dbo.state_master(state_code);
ALTER TABLE dbo.project ADD CONSTRAINT FK_project_state_code FOREIGN KEY (state_code) REFERENCES dbo.state_master(state_code);
ALTER TABLE dbo.service_center ADD CONSTRAINT FK_service_center_state_code FOREIGN KEY (state_code) REFERENCES dbo.state_master(state_code);
ALTER TABLE dbo.app_user ADD CONSTRAINT FK_app_user_sc_id FOREIGN KEY (sc_id) REFERENCES dbo.service_center(sc_id);
ALTER TABLE dbo.approval_rule ADD CONSTRAINT FK_approval_rule_approver_user_id FOREIGN KEY (approver_user_id) REFERENCES dbo.app_user(user_id);
ALTER TABLE dbo.dealer ADD CONSTRAINT FK_dealer_state_code FOREIGN KEY (state_code) REFERENCES dbo.state_master(state_code);
ALTER TABLE dbo.customer ADD CONSTRAINT FK_customer_state_code FOREIGN KEY (state_code) REFERENCES dbo.state_master(state_code);
ALTER TABLE dbo.sticker ADD CONSTRAINT FK_sticker_batch_id FOREIGN KEY (batch_id) REFERENCES dbo.sticker_batch(batch_id);
ALTER TABLE dbo.sticker ADD CONSTRAINT FK_sticker_model_id FOREIGN KEY (model_id) REFERENCES dbo.product_model(model_id);
ALTER TABLE dbo.installation ADD CONSTRAINT FK_installation_customer_id FOREIGN KEY (customer_id) REFERENCES dbo.customer(customer_id);
ALTER TABLE dbo.installation ADD CONSTRAINT FK_installation_dealer_id FOREIGN KEY (dealer_id) REFERENCES dbo.dealer(dealer_id);
ALTER TABLE dbo.installation ADD CONSTRAINT FK_installation_state_code FOREIGN KEY (state_code) REFERENCES dbo.state_master(state_code);
ALTER TABLE dbo.installation ADD CONSTRAINT FK_installation_project_id FOREIGN KEY (project_id) REFERENCES dbo.project(project_id);
ALTER TABLE dbo.warranty ADD CONSTRAINT FK_warranty_install_id FOREIGN KEY (install_id) REFERENCES dbo.installation(install_id);
ALTER TABLE dbo.warranty ADD CONSTRAINT FK_warranty_sticker_id FOREIGN KEY (sticker_id) REFERENCES dbo.sticker(sticker_id);
ALTER TABLE dbo.warranty ADD CONSTRAINT FK_warranty_model_id FOREIGN KEY (model_id) REFERENCES dbo.product_model(model_id);
ALTER TABLE dbo.warranty ADD CONSTRAINT FK_warranty_customer_id FOREIGN KEY (customer_id) REFERENCES dbo.customer(customer_id);
ALTER TABLE dbo.warranty ADD CONSTRAINT FK_warranty_dealer_id FOREIGN KEY (dealer_id) REFERENCES dbo.dealer(dealer_id);
ALTER TABLE dbo.replacement ADD CONSTRAINT FK_replacement_complaint_id FOREIGN KEY (complaint_id) REFERENCES dbo.complaint(complaint_id);
ALTER TABLE dbo.replacement ADD CONSTRAINT FK_replacement_dealer_id FOREIGN KEY (dealer_id) REFERENCES dbo.dealer(dealer_id);
ALTER TABLE dbo.replacement_item ADD CONSTRAINT FK_replacement_item_repl_id FOREIGN KEY (repl_id) REFERENCES dbo.replacement(repl_id);
ALTER TABLE dbo.complaint ADD CONSTRAINT FK_complaint_calltype_id FOREIGN KEY (calltype_id) REFERENCES dbo.call_type(calltype_id);
ALTER TABLE dbo.complaint ADD CONSTRAINT FK_complaint_project_id FOREIGN KEY (project_id) REFERENCES dbo.project(project_id);
ALTER TABLE dbo.complaint ADD CONSTRAINT FK_complaint_install_id FOREIGN KEY (install_id) REFERENCES dbo.installation(install_id);
ALTER TABLE dbo.complaint ADD CONSTRAINT FK_complaint_customer_id FOREIGN KEY (customer_id) REFERENCES dbo.customer(customer_id);
ALTER TABLE dbo.complaint ADD CONSTRAINT FK_complaint_state_code FOREIGN KEY (state_code) REFERENCES dbo.state_master(state_code);
ALTER TABLE dbo.complaint ADD CONSTRAINT FK_complaint_dealer_id FOREIGN KEY (dealer_id) REFERENCES dbo.dealer(dealer_id);
ALTER TABLE dbo.complaint ADD CONSTRAINT FK_complaint_sc_id FOREIGN KEY (sc_id) REFERENCES dbo.service_center(sc_id);
ALTER TABLE dbo.complaint ADD CONSTRAINT FK_complaint_engineer_id FOREIGN KEY (engineer_id) REFERENCES dbo.app_user(user_id);
ALTER TABLE dbo.complaint_item ADD CONSTRAINT FK_complaint_item_complaint_id FOREIGN KEY (complaint_id) REFERENCES dbo.complaint(complaint_id);
ALTER TABLE dbo.complaint_item ADD CONSTRAINT FK_complaint_item_model_id FOREIGN KEY (model_id) REFERENCES dbo.product_model(model_id);
ALTER TABLE dbo.complaint_reminder ADD CONSTRAINT FK_complaint_reminder_complaint_id FOREIGN KEY (complaint_id) REFERENCES dbo.complaint(complaint_id);
ALTER TABLE dbo.visit_report ADD CONSTRAINT FK_visit_report_complaint_id FOREIGN KEY (complaint_id) REFERENCES dbo.complaint(complaint_id);
ALTER TABLE dbo.visit_report ADD CONSTRAINT FK_visit_report_engineer_id FOREIGN KEY (engineer_id) REFERENCES dbo.app_user(user_id);
ALTER TABLE dbo.jobcard ADD CONSTRAINT FK_jobcard_complaint_id FOREIGN KEY (complaint_id) REFERENCES dbo.complaint(complaint_id);
ALTER TABLE dbo.jobcard ADD CONSTRAINT FK_jobcard_sc_id FOREIGN KEY (sc_id) REFERENCES dbo.service_center(sc_id);
ALTER TABLE dbo.jobcard ADD CONSTRAINT FK_jobcard_engineer_id FOREIGN KEY (engineer_id) REFERENCES dbo.app_user(user_id);
ALTER TABLE dbo.jobcard_item ADD CONSTRAINT FK_jobcard_item_jobcard_id FOREIGN KEY (jobcard_id) REFERENCES dbo.jobcard(jobcard_id);
ALTER TABLE dbo.jobcard_fault ADD CONSTRAINT FK_jobcard_fault_jobcard_id FOREIGN KEY (jobcard_id) REFERENCES dbo.jobcard(jobcard_id);
ALTER TABLE dbo.jobcard_fault ADD CONSTRAINT FK_jobcard_fault_fault_id FOREIGN KEY (fault_id) REFERENCES dbo.fault_master(fault_id);
ALTER TABLE dbo.jobcard_approval ADD CONSTRAINT FK_jobcard_approval_jobcard_id FOREIGN KEY (jobcard_id) REFERENCES dbo.jobcard(jobcard_id);
ALTER TABLE dbo.jobcard_approval ADD CONSTRAINT FK_jobcard_approval_approver_id FOREIGN KEY (approver_id) REFERENCES dbo.app_user(user_id);
ALTER TABLE dbo.spare_rate_history ADD CONSTRAINT FK_spare_rate_history_spare_id FOREIGN KEY (spare_id) REFERENCES dbo.spare_master(spare_id);
ALTER TABLE dbo.stock_txn ADD CONSTRAINT FK_stock_txn_spare_id FOREIGN KEY (spare_id) REFERENCES dbo.spare_master(spare_id);
ALTER TABLE dbo.stock_txn ADD CONSTRAINT FK_stock_txn_jitem_id FOREIGN KEY (jitem_id) REFERENCES dbo.jobcard_item(jitem_id);
GO

/* ---------------- INDEXES FOR THE SEARCHES THE SCREENS USE ---------------- */
CREATE INDEX IX_warranty_serial_no ON dbo.warranty(serial_no);
CREATE INDEX IX_warranty_install_id ON dbo.warranty(install_id);
CREATE INDEX IX_warranty_end_date ON dbo.warranty(end_date);
CREATE INDEX IX_warranty_dealer_id ON dbo.warranty(dealer_id);
CREATE INDEX IX_sticker_status ON dbo.sticker(status);
CREATE INDEX IX_sticker_model_id ON dbo.sticker(model_id);
CREATE INDEX IX_installation_customer_id ON dbo.installation(customer_id);
CREATE INDEX IX_complaint_status ON dbo.complaint(status);
CREATE INDEX IX_complaint_call_date ON dbo.complaint(call_date);
CREATE INDEX IX_complaint_sc_id ON dbo.complaint(sc_id);
CREATE INDEX IX_complaint_engineer_id ON dbo.complaint(engineer_id);
CREATE INDEX IX_complaint_item_serial_no ON dbo.complaint_item(serial_no);
CREATE INDEX IX_jobcard_complaint_id ON dbo.jobcard(complaint_id);
CREATE INDEX IX_jobcard_item_jobcard_id ON dbo.jobcard_item(jobcard_id);
CREATE INDEX IX_stock_txn_spare_id ON dbo.stock_txn(spare_id);
CREATE INDEX IX_stock_txn_loc_type ON dbo.stock_txn(loc_type);
CREATE INDEX IX_notification_log_sent_on ON dbo.notification_log(sent_on);
GO