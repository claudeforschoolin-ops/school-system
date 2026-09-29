import { Suspense } from "react";
import { DeskPage } from "@/components/ops/library";

export default function Page() {
  return (
    <Suspense>
      <DeskPage />
    </Suspense>
  );
}
