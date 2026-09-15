CREATE TABLE IF NOT EXISTS score_sources (
  id BIGSERIAL PRIMARY KEY,
  parent_id BIGINT REFERENCES score_sources(id) ON DELETE RESTRICT,
  slug TEXT UNIQUE,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_score_sources_parent_name
  ON score_sources(COALESCE(parent_id, 0), name);

INSERT INTO score_sources (slug, name, sort)
VALUES ('institution', '机构内', 1), ('school', '学校内', 2), ('third_party', '其他第三方', 3)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, sort = EXCLUDED.sort;

INSERT INTO score_sources (parent_id, name, sort)
SELECT root.id, source.name, source.sort
FROM score_sources root
CROSS JOIN (VALUES
  ('institution', '单元考试', 1), ('institution', '月考', 2), ('institution', '阶段测评', 3), ('institution', '机构内测评', 4),
  ('school', '单元考试', 1), ('school', '期中考试', 2), ('school', '期末考试', 3), ('school', '模拟考试', 4),
  ('third_party', '入学测评', 1), ('third_party', '第三方测评', 2), ('third_party', '竞赛考试', 3), ('third_party', '等级考试', 4)
) AS source(root_slug, name, sort)
WHERE root.slug = source.root_slug
ON CONFLICT DO NOTHING;

ALTER TABLE student_scores ADD COLUMN IF NOT EXISTS source_id BIGINT REFERENCES score_sources(id) ON DELETE SET NULL;

UPDATE student_scores ss SET source_id = child.id
FROM score_sources root JOIN score_sources child ON child.parent_id = root.id
WHERE ss.source_id IS NULL
  AND ((ss.source = 'teacher' AND root.slug = 'institution' AND child.name = '机构内测评')
    OR (ss.source = 'import' AND root.slug = 'school' AND child.name = '单元考试')
    OR (ss.source = 'registration' AND root.slug = 'third_party' AND child.name = '入学测评'));

CREATE INDEX IF NOT EXISTS idx_student_scores_source ON student_scores(source_id);
