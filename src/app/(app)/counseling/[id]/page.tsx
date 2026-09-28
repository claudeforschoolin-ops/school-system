import { CaseDetail } from "@/components/student-ops/details";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CaseDetail key={id} id={id} />;
}
