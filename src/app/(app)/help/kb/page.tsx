import { Suspense } from "react";
import { KnowledgeBasePage } from "@/components/governance/support";

export default function Page() {
  return (
    <Suspense>
      <KnowledgeBasePage />
    </Suspense>
  );
}
