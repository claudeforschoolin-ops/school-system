import { Suspense } from "react";
import { PoliciesPage } from "@/components/governance/compliance";

export default function Page() {
  return (
    <Suspense>
      <PoliciesPage />
    </Suspense>
  );
}
