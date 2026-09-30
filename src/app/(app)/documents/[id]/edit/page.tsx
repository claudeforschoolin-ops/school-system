import { DocumentEditorPage } from "@/components/governance/documents";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocumentEditorPage id={id} />;
}
