import { Suspense } from "react";
import { LibrarySettingsPage } from "@/components/ops/library";

export default function Page() {
  return (
    <Suspense>
      <LibrarySettingsPage />
    </Suspense>
  );
}
