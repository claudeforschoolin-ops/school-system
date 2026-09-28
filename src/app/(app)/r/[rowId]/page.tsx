import { RowScreen } from "@/components/page/row-screen";

export default async function RowPage({ params }: { params: Promise<{ rowId: string }> }) {
  const { rowId } = await params;
  return <RowScreen key={rowId} rowId={rowId} />;
}
