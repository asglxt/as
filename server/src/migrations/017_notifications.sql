CREATE TABLE IF NOT EXISTS notification_templates (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  audience_type TEXT NOT NULL CHECK (audience_type IN ('all','campus','class')),
  campus_id BIGINT REFERENCES campuses(id) ON DELETE SET NULL,
  template_id BIGINT REFERENCES notification_templates(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending','published','rejected','recalled')),
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  reject_reason TEXT,
  published_at TIMESTAMPTZ,
  recalled_at TIMESTAMPTZ,
  recall_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_classes (
  notification_id BIGINT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  class_id BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (notification_id, class_id)
);

CREATE TABLE IF NOT EXISTS notification_recipients (
  id BIGSERIAL PRIMARY KEY,
  notification_id BIGINT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notifications_status_published ON notifications(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_campus ON notifications(campus_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_recipients_user ON notification_recipients(user_id, read_at);

INSERT INTO role_permissions (role_id, module_key)
SELECT id, 'notifications' FROM roles
WHERE name IN ('机构主管', '校区主管', '教务')
ON CONFLICT DO NOTHING;
