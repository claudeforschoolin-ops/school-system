import { Suspense } from "react";
import { RecruitmentPage } from "@/components/hr/recruitment";

export default function Page() {
  return (
    <Suspense>
      <RecruitmentPage />
    </Suspense>
  );
}
