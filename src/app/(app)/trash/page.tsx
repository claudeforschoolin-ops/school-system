import type { Metadata } from "next";
import { TrashView } from "@/components/misc/trash";

export const metadata: Metadata = { title: "المهملات" };

export default function TrashPage() {
  return <TrashView />;
}
