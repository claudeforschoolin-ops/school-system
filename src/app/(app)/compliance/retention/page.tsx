import { Suspense } from "react";
import { RetentionPage } from "@/components/governance/compliance";

export default function Page() {
  return (
    <Suspense>
      <RetentionPage />
    </Suspense>
  );
}
