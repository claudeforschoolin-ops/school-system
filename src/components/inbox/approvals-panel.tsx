"use client";
/** الموافقات: الطلبات بانتظار اعتمادي + طلباتي، مع مسار الخطوات */
import { Check, Circle, CircleCheck, CircleX, X } from "lucide-react";
import { useState } from "react";
import { formatRelative } from "@/lib/dates";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { usePrefs } from "@/components/shell/app-context";

type Req = RouterOutputs["approval"]["list"]["awaitingMe"][number];

const STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "قيد الاعتماد", color: "orange" },
  APPROVED: { label: "معتمد", color: "green" },
  REJECTED: { label: "مرفوض", color: "red" },
  CANCELLED: { label: "ملغى", color: "gray" },
};

export function ApprovalsPanel() {
  const list = trpc.approval.list.useQuery();
  if (list.isLoading) return <SkeletonLines lines={4} className="mt-5" />;
  const data = list.data;
  if (!data) return null;
  return (
    <div className="mt-5 space-y-6">
      <section>
        <h2 className="mb-2 text-[13px] font-medium text-fg-3">بانتظار اعتمادك ({new Intl.NumberFormat("ar-SA").format(data.awaitingMe.length)})</h2>
        {data.awaitingMe.length ? (
          <div className="space-y-2">
            {data.awaitingMe.map((r) => (
              <RequestCard key={r.id} req={r} actionable users={data.users} />
            ))}
          </div>
        ) : (
          <p className="text-[14px] text-fg-3">لا توجد طلبات بانتظارك.</p>
        )}
      </section>
      {data.mine.length ? (
        <section>
          <h2 className="mb-2 text-[13px] font-medium text-fg-3">طلباتي</h2>
          <div className="space-y-2">
            {data.mine.map((r) => (
              <RequestCard key={r.id} req={r} users={data.users} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function RequestCard({ req, actionable, users }: { req: Req; actionable?: boolean; users: Array<{ id: string; name: string; avatarColor: string }> }) {
  const prefs = usePrefs();
  const utils = trpc.useUtils();
  const [decision, setDecision] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [comment, setComment] = useState("");
  const decide = trpc.approval.decide.useMutation({
    onSuccess: async () => {
      toast.success(decision === "APPROVED" ? "تم الاعتماد" : "تم الرفض");
      setDecision(null);
      await Promise.all([utils.approval.list.invalidate(), utils.workspace.home.invalidate(), utils.notification.invalidate()]);
    },
  });
  const cancel = trpc.approval.cancel.useMutation({ onSuccess: () => utils.approval.list.invalidate() });
  const status = STATUS[req.status]!;
  return (
    <div className="rounded-lg p-4 shadow-card">
      <div className="flex items-start gap-3">
        <Avatar name={req.requestedBy?.name ?? "؟"} color={req.requestedBy?.avatarColor} size={30} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-medium">{req.title}</p>
            <Tag color={status.color}>{status.label}</Tag>
          </div>
          {req.description ? <p className="mt-1 text-[13px] leading-5 text-fg-2">{req.description}</p> : null}
          <p className="mt-1 text-[12px] text-fg-3">
            قدّمه {req.requestedBy?.name} · {formatRelative(req.createdAt, new Date(), prefs.digits)}
          </p>
          <ol className="mt-3 flex flex-wrap items-center gap-2">
            {req.steps.map((s, i) => {
              const decidedBy = users.find((u) => u.id === s.decidedById);
              return (
                <li key={s.id} className="flex items-center gap-2">
                  {i > 0 ? <span className="h-px w-5 bg-line-strong" /> : null}
                  <span
                    className={cn(
                      "flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px]",
                      s.status === "APPROVED" && "bg-success-50 text-success-800",
                      s.status === "REJECTED" && "bg-danger-50 text-danger-700",
                      s.status === "PENDING" && req.currentStep === s.order && req.status === "PENDING" && "bg-warning-50 text-warning-700",
                      s.status === "PENDING" && !(req.currentStep === s.order && req.status === "PENDING") && "bg-hover text-fg-3",
                    )}
                    title={s.comment ?? undefined}
                  >
                    {s.status === "APPROVED" ? <CircleCheck className="size-3.5" /> : s.status === "REJECTED" ? <CircleX className="size-3.5" /> : <Circle className="size-3.5" />}
                    {s.name}
                    {decidedBy ? ` · ${decidedBy.name.replace(/^(أ|م|د)\.\s*/, "").split(" ")[0]}` : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      {actionable ? (
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => setDecision("REJECTED")}>
            رفض
          </Button>
          <Button size="sm" variant="teal" icon={<Check className="size-4" />} onClick={() => setDecision("APPROVED")}>
            اعتماد
          </Button>
        </div>
      ) : req.status === "PENDING" ? (
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate({ requestId: req.id })}>
            إلغاء الطلب
          </Button>
        </div>
      ) : null}
      <Dialog open={decision !== null} onOpenChange={(o) => !o && setDecision(null)}>
        <DialogContent title={decision === "APPROVED" ? "اعتماد الطلب" : "رفض الطلب"} description={req.title} width={440}>
          <div className="px-5 pb-3">
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={decision === "REJECTED" ? "سبب الرفض (مستحسن)" : "ملاحظة (اختياري)"} />
            <p className="mt-2 text-[12px] text-fg-3">يُسجَّل القرار في سجل التدقيق مع اسمك ووقت الاعتماد.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDecision(null)}>
              إلغاء
            </Button>
            <Button variant={decision === "APPROVED" ? "teal" : "danger"} loading={decide.isPending} onClick={() => decision && decide.mutate({ requestId: req.id, decision, comment: comment || undefined })}>
              {decision === "APPROVED" ? "تأكيد الاعتماد" : "تأكيد الرفض"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
