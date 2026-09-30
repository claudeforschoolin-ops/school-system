import { Suspense } from "react";
import { SupportPage } from "@/components/governance/support";

export default function Page() {
  return (
    <Suspense>
      <SupportPage />
    </Suspense>
  );
}
