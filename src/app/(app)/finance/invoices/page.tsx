import { Suspense } from "react";
import { InvoicesHome } from "@/components/finance/invoices";

export default function Page() {
  return (
    <Suspense>
      <InvoicesHome />
    </Suspense>
  );
}
