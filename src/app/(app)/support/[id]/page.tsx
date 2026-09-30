import { TicketPage } from "@/components/governance/support";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TicketPage id={id} />;
}
