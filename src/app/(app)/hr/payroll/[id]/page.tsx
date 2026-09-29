import { Suspense } from "react";
import { RunPage } from "@/components/hr/payroll";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <RunPage id={id} />
    </Suspense>
  );
}
