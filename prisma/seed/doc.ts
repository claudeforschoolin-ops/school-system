/**
 * أدوات بناء محتوى Tiptap JSON للبذور.
 */
type Mark = { type: string; attrs?: Record<string, unknown> };
export type DocNode = { type: string; attrs?: Record<string, unknown>; content?: DocNode[]; text?: string; marks?: Mark[] };

export const text = (value: string, marks?: Array<"bold" | "italic" | "code" | "highlight">): DocNode => ({
  type: "text",
  text: value,
  ...(marks?.length ? { marks: marks.map((m) => ({ type: m })) } : {}),
});

type Inline = string | DocNode;
const inline = (parts: Inline[]): DocNode[] => parts.map((p) => (typeof p === "string" ? text(p) : p));

export const p = (...parts: Inline[]): DocNode => ({ type: "paragraph", ...(parts.length ? { content: inline(parts) } : {}) });
export const h1 = (value: string): DocNode => ({ type: "heading", attrs: { level: 1 }, content: [text(value)] });
export const h2 = (value: string): DocNode => ({ type: "heading", attrs: { level: 2 }, content: [text(value)] });
export const h3 = (value: string): DocNode => ({ type: "heading", attrs: { level: 3 }, content: [text(value)] });
export const bullets = (...items: Inline[][] | string[]): DocNode => ({
  type: "bulletList",
  content: items.map((item) => ({ type: "listItem", content: [p(...(Array.isArray(item) ? item : [item]))] })),
});
export const numbered = (...items: string[]): DocNode => ({
  type: "orderedList",
  attrs: { start: 1 },
  content: items.map((item) => ({ type: "listItem", content: [p(item)] })),
});
export const todos = (...items: Array<[string, boolean]>): DocNode => ({
  type: "taskList",
  content: items.map(([label, checked]) => ({ type: "taskItem", attrs: { checked }, content: [p(label)] })),
});
export const quote = (value: string): DocNode => ({ type: "blockquote", content: [p(value)] });
export const divider = (): DocNode => ({ type: "horizontalRule" });
export const callout = (icon: string, tone: "info" | "warning" | "success" | "neutral", ...parts: Inline[]): DocNode => ({
  type: "callout",
  attrs: { icon, tone },
  content: [p(...parts)],
});
export const mentionUser = (id: string, label: string): DocNode => ({ type: "mention", attrs: { id, label, kind: "user" } });
export const mentionPage = (id: string, label: string): DocNode => ({ type: "mention", attrs: { id, label, kind: "page" } });
export const bold = (value: string) => text(value, ["bold"]);

export const doc = (...content: DocNode[]): DocNode => ({ type: "doc", content });
