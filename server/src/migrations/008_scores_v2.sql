DROP TABLE IF EXISTS scores CASCADE;
DROP TABLE IF EXISTS exams CASCADE;

CREATE TABLE exam_projects (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE exams (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE student_scores (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  project_id BIGINT NOT NULL REFERENCES exam_projects(id),
  exam_id BIGINT NOT NULL REFERENCES exams(id),
  class_id BIGINT REFERENCES classes(id) ON DELETE SET NULL,
  score TEXT,
  source TEXT NOT NULL DEFAULT 'teacher' CHECK (source IN ('teacher','import','registration')),
  exam_date DATE NOT NULL,
  remark TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, project_id, exam_id, exam_date)
);

CREATE INDEX idx_student_scores_student ON student_scores(student_id);
CREATE INDEX idx_student_scores_exam ON student_scores(exam_id, project_id);

INSERT INTO exam_projects (name, sort) VALUES
  ('单元测评', 1), ('期中考试', 2), ('期末考试', 3), ('听写', 4), ('入学测', 5);

INSERT INTO exams (name, sort) VALUES
  ('第一单元', 1), ('第二单元', 2), ('第三单元', 3), ('期中考试', 4), ('期末考试', 5);

INSERT INTO role_permissions (role_id, module_key)
  SELECT id, m.key FROM roles CROSS JOIN (
    VALUES ('scores'), ('comments'), ('homework')
  ) AS m(key)
  WHERE roles.name IN ('机构主管', '校区主管', '教务', '教师');