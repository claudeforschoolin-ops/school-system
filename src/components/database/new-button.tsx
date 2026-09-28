"use client";
/**
 * زر «جديد» المقسوم: إنشاء سجل (بالقالب الافتراضي إن وُجد) + سهم لاختيار القالب وإدارة القوالب.
 */
import { ChevronDown, FileText, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { PageIcon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Switch } from "@/components/ui/switch";
import type { DatabaseApi } from "./use-database";

export function NewButton({ api, onCreated, defaults }: { api: DatabaseApi; onCreated: (id: string) => void; defaults?: Record<string, unknown> }) {
  const templates = api.bundle?.templates ?? [];
  const defaultTemplate = templates.find((t) => t.isDefault);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const remove = trpc.database.deleteTemplate.useMutation({ onSuccess: () => api.refreshBundle() });
  if (!api.canEdit) return null;
  const create = async (templateId?: string | null) => {
    const row = await api.createRow({ templateId: templateId ?? null, values: defaults });
    onCreated(row.id);
  };
  return (
    <div className="flex items-center">
      <Button variant="primary" size="sm" className="rounded-e-none" onClick={() => void create(defaultTemplate?.id)}>
        جديد
      </Button>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="primary" size="sm" className="w-6 justify-center rounded-s-none border-s border-white/25 px-0" aria-label="اختيار قالب">
            <ChevronDown className="size-3.5" />
          </Button>
        </MenuTrigger>
        <MenuContent align="end" className="w-[260px]">
          <MenuLabel>القوالب</MenuLabel>
          {templates.map((t) => (
            <MenuItem key={t.id} icon={<PageIcon icon={t.icon} size={16} fallback={FileText} />} onSelect={() => void create(t.id)}>
              <span className="flex items-center gap-1.5">
                {t.name}
                {t.isDefault ? <Star className="size-3 fill-current text-gold-700" /> : null}
              </span>
            </MenuItem>
          ))}
          <MenuItem icon={<FileText className="size-4" />} onSelect={() => void create(null)}>
            صفحة فارغة
          </MenuItem>
          <MenuSeparator />
          {templates.map((t) => (
            <MenuItem key={`e-${t.id}`} icon={<Pencil className="size-4" />} onSelect={() => setEditing(t.id)}>
              تعديل «{t.name}»
            </MenuItem>
          ))}
          <MenuItem icon={<Plus className="size-4" />} onSelect={() => setEditing("new")}>
            قالب جديد
          </MenuItem>
        </MenuContent>
      </Menu>
      <TemplateDialog api={api} templateId={editing} onClose={() => setEditing(null)} onDelete={(id) => remove.mutate({ templateId: id })} />
    </div>
  );
}

function TemplateDialog({ api, templateId, onClose, onDelete }: { api: DatabaseApi; templateId: string | "new" | null; onClose: () => void; onDelete: (id: string) => void }) {
  const template = templateId && templateId !== "new" ? api.bundle?.templates.find((t) => t.id === templateId) : undefined;
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  if (templateId !== lastId) {
    setLastId(templateId);
    setName(template?.name ?? "");
    setTitle(template?.title ?? "");
    setIsDefault(template?.isDefault ?? false);
  }
  const save = trpc.database.upsertTemplate.useMutation({
    onSuccess: async () => {
      await api.refreshBundle();
      onClose();
    },
  });
  return (
    <Dialog open={Boolean(templateId)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={template ? "تعديل القالب" : "قالب جديد"} description="القالب يملأ العنوان والقيم الافتراضية والمحتوى عند إنشاء سجل جديد." width={460}>
        <div className="space-y-3 px-5 pb-4">
          <label className="block">
            <span className="mb-1 block text-[12px] text-fg-3">اسم القالب</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: طالب جديد" autoFocus />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] text-fg-3">العنوان الافتراضي (اختياري)</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="flex items-center justify-between text-[13px]">
            <span className="text-fg-2">القالب الافتراضي عند الضغط على «جديد»</span>
            <Switch size="sm" checked={isDefault} onChange={setIsDefault} />
          </label>
          <p className="text-[12px] leading-5 text-fg-3">تُحفظ القيم الافتراضية الحالية للقالب ومحتواه كما هي؛ لتعديل المحتوى أنشئ سجلاً من القالب ثم عدّله.</p>
        </div>
        <DialogFooter>
          {template ? (
            <Button
              variant="ghost"
              className="me-auto text-danger-700"
              icon={<Trash2 className="size-4" />}
              onClick={() => {
                onDelete(template.id);
                onClose();
              }}
            >
              حذف
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!name.trim()}
            onClick={() =>
              save.mutate({
                databaseId: api.databaseId,
                templateId: template?.id ?? null,
                name,
                title,
                isDefault,
                values: (template?.values as Record<string, unknown>) ?? {},
                content: template?.content ?? undefined,
              })
            }
          >
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
