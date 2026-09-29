import { Suspense } from "react";
import { MyPickupsPage } from "@/components/ops/safety";

export default function Page() {
  return (
    <Suspense>
      <MyPickupsPage />
    </Suspense>
  );
}
