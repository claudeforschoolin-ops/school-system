import { Suspense } from "react";
import { EosPage } from "@/components/hr/eos";

export default function Page() {
  return (
    <Suspense>
      <EosPage />
    </Suspense>
  );
}
