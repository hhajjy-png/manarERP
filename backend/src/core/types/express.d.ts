import { TokenPayload } from '../utils/jwt';

/** توسعة نوع Request في Express لإضافة المستخدم المصادَق والصلاحيات. */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
      permissions?: string[];
    }
  }
}

export {};
