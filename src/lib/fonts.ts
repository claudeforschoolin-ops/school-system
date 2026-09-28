/**
 * خط ثمانية: يُحمَّل من /public/fonts إن وضعه صاحب المشروع (مع التحقق من الترخيص).
 * نولّد @font-face فقط للملفات الموجودة فعلاً لتجنب طلبات 404، وإلا يعمل
 * النظام بالبديل الاحتياطي (IBM Plex Sans Arabic) دون كسر التصميم.
 */
import { existsSync } from "node:fs";
import path from "node:path";

const WEIGHTS: Array<[number, string]> = [
  [400, "thmanyah-regular.woff2"],
  [500, "thmanyah-medium.woff2"],
  [700, "thmanyah-bold.woff2"],
];

let cached: string | null = null;

export function thmanyahFontFaceCss(): string {
  if (cached !== null && process.env.NODE_ENV === "production") return cached;
  const dir = path.join(process.cwd(), "public", "fonts");
  cached = WEIGHTS.filter(([, file]) => existsSync(path.join(dir, file)))
    .map(
      ([weight, file]) =>
        `@font-face{font-family:"Thmanyah";src:local("Thmanyah"),url("/fonts/${file}") format("woff2");font-weight:${weight};font-style:normal;font-display:swap;}`,
    )
    .join("");
  return cached;
}

export function hasThmanyah(): boolean {
  return thmanyahFontFaceCss().length > 0;
}
