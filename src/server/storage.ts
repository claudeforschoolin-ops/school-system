/**
 * تخزين الملفات: واجهة موحدة. المرحلة ١ تنفذ المشغّل المحلي (قرص الخادم)،
 * ومشغّل S3 المتوافق يُضاف بنفس الواجهة عند توفر بيانات الاعتماد.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface StorageDriver {
  put(key: string, data: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

class LocalDriver implements StorageDriver {
  constructor(private readonly root: string) {}
  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root))) throw new Error("مسار تخزين غير صالح");
    return full;
  }
  async put(key: string, data: Buffer) {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  }
  async get(key: string) {
    return readFile(this.resolve(key));
  }
  async remove(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

let driver: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (driver) return driver;
  const kind = process.env.STORAGE_DRIVER ?? "local";
  if (kind !== "local") {
    throw new Error("مشغّل التخزين المطلوب غير مفعّل في هذه النسخة؛ استخدم STORAGE_DRIVER=local");
  }
  driver = new LocalDriver(path.resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR ?? "./storage"));
  return driver;
}

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** الأنواع المسموح برفعها (SVG و HTML ممنوعان لمنع XSS) */
export const ALLOWED_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/zip": "zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

/** التحقق من التوقيع الفعلي للصور وملفات PDF (لا نثق بالنوع المُعلن فقط) */
export function sniffMatches(mime: string, buf: Buffer): boolean {
  const hex = buf.subarray(0, 12).toString("hex");
  switch (mime) {
    case "image/png":
      return hex.startsWith("89504e470d0a1a0a");
    case "image/jpeg":
      return hex.startsWith("ffd8ff");
    case "image/gif":
      return hex.startsWith("47494638");
    case "image/webp":
      return hex.startsWith("52494646") && buf.subarray(8, 12).toString("ascii") === "WEBP";
    case "application/pdf":
      return buf.subarray(0, 5).toString("ascii") === "%PDF-";
    case "application/zip":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return hex.startsWith("504b0304");
    default:
      return true;
  }
}
