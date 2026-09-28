"use client";
/** رفع ملف من الواجهة إلى /api/files */
export interface UploadedFile {
  id: string;
  name: string;
  url: string;
  size: number;
  mime: string;
}

export async function uploadFile(file: File): Promise<UploadedFile> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch("/api/files", { method: "POST", body });
  const data = (await res.json().catch(() => ({}))) as UploadedFile & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "تعذر رفع الملف");
  return data;
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} ك.ب`;
  return `${(bytes / 1024 / 1024).toFixed(1)} م.ب`;
}
