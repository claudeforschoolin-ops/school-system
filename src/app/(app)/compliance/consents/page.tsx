import { Suspense } from "react";
import { ConsentsPage } from "@/components/governance/compliance";

export default function Page() {
  return (
    <Suspense>
      <ConsentsPage />
    </Suspense>
  );
}
