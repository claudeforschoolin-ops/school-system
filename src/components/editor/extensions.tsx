"use client";
/**
 * إضافات المحرر المخصصة: كتلة التنبيه، قاعدة البيانات المضمّنة، أمر «/»، والإشارات «@».
 */
import { Extension, Node, mergeAttributes, type Editor, type Range } from "@tiptap/core";
import Mention from "@tiptap/extension-mention";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import dynamic from "next/dynamic";
import { PluginKey } from "@tiptap/pm/state";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PageIcon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { suggestionRenderer, type SuggestionItemBase, type SuggestionStore } from "./suggestion";

// ---------------------------------------------------------------------
// كتلة التنبيه (Callout)
// ---------------------------------------------------------------------

const TONES = ["info", "warning", "success", "neutral"] as const;
type Tone = (typeof TONES)[number];
const TONE_CLASS: Record<Tone, string> = {
  info: "bg-navy-50",
  warning: "bg-warning-50",
  success: "bg-success-50",
  neutral: "bg-hover",
};
const TONE_ICON: Record<Tone, string> = {
  info: "lucide:info",
  warning: "lucide:triangle-alert",
  success: "lucide:circle-check",
  neutral: "lucide:lightbulb",
};

function CalloutView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const tone = (node.attrs.tone as Tone) ?? "info";
  const icon = (node.attrs.icon as string | null) ?? TONE_ICON[tone];
  return (
    <NodeViewWrapper className={cn("my-1.5 flex gap-3 rounded-lg px-4 py-3", TONE_CLASS[tone])} data-type="callout">
      <button
        type="button"
        contentEditable={false}
        disabled={!editor.isEditable}
        title="تغيير النمط"
        onClick={() => {
          const next = TONES[(TONES.indexOf(tone) + 1) % TONES.length]!;
          updateAttributes({ tone: next, icon: TONE_ICON[next] });
        }}
        className="mt-1 grid size-6 shrink-0 place-items-center rounded-md text-fg-2 hover:bg-black/5 dark:hover:bg-white/10"
      >
        <PageIcon icon={icon} size={18} />
      </button>
      <NodeViewContent className="min-w-0 flex-1 [&>p]:m-0" />
    </NodeViewWrapper>
  );
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      tone: { default: "info" },
      icon: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "callout" }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});

// ---------------------------------------------------------------------
// قاعدة بيانات مضمّنة داخل صفحة
// ---------------------------------------------------------------------

const InlineDatabase = dynamic(() => import("@/components/database/inline-database").then((m) => m.InlineDatabase), {
  ssr: false,
  loading: () => <Skeleton className="h-40 w-full" />,
});

function DatabaseEmbedView({ node }: ReactNodeViewProps) {
  return (
    <NodeViewWrapper data-type="database-embed" className="my-3" contentEditable={false}>
      <InlineDatabase databaseId={node.attrs.databaseId as string} />
    </NodeViewWrapper>
  );
}

export const DatabaseEmbed = Node.create({
  name: "databaseEmbed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return { databaseId: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="database-embed"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "database-embed" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(DatabaseEmbedView);
  },
});

// ---------------------------------------------------------------------
// أمر الشرطة المائلة «/»
// ---------------------------------------------------------------------

export interface SlashItem extends SuggestionItemBase {
  keywords: string;
  icon: ReactNode;
  description: string;
  run: (editor: Editor, range: Range) => void;
}

export const SlashCommand = Extension.create<{ store: SuggestionStore<SlashItem> | null; items: () => SlashItem[] }>({
  name: "slashCommand",
  addOptions() {
    return { store: null, items: () => [] };
  },
  addProseMirrorPlugins() {
    const { store, items } = this.options;
    if (!store) return [];
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        pluginKey: new PluginKey("slashCommand"),
        char: "/",
        allowSpaces: false,
        startOfLine: false,
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          return $from.parent.type.name !== "codeBlock";
        },
        items: ({ query }) => {
          const q = query.trim().toLowerCase();
          const all = items();
          if (!q) return all;
          return all.filter((i) => `${i.label} ${i.keywords}`.toLowerCase().includes(q));
        },
        command: ({ editor, range, props }) => props.run(editor, range),
        render: suggestionRenderer(store),
      }),
    ];
  },
});

/** أمر «/» مع مصدر عناصر يُقرأ لحظة الكتابة */
export function createSlashCommand(store: SuggestionStore<SlashItem>, items: () => SlashItem[]) {
  return SlashCommand.configure({ store, items });
}

// ---------------------------------------------------------------------
// الإشارات «@» (أشخاص وصفحات)
// ---------------------------------------------------------------------

export interface MentionItem extends SuggestionItemBase {
  kind: "user" | "page";
  icon?: string | null;
  color?: string | null;
  hint?: string | null;
}

export function createMention(store: SuggestionStore<MentionItem>, items: (query: string) => MentionItem[]) {
  return Mention.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        kind: {
          default: "user",
          parseHTML: (el: HTMLElement) => el.getAttribute("data-kind") ?? "user",
          renderHTML: (attrs: Record<string, unknown>) => ({ "data-kind": attrs.kind }),
        },
      };
    },
  }).configure({
    HTMLAttributes: { class: "mention-chip" },
    renderHTML({ node }) {
      const kind = node.attrs.kind as string;
      if (kind === "page") {
        return ["a", { class: "mention-chip", "data-kind": "page", "data-id": node.attrs.id, href: `/p/${node.attrs.id}` }, `↗ ${node.attrs.label ?? ""}`];
      }
      return ["span", { class: "mention-chip", "data-kind": "user", "data-id": node.attrs.id }, node.attrs.label ?? ""];
    },
    renderText({ node }) {
      return `@${node.attrs.label ?? ""}`;
    },
    suggestion: {
      char: "@",
      pluginKey: new PluginKey("mention"),
      items: ({ query }) => items(query),
      command: ({ editor, range, props }) => {
        const item = props as unknown as MentionItem;
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            { type: "mention", attrs: { id: item.id, label: item.label, kind: item.kind } },
            { type: "text", text: " " },
          ])
          .run();
      },
      render: suggestionRenderer(store) as never,
    },
  });
}
