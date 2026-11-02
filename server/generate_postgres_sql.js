const fs = require('fs');
const path = require('path');
const SCHEMA = require('../app/schema.js');

function pgType(t) {
  if (t === 'pk') return 'SERIAL PRIMARY KEY';
  if (t === 'int') return 'INTEGER';
  if (t === 'bit') return 'SMALLINT';
  if (t === 'txt') return 'TEXT';
  if (t === 'date') return 'DATE';
  if (t === 'dt') return 'TIMESTAMP';
  if (t === 'dec') return 'NUMERIC(18,2)';
  if (t.startsWith('s')) return `VARCHAR(${t.slice(1)})`;
  if (t.startsWith('d')) {
    const parts = t.slice(1).split(',');
    return `NUMERIC(${parts[0]},${parts[1]})`;
  }
  return 'TEXT';
}

function generatePostgresSql() {
  const out = [];
  out.push('-- ============================================================================');
  out.push('-- Delta iERP - Warranty & Service Module');
  out.push('-- Database Target: PostgreSQL 12+');
  out.push('-- Database Name: Solarative_Warrenty_ModuleDemo');
  out.push('-- Generated from app/schema.js');
  out.push('-- ============================================================================');
  out.push('');
  out.push('BEGIN;');
  out.push('');

  // 1. Create Tables
  SCHEMA.groups.forEach(g => {
    out.push(`-- ------------------------------------------------------------------ ${g.toUpperCase()}`);
    const tables = SCHEMA.tables.filter(t => t.group === g);
    tables.forEach(t => {
      if (t.note) out.push(`-- ${t.title}: ${t.note}`);
      else out.push(`-- ${t.title}`);
      out.push(`CREATE TABLE IF NOT EXISTS ${t.name} (`);
      const colLines = [];
      t.cols.forEach(c => {
        let line = `    ${c.n} ${pgType(c.t)}`;
        if (c.t !== 'pk') {
          if (c.def !== null && c.def !== undefined) {
            const isNum = /^-?\d+(\.\d+)?$/.test(c.def);
            line += ` DEFAULT ${isNum ? c.def : `'` + c.def + `'`}`;
          }
          if (c.req) line += ' NOT NULL';
          if (c.uq) line += ` CONSTRAINT uq_${t.name}_${c.n} UNIQUE`;
        }
        colLines.push(line);
      });
      if (t.uniqueSets) {
        t.uniqueSets.forEach(u => {
          colLines.push(`    CONSTRAINT uq_${t.name}_${u.join('_')} UNIQUE (${u.join(', ')})`);
        });
      }
      out.push(colLines.join(',\n'));
      out.push(');');
      out.push('');
    });
  });

  // 2. Foreign Keys
  out.push('-- ------------------------------------------------------------------ FOREIGN KEYS');
  SCHEMA.tables.forEach(t => {
    t.cols.forEach(c => {
      if (!c.fk) return;
      const parts = c.fk.split('.');
      const refTable = parts[0];
      const refCol = parts[1] || SCHEMA.by[refTable].pk;
      out.push(`DO $$ BEGIN`);
      out.push(`  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_${t.name}_${c.n}') THEN`);
      out.push(`    ALTER TABLE ${t.name} ADD CONSTRAINT fk_${t.name}_${c.n} FOREIGN KEY (${c.n}) REFERENCES ${refTable}(${refCol}) ON UPDATE CASCADE ON DELETE RESTRICT;`);
      out.push(`  END IF;`);
      out.push(`END $$;`);
      out.push('');
    });
  });

  // 3. Indexes
  out.push('-- ------------------------------------------------------------------ INDEXES');
  const ix = [
    ['warranty', 'serial_no'], ['warranty', 'install_id'], ['warranty', 'end_date'], ['warranty', 'dealer_id'],
    ['sticker', 'status'], ['sticker', 'model_id'], ['installation', 'customer_id'],
    ['complaint', 'status'], ['complaint', 'call_date'], ['complaint', 'sc_id'], ['complaint', 'engineer_id'],
    ['complaint_item', 'serial_no'], ['jobcard', 'complaint_id'], ['jobcard_item', 'jobcard_id'],
    ['stock_txn', 'spare_id'], ['stock_txn', 'loc_type'], ['notification_log', 'sent_on']
  ];
  ix.forEach(p => {
    out.push(`CREATE INDEX IF NOT EXISTS ix_${p[0]}_${p[1]} ON ${p[0]} (${p[1]});`);
  });

  out.push('');
  out.push('COMMIT;');
  return out.join('\n');
}

const targetPath = path.join(__dirname, '../database/01_create_tables_postgres.sql');
fs.writeFileSync(targetPath, generatePostgresSql(), 'utf8');
console.log('PostgreSQL DDL successfully written to ' + targetPath);
