-- Class-teacher attendance security + parent notification delivery.
-- A teacher may mark attendance only for the section/session where they are the class teacher.

CREATE TABLE IF NOT EXISTS class_teacher_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, section_id, session_id),
  UNIQUE (school_id, teacher_id, section_id, session_id)
);
CREATE INDEX IF NOT EXISTS class_teacher_assignments_teacher_idx ON class_teacher_assignments(school_id,teacher_id,session_id);
CREATE INDEX IF NOT EXISTS class_teacher_assignments_section_idx ON class_teacher_assignments(school_id,section_id,session_id);

CREATE TABLE IF NOT EXISTS parent_push_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  device_token_id UUID NOT NULL REFERENCES parent_device_tokens(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed')),
  attempts SMALLINT NOT NULL DEFAULT 0,
  provider_message_id VARCHAR(200),
  last_error TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS parent_push_queue_pending_idx ON parent_push_queue(status,queued_at);
CREATE INDEX IF NOT EXISTS parent_push_queue_school_idx ON parent_push_queue(school_id,status,queued_at);

CREATE OR REPLACE FUNCTION enforce_class_teacher_attendance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  actor_role TEXT;
  teacher_ok BOOLEAN;
BEGIN
  SELECT role INTO actor_role FROM users WHERE id=NEW.marked_by AND school_id=NEW.school_id;
  IF actor_role IS DISTINCT FROM 'teacher' THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1
    FROM teachers t
    JOIN enrollments e ON e.student_id=NEW.student_id AND e.session_id=NEW.session_id AND e.school_id=NEW.school_id AND e.status='active'
    JOIN class_teacher_assignments cta ON cta.teacher_id=t.id
      AND cta.section_id=e.section_id
      AND cta.session_id=e.session_id
      AND cta.school_id=NEW.school_id
      AND (cta.branch_id IS NULL OR NEW.branch_id IS NULL OR cta.branch_id=NEW.branch_id)
    WHERE t.user_id=NEW.marked_by
      AND t.school_id=NEW.school_id
  ) INTO teacher_ok;

  IF NOT teacher_ok THEN
    RAISE EXCEPTION 'Teacher is not the class teacher assigned to this student section' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_class_teacher_guard ON attendance_records;
CREATE TRIGGER attendance_class_teacher_guard
BEFORE INSERT OR UPDATE OF student_id,session_id,marked_by,branch_id ON attendance_records
FOR EACH ROW WHEN (NEW.marked_by IS NOT NULL)
EXECUTE FUNCTION enforce_class_teacher_attendance();

CREATE OR REPLACE FUNCTION notify_parents_after_attendance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  p RECORD;
  student_name TEXT;
  admission_no TEXT;
  message_text TEXT;
  event_data JSONB;
BEGIN
  IF TG_OP='UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status AND OLD.note IS NOT DISTINCT FROM NEW.note THEN RETURN NEW; END IF;

  SELECT s.full_name,s.admission_no INTO student_name,admission_no
  FROM students s WHERE s.id=NEW.student_id AND s.school_id=NEW.school_id;

  message_text := format('Attendance update: %s (%s) is %s on %s.', COALESCE(student_name,'Student'),COALESCE(admission_no,'N/A'),replace(NEW.status,'_',' '),NEW.attendance_date);
  event_data := jsonb_build_object('event','attendance','studentId',NEW.student_id,'status',NEW.status,'date',NEW.attendance_date,'attendanceId',NEW.id,'note',NEW.note);

  FOR p IN SELECT DISTINCT sp.user_id AS user_id FROM student_portal_profiles sp WHERE sp.school_id=NEW.school_id AND sp.student_id=NEW.student_id AND sp.status='active' AND sp.user_id IS NOT NULL LOOP
    INSERT INTO parent_notifications(school_id,user_id,student_id,type,title,message,data_json)
    VALUES(NEW.school_id,p.user_id,NEW.student_id,'attendance','Attendance Update',message_text,event_data);

    INSERT INTO notification_sms_queue(school_id,user_id,student_id,phone,message,event_type)
    SELECT NEW.school_id,p.user_id,NEW.student_id,pr.phone,message_text,'attendance'
    FROM parents pr WHERE pr.school_id=NEW.school_id AND pr.user_id=p.user_id AND pr.phone IS NOT NULL;

    INSERT INTO parent_push_queue(school_id,device_token_id,student_id,title,message,data_json)
    SELECT NEW.school_id,dt.id,NEW.student_id,'Attendance Update',message_text,event_data
    FROM parent_device_tokens dt WHERE dt.school_id=NEW.school_id AND dt.user_id=p.user_id AND dt.is_active=true;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_parent_notification ON attendance_records;
CREATE TRIGGER attendance_parent_notification
AFTER INSERT OR UPDATE OF status,note ON attendance_records
FOR EACH ROW EXECUTE FUNCTION notify_parents_after_attendance();
