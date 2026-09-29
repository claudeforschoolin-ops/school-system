import { Suspense } from "react";
import { InvoiceDetail } from "@/components/finance/invoices";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <InvoiceDetail key={id} id={id} />
    </Suspense>
  );
}
