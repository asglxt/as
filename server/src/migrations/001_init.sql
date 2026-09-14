CREATE TABLE campuses (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE students (
  id BIGSERIAL PRIMARY KEY,
  campus_id BIGINT NOT NULL REFERENCES campuses(id),
  name TEXT NOT NULL,
  guardian_phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','graduated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE,
  password_hash TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','teacher','parent','student')),
  campus_id BIGINT REFERENCES campuses(id),
  student_id BIGINT UNIQUE REFERENCES students(id),
  invite_code TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE classes (
  id BIGSERIAL PRIMARY KEY,
  campus_id BIGINT NOT NULL REFERENCES campuses(id),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  grade TEXT NOT NULL,
  schedule TEXT,
  teacher_id BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE class_students (
  class_id BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  PRIMARY KEY (class_id, student_id)
);

CREATE TABLE exams (
  id BIGSERIAL PRIMARY KEY,
  class_id BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'unit' CHECK (type IN ('unit','midterm','final','level')),
  exam_date DATE NOT NULL,
  max_score NUMERIC(6,2),
  grading_system TEXT NOT NULL DEFAULT 'percent' CHECK (grading_system IN ('percent','level','points','comment')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE scores (
  id BIGSERIAL PRIMARY KEY,
  exam_id BIGINT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  numeric_score NUMERIC(6,2),
  level TEXT,
  points INTEGER,
  comment TEXT,
  entered_by BIGINT NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id)
);

CREATE TABLE parent_bindings (
  parent_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY (parent_user_id, student_id)
);

CREATE TABLE import_jobs (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('students','classes','scores')),
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','validating','failed','done')),
  total_rows INTEGER NOT NULL DEFAULT 0,
  error_rows INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]',
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id BIGINT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id BIGINT,
  detail JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scores_exam ON scores(exam_id);
CREATE INDEX idx_scores_student ON scores(student_id);
CREATE INDEX idx_class_students_student ON class_students(student_id);
CREATE INDEX idx_users_role ON users(role);
