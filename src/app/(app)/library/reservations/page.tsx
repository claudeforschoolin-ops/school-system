import { Suspense } from "react";
import { ReservationsPage } from "@/components/ops/library";

export default function Page() {
  return (
    <Suspense>
      <ReservationsPage />
    </Suspense>
  );
}
