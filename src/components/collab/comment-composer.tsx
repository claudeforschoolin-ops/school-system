"use client";
/**
 * محرر تعليق صغير يدعم الإشارة «@» إلى الزملاء، ويحوّل المحتوى إلى نص برموز الإشارة.
 */
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Placeholder, UndoRedo } from "@tiptap/extensions";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import { ArrowUp } from "lucide-react";
import { useLayoutEffect, useMemo, useRef } from "react";
import { useLatest } from "@/lib/hooks/use-latest";
import { mentionToken } from "@/lib/mentions";
import { trpc } from "@/lib/trpc/client";
import { cn, matchesSearch } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { createMention, type MentionItem } from "@/components/editor/extensions";
import { SuggestionPopup, SuggestionStore } from "@/components/editor/suggestion";

export function docToBody(doc: JSONContent): string {
  const lines: string[] = [];
  for (const block of doc.content ?? []) {
    let line = "";
    for (const node of block.content ?? []) {
      if (node.type === "text") line += node.text ?? "";
      else if (node.type === "hardBreak") line += "\n";
      else if (node.type === "mention") line += mentionToken((node.attrs?.kind as "user") ?? "user", String(node.attrs?.id), String(node.attrs?.label ?? ""));
    }
    lines.push(line);
  }
  return lines.join("\n").trim();
}

export function CommentComposer({
  onSubmit,
  placeholder = "أضف تعليقاً… استخدم @ للإشارة",
  pending,
  autoFocus,
  compact,
}: {
  onSubmit: (body: string) => Promise<unknown> | void;
  placeholder?: string;
  pending?: boolean;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const store = useMemo(() => new SuggestionStore<MentionItem>(), []);
  const directory = trpc.workspace.directory.useQuery(undefined, { staleTime: 5 * 60_000 });
  const activeUsers = useMemo<MentionItem[]>(
    () => (directory.data ?? []).filter((u) => u.status === "ACTIVE").map((u) => ({ id: u.id, label: u.name, kind: "user" as const, color: u.avatarColor, hint: u.jobTitle })),
    [directory.data],
  );
  const users = useLatest(activeUsers);
  const submitRef = useRef<() => void>(() => undefined);

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      UndoRedo,
      Placeholder.configure({ placeholder }),
      createMention(store, (q) => users.current.filter((u) => matchesSearch(u.label, q)).slice(0, 8)),
    ],
    editorProps: {
      attributes: { class: "outline-none min-h-[22px] max-h-40 overflow-y-auto text-[14px] leading-6" },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && !event.shiftKey && store.get().open === false) {
          event.preventDefault();
          submitRef.current();
          return true;
        }
        return false;
      },
    },
  });

  const submit = () => {
    if (!editor || pending) return;
    const body = docToBody(editor.getJSON());
    if (!body) return;
    const result = onSubmit(body);
    const clear = () => editor.commands.clearContent();
    if (result && typeof (result as Promise<unknown>).then === "function") void (result as Promise<unknown>).then(clear);
    else clear();
  };
  useLayoutEffect(() => {
    submitRef.current = submit;
  });

  return (
    <div className={cn("editor-content flex items-end gap-2 rounded-lg bg-card px-3 py-2 shadow-[0_0_0_1px_var(--border)] focus-within:shadow-[0_0_0_1px_var(--border-strong)]", compact && "py-1.5")}>
      <EditorContent editor={editor} className="min-w-0 flex-1 [&_.ProseMirror]:min-h-0 [&_.ProseMirror]:p-0 [&_.ProseMirror]:text-[14px]" />
      <button
        onClick={submit}
        disabled={pending}
        className="grid size-7 shrink-0 place-items-center rounded-full bg-navy-700 text-white transition-opacity hover:bg-navy-600 disabled:opacity-40 dark:text-on-primary"
        aria-label="إرسال"
      >
        {pending ? <Spinner className="size-3.5" /> : <ArrowUp className="size-4" />}
      </button>
      <SuggestionPopup
        store={store}
        width={260}
        empty="لا يوجد زملاء مطابقون"
        renderItem={(item) => (
          <>
            <Avatar name={item.label} color={item.color} size={22} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px]">{item.label}</span>
              {item.hint ? <span className="block truncate text-[12px] text-fg-3">{item.hint}</span> : null}
            </span>
          </>
        )}
      />
    </div>
  );
}
