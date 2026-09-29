import { Suspense } from "react";
import { SyllabusPage } from "@/components/academic/curriculum-pages";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <SyllabusPage id={id} />
    </Suspense>
  );
}
