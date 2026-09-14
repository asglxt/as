CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  order_no TEXT NOT NULL UNIQUE,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  order_type TEXT NOT NULL CHECK (order_type IN ('enroll','renew','recharge','transfer','refund','material')),
  campus_id BIGINT REFERENCES campuses(id),
  operator_id BIGINT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('draft','confirmed','cancelled')),
  receivable NUMERIC(12,2) NOT NULL DEFAULT 0,
  received NUMERIC(12,2) NOT NULL DEFAULT 0,
  account_change NUMERIC(12,2) NOT NULL DEFAULT 0,
  arrears NUMERIC(12,2) NOT NULL DEFAULT 0,
  points NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','partial','paid')),
  internal_note TEXT,
  external_note TEXT,
  enrollment_applied BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('course','material','transfer','recharge')),
  lesson_id BIGINT REFERENCES lessons(id),
  class_id BIGINT REFERENCES classes(id),
  name TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('cash','wechat','alipay','bank','balance')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount <> 0),
  operator_id BIGINT REFERENCES users(id),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT
);

CREATE TABLE refunds (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  suggested_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  actual_amount NUMERIC(12,2) NOT NULL,
  reason TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash','wechat','alipay','bank','balance')),
  operator_id BIGINT REFERENCES users(id),
  refunded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE student_accounts (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  points NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE account_transactions (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('recharge','consume','refund','adjust')),
  amount NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2) NOT NULL,
  order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  remark TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fee_items (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  lesson_id BIGINT REFERENCES lessons(id) ON DELETE SET NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE enrollments ADD COLUMN unit_price NUMERIC(12,2) NOT NULL DEFAULT 0;
UPDATE enrollments SET unit_price = CASE WHEN purchased_hours > 0 THEN total_fee / purchased_hours ELSE 0 END;
ALTER TABLE hour_transactions ADD COLUMN order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL;

INSERT INTO role_permissions (role_id, module_key)
  SELECT id, 'finance' FROM roles WHERE roles.name IN ('机构主管', '校区主管', '财务');