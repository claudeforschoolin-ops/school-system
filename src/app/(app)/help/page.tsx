"use client";
import Link from "next/link";
import { BookOpen, Keyboard, LifeBuoy, ShieldCheck } from "lucide-react";
import { Kbd, modKey } from "@/components/ui/kbd";
import { PageTopbar } from "@/components/shell/page-topbar";
import { useTabMeta } from "@/components/shell/tabs-bar";

export default function HelpPage() {
  useTabMeta("المساعدة", "lucide:circle-help");
  const mod = modKey();
  return (
    <>
      <PageTopbar crumbs={[{ title: "المساعدة", icon: "lucide:circle-help" }]} />
      <div className="mx-auto w-full max-w-[760px] px-6 pb-24 pt-12 md:px-12">
        <h1 className="text-[36px] font-bold">المساعدة</h1>
        <p className="mt-2 text-[15px] text-fg-3">دليل سريع لاستخدام منصة إدارة المدرسة.</p>
        <section className="mt-10">
          <h2 className="flex items-center gap-2 text-[18px] font-bold"><BookOpen className="size-5 text-fg-3" /> المفاهيم الأساسية</h2>
          <ul className="mt-3 list-disc space-y-2 ps-6 text-[15px] leading-7 text-fg-2">
            <li><b>كل شيء صفحة:</b> لكل صفحة أو سجل أيقونة وعنوان ومحتوى وتعليقات وسجل نشاط.</li>
            <li><b>مساحات الفرق:</b> تظهر لك فقط المساحات التي يمنحك دورك أو عضويتك صلاحية عليها.</li>
            <li><b>قواعد البيانات:</b> جداول بعروض متعددة (جدول، لوحة، تقويم، خط زمني، معرض، قائمة) مع التصفية والفرز والتجميع والتصدير.</li>
            <li><b>الصفحات الخاصة:</b> لا يراها أحد غيرك ما لم تشاركها.</li>
          </ul>
        </section>
        <section className="mt-10">
          <h2 className="flex items-center gap-2 text-[18px] font-bold"><Keyboard className="size-5 text-fg-3" /> اختصارات مفيدة</h2>
          <ul className="mt-3 space-y-2 text-[15px] text-fg-2">
            <li className="flex items-center justify-between"><span>لوحة الأوامر والبحث</span><span className="flex gap-1"><Kbd>{mod}</Kbd><Kbd>K</Kbd></span></li>
            <li className="flex items-center justify-between"><span>محادثة جديدة</span><span className="flex gap-1"><Kbd>{mod}</Kbd><Kbd>O</Kbd></span></li>
            <li className="flex items-center justify-between"><span>قائمة الكتل في المحرر</span><Kbd>/</Kbd></li>
            <li className="flex items-center justify-between"><span>الإشارة إلى زميل أو صفحة</span><Kbd>@</Kbd></li>
            <li className="flex items-center justify-between"><span>كل الاختصارات</span><Kbd>?</Kbd></li>
          </ul>
        </section>
        <section className="mt-10">
          <h2 className="flex items-center gap-2 text-[18px] font-bold"><ShieldCheck className="size-5 text-fg-3" /> الخصوصية والأمان</h2>
          <p className="mt-3 text-[15px] leading-7 text-fg-2">كل عملية إنشاء أو تعديل أو حذف تُسجَّل في سجل تدقيق لا يمكن تعديله أو حذفه. يمكنك مراجعة جلساتك النشطة وإنهاؤها من <Link href="/settings/security" className="underline">إعدادات الأمان</Link>.</p>
        </section>
        <section id="support" className="mt-10">
          <h2 className="flex items-center gap-2 text-[18px] font-bold"><LifeBuoy className="size-5 text-fg-3" /> الدعم الفني</h2>
          <p className="mt-3 text-[15px] leading-7 text-fg-2">للإبلاغ عن مشكلة أضف طلباً في قاعدة «طلبات الدعم الفني» ضمن «مركز الإدارة والنظام»، أو تواصل مع مسؤول النظام عبر <Link href="/chat?new=1" className="underline">محادثة جديدة</Link>.</p>
        </section>
      </div>
    </>
  );
}
