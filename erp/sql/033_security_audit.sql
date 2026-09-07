-- Security audit trail for authentication, authorization and sensitive ERP actions.
CREATE TABLE IF NOT EXISTS security_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id UUID,
  request_id VARCHAR(100),
  ip_address INET,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_audit_school_created_idx ON security_audit_logs(school_id,created_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_user_created_idx ON security_audit_logs(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_action_created_idx ON security_audit_logs(action,created_at DESC);
