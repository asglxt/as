import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/auth/password.ts';
import { signToken, verifyToken } from '../src/auth/token.ts';

test('password hash roundtrip', async () => {
  const hash = await hashPassword('secret123');
  assert.notEqual(hash, 'secret123');
  assert.equal(await verifyPassword('secret123', hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
});

test('jwt sign and verify', () => {
  const token = signToken({ userId: 7, role: 'admin', campusId: null, studentId: null }, 'test-secret');
  const payload = verifyToken(token, 'test-secret');
  assert.equal(payload.userId, 7);
  assert.equal(payload.role, 'admin');
});
