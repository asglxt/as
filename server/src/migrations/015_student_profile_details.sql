ALTER TABLE students ADD COLUMN IF NOT EXISTS student_no TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS school_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE student_guardians ADD COLUMN IF NOT EXISTS wechat TEXT;
ALTER TABLE student_guardians ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE student_guardians ADD COLUMN IF NOT EXISTS remark TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_student_no_unique ON students(student_no) WHERE student_no IS NOT NULL;
