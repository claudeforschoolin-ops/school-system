import { Suspense } from "react";
import { FamiliesIndex } from "@/components/finance/family";

export default function Page() {
  return (
    <Suspense>
      <FamiliesIndex />
    </Suspense>
  );
}
