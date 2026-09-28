"use client";
/**
 * صفحة المساعد الذكي: تعريفه وقدراته وحدود صلاحياته وحالة الربط.
 * الربط الفعلي بواجهة الذكاء الاصطناعي مجدول في المرحلة ٨ (الجزء ٥١).
 */
import { Check, ShieldCheck } from "lucide-react";
import { AGENT_MAP } from "@/lib/agents";
import { PageIcon } from "@/components/ui/icon";
import { PageTopbar } from "@/components/shell/page-topbar";
import { useTabMeta } from "@/components/shell/tabs-bar";

export function AgentView({ agentKey }: { agentKey: string }) {
  const agent = AGENT_MAP.get(agentKey)!;
  useTabMeta(agent.name, agent.icon);
  return (
    <>
      <PageTopbar crumbs={[{ title: "المساعدون الأذكياء", icon: "lucide:bot" }, { title: agent.name, icon: agent.icon }]} />
      <div className="mx-auto w-full max-w-[760px] px-6 pb-24 pt-14 md:px-12">
        <span className="grid size-20 place-items-center rounded-full" style={{ background: `var(--tag-${agent.color}-bg)`, color: `var(--tag-${agent.color}-dot)` }}>
          <PageIcon icon={agent.icon} size={36} strokeWidth={1.5} />
        </span>
        <h1 className="mt-5 text-[34px] font-bold">{agent.name}</h1>
        <p className="mt-2 text-[16px] leading-7 text-fg-2">{agent.summary}</p>

        <div className="mt-8 rounded-lg bg-gold-50 p-4 text-[14px] leading-6 text-fg-2">
          <p className="font-medium text-fg">حالة المساعد: غير مربوط بعد</p>
          <p className="mt-1">
            يتطلب هذا المساعد ربط مزوّد ذكاء اصطناعي من إعدادات المدرسة، وهو مجدول في المرحلة ٨ من خطة التنفيذ. عند التفعيل سيعمل ضمن صلاحياتك فقط ويظهر كعنصر عائم في الصفحات ذات الصلة.
          </p>
        </div>

        <h2 className="mt-10 text-[13px] font-medium text-fg-3">ما سيقوم به</h2>
        <ul className="mt-3 space-y-2">
          {agent.capabilities.map((c) => (
            <li key={c} className="flex items-start gap-2.5 text-[15px]">
              <Check className="mt-1 size-4 shrink-0 text-teal-700" />
              {c}
            </li>
          ))}
        </ul>

        <h2 className="mt-10 text-[13px] font-medium text-fg-3">ضوابط ثابتة</h2>
        <ul className="mt-3 space-y-2 text-[14px] leading-6 text-fg-2">
          <li className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-navy-700" />
            يجيب ويعمل على البيانات المسموح لك بالاطلاع عليها فقط.
          </li>
          <li className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-navy-700" />
            لا يعدّل أي بيانات مالية أو أكاديمية دون تأكيد صريح منك، وكل إجراء يُسجَّل في سجل التدقيق.
          </li>
        </ul>
      </div>
    </>
  );
}
