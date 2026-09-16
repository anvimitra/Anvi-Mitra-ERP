const fs = require('fs');
const path = require('path');
const assert = require('assert');

const migration = fs.readFileSync(path.join(__dirname,'../sql/042_fee_management.sql'),'utf8');
const routes = fs.readFileSync(path.join(__dirname,'../src/fees.js'),'utf8');

assert(migration.includes('CREATE TABLE IF NOT EXISTS fee_heads'));
assert(migration.includes('CREATE TABLE IF NOT EXISTS fee_structures'));
assert(migration.includes('CREATE TABLE IF NOT EXISTS fee_invoices'));
assert(migration.includes('CREATE TABLE IF NOT EXISTS fee_payments'));
assert(routes.includes("app.post('/api/fee-heads'"));
assert(routes.includes("app.post('/api/fee-structures'"));
assert(routes.includes("app.post('/api/fees/invoices'"));
assert(routes.includes("app.post('/api/fees/payments'"));
assert(routes.includes('/api/fees/reports/collection'));
assert(routes.includes('/api/fees/reports/outstanding'));
assert(routes.includes('/api/fees/reports/due'));
console.log('fee management contract: PASS');
