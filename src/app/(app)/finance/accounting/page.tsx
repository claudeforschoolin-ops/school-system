import { Suspense } from "react";
import { JournalPage } from "@/components/finance/accounting";

export default function Page() {
  return (
    <Suspense>
      <JournalPage />
    </Suspense>
  );
}
