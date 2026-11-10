import { NextResponse } from "next/server";
import { consumeAuthToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { nowIso, run } from "@/lib/db";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const target = new URL("/login", env.appUrl);

  if (!token) {
    target.searchParams.set("verified", "0");
    return NextResponse.redirect(target);
  }

  const row = consumeAuthToken(token, "verify_email");
  if (!row) {
    target.searchParams.set("verified", "0");
    return NextResponse.redirect(target);
  }

  run(`UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?`, nowIso(), row.user_id);
  logAudit({ action: "auth.email_verified", actorId: row.user_id });

  target.searchParams.set("verified", "1");
  return NextResponse.redirect(target);
}
