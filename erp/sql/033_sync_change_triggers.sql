-- Anvi Mitra ERP: server-side change capture for offline synchronization.
-- The API remains the source of truth. These triggers make ordinary CRUD writes
-- visible to other online/offline clients through sync_changes.

CREATE OR REPLACE FUNCTION capture_sync_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_data JSONB;
  school UUID;
  entity UUID;
  op VARCHAR(20);
BEGIN
  IF TG_OP = 'DELETE' THEN
    row_data := to_jsonb(OLD);
    school := OLD.school_id;
    entity := OLD.id;
    op := 'delete';
  ELSE
    row_data := to_jsonb(NEW);
    school := NEW.school_id;
    entity := NEW.id;
    op := CASE WHEN TG_OP = 'INSERT' THEN 'create' ELSE 'update' END;
  END IF;

  IF school IS NOT NULL AND entity IS NOT NULL THEN
    INSERT INTO sync_changes(school_id, entity_type, entity_id, operation, payload, changed_by)
    VALUES(school, TG_TABLE_NAME, entity, op, row_data, NULL);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_name TEXT;
  trigger_name TEXT;
BEGIN
  -- Every table below has both school_id and id columns. schools itself is
  -- intentionally excluded because its tenant key is id, not school_id.
  FOREACH table_name IN ARRAY ARRAY['branches','classes','sections','subjects','teachers','parents','students','enrollments'] LOOP
    trigger_name := 'sync_capture_' || table_name;
    IF to_regclass(table_name) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trigger_name, table_name);
      EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION capture_sync_change()', trigger_name, table_name);
    END IF;
  END LOOP;
END;
$$;

CREATE INDEX IF NOT EXISTS sync_changes_school_changed_at_idx
  ON sync_changes(school_id, changed_at DESC);
