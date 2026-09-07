CREATE TABLE IF NOT EXISTS fee_heads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(40) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (school_id, code),
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS fee_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE RESTRICT,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  fee_head_id UUID NOT NULL REFERENCES fee_heads(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  frequency VARCHAR(20) NOT NULL DEFAULT 'annual' CHECK (frequency IN ('monthly','quarterly','half_yearly','annual','one_time')),
  due_day SMALLINT CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31),
  UNIQUE (session_id, class_id, fee_head_id, frequency)
);

CREATE TABLE IF NOT EXISTS fee_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE RESTRICT,
  invoice_no VARCHAR(60) NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','partial','paid','cancelled')),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  net_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (net_amount >= 0),
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  balance_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (balance_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, invoice_no)
);

CREATE TABLE IF NOT EXISTS fee_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES fee_invoices(id) ON DELETE CASCADE,
  fee_head_id UUID NOT NULL REFERENCES fee_heads(id) ON DELETE RESTRICT,
  description VARCHAR(200),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0)
);

CREATE TABLE IF NOT EXISTS fee_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES fee_invoices(id) ON DELETE RESTRICT,
  receipt_no VARCHAR(60) NOT NULL,
  paid_on TIMESTAMPTZ NOT NULL DEFAULT now(),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method VARCHAR(30) NOT NULL CHECK (method IN ('cash','upi','card','bank_transfer','online','other')),
  transaction_ref VARCHAR(120),
  received_by UUID REFERENCES users(id) ON DELETE SET NULL,
  remarks TEXT,
  UNIQUE (school_id, receipt_no)
);

CREATE INDEX IF NOT EXISTS fee_invoice_student_idx ON fee_invoices(school_id, student_id, invoice_date DESC);
CREATE INDEX IF NOT EXISTS fee_payment_invoice_idx ON fee_payments(school_id, invoice_id, paid_on DESC);
