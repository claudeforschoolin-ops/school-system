import { Suspense } from "react";
import { WalletsPage } from "@/components/ops/pos";

export default function Page() {
  return (
    <Suspense>
      <WalletsPage />
    </Suspense>
  );
}
