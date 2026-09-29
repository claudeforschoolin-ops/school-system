import { Suspense } from "react";
import { OrgPage } from "@/components/hr/org";

export default function Page() {
  return (
    <Suspense>
      <OrgPage />
    </Suspense>
  );
}
