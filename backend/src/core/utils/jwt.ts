import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env';

export interface TokenPayload {
  userId: number;
  username: string;
  roleId: number;
  roleName: string;
}

/** توليد رمز جلسة موقّع. */
export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as SignOptions);
}

/** التحقق من رمز الجلسة وفك تشفيره. يرمي خطأ إن كان غير صالح/منتهيًا. */
export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
}
