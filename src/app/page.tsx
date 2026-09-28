import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/current";

export default async function Index() {
  const session = await getCurrentSession();
  redirect(session ? "/home" : "/login");
}
