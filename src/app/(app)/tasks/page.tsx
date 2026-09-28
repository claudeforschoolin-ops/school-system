import type { Metadata } from "next";
import { MyTasksView } from "@/components/misc/my-tasks";

export const metadata: Metadata = { title: "مهامي" };

export default function TasksPage() {
  return <MyTasksView />;
}
