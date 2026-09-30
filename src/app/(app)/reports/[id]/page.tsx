import { Suspense } from "react";
import { ReportBuilderPage } from "@/components/analytics/reports";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <ReportBuilderPage id={id} />
    </Suspense>
  );
}
