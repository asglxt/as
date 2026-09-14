CREATE TABLE IF NOT EXISTS materials (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  category TEXT NOT NULL DEFAULT '教材',
  unit TEXT NOT NULL DEFAULT '本',
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS material_inventory (
  id BIGSERIAL PRIMARY KEY,
  material_id BIGINT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  campus_id BIGINT NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  stock NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (stock >= 0),
  warning_stock NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (warning_stock >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (material_id, campus_id)
);

CREATE TABLE IF NOT EXISTS material_transactions (
  id BIGSERIAL PRIMARY KEY,
  material_id BIGINT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  campus_id BIGINT NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('purchase','issue','return','adjust')),
  quantity NUMERIC(12,2) NOT NULL CHECK (quantity <> 0),
  balance_after NUMERIC(12,2) NOT NULL CHECK (balance_after >= 0),
  student_id BIGINT REFERENCES students(id) ON DELETE SET NULL,
  order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  order_item_id BIGINT REFERENCES order_items(id) ON DELETE SET NULL,
  remark TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS material_id BIGINT REFERENCES materials(id) ON DELETE SET NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS issue_status TEXT NOT NULL DEFAULT 'not_required'
  CHECK (issue_status IN ('not_required','pending','issued','returned'));
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS issued_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE fee_items ADD COLUMN IF NOT EXISTS material_id BIGINT REFERENCES materials(id) ON DELETE SET NULL;
ALTER TABLE fee_items ADD COLUMN IF NOT EXISTS auto_apply_on_enroll BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE fee_items ADD COLUMN IF NOT EXISTS sort INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_material_inventory_campus ON material_inventory(campus_id, material_id);
CREATE INDEX IF NOT EXISTS idx_material_transactions_material ON material_transactions(material_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_order_items_pending ON order_items(issue_status) WHERE item_type = 'material';
CREATE INDEX IF NOT EXISTS idx_fee_items_auto_enroll ON fee_items(auto_apply_on_enroll) WHERE enabled;
