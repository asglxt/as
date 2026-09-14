CREATE TABLE roles (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_preset BOOLEAN NOT NULL DEFAULT false,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE role_permissions (
  role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  PRIMARY KEY (role_id, module_key)
);

CREATE TABLE role_campuses (
  role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  campus_id BIGINT REFERENCES campuses(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, campus_id)
);

CREATE TABLE user_roles (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

INSERT INTO roles (name, is_preset) VALUES
  ('机构主管', true), ('校区主管', true), ('教务', true), ('教师', true),
  ('前台', true), ('财务', true), ('人事', true), ('市场主管', true),
  ('销售员', true), ('班务', true);

INSERT INTO role_permissions (role_id, module_key)
  SELECT id, m.key FROM roles CROSS JOIN (
    VALUES ('dashboard'), ('students'), ('classes'), ('lessons'),
           ('schedules'), ('attendance'), ('enrollments'), ('classrooms'),
           ('org'), ('employees'), ('roles')
  ) AS m(key) WHERE roles.name = '机构主管';

INSERT INTO role_permissions (role_id, module_key)
  SELECT id, m.key FROM roles CROSS JOIN (
    VALUES ('dashboard'), ('students'), ('classes'), ('lessons'),
           ('schedules'), ('attendance'), ('enrollments'), ('classrooms')
  ) AS m(key) WHERE roles.name IN ('校区主管', '教务');

INSERT INTO role_permissions (role_id, module_key)
  SELECT id, m.key FROM roles CROSS JOIN (
    VALUES ('dashboard'), ('classes'), ('schedules'), ('attendance')
  ) AS m(key) WHERE roles.name = '教师';