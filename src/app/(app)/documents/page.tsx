import { Suspense } from "react";
import { DocumentsPage } from "@/components/governance/documents";

export default function Page() {
  return (
    <Suspense>
      <DocumentsPage />
    </Suspense>
  );
}
