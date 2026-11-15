import { NextResponse } from "next/server";
import { AuthError, closeAuth, requireAuth, requirePermission } from "@/lib/security/auth";

export const runtime = "nodejs";

export async function GET(request: Request) { let auth = null; try { auth = requireAuth(request); requirePermission(auth, "security.manage_users"); return NextResponse.json({ activity: auth.security.listSecurityActivity(), integrity: auth.security.verifySecurityActivity() }); } catch (error) { const status = error instanceof AuthError ? error.status : 400; return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to list security activity." }, { status }); } finally { closeAuth(auth); } }
