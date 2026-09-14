CREATE TABLE lesson_categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE subjects (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE lessons (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category_id BIGINT REFERENCES lesson_categories(id),
  subject_id BIGINT REFERENCES subjects(id),
  teaching_mode TEXT NOT NULL DEFAULT 'small_class'
    CHECK (teaching_mode IN ('one_to_one','small_class','big_class')),
  fee_mode TEXT NOT NULL DEFAULT 'per_hour'
    CHECK (fee_mode IN ('per_hour','per_period','per_time')),
  campus_id BIGINT REFERENCES campuses(id),
  status TEXT NOT NULL DEFAULT 'on_sale' CHECK (status IN ('on_sale','off_sale')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE lesson_upgrades (
  id BIGSERIAL PRIMARY KEY,
  from_lesson_id BIGINT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  to_lesson_id BIGINT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  sort INTEGER NOT NULL DEFAULT 0,
  UNIQUE (from_lesson_id, to_lesson_id)
);

INSERT INTO lesson_categories (name, sort) VALUES ('英语', 1), ('数学', 2), ('素质', 3);
INSERT INTO subjects (name, sort) VALUES ('英语', 1), ('数学', 2), ('语文', 3), ('编程', 4);