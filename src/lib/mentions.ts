/**
 * الإشارات في التعليقات والرسائل: تُخزَّن كرموز داخل النص
 *   @[اسم المستخدم](user:ID) أو @[عنوان الصفحة](page:ID)
 * وتُعرض في الواجهة كشارات قابلة للنقر.
 */
export type MentionKind = "user" | "page" | "row";

export interface MentionToken {
  kind: MentionKind;
  id: string;
  label: string;
}

export const MENTION_PATTERN = /@\[([^\]]{1,120})\]\((user|page|row):([A-Za-z0-9_-]{1,64})\)/g;

export function extractMentions(body: string): MentionToken[] {
  const out: MentionToken[] = [];
  for (const m of body.matchAll(MENTION_PATTERN)) {
    out.push({ label: m[1]!, kind: m[2] as MentionKind, id: m[3]! });
  }
  return out;
}

export function mentionToken(kind: MentionKind, id: string, label: string): string {
  return `@[${label.replace(/[\[\]]/g, "")}](${kind}:${id})`;
}

/** نص مقروء بدون رموز (للإشعارات والمعاينات) */
export function plainTextFromBody(body: string): string {
  return body.replace(MENTION_PATTERN, (_m, label: string) => `@${label}`);
}

export type BodySegment = { type: "text"; text: string } | { type: "mention"; mention: MentionToken };

export function segmentBody(body: string): BodySegment[] {
  const segments: BodySegment[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION_PATTERN)) {
    const index = m.index ?? 0;
    if (index > last) segments.push({ type: "text", text: body.slice(last, index) });
    segments.push({ type: "mention", mention: { label: m[1]!, kind: m[2] as MentionKind, id: m[3]! } });
    last = index + m[0].length;
  }
  if (last < body.length) segments.push({ type: "text", text: body.slice(last) });
  return segments;
}

/** استخراج إشارات المستخدمين من محتوى Tiptap JSON */
export function extractDocMentions(doc: unknown): MentionToken[] {
  const out: MentionToken[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; attrs?: Record<string, unknown>; content?: unknown[] };
    if (n.type === "mention" && n.attrs && typeof n.attrs.id === "string") {
      out.push({ kind: (n.attrs.kind as MentionKind) ?? "user", id: n.attrs.id, label: String(n.attrs.label ?? "") });
    }
    n.content?.forEach(walk);
  };
  walk(doc);
  return out;
}

/** نص خام من محتوى Tiptap (للبحث والمعاينة) */
export function docToPlainText(doc: unknown, limit = 2000): string {
  const parts: string[] = [];
  let length = 0;
  const walk = (node: unknown) => {
    if (length > limit || !node || typeof node !== "object") return;
    const n = node as { type?: string; text?: string; attrs?: Record<string, unknown>; content?: unknown[] };
    if (typeof n.text === "string") {
      parts.push(n.text);
      length += n.text.length;
    } else if (n.type === "mention") parts.push(`@${String(n.attrs?.label ?? "")}`);
    n.content?.forEach(walk);
    if (n.type && ["paragraph", "heading", "listItem", "taskItem", "blockquote", "codeBlock"].includes(n.type)) parts.push("\n");
  };
  walk(doc);
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim().slice(0, limit);
}
