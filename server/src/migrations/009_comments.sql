CREATE TABLE comment_templates (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  default_rating INTEGER,
  default_flowers INTEGER NOT NULL DEFAULT 0,
  lesson_id BIGINT REFERENCES lessons(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE teaching_comments (
  id BIGSERIAL PRIMARY KEY,
  teaching_log_id BIGINT NOT NULL REFERENCES teaching_logs(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  rating INTEGER,
  content TEXT,
  flowers INTEGER NOT NULL DEFAULT 0,
  read_at TIMESTAMPTZ,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (teaching_log_id, student_id)
);