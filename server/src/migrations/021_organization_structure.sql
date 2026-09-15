CREATE TABLE IF NOT EXISTS departments (
  id BIGSERIAL PRIMARY KEY,
  campus_id BIGINT NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  parent_id BIGINT REFERENCES departments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  leader_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_root_name
  ON departments(campus_id, name) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_parent_name
  ON departments(campus_id, parent_id, name) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_departments_campus ON departments(campus_id, sort, id);
CREATE INDEX IF NOT EXISTS idx_departments_parent ON departments(parent_id, sort, id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id BIGINT REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS position_title TEXT;
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id);

INSERT INTO departments (campus_id, name, code, sort)
SELECT c.id, defaults.name, defaults.code, defaults.sort
FROM campuses c
CROSS JOIN (VALUES
  ('校长办公室', 'PRINCIPAL', 1),
  ('教学部', 'TEACHING', 2),
  ('教务部', 'ACADEMIC', 3),
  ('招生咨询部', 'ADMISSION', 4),
  ('财务行政部', 'FINANCE_ADMIN', 5)
) AS defaults(name, code, sort)
WHERE NOT EXISTS (
  SELECT 1 FROM departments d WHERE d.campus_id = c.id AND d.parent_id IS NULL AND d.name = defaults.name
);

INSERT INTO departments (campus_id, parent_id, name, code, sort)
SELECT c.id, parent.id, child.name, child.code, child.sort
FROM campuses c
JOIN departments parent ON parent.campus_id = c.id AND parent.parent_id IS NULL AND parent.name = '教学部'
CROSS JOIN (VALUES
  ('英语教研组', 'ENGLISH', 1),
  ('数学教研组', 'MATH', 2),
  ('素质教研组', 'QUALITY', 3)
) AS child(name, code, sort)
WHERE NOT EXISTS (
  SELECT 1 FROM departments d WHERE d.campus_id = c.id AND d.parent_id = parent.id AND d.name = child.name
);

UPDATE users u
SET department_id = d.id
FROM departments d
WHERE u.department_id IS NULL
  AND u.campus_id = d.campus_id
  AND u.department = d.name;
