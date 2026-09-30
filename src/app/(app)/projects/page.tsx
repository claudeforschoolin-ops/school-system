import { Suspense } from "react";
import { ProjectsPage } from "@/components/governance/projects";

export default function Page() {
  return (
    <Suspense>
      <ProjectsPage />
    </Suspense>
  );
}
