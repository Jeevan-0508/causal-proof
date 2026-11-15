import { NextResponse } from "next/server";
import { authenticate, closeAuth } from "@/lib/security/auth";
import { openSecurityStore } from "@/lib/security/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const security = openSecurityStore(); const auth = authenticate(request, security);
  if (!auth) { security.close(); return NextResponse.json({ error: "Authentication required." }, { status: 401 }); }
  try { return NextResponse.json({ user: auth.user, session: auth.session }); } finally { closeAuth(auth); }
}
