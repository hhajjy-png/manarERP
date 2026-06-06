import { Response } from 'express';

/** استجابات نجاح موحّدة عبر كل النظام. */

export function ok<T>(res: Response, data: T, message?: string): void {
  res.status(200).json({ success: true, message, data });
}

export function created<T>(res: Response, data: T, message = 'تم الإنشاء بنجاح'): void {
  res.status(201).json({ success: true, message, data });
}

export function noContent(res: Response, message = 'تمت العملية بنجاح'): void {
  res.status(200).json({ success: true, message });
}
