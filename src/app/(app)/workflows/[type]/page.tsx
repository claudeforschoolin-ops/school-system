import { Suspense } from "react";
import { WorkflowEditorPage } from "@/components/governance/workflows";

export default async function Page({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  return (
    <Suspense>
      <WorkflowEditorPage type={type} />
    </Suspense>
  );
}
