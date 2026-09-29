import { Suspense } from "react";
import { SelfServicePage } from "@/components/hr/me";

export default function Page() {
  return (
    <Suspense>
      <SelfServicePage />
    </Suspense>
  );
}
