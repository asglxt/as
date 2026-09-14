import jwt from 'jsonwebtoken';

export interface TokenPayload {
  userId: number;
  role: 'admin' | 'teacher' | 'parent' | 'student';
  campusId: number | null;
  studentId: number | null;
}

export function signToken(payload: TokenPayload, secret: string): string {
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

export function verifyToken(token: string, secret: string): TokenPayload {
  return jwt.verify(token, secret) as TokenPayload;
}
