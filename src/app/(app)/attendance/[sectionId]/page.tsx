import { Suspense } from "react";
import { RollCallScreen } from "@/components/attendance/roll-call";

export default async function Page({ params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = await params;
  return (
    <Suspense>
      <RollCallScreen key={sectionId} sectionId={sectionId} />
    </Suspense>
  );
}
