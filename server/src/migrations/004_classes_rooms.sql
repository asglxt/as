ALTER TABLE classes ADD COLUMN lesson_id BIGINT REFERENCES lessons(id);
ALTER TABLE classes ADD COLUMN assistant_id BIGINT REFERENCES users(id);
ALTER TABLE classes ADD COLUMN capacity INTEGER;
ALTER TABLE classes ADD COLUMN start_date DATE;
ALTER TABLE classes ADD COLUMN recruit_status TEXT NOT NULL DEFAULT 'recruiting'
  CHECK (recruit_status IN ('recruiting','full','closed'));

ALTER TABLE class_students ADD COLUMN lesson_id BIGINT REFERENCES lessons(id);
ALTER TABLE class_students ADD COLUMN teacher_id BIGINT REFERENCES users(id);
ALTER TABLE class_students ADD COLUMN start_date DATE;
ALTER TABLE class_students ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','stopped','transferred','finished'));
ALTER TABLE class_students ADD COLUMN is_upgraded BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE classrooms (
  id BIGSERIAL PRIMARY KEY,
  campus_id BIGINT NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campus_id, name)
);