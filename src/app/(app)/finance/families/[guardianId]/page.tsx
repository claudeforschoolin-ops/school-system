import { Suspense } from "react";
import { FamilyStatement } from "@/components/finance/family";

export default async function Page({ params }: { params: Promise<{ guardianId: string }> }) {
  const { guardianId } = await params;
  return (
    <Suspense>
      <FamilyStatement key={guardianId} guardianId={guardianId} />
    </Suspense>
  );
}
