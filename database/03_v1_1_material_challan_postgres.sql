-- ============================================================================
-- Delta iERP - Warranty & Service Module  |  v1.1 upgrade (PostgreSQL)
-- Service center login, replacement warranty status, material request ->
-- HO approval -> delivery challan -> fresh / defective receipt, warehouse GRN.
--
-- New tables are created by 01_create_tables_postgres.sql (CREATE TABLE IF NOT EXISTS).
-- This file adds the new columns to tables that already exist in a live database.
-- Safe to run more than once.  Applied by: npm run db:migrate
-- ============================================================================

BEGIN;

ALTER TABLE service_center ADD COLUMN IF NOT EXISTS password VARCHAR(40);
ALTER TABLE service_center ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
ALTER TABLE replacement ADD COLUMN IF NOT EXISTS warranty_status VARCHAR(20);

-- Existing replacements: "Without Serial No" vouchers are out of warranty, the rest in warranty
UPDATE replacement
SET warranty_status = CASE WHEN voucher_type = 'Without Serial No' THEN 'Out of Warranty' ELSE 'In Warranty' END
WHERE warranty_status IS NULL;

CREATE INDEX IF NOT EXISTS ix_material_request_status ON material_request (status);
CREATE INDEX IF NOT EXISTS ix_material_request_item_mr_id ON material_request_item (mr_id);
CREATE INDEX IF NOT EXISTS ix_delivery_challan_status ON delivery_challan (status);
CREATE INDEX IF NOT EXISTS ix_delivery_challan_item_dc_id ON delivery_challan_item (dc_id);
CREATE INDEX IF NOT EXISTS ix_dc_receipt_dc_id ON dc_receipt (dc_id);
CREATE INDEX IF NOT EXISTS ix_wh_grn_dc_id ON wh_grn (dc_id);

COMMIT;
