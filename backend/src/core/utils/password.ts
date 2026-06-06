import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

/** تشفير كلمة المرور (Hash + Salt). لا تُخزّن كلمة المرور كنص أبدًا. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** مقارنة كلمة مرور بالنص المشفّر. */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
