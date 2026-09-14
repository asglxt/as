CREATE TABLE teaching_logs (
  id BIGSERIAL PRIMARY KEY,
  schedule_id BIGINT REFERENCES schedules(id) ON DELETE SET NULL,
  class_id BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  campus_id BIGINT NOT NULL REFERENCES campuses(id),
  teacher_id BIGINT REFERENCES users(id),
  classroom_id BIGINT REFERENCES classrooms(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','recorded')),
  taught_at TIMESTAMPTZ,
  recorded_by BIGINT REFERENCES users(id),
  recorded_at TIMESTAMPTZ,
  remark TEXT,
  UNIQUE (schedule_id)
);

CREATE TABLE attendance_records (
  id BIGSERIAL PRIMARY KEY,
  teaching_log_id BIGINT NOT NULL REFERENCES teaching_logs(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('present','absent','leave','makeup')),
  hours_deducted NUMERIC(10,2) NOT NULL DEFAULT 0,
  remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (teaching_log_id, student_id)
);