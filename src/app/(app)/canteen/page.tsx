import { Suspense } from "react";
import { PosScreen } from "@/components/ops/pos";

export default function Page() {
  return (
    <Suspense>
      <PosScreen kind="CANTEEN" />
    </Suspense>
  );
}
