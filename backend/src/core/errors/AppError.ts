/**
 * فئة خطأ موحّدة لكل التطبيق.
 * تحمل رمز حالة HTTP ورسالة عربية واضحة، وتميّز الأخطاء المتوقعة (التشغيلية)
 * عن الأخطاء البرمجية غير المتوقعة.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static badRequest(msg: string, details?: unknown) {
    return new AppError(msg, 400, details);
  }
  static unauthorized(msg = 'غير مصرّح بالدخول') {
    return new AppError(msg, 401);
  }
  static forbidden(msg = 'ليست لديك صلاحية لهذا الإجراء') {
    return new AppError(msg, 403);
  }
  static notFound(msg = 'السجل غير موجود') {
    return new AppError(msg, 404);
  }
  static conflict(msg: string) {
    return new AppError(msg, 409);
  }
  static internal(msg = 'حدث خطأ داخلي في النظام') {
    return new AppError(msg, 500);
  }
}
