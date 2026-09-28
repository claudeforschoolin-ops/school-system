import { AdmissionDetail } from "@/components/admissions/admission-detail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdmissionDetail key={id} id={id} />;
}
