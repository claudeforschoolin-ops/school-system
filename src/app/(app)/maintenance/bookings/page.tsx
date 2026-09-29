import { Suspense } from "react";
import { BookingsPage } from "@/components/ops/maintenance";

export default function Page() {
  return (
    <Suspense>
      <BookingsPage />
    </Suspense>
  );
}
