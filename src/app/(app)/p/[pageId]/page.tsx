import { PageScreen } from "@/components/page/page-screen";

export default async function Page({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  return <PageScreen key={pageId} pageId={pageId} />;
}
