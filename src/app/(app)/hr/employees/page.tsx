import { Suspense } from "react";
import { EmployeesPage } from "@/components/hr/employees";

export default function Page() {
  return (
    <Suspense>
      <EmployeesPage />
    </Suspense>
  );
}
