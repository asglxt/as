import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { authGuard } from '../auth/middleware.ts';
import { requireModule } from '../permissions/module_access.ts';
import { writeAudit } from '../audit.ts';

type AudienceType = 'all' | 'campus' | 'class';

async function syncRecipients(
  client: pg.PoolClient,
  notificationId: number,
  audienceType: AudienceType,
  campusId: number | null,
  classIds: number[]
) {
  await client.query('DELETE FROM notification_recipients WHERE notification_id = $1', [notificationId]);
  if (audienceType === 'all') {
    await client.query(
      `INSERT INTO notification_recipients (notification_id, user_id)
       SELECT $1, id FROM users WHERE role IN ('admin','teacher')
       ON CONFLICT DO NOTHING`,
      [notificationId]
    );
    return;
  }
  if (audienceType === 'campus') {
    await client.query(
      `INSERT INTO notification_recipients (notification_id, user_id)
       SELECT $1, id FROM users WHERE role IN ('admin','teacher') AND campus_id = $2
       ON CONFLICT DO NOTHING`,
      [notificationId, campusId]
    );
    return;
  }
  await client.query(
    `INSERT INTO notification_recipients (notification_id, user_id)
     SELECT DISTINCT $1::bigint AS notification_id, recipient_id FROM (
       SELECT u.id AS recipient_id
       FROM users u JOIN classes c ON c.teacher_id = u.id
       WHERE c.id = ANY($2::bigint[])
       UNION
       SELECT u.id AS recipient_id
       FROM users u
       JOIN parent_bindings pb ON pb.parent_user_id = u.id
       JOIN class_students cs ON cs.student_id = pb.student_id
       WHERE cs.class_id = ANY($2::bigint[]) AND cs.left_at IS NULL
       UNION
       SELECT u.id AS recipient_id
       FROM users u
       JOIN class_students cs ON cs.student_id = u.student_id
       WHERE u.role = 'student' AND cs.class_id = ANY($2::bigint[]) AND cs.left_at IS NULL
     ) recipients
     ON CONFLICT DO NOTHING`,
    [notificationId, classIds]
  );
}

async function publishNotification(client: pg.PoolClient, id: number, reviewedBy: number) {
  const notification = (await client.query('SELECT * FROM notifications WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (!notification) return null;
  const classIds = (await client.query('SELECT class_id FROM notification_classes WHERE notification_id = $1', [id]))
    .rows.map((row) => Number(row.class_id));
  await syncRecipients(
    client,
    id,
    notification.audience_type as AudienceType,
    notification.campus_id === null ? null : Number(notification.campus_id),
    classIds
  );
  return (await client.query(
    `UPDATE notifications
     SET status = 'published', reviewed_by = $2, reviewed_at = now(), published_at = now(),
         reject_reason = NULL, recalled_at = NULL, recall_reason = NULL, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, reviewedBy]
  )).rows[0];
}

export async function notificationRoutes(app: FastifyInstance) {
  const guard = [authGuard, requireModule('notifications')];

  app.get('/templates', { preHandler: guard }, async () => {
    return (await app.pool.query(
      `SELECT t.*, u.display_name AS created_by_name FROM notification_templates t
       LEFT JOIN users u ON u.id = t.created_by ORDER BY t.id DESC`
    )).rows;
  });

  app.post('/templates', { preHandler: guard }, async (request, reply) => {
    const body = request.body as { name?: string; title?: string; content?: string; category?: string };
    if (!body.name?.trim() || !body.title?.trim() || !body.content?.trim()) {
      return reply.code(400).send({ error: 'name, title and content required' });
    }
    try {
      return (await app.pool.query(
        `INSERT INTO notification_templates (name, title, content, category, created_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [body.name.trim(), body.title.trim(), body.content.trim(), body.category?.trim() || 'general', request.user!.id]
      )).rows[0];
    } catch (err: any) {
      if (err.code === '23505') return reply.code(409).send({ error: 'template name exists' });
      throw err;
    }
  });

  app.get('/list', { preHandler: guard }, async (request) => {
    const query = request.query as {
      keyword?: string; status?: string; audienceType?: string; campusId?: string; page?: string; pageSize?: string;
    };
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));
    const params: unknown[] = [];
    const where: string[] = ['1 = 1'];
    if (query.keyword?.trim()) {
      params.push(`%${query.keyword.trim()}%`);
      where.push(`(n.title ILIKE $${params.length} OR n.content ILIKE $${params.length})`);
    }
    if (query.status) { params.push(query.status); where.push(`n.status = $${params.length}`); }
    if (query.audienceType) { params.push(query.audienceType); where.push(`n.audience_type = $${params.length}`); }
    if (query.campusId) { params.push(Number(query.campusId)); where.push(`n.campus_id = $${params.length}`); }
    const baseWhere = where.join(' AND ');

    const summary = (await app.pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE n.status = 'draft')::int AS draft,
              COUNT(*) FILTER (WHERE n.status = 'pending')::int AS pending,
              COUNT(*) FILTER (WHERE n.status = 'published')::int AS published,
              COUNT(*) FILTER (WHERE n.status = 'recalled')::int AS recalled,
              COUNT(*) FILTER (WHERE n.status = 'rejected')::int AS rejected,
              COALESCE(SUM((SELECT COUNT(*) FROM notification_recipients nr WHERE nr.notification_id = n.id)),0)::int AS recipients,
              COALESCE(SUM((SELECT COUNT(*) FROM notification_recipients nr WHERE nr.notification_id = n.id AND nr.read_at IS NOT NULL)),0)::int AS reads
       FROM notifications n WHERE ${baseWhere}`,
      params
    )).rows[0];

    const items = (await app.pool.query(
      `SELECT n.*, camp.name AS campus_name, u.display_name AS created_by_name,
              COALESCE((
                SELECT JSON_AGG(c.name ORDER BY c.name)
                FROM notification_classes nc JOIN classes c ON c.id = nc.class_id
                WHERE nc.notification_id = n.id
              ), '[]') AS class_names,
              (SELECT COUNT(*) FROM notification_recipients nr WHERE nr.notification_id = n.id)::int AS recipient_count,
              (SELECT COUNT(*) FROM notification_recipients nr WHERE nr.notification_id = n.id AND nr.read_at IS NOT NULL)::int AS read_count
       FROM notifications n
       LEFT JOIN campuses camp ON camp.id = n.campus_id
       LEFT JOIN users u ON u.id = n.created_by
       WHERE ${baseWhere}
       ORDER BY n.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize]
    )).rows.map((row) => {
      const recipientCount = Number(row.recipient_count);
      const readCount = Number(row.read_count);
      return {
        ...row,
        id: Number(row.id),
        campus_id: row.campus_id === null ? null : Number(row.campus_id),
        recipient_count: recipientCount,
        read_count: readCount,
        read_rate: recipientCount ? Math.round((readCount / recipientCount) * 100) : 0,
        class_names: typeof row.class_names === 'string' ? JSON.parse(row.class_names) : row.class_names
      };
    });

    return {
      items,
      total: Number(summary.total),
      page,
      pageSize,
      summary: {
        total: Number(summary.total), draft: Number(summary.draft), pending: Number(summary.pending),
        published: Number(summary.published), recalled: Number(summary.recalled), rejected: Number(summary.rejected),
        recipients: Number(summary.recipients), reads: Number(summary.reads),
        readRate: Number(summary.recipients) ? Math.round((Number(summary.reads) / Number(summary.recipients)) * 100) : 0
      }
    };
  });

  app.get('/mine', { preHandler: [authGuard] }, async (request) => {
    return (await app.pool.query(
      `SELECT n.id, n.title, n.content, n.category, n.status, n.published_at, n.recalled_at,
              n.recall_reason, nr.read_at
       FROM notification_recipients nr
       JOIN notifications n ON n.id = nr.notification_id
       WHERE nr.user_id = $1 AND n.status IN ('published','recalled')
       ORDER BY n.published_at DESC NULLS LAST, n.id DESC`,
      [request.user!.id]
    )).rows;
  });

  app.get('/unread-count', { preHandler: [authGuard] }, async (request) => {
    const row = (await app.pool.query(
      `SELECT COUNT(*)::int AS count
       FROM notification_recipients nr
       JOIN notifications n ON n.id = nr.notification_id
       WHERE nr.user_id = $1 AND nr.read_at IS NULL AND n.status = 'published'`,
      [request.user!.id]
    )).rows[0];
    return { count: Number(row.count) };
  });

  app.post('/', { preHandler: guard }, async (request, reply) => {
    const body = request.body as {
      title?: string; content?: string; audienceType?: AudienceType; campusId?: number;
      classIds?: number[]; templateId?: number; category?: string; status?: string;
    };
    if (!body.title?.trim() || !body.content?.trim()) return reply.code(400).send({ error: 'title and content required' });
    if (!body.audienceType || !['all', 'campus', 'class'].includes(body.audienceType)) {
      return reply.code(400).send({ error: 'valid audienceType required' });
    }
    if (body.audienceType === 'campus' && !body.campusId) return reply.code(400).send({ error: 'campusId required' });
    if (body.audienceType === 'class' && !body.classIds?.length) return reply.code(400).send({ error: 'classIds required' });
    const status = body.status === 'published' ? 'published' : body.status === 'pending' ? 'pending' : 'draft';

    const client = await app.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO notifications (title, content, category, audience_type, campus_id, template_id, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          body.title.trim(), body.content.trim(), body.category?.trim() || 'general', body.audienceType,
          body.audienceType === 'campus' ? body.campusId : null,
          body.templateId ?? null, status === 'published' ? 'draft' : status, request.user!.id
        ]
      );
      for (const classId of body.classIds ?? []) {
        await client.query(
          'INSERT INTO notification_classes (notification_id, class_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [inserted.rows[0].id, classId]
        );
      }
      let notification = inserted.rows[0];
      if (status === 'published') notification = await publishNotification(client, Number(notification.id), request.user!.id);
      await client.query('COMMIT');
      await writeAudit(app, request.user!.id, 'notification_create', 'notification', notification.id, {
        audienceType: body.audienceType, status: notification.status
      });
      return notification;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  app.post('/:id/submit', { preHandler: guard }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const result = await app.pool.query(
      `UPDATE notifications SET status = 'pending', reject_reason = NULL, updated_at = now()
       WHERE id = $1 AND status IN ('draft','rejected') RETURNING *`,
      [id]
    );
    if (!result.rowCount) return reply.code(409).send({ error: 'notification cannot be submitted' });
    return result.rows[0];
  });

  app.post('/:id/review', { preHandler: guard }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as { approved?: boolean; reason?: string };
    const client = await app.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = (await client.query("SELECT * FROM notifications WHERE id = $1 AND status = 'pending'", [id])).rows[0];
      if (!existing) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'notification is not pending review' });
      }
      let notification;
      if (body.approved) {
        notification = await publishNotification(client, id, request.user!.id);
      } else {
        notification = (await client.query(
          `UPDATE notifications SET status = 'rejected', reviewed_by = $2, reviewed_at = now(),
             reject_reason = $3, updated_at = now() WHERE id = $1 RETURNING *`,
          [id, request.user!.id, body.reason?.trim() || '审核未通过']
        )).rows[0];
      }
      await client.query('COMMIT');
      return notification;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  app.post('/:id/publish', { preHandler: guard }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const client = await app.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = (await client.query('SELECT status FROM notifications WHERE id = $1', [id])).rows[0];
      if (!existing) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'notification not found' });
      }
      if (!['draft', 'rejected'].includes(existing.status)) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'notification cannot be published' });
      }
      const notification = await publishNotification(client, id, request.user!.id);
      await client.query('COMMIT');
      return notification;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  app.post('/:id/recall', { preHandler: guard }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const reason = ((request.body as { reason?: string } | undefined)?.reason ?? '').trim() || null;
    const result = await app.pool.query(
      `UPDATE notifications SET status = 'recalled', recalled_at = now(), recall_reason = $2, updated_at = now()
       WHERE id = $1 AND status = 'published' RETURNING *`,
      [id, reason]
    );
    if (!result.rowCount) return reply.code(409).send({ error: 'notification cannot be recalled' });
    return result.rows[0];
  });

  app.post('/:id/read', { preHandler: [authGuard] }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const result = await app.pool.query(
      'UPDATE notification_recipients SET read_at = COALESCE(read_at, now()) WHERE notification_id = $1 AND user_id = $2 RETURNING *',
      [id, request.user!.id]
    );
    if (!result.rowCount) return reply.code(404).send({ error: 'notification recipient not found' });
    return result.rows[0];
  });

  app.get('/:id', { preHandler: guard }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const notification = (await app.pool.query(
      `SELECT n.*, camp.name AS campus_name, u.display_name AS created_by_name,
              reviewer.display_name AS reviewed_by_name,
              COALESCE((
                SELECT JSON_AGG(JSON_BUILD_OBJECT('id', c.id, 'name', c.name) ORDER BY c.name)
                FROM notification_classes nc JOIN classes c ON c.id = nc.class_id
                WHERE nc.notification_id = n.id
              ), '[]') AS classes,
              (SELECT COUNT(*) FROM notification_recipients nr WHERE nr.notification_id = n.id)::int AS recipient_count,
              (SELECT COUNT(*) FROM notification_recipients nr WHERE nr.notification_id = n.id AND nr.read_at IS NOT NULL)::int AS read_count
       FROM notifications n
       LEFT JOIN campuses camp ON camp.id = n.campus_id
       LEFT JOIN users u ON u.id = n.created_by
       LEFT JOIN users reviewer ON reviewer.id = n.reviewed_by
       WHERE n.id = $1`,
      [id]
    )).rows[0];
    if (!notification) return reply.code(404).send({ error: 'notification not found' });
    const recipients = (await app.pool.query(
      `SELECT nr.id, nr.user_id, nr.read_at, u.display_name, u.role, u.username
       FROM notification_recipients nr JOIN users u ON u.id = nr.user_id
       WHERE nr.notification_id = $1 ORDER BY nr.read_at NULLS FIRST, u.id`,
      [id]
    )).rows.map((row) => ({ ...row, id: Number(row.id), user_id: Number(row.user_id) }));
    const recipientCount = Number(notification.recipient_count);
    const readCount = Number(notification.read_count);
    return {
      notification: {
        ...notification,
        id: Number(notification.id),
        campus_id: notification.campus_id === null ? null : Number(notification.campus_id),
        recipient_count: recipientCount,
        read_count: readCount,
        read_rate: recipientCount ? Math.round((readCount / recipientCount) * 100) : 0,
        classes: typeof notification.classes === 'string' ? JSON.parse(notification.classes) : notification.classes
      },
      recipients
    };
  });
}
