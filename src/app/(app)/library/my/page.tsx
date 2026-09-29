import { Suspense } from "react";
import { FamilyLibraryPage } from "@/components/ops/library";

export default function Page() {
  return (
    <Suspense>
      <FamilyLibraryPage />
    </Suspense>
  );
}
