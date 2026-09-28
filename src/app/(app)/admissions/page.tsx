import { Suspense } from "react";
import { AdmissionsHome } from "@/components/admissions/admissions-home";

export default function Page() {
  return (
    <Suspense>
      <AdmissionsHome />
    </Suspense>
  );
}
