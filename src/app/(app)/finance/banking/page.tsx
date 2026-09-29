import { Suspense } from "react";
import { BankingHome } from "@/components/finance/banking";

export default function Page() {
  return (
    <Suspense>
      <BankingHome />
    </Suspense>
  );
}
