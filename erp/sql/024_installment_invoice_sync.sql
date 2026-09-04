-- Anvi Mitra ERP: installment -> invoice linkage and installment-level payment allocation.
ALTER TABLE IF EXISTS fee_installments
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0);

CREATE INDEX IF NOT EXISTS fee_installments_invoice_idx
  ON fee_installments(school_id,invoice_id,status);

CREATE OR REPLACE FUNCTION sync_fee_installment_payments()
RETURNS TRIGGER AS $$
DECLARE
  delta NUMERIC(12,2);
  remaining NUMERIC(12,2);
  r RECORD;
  alloc NUMERIC(12,2);
BEGIN
  delta := GREATEST(0, COALESCE(NEW.paid_amount,0) - COALESCE(OLD.paid_amount,0));
  IF delta <= 0 THEN RETURN NEW; END IF;
  remaining := delta;

  FOR r IN
    SELECT id, amount, paid_amount
    FROM fee_installments
    WHERE school_id=NEW.school_id AND invoice_id=NEW.id
      AND status <> 'cancelled'
      AND paid_amount < amount
    ORDER BY due_date, period_start, id
    FOR UPDATE
  LOOP
    EXIT WHEN remaining <= 0;
    alloc := LEAST(remaining, GREATEST(0,r.amount-r.paid_amount));
    UPDATE fee_installments
      SET paid_amount=paid_amount+alloc,
          status=CASE WHEN paid_amount+alloc >= amount THEN 'paid' ELSE 'invoiced' END
      WHERE id=r.id;
    remaining := remaining-alloc;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_fee_installment_payments ON fee_invoices;
CREATE TRIGGER trg_sync_fee_installment_payments
AFTER UPDATE OF paid_amount ON fee_invoices
FOR EACH ROW EXECUTE FUNCTION sync_fee_installment_payments();
