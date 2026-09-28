"use client";
/**
 * المحرر النصي (Tiptap) بكتل على طراز Notion مع دعم RTL:
 * «/» لإدراج الكتل، «@» للإشارة إلى زميل أو صفحة، شريط تنسيق عند التحديد،
 * لصق/إفلات الصور، المعادلات، وقواعد البيانات المضمّنة.
 */
import "katex/dist/katex.min.css";
import { Mathematics } from "@tiptap/extension-mathematics";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, type Editor, type JSONContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import {
  AtSign,
  Bold,
  Code,
  Database,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Paperclip,
  Quote,
  Sigma,
  SquareCode,
  Strikethrough,
  Table,
  TextQuote,
  Type,
  Underline,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLatest } from "@/lib/hooks/use-latest";
import { pickFile, uploadFile } from "@/lib/upload";
import { trpc } from "@/lib/trpc/client";
import { cn, matchesSearch } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { PageIcon } from "@/components/ui/icon";
import { Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { Callout, DatabaseEmbed, createMention, createSlashCommand, type MentionItem, type SlashItem } from "./extensions";
import { SuggestionPopup, SuggestionStore } from "./suggestion";

export interface EditorHost {
  createChildPage?: () => Promise<{ id: string; title: string }>;
  createInlineDatabase?: () => Promise<{ databaseId: string }>;
}

export interface BlockEditorProps {
  content: unknown;
  editable: boolean;
  onChange?: (doc: JSONContent) => void;
  placeholder?: string;
  host?: EditorHost;
  className?: string;
  autofocus?: boolean;
}

const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

export function BlockEditor({ content, editable, onChange, placeholder, host, className, autofocus }: BlockEditorProps) {
  const router = useRouter();
  const slashStore = useMemo(() => new SuggestionStore<SlashItem>(), []);
  const mentionStore = useMemo(() => new SuggestionStore<MentionItem>(), []);
  const [math, setMath] = useState<{ kind: "block" | "inline"; pos: number; latex: string } | null>(null);
  const hostRef = useLatest(host);
  const onChangeRef = useLatest(onChange);

  // مصادر الإشارات
  const directory = trpc.workspace.directory.useQuery(undefined, { staleTime: 5 * 60_000, enabled: editable });
  const sidebar = trpc.workspace.sidebar.useQuery(undefined, { staleTime: 60_000, enabled: editable });
  const mentionItems = useMemo<{ users: MentionItem[]; pages: MentionItem[] }>(
    () => ({
      users: (directory.data ?? [])
        .filter((u) => u.status === "ACTIVE")
        .map((u) => ({ id: u.id, label: u.name, kind: "user", color: u.avatarColor, hint: u.jobTitle, group: "الأشخاص" })),
      pages: (sidebar.data?.pages ?? []).map((p) => ({ id: p.id, label: p.title || "بدون عنوان", kind: "page", icon: p.icon, group: "الصفحات" })),
    }),
    [directory.data, sidebar.data],
  );
  const mentionSource = useLatest(mentionItems);

  const editorRef = useRef<Editor | null>(null);

  const slashItems = (): SlashItem[] => {
    const h = hostRef.current;
    const upload = async (editor: Editor, kind: "image" | "file") => {
      const file = await pickFile(kind === "image" ? "image/png,image/jpeg,image/webp,image/gif" : "*/*");
      if (!file) return;
      try {
        const uploaded = await uploadFile(file);
        if (kind === "image") editor.chain().focus().setImage({ src: uploaded.url, alt: uploaded.name }).run();
        else editor.chain().focus().insertContent({ type: "text", text: `📎 ${uploaded.name}`, marks: [{ type: "link", attrs: { href: uploaded.url } }] }).run();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "تعذر رفع الملف");
      }
    };
    const items: SlashItem[] = [
      { id: "p", group: "كتل أساسية", label: "نص", keywords: "paragraph فقرة text", description: "فقرة نصية عادية", icon: <Type className="size-4" />, run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run() },
      { id: "h1", group: "كتل أساسية", label: "عنوان ١", keywords: "h1 heading عنوان كبير", description: "عنوان قسم كبير", icon: <Heading1 className="size-4" />, run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 1 }).run() },
      { id: "h2", group: "كتل أساسية", label: "عنوان ٢", keywords: "h2 heading عنوان متوسط", description: "عنوان متوسط", icon: <Heading2 className="size-4" />, run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run() },
      { id: "h3", group: "كتل أساسية", label: "عنوان ٣", keywords: "h3 heading عنوان صغير", description: "عنوان فرعي صغير", icon: <Heading3 className="size-4" />, run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run() },
      { id: "ul", group: "كتل أساسية", label: "قائمة نقطية", keywords: "bullet list قائمة نقاط", description: "قائمة بسيطة", icon: <List className="size-4" />, run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
      { id: "ol", group: "كتل أساسية", label: "قائمة مرقمة", keywords: "numbered ordered list ترقيم", description: "قائمة بأرقام", icon: <ListOrdered className="size-4" />, run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
      { id: "todo", group: "كتل أساسية", label: "قائمة مهام", keywords: "todo task checkbox مهام تحقق", description: "مهام قابلة للتحديد", icon: <ListTodo className="size-4" />, run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
      { id: "quote", group: "كتل أساسية", label: "اقتباس", keywords: "quote blockquote اقتباس", description: "نص مقتبس", icon: <Quote className="size-4" />, run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
      {
        id: "callout",
        group: "كتل أساسية",
        label: "تنبيه",
        keywords: "callout note تنبيه ملاحظة",
        description: "كتلة بارزة بأيقونة",
        icon: <TextQuote className="size-4" />,
        run: (e, r) => e.chain().focus().deleteRange(r).insertContent({ type: "callout", attrs: { tone: "info" }, content: [{ type: "paragraph" }] }).run(),
      },
      { id: "hr", group: "كتل أساسية", label: "فاصل", keywords: "divider hr خط فاصل", description: "خط فاصل بين الأقسام", icon: <Minus className="size-4" />, run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
      { id: "code", group: "كتل أساسية", label: "كتلة برمجية", keywords: "code برمجة كود", description: "نص برمجي", icon: <SquareCode className="size-4" />, run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run() },
      { id: "table", group: "كتل أساسية", label: "جدول", keywords: "table جدول", description: "جدول بسيط ٣×٣", icon: <Table className="size-4" />, run: (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
      { id: "image", group: "وسائط", label: "صورة", keywords: "image صورة رفع", description: "رفع صورة", icon: <ImagePlus className="size-4" />, run: (e, r) => { e.chain().focus().deleteRange(r).run(); void upload(e, "image"); } },
      { id: "file", group: "وسائط", label: "مرفق", keywords: "file attachment ملف مرفق", description: "رفع ملف وإرفاق رابطه", icon: <Paperclip className="size-4" />, run: (e, r) => { e.chain().focus().deleteRange(r).run(); void upload(e, "file"); } },
      {
        id: "math",
        group: "متقدم",
        label: "معادلة",
        keywords: "math equation latex معادلة رياضيات",
        description: "معادلة رياضية (LaTeX)",
        icon: <Sigma className="size-4" />,
        run: (e, r) => {
          e.chain().focus().deleteRange(r).insertBlockMath({ latex: "x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}" }).run();
        },
      },
      { id: "mention", group: "متقدم", label: "إشارة إلى شخص", keywords: "mention @ اشارة زميل", description: "إشعار زميل بهذه الصفحة", icon: <AtSign className="size-4" />, run: (e, r) => e.chain().focus().deleteRange(r).insertContent("@").run() },
    ];
    if (h?.createChildPage) {
      items.push({
        id: "subpage",
        group: "متقدم",
        label: "صفحة فرعية",
        keywords: "page صفحة فرعية",
        description: "إنشاء صفحة داخل هذه الصفحة",
        icon: <FileText className="size-4" />,
        run: (e, r) => {
          e.chain().focus().deleteRange(r).run();
          void h.createChildPage!().then((child) => {
            e.chain().focus().insertContent([{ type: "mention", attrs: { id: child.id, label: child.title || "صفحة جديدة", kind: "page" } }, { type: "text", text: " " }]).run();
          });
        },
      });
    }
    if (h?.createInlineDatabase) {
      items.push({
        id: "database",
        group: "متقدم",
        label: "قاعدة بيانات مضمّنة",
        keywords: "database table جدول قاعدة بيانات لوحة",
        description: "جدول بعروض متعددة داخل الصفحة",
        icon: <Database className="size-4" />,
        run: (e, r) => {
          e.chain().focus().deleteRange(r).run();
          void h.createInlineDatabase!().then(({ databaseId }) => {
            e.chain().focus().insertContent([{ type: "databaseEmbed", attrs: { databaseId } }, { type: "paragraph" }]).run();
          });
        },
      });
    }
    return items;
  };
  const slashItemsRef = useLatest(slashItems);

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    autofocus: autofocus ? "end" : false,
    content: (content as JSONContent) ?? EMPTY_DOC,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https", HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } },
        dropcursor: { color: "var(--teal-500)", width: 2 },
      }),
      Placeholder.configure({
        placeholder: ({ node }) => (node.type.name === "heading" ? "عنوان" : (placeholder ?? "اكتب، أو اضغط «/» لإدراج كتلة…")),
        showOnlyCurrent: true,
        includeChildren: false,
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      Image.configure({ inline: false }),
      TableKit.configure({ table: { resizable: false } }),
      Mathematics.configure({
        katexOptions: { throwOnError: false },
        blockOptions: {
          onClick: (node, pos) => setMath({ kind: "block", pos, latex: String(node.attrs.latex ?? "") }),
        },
        inlineOptions: {
          onClick: (node, pos) => setMath({ kind: "inline", pos, latex: String(node.attrs.latex ?? "") }),
        },
      }),
      Callout,
      DatabaseEmbed,
      // eslint-disable-next-line react-hooks/refs -- الدالة تُستدعى عند كتابة «/» فقط، لا أثناء العرض
      createSlashCommand(slashStore, () => slashItemsRef.current()),
      createMention(mentionStore, (query) => {
        const { users, pages } = mentionSource.current;
        return [...users.filter((u) => matchesSearch(u.label, query)).slice(0, 6), ...pages.filter((p) => matchesSearch(p.label, query)).slice(0, 5)];
      }),
    ],
    editorProps: {
      attributes: { class: "outline-none", "aria-label": "محتوى الصفحة" },
      handleClickOn: (_view, _pos, _node, _nodePos, event) => {
        const target = (event.target as HTMLElement).closest("a.mention-chip[data-kind=page]") as HTMLAnchorElement | null;
        if (target) {
          event.preventDefault();
          router.push(target.getAttribute("href")!);
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const file = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
        if (!file || !editorRef.current?.isEditable) return false;
        void uploadFile(file)
          .then((u) => editorRef.current?.chain().focus().setImage({ src: u.url, alt: u.name }).run())
          .catch((e: Error) => toast.error(e.message));
        return true;
      },
      handleDrop: (_view, event) => {
        const file = Array.from(event.dataTransfer?.files ?? []).find((f) => f.type.startsWith("image/"));
        if (!file || !editorRef.current?.isEditable) return false;
        event.preventDefault();
        void uploadFile(file)
          .then((u) => editorRef.current?.chain().focus().setImage({ src: u.url, alt: u.name }).run())
          .catch((e: Error) => toast.error(e.message));
        return true;
      },
    },
    onUpdate: ({ editor: e }) => onChangeRef.current?.(e.getJSON()),
  });
  useLayoutEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  // استبدال المحتوى عند تغيّره من الخارج (استرجاع نسخة مثلاً)
  const lastExternal = useRef(content);
  useEffect(() => {
    if (!editor || content === lastExternal.current) return;
    lastExternal.current = content;
    const current = JSON.stringify(editor.getJSON());
    if (JSON.stringify(content) !== current) editor.commands.setContent((content as JSONContent) ?? EMPTY_DOC, { emitUpdate: false });
  }, [content, editor]);

  return (
    <div className={cn("editor-content", className)}>
      <EditorContent editor={editor} />
      {editor && editable ? <FormatBubble editor={editor} /> : null}
      <SuggestionPopup
        store={slashStore}
        empty="لا توجد كتل مطابقة"
        renderItem={(item) => (
          <>
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-card text-fg-2 shadow-[0_0_0_1px_var(--border)]">{item.icon}</span>
            <span className="min-w-0">
              <span className="block truncate text-[14px] text-fg">{item.label}</span>
              <span className="block truncate text-[12px] text-fg-3">{item.description}</span>
            </span>
          </>
        )}
      />
      <SuggestionPopup
        store={mentionStore}
        width={280}
        empty="لا توجد نتائج"
        renderItem={(item) => (
          <>
            {item.kind === "user" ? <Avatar name={item.label} color={item.color} size={22} /> : <PageIcon icon={item.icon ?? null} size={18} />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] text-fg">{item.label}</span>
              {item.hint ? <span className="block truncate text-[12px] text-fg-3">{item.hint}</span> : null}
            </span>
          </>
        )}
      />
      <MathDialog
        value={math}
        onClose={() => setMath(null)}
        onSave={(latex) => {
          if (!editor || !math) return;
          const chain = editor.chain().setNodeSelection(math.pos);
          if (math.kind === "block") chain.updateBlockMath({ latex }).run();
          else chain.updateInlineMath({ latex }).run();
          setMath(null);
        }}
      />
    </div>
  );
}

function BubbleButton({ active, onClick, label, children }: { active?: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn("grid size-7 place-items-center rounded-md text-fg-2 transition-colors hover:bg-hover hover:text-fg", active && "bg-hover text-navy-700")}
    >
      {children}
    </button>
  );
}

function FormatBubble({ editor }: { editor: Editor }) {
  const [linkMode, setLinkMode] = useState(false);
  const [href, setHref] = useState("");
  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: 8 }}
      shouldShow={({ editor: e, state }) => e.isEditable && !state.selection.empty && !e.isActive("image") && !e.isActive("databaseEmbed") && !e.isActive("blockMath")}
      className="flex items-center gap-0.5 rounded-lg bg-elevated p-1 shadow-popover"
    >
      {linkMode ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(ev) => {
            ev.preventDefault();
            const value = href.trim();
            if (!value) editor.chain().focus().unsetLink().run();
            else editor.chain().focus().extendMarkRange("link").setLink({ href: /^(https?:|mailto:|\/)/.test(value) ? value : `https://${value}` }).run();
            setLinkMode(false);
          }}
        >
          <input
            autoFocus
            dir="ltr"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            placeholder="https://"
            className="h-7 w-56 rounded-md bg-hover px-2 text-[13px] outline-none"
            onKeyDown={(e) => e.key === "Escape" && setLinkMode(false)}
          />
        </form>
      ) : (
        <>
          <select
            aria-label="نوع الكتلة"
            className="h-7 rounded-md bg-transparent px-1 text-[13px] text-fg-2 outline-none hover:bg-hover"
            value={editor.isActive("heading", { level: 1 }) ? "h1" : editor.isActive("heading", { level: 2 }) ? "h2" : editor.isActive("heading", { level: 3 }) ? "h3" : "p"}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "p") editor.chain().focus().setParagraph().run();
              else editor.chain().focus().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
            }}
          >
            <option value="p">نص</option>
            <option value="h1">عنوان ١</option>
            <option value="h2">عنوان ٢</option>
            <option value="h3">عنوان ٣</option>
          </select>
          <span className="mx-0.5 h-4 w-px bg-line" />
          <BubbleButton label="غامق" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold className="size-4" />
          </BubbleButton>
          <BubbleButton label="مائل" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic className="size-4" />
          </BubbleButton>
          <BubbleButton label="تسطير" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <Underline className="size-4" />
          </BubbleButton>
          <BubbleButton label="يتوسطه خط" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <Strikethrough className="size-4" />
          </BubbleButton>
          <BubbleButton label="برمجي" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
            <Code className="size-4" />
          </BubbleButton>
          <BubbleButton label="تمييز" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()}>
            <Highlighter className="size-4" />
          </BubbleButton>
          <BubbleButton
            label="رابط"
            active={editor.isActive("link")}
            onClick={() => {
              setHref((editor.getAttributes("link").href as string | undefined) ?? "");
              setLinkMode(true);
            }}
          >
            <Link2 className="size-4" />
          </BubbleButton>
        </>
      )}
    </BubbleMenu>
  );
}

function MathDialog({ value, onClose, onSave }: { value: { latex: string } | null; onClose: () => void; onSave: (latex: string) => void }) {
  const [latex, setLatex] = useState(value?.latex ?? "");
  const [preview, setPreview] = useState("");
  // مزامنة النص عند فتح المعادلة لعقدة أخرى (تعديل الحالة أثناء العرض بدل التأثير)
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    if (value) setLatex(value.latex);
  }
  useEffect(() => {
    let cancelled = false;
    void import("katex").then((k) => {
      if (cancelled) return;
      try {
        setPreview(k.default.renderToString(latex || "\\;", { throwOnError: false, displayMode: true }));
      } catch {
        setPreview("");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [latex]);
  return (
    <Dialog open={Boolean(value)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="تحرير المعادلة" description="اكتب المعادلة بصيغة LaTeX." width={520}>
        <div className="space-y-3 px-5 pb-4">
          <Textarea dir="ltr" className="font-mono text-[13px]" value={latex} onChange={(e) => setLatex(e.target.value)} autoFocus />
          <div dir="ltr" className="min-h-14 overflow-x-auto rounded-md bg-sidebar p-3" dangerouslySetInnerHTML={{ __html: preview }} />
        </div>
        <DialogFooter>
          <button className="h-8 rounded-md px-3 text-[14px] text-fg-2 hover:bg-hover" onClick={onClose}>
            إلغاء
          </button>
          <button className="h-8 rounded-md bg-navy-700 px-3 text-[14px] font-medium text-white hover:bg-navy-600" onClick={() => onSave(latex)}>
            حفظ
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
