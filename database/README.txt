DATABASE SCRIPTS - Delta iERP Warranty & Service (Solartive Techno Industries Pvt Ltd)
=====================================================================================

Target: Microsoft SQL Server 2016 or later (SQL Server Management Studio / sqlcmd).

1. Create an empty database, e.g.   CREATE DATABASE SolartiveWarranty;   then   USE SolartiveWarranty;
2. Run  01_create_tables.sql   - 34 tables, primary / foreign keys, unique constraints, defaults, indexes.
3. Run  02_demo_data.sql       - the same sample data that the demo application shows (customers, serials,
                                 warranties, service calls, job cards, stock, ...). Optional.
4. Data-Dictionary.xlsx        - every table, column (type, null, key, default, description) and relationship.

The scripts are generated from the same definition that draws the screens, the Database Schema page in the
application and the Excel import templates, so they always agree with what you see in the demo.

Table groups
  Masters   company_profile, state_master, district_master, product_model, project, call_type, fault_master, service_center, app_user, approval_rule
  Warranty  dealer, customer, sticker_batch, sticker, installation, warranty, replacement, replacement_item
  Service   complaint, complaint_item, complaint_reminder, visit_report, jobcard, jobcard_item, jobcard_fault, jobcard_approval
  Stock     spare_master, spare_rate_history, labour_master, stock_txn
  System    notification_log, attachment, doc_sequence, activity_log

Notes
  * Every component of the set (pump, motor, controller) has its own row in warranty with its own serial_no,
    start / end date and status; installation groups the three rows of one site.
  * Document numbers (calls, job cards, warranties ...) come from doc_sequence, one counter per financial year.
  * Job card approval levels are driven by approval_rule (level, approver role, amount from).
  * Stock is a ledger (stock_txn); the balance of a spare at a service centre or engineer is the sum of qty.
