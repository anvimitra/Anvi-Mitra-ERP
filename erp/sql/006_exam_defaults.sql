INSERT INTO exam_types (school_id, code, name, category, display_order)
SELECT s.id, v.code, v.name, v.category, v.display_order
FROM schools s
CROSS JOIN (VALUES
  ('FA1','FA 1','formative',10),
  ('FA2','FA 2','formative',20),
  ('FA3','FA 3','formative',30),
  ('HALF_YEARLY','Half Yearly','summative',40),
  ('YEARLY','Yearly','annual',50)
) AS v(code,name,category,display_order)
ON CONFLICT (school_id, code) DO NOTHING;
