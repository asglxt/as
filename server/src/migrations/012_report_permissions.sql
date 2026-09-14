INSERT INTO role_permissions (role_id, module_key)
  SELECT id, 'report' FROM roles
  WHERE roles.name IN ('机构主管', '校区主管', '财务')
  ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_campus ON orders(campus_id);
CREATE INDEX IF NOT EXISTS idx_teaching_logs_taught_at ON teaching_logs(taught_at);
CREATE INDEX IF NOT EXISTS idx_attendance_created_at ON attendance_records(created_at);
CREATE INDEX IF NOT EXISTS idx_students_campus ON students(campus_id);
CREATE INDEX IF NOT EXISTS idx_schedules_campus_date ON schedules(campus_id, schedule_date);