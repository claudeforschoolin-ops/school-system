import { Suspense } from "react";
import { TransportSettingsPage } from "@/components/ops/transport";

export default function Page() {
  return (
    <Suspense>
      <TransportSettingsPage />
    </Suspense>
  );
}
