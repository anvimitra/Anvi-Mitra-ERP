-- Ensure school provisioning is visible to every authorized sync client.
-- This trigger is intentionally created after sync_changes exists.

CREATE OR REPLACE FUNCTION journal_school_provisioning()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO sync_changes (school_id, entity_type, entity_id, operation, payload)
  VALUES (
    NEW.id,
    'school',
    NEW.id,
    'create',
    jsonb_build_object(
      'id', NEW.id,
      'name', NEW.name,
      'code', NEW.code,
      'status', NEW.status
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schools_sync_journal_trigger ON schools;
CREATE TRIGGER schools_sync_journal_trigger
AFTER INSERT ON schools
FOR EACH ROW
EXECUTE FUNCTION journal_school_provisioning();
