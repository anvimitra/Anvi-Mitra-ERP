-- Provider-neutral online payment foundation.
-- Provider credentials/secrets stay outside the database (environment/secret manager).

CREATE TABLE IF NOT EXISTS payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  invoice_id UUID NOT NULL REFERENCES fee_invoices(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  provider VARCHAR(40) NOT NULL,
  provider_order_id VARCHAR(200),
  provider_payment_id VARCHAR(200),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency_code VARCHAR(10) NOT NULL DEFAULT 'INR',
  status VARCHAR(30) NOT NULL DEFAULT 'created' CHECK (status IN ('created','pending','paid','failed','cancelled','refunded')),
  idempotency_key VARCHAR(200) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(school_id,idempotency_key),
  UNIQUE(school_id,provider,provider_order_id)
);
CREATE INDEX IF NOT EXISTS payment_intents_school_status_idx ON payment_intents(school_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS payment_intents_invoice_idx ON payment_intents(school_id,invoice_id,created_at DESC);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  provider VARCHAR(40) NOT NULL,
  event_id VARCHAR(200) NOT NULL,
  event_type VARCHAR(120),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider,event_id)
);
CREATE INDEX IF NOT EXISTS payment_webhook_pending_idx ON payment_webhook_events(processed,created_at);
