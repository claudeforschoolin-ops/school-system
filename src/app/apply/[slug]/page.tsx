import type { Metadata } from "next";
import { PublicApplyForm } from "@/components/admissions/public-apply-form";

export const metadata: Metadata = { title: "التقديم للقبول" };

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <main className="min-h-dvh bg-sidebar px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-[720px]">
        <PublicApplyForm slug={slug} />
      </div>
      <p className="mt-8 text-center text-[12px] text-fg-3">منصة — نظام إدارة المدارس المتكامل</p>
    </main>
  );
}
