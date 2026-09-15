ALTER TABLE students ADD COLUMN IF NOT EXISTS advisor_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_students_advisor ON students(advisor_id);
