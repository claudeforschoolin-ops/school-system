/**
 * أخطاء التطبيق: رسائل عربية واضحة للمستخدم، دون تفاصيل تقنية.
 */
export type AppErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "TOO_MANY_REQUESTS"
  | "PRECONDITION_FAILED";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: AppErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

export const forbidden = (message = "ليست لديك صلاحية لتنفيذ هذا الإجراء") => new AppError("FORBIDDEN", message);
export const notFound = (message = "العنصر المطلوب غير موجود أو تم حذفه") => new AppError("NOT_FOUND", message);
export const badRequest = (message: string, details?: Record<string, unknown>) => new AppError("BAD_REQUEST", message, details);
