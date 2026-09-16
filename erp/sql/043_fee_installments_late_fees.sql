-- Installment and late-fee support for the finance module.
CREATE TABLE IF NOT EXISTS fee_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES fee_invoices(id) ON DELETE CASCADE,
  installment_no INTEGER NOT NULL CHECK (installment_no > 0),
  due_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','partial','paid','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(school_id, invoice_id, installment_no)
);
CREATE INDEX IF NOT EXISTS fee_installments_due_idx ON fee_installments(school_id,due_date,status);

CREATE TABLE IF NOT EXISTS fee_late_fee_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  grace_days INTEGER NOT NULL DEFAULT 0 CHECK (grace_days >= 0),
  mode VARCHAR(20) NOT NULL DEFAULT 'fixed' CHECK (mode IN ('fixed','daily_fixed','percentage')),
  value NUMERIC(12,2) NOT NULL CHECK (value >= 0),
  max_amount NUMERIC(12,2) CHECK (max_amount IS NULL OR max_amount >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(school_id,name)
);

CREATE TABLE IF NOT EXISTS fee_late_fee_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES fee_invoices(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES fee_late_fee_rules(id) ON DELETE SET NULL,
  charge_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','waived')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(school_id,invoice_id,charge_date,rule_id)
);
