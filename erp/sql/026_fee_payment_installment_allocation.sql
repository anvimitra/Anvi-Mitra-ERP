-- Anvi Mitra ERP: payment-to-installment allocation and installment balance tracking.
ALTER TABLE IF EXISTS fee_installments
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0);

CREATE TABLE IF NOT EXISTS fee_payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES fee_payments(id) ON DELETE CASCADE,
  installment_id UUID NOT NULL REFERENCES fee_installments(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payment_id, installment_id)
);

CREATE INDEX IF NOT EXISTS fee_payment_allocations_installment_idx
  ON fee_payment_allocations(school_id,installment_id,created_at DESC);

CREATE INDEX IF NOT EXISTS fee_payment_allocations_payment_idx
  ON fee_payment_allocations(school_id,payment_id);

UPDATE fee_installments fi
SET paid_amount = COALESCE(x.total_allocated,0),
    status = CASE
      WHEN fi.status='cancelled' THEN 'cancelled'
      WHEN COALESCE(x.total_allocated,0) >= fi.amount THEN 'paid'
      WHEN COALESCE(x.total_allocated,0) > 0 THEN 'invoiced'
      ELSE fi.status
    END
FROM (
  SELECT installment_id,SUM(amount) AS total_allocated
  FROM fee_payment_allocations
  GROUP BY installment_id
) x
WHERE fi.id=x.installment_id;
