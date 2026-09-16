-- Finance audit trail: immutable business-event records for fee operations.
CREATE TABLE IF NOT EXISTS finance_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id UUID,
  reference_no VARCHAR(120),
  amount NUMERIC(14,2),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finance_audit_school_created_idx ON finance_audit_events(school_id,created_at DESC);
CREATE INDEX IF NOT EXISTS finance_audit_entity_idx ON finance_audit_events(school_id,entity_type,entity_id,created_at DESC);

CREATE OR REPLACE FUNCTION append_finance_audit_event(
  p_school_id UUID,
  p_branch_id UUID,
  p_actor_user_id UUID,
  p_event_type VARCHAR,
  p_entity_type VARCHAR,
  p_entity_id UUID,
  p_reference_no VARCHAR,
  p_amount NUMERIC,
  p_payload JSONB
) RETURNS UUID
LANGUAGE SQL
AS $$
  INSERT INTO finance_audit_events(school_id,branch_id,actor_user_id,event_type,entity_type,entity_id,reference_no,amount,payload)
  VALUES(p_school_id,p_branch_id,p_actor_user_id,p_event_type,p_entity_type,p_entity_id,p_reference_no,p_amount,COALESCE(p_payload,'{}'::jsonb))
  RETURNING id;
$$;
