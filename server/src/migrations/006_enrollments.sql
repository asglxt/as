CREATE TABLE enrollments (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  lesson_id BIGINT NOT NULL REFERENCES lessons(id),
  campus_id BIGINT NOT NULL REFERENCES campuses(id),
  purchased_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  used_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  remaining_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  used_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  remaining_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  arrears NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','stopped','finished','refunded')),
  enrolled_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, lesson_id, campus_id)
);

CREATE TABLE hour_transactions (
  id BIGSERIAL PRIMARY KEY,
  enrollment_id BIGINT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('purchase','consume','adjust','refund')),
  hours NUMERIC(10,2) NOT NULL,
  balance_after NUMERIC(10,2) NOT NULL,
  teaching_log_id BIGINT,
  remark TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);