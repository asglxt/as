import Fastify from 'fastify';
import cors from '@fastify/cors';
import type pg from 'pg';
import { loadConfig } from './config.ts';
import { createPool } from './db.ts';
import { authRoutes } from './routes/auth.ts';
import { campusRoutes } from './routes/campuses.ts';
import { classRoutes } from './routes/classes.ts';
import { studentRoutes } from './routes/students.ts';
import { reportRoutes } from './routes/reports.ts';
import { scoreRoutes } from './routes/scores.ts';
import { commentRoutes } from './routes/comments.ts';
import { homeworkRoutes } from './routes/homework.ts';
import { orderRoutes } from './routes/orders.ts';
import { feeItemRoutes } from './routes/fee-items.ts';
import { accountRoutes } from './routes/accounts.ts';
import { report2Routes } from './routes/reports2.ts';
import { importRoutes } from './routes/imports.ts';
import { meRoutes } from './routes/me.ts';
import { roleRoutes } from './routes/roles.ts';
import { lessonRoutes } from './routes/lessons.ts';
import { classroomRoutes } from './routes/classrooms.ts';
import { scheduleRoutes } from './routes/schedules.ts';
import { enrollmentRoutes } from './routes/enrollments.ts';
import { attendanceRoutes } from './routes/attendance.ts';
import { dashboardRoutes } from './routes/dashboard.ts';
import { notificationRoutes } from './routes/notifications.ts';

declare module 'fastify' {
  interface FastifyInstance {
    secret: string;
    pool: pg.Pool;
  }
  interface FastifyRequest {
    user?: { id: number; role: 'admin' | 'teacher' | 'parent' | 'student'; campusId: number | null; studentId: number | null };
  }
}

export async function buildApp() {
  const config = loadConfig();
  const pool = createPool(config.databaseUrl);
  const app = Fastify({ logger: false });
  app.decorate('secret', config.jwtSecret);
  app.decorate('pool', pool);
  await app.register(cors, { origin: true });

  app.get('/', async (_request, reply) => reply.redirect(`${config.webUrl}/login`));
  app.get('/api/health', async () => ({ ok: true }));
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(campusRoutes, { prefix: '/api/campuses' });
  await app.register(classRoutes, { prefix: '/api/classes' });
  await app.register(studentRoutes, { prefix: '/api/students' });
  await app.register(reportRoutes, { prefix: '/api/reports' });
  await app.register(scoreRoutes, { prefix: '/api/scores' });
  await app.register(commentRoutes, { prefix: '/api/comments' });
  await app.register(homeworkRoutes, { prefix: '/api/homework' });
  await app.register(orderRoutes, { prefix: '/api/orders' });
  await app.register(feeItemRoutes, { prefix: '/api/fee-items' });
  await app.register(accountRoutes, { prefix: '/api/accounts' });
  await app.register(report2Routes, { prefix: '/api/reports' });
  await app.register(importRoutes, { prefix: '/api/imports' });
  await app.register(meRoutes, { prefix: '/api/me' });
  await app.register(roleRoutes, { prefix: '/api/roles' });
  await app.register(lessonRoutes, { prefix: '/api/lessons' });
  await app.register(classroomRoutes, { prefix: '/api/classrooms' });
  await app.register(scheduleRoutes, { prefix: '/api/schedules' });
  await app.register(enrollmentRoutes, { prefix: '/api/enrollments' });
  await app.register(attendanceRoutes, { prefix: '/api/attendance' });
  await app.register(notificationRoutes, { prefix: '/api/notifications' });

  return app;
}
