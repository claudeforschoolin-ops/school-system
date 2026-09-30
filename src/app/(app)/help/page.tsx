"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Compass, Keyboard, Library, LifeBuoy, ShieldCheck } from "lucide-react";
import { TOURS } from "@/lib/tours";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Kbd, modKey } from "@/components/ui/kbd";
import { Tag } from "@/components/ui/tag";
import { PageTopbar } from "@/components/shell/page-topbar";
import { useApp } from "@/components/shell/app-context";
import { useTabMeta } from "@/components/shell/tabs-bar";

export default function HelpPage() {
  useTabMeta("المساعدة", "lucide:circle-help");
  const mod = modKey();
  const router = useRouter();
  const { data, can } = useApp();
  const utils = trpc.useUtils();
  const reset = trpc.support.completeTour.useMutation({ onSuccess: () => void utils.account.context.invalidate() });
  const done = new Set(data.user.preferences.toursDone ?? []);
  const tours = TOURS.filter((t) => !t.module || can(t.module, "view"));
  const articles = trpc.support.articles.useQuery({ q: null, category: null }, { staleTime: 60_000 });
  const popular = [...(articles.data?.rows ?? [])].filter((a) => a.isPublished).sort((a, b) => b.views - a.views).slice(0, 6);
  return (
    <>
      <PageTopbar crumbs={[{ title: "المساعدة", icon: "lucide:circle-help" }]} />
      <div className="mx-auto w-full max-w-[760px] px-6 pb-24 pt-12 md:px-12">
        <h1 className="text-[36px] font-bold">المساعدة</h1>
        <p className="mt-2 text-[15px] text-fg-3">دليل سريع لاستخدام منصة إدارة المدرسة، وجولات إرشادية، وقاعدة معرفة، والدعم الفني.</p>

        <section className="mt-10" aria-labelledby="tours-h">
          <h2 id="tours-h" className="flex items-center gap-2 text-[18px] font-bold"><Compass className="size-5 text-fg-3" aria-hidden /> الجولات الإرشادية</h2>
          <ul className="mt-3 space-y-2">
            {tours.map((t) => (
              <li key={t.key} className="flex items-center justify-between gap-3 rounded-lg bg-card p-3 shadow-card">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[15px] font-medium">{t.title}{done.has(t.key) ? <Tag color="green">شوهدت</Tag> : null}</p>
                  <p className="text-[13px] text-fg-3">{t.description}</p>
                </div>
                <Button size="sm" variant="secondary" loading={reset.isPending && reset.variables?.key === t.key} onClick={() => reset.mutate({ key: t.key, reset: true }, { onSuccess: () => router.push(`${t.path}?tour=${t.key}`) })}>{done.has(t.key) ? "إعادة الجولة" : "ابدأ الجولة"}</Button>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10" aria-labelledby="kb-h">
          <div className="flex items-center justify-between gap-2">
            <h2 id="kb-h" className="flex items-center gap-2 text-[18px] font-bold"><Library className="size-5 text-fg-3" aria-hidden /> قاعدة المعرفة</h2>
            <Link href="/help/kb" className="text-[14px] text-navy-600 underline">كل المقالات</Link>
          </div>
          {popular.length ? (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {popular.map((a) => (
                <li key={a.id}><Link href={`/help/kb/${a.slug}`} className="block rounded-lg bg-card p-3 text-[14px] font-medium shadow-card hover:shadow-card-hover">{a.title}<span className="block text-[12px] font-normal text-fg-3">{a.category}</span></Link></li>
              ))}
            </ul>
          ) : <p className="mt-3 text-[14px] text-fg-3">{articles.isLoading ? "…" : "لا مقالات منشورة بعد."}</p>}
        </section>

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
          <p className="mt-3 text-[15px] leading-7 text-fg-2">كل عملية إنشاء أو تعديل أو حذف تُسجَّل في سجل تدقيق لا يمكن تعديله أو حذفه. راجع سياسة الخصوصية وموافقاتك واطلب نسخة من بياناتك من <Link href="/privacy" className="underline">خصوصيتي</Link>، وجلساتك النشطة من <Link href="/settings/security" className="underline">إعدادات الأمان</Link>.</p>
        </section>
        <section id="support" className="mt-10">
          <h2 className="flex items-center gap-2 text-[18px] font-bold"><LifeBuoy className="size-5 text-fg-3" /> الدعم الفني</h2>
          <p className="mt-3 text-[15px] leading-7 text-fg-2">لم تجد الحل في قاعدة المعرفة؟ افتح تذكرة دعم وتابع ردود الفريق حتى الحل، وقيّم الخدمة عند الإغلاق.</p>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" onClick={() => router.push("/support?new=1&from=/help")}>فتح تذكرة دعم</Button>
            <Button variant="secondary" onClick={() => router.push("/support")}>تذاكري</Button>
          </div>
        </section>
      </div>
    </>
  );
}
