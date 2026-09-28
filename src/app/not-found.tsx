import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <EmptyState
        illustration="search"
        title="الصفحة غير موجودة"
        description="ربما نُقلت أو حُذفت، أو أن الرابط غير صحيح."
        action={
          <Link href="/home" className="inline-flex h-8 items-center rounded-md bg-navy-700 px-3 text-[14px] font-medium text-white hover:bg-navy-600">
            العودة إلى الرئيسية
          </Link>
        }
      />
    </main>
  );
}
