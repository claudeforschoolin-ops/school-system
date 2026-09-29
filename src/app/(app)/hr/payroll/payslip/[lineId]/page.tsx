import { Suspense } from "react";
import { PayslipPage } from "@/components/hr/payroll";

export default async function Page({ params }: { params: Promise<{ lineId: string }> }) {
  const { lineId } = await params;
  return (
    <Suspense>
      <PayslipPage lineId={lineId} />
    </Suspense>
  );
}
