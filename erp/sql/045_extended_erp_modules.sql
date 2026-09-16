-- Extended ERP modules: academics, transport, library, inventory, HR/payroll and SaaS controls.
CREATE TABLE IF NOT EXISTS academic_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL, title VARCHAR(200) NOT NULL, event_type VARCHAR(40) NOT NULL DEFAULT 'academic',
  starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ, description TEXT, status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS academic_calendar_school_time_idx ON academic_calendar_events(school_id,starts_at);

CREATE TABLE IF NOT EXISTS homework_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL, class_id UUID, section_id UUID, subject_id UUID,
  teacher_id UUID, title VARCHAR(250) NOT NULL, description TEXT, assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at TIMESTAMPTZ, attachments JSONB NOT NULL DEFAULT '[]'::jsonb, status VARCHAR(20) NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS homework_school_class_idx ON homework_assignments(school_id,class_id,section_id,due_at);

CREATE TABLE IF NOT EXISTS teacher_substitutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL, timetable_slot_id UUID, absent_teacher_id UUID, substitute_teacher_id UUID,
  class_id UUID, section_id UUID, subject_id UUID, substitute_date DATE NOT NULL, note TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'assigned', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS substitution_school_date_idx ON teacher_substitutions(school_id,substitute_date);

CREATE TABLE IF NOT EXISTS transport_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL, registration_no VARCHAR(50) NOT NULL, vehicle_type VARCHAR(40),
  capacity INTEGER, driver_id UUID, status VARCHAR(20) NOT NULL DEFAULT 'active', metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(school_id,registration_no)
);
CREATE TABLE IF NOT EXISTS transport_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL, name VARCHAR(150) NOT NULL, code VARCHAR(50),
  vehicle_id UUID REFERENCES transport_vehicles(id) ON DELETE SET NULL, stops JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'active', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS transport_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL, route_id UUID REFERENCES transport_routes(id) ON DELETE SET NULL, stop_name VARCHAR(150),
  pickup_time TIME, drop_time TIME, starts_on DATE, ends_on DATE, status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS library_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  isbn VARCHAR(40), title VARCHAR(300) NOT NULL, author VARCHAR(200), publisher VARCHAR(200), category VARCHAR(120),
  total_copies INTEGER NOT NULL DEFAULT 1, available_copies INTEGER NOT NULL DEFAULT 1, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS library_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES library_books(id) ON DELETE CASCADE, borrower_id UUID NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(), due_at TIMESTAMPTZ, returned_at TIMESTAMPTZ,
  fine_amount NUMERIC(12,2) NOT NULL DEFAULT 0, status VARCHAR(20) NOT NULL DEFAULT 'issued'
);
CREATE INDEX IF NOT EXISTS library_loans_school_borrower_idx ON library_loans(school_id,borrower_id,status);

CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL, sku VARCHAR(80), name VARCHAR(250) NOT NULL, category VARCHAR(120),
  unit VARCHAR(30) NOT NULL DEFAULT 'pcs', quantity NUMERIC(14,3) NOT NULL DEFAULT 0, reorder_level NUMERIC(14,3) NOT NULL DEFAULT 0,
  vendor_name VARCHAR(200), metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE, transaction_type VARCHAR(20) NOT NULL,
  quantity NUMERIC(14,3) NOT NULL, reference_no VARCHAR(100), notes TEXT, created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hr_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL, employee_code VARCHAR(80), department VARCHAR(120), designation VARCHAR(120),
  joining_date DATE, status VARCHAR(20) NOT NULL DEFAULT 'active', documents JSONB NOT NULL DEFAULT '[]'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(school_id,employee_code)
);
CREATE TABLE IF NOT EXISTS hr_leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE, leave_type VARCHAR(50) NOT NULL,
  starts_on DATE NOT NULL, ends_on DATE NOT NULL, reason TEXT, status VARCHAR(20) NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payroll_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE, effective_from DATE NOT NULL,
  components JSONB NOT NULL DEFAULT '{}'::jsonb, gross_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  deductions JSONB NOT NULL DEFAULT '{}'::jsonb, net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  period_start DATE NOT NULL, period_end DATE NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'draft',
  processed_at TIMESTAMPTZ, processed_by UUID REFERENCES users(id) ON DELETE SET NULL, summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payroll_payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE, employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  gross_amount NUMERIC(14,2) NOT NULL DEFAULT 0, deductions NUMERIC(14,2) NOT NULL DEFAULT 0, net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  breakdown JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saas_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  plan_code VARCHAR(80) NOT NULL DEFAULT 'standard', status VARCHAR(30) NOT NULL DEFAULT 'trial',
  starts_on DATE, ends_on DATE, limits JSONB NOT NULL DEFAULT '{}'::jsonb, provider_customer_id VARCHAR(150),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_mfa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method VARCHAR(30) NOT NULL, secret_ref TEXT, enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(user_id,method)
);
