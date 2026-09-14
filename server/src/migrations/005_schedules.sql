CREATE TABLE schedules (
  id BIGSERIAL PRIMARY KEY,
  class_id BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  campus_id BIGINT NOT NULL REFERENCES campuses(id),
  schedule_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  teacher_id BIGINT REFERENCES users(id),
  classroom_id BIGINT REFERENCES classrooms(id),
  is_recorded BOOLEAN NOT NULL DEFAULT false,
  has_trial BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'normal' CHECK (status IN ('normal','cancelled')),
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

CREATE INDEX idx_schedules_date ON schedules(schedule_date);
CREATE INDEX idx_schedules_teacher ON schedules(teacher_id, schedule_date);
CREATE INDEX idx_schedules_classroom ON schedules(classroom_id, schedule_date);
CREATE INDEX idx_schedules_class ON schedules(class_id, schedule_date);