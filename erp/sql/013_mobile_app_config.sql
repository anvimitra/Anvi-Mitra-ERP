-- Anvi Mitra ERP: white-label mobile app configuration per school.
-- One ERP backend can power separately branded Android/iOS apps for each school.

CREATE TABLE IF NOT EXISTS mobile_app_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  app_name VARCHAR(200) NOT NULL,
  app_slug VARCHAR(100) NOT NULL,
  android_package VARCHAR(200),
  ios_bundle_id VARCHAR(200),
  api_base_url VARCHAR(500),
  logo_url TEXT,
  primary_color VARCHAR(30),
  secondary_color VARCHAR(30),
  support_email VARCHAR(254),
  support_phone VARCHAR(30),
  min_app_version VARCHAR(30),
  force_update BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id),
  UNIQUE (app_slug)
);
CREATE UNIQUE INDEX IF NOT EXISTS mobile_android_package_uq ON mobile_app_configs(android_package) WHERE android_package IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mobile_ios_bundle_id_uq ON mobile_app_configs(ios_bundle_id) WHERE ios_bundle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mobile_app_school_status_idx ON mobile_app_configs(school_id,status);
