-- Per-school report-card templates. Each school/branch can have its own printable layout.
CREATE TABLE IF NOT EXISTS report_card_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  name VARCHAR(120) NOT NULL,
  template_key VARCHAR(80) NOT NULL,
  layout_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, branch_id, name)
);

CREATE INDEX IF NOT EXISTS report_card_templates_scope_idx
  ON report_card_templates(school_id, branch_id, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS report_card_templates_default_idx
  ON report_card_templates(school_id, branch_id)
  WHERE is_default = true;

ALTER TABLE report_card_configs
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES report_card_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS report_card_configs_template_idx
  ON report_card_configs(template_id);
