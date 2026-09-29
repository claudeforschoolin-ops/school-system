import { Suspense } from "react";
import { EmployeeProfilePage } from "@/components/hr/employees";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <EmployeeProfilePage id={id} />
    </Suspense>
  );
}
