import { Suspense } from "react";
import { RequestsPage } from "@/components/governance/compliance";

export default function Page() {
  return (
    <Suspense>
      <RequestsPage />
    </Suspense>
  );
}
