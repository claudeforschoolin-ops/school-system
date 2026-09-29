import { Suspense } from "react";
import { CanteenSettingsPage } from "@/components/ops/pos";

export default function Page() {
  return (
    <Suspense>
      <CanteenSettingsPage />
    </Suspense>
  );
}
