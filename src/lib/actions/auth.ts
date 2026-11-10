"use server";

import { redirect } from "next/navigation";
import { logAudit } from "@/lib/audit";
import { destroySession, getSessionUser } from "@/lib/session";

export async function logoutAction() {
  const user = await getSessionUser();
  if (user) {
    logAudit({ action: "auth.logout", actorId: user.id, actorEmail: user.email });
  }
  await destroySession();
  redirect("/login?loggedOut=1");
}
