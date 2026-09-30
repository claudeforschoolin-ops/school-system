import { Suspense } from "react";
import { AutomationEditorPage } from "@/components/governance/automations";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <AutomationEditorPage id={id} />
    </Suspense>
  );
}
