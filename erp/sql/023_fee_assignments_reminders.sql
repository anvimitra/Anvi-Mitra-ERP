-- Anvi Mitra ERP: student fee assignments, installment tracking and weekly reminder idempotency.
CREATE TABLE IF NOT EXISTS student_fee_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE RESTRICT,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  fee_head_id UUID NOT NULL REFERENCES fee_heads(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('monthly','quarterly','half_yearly','annual','one_time')),
  start_date DATE NOT NULL,
  end_date DATE,
  due_day SMALLINT CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id,student_id,session_id,fee_head_id,frequency,start_date)
);
CREATE INDEX IF NOT EXISTS student_fee_assignments_scope_idx
  ON student_fee_assignments(school_id,session_id,branch_id,student_id,status);

CREATE TABLE IF NOT EXISTS fee_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES student_fee_assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE RESTRICT,
  fee_head_id UUID NOT NULL REFERENCES fee_heads(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  invoice_id UUID REFERENCES fee_invoices(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'due' CHECK (status IN ('due','invoiced','paid','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assignment_id,period_start)
);
CREATE INDEX IF NOT EXISTS fee_installments_due_idx
  ON fee_installments(school_id,session_id,student_id,due_date,status);

CREATE TABLE IF NOT EXISTS fee_reminder_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  week_key VARCHAR(20) NOT NULL,
  run_type VARCHAR(30) NOT NULL DEFAULT 'weekly_due',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id,week_key,run_type)
);
