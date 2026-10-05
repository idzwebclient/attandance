import { redirect } from "next/navigation";
import { homeFor, requireRole } from "@/lib/auth";

export default async function Home() {
  const { profile } = await requireRole();
  redirect(homeFor(profile.role));
}
