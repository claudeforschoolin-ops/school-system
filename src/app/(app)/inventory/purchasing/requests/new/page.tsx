import { Suspense } from "react";
import { RequestEditor } from "@/components/ops/procurement";

export default function Page() {
  return (
    <Suspense>
      <RequestEditor />
    </Suspense>
  );
}
