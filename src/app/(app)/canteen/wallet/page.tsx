import { Suspense } from "react";
import { FamilyWalletPage } from "@/components/ops/pos";

export default function Page() {
  return (
    <Suspense>
      <FamilyWalletPage />
    </Suspense>
  );
}
