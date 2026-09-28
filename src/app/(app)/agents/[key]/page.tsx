import { notFound } from "next/navigation";
import { AGENT_MAP } from "@/lib/agents";
import { AgentView } from "@/components/misc/agent-view";

export default async function AgentPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!AGENT_MAP.has(key)) notFound();
  return <AgentView agentKey={key} />;
}
