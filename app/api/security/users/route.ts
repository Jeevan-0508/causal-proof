import { NextResponse } from "next/server";
import { AuthError, closeAuth, enforceRequestSize, requireAuth, requireCsrf, requirePermission } from "@/lib/security/auth";
import { hashPassword } from "@/lib/security/store";
import { RoleSchema } from "@/lib/security/types";

export const runtime = "nodejs";

export async function GET(request: Request) { let auth = null; try { auth = requireAuth(request); requirePermission(auth, "security.manage_users"); return NextResponse.json({ users: auth.security.listUsers() }); } catch (error) { const status = error instanceof AuthError ? error.status : 400; return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to list users." }, { status }); } finally { closeAuth(auth); } }
export async function POST(request: Request) { let auth = null; try { enforceRequestSize(request, 50_000); auth = requireAuth(request); requireCsrf(request, auth); requirePermission(auth, "security.manage_users"); const body = await request.json(); const role = RoleSchema.parse(body.role); const user = auth.security.createUser({ username: String(body.username ?? ""), displayName: String(body.displayName ?? ""), role, passwordHash: await hashPassword(String(body.password ?? "")) }, auth.user.id); return NextResponse.json({ user }, { status: 201 }); } catch (error) { const status = error instanceof AuthError ? error.status : 400; return NextResponse.json({ error: error instanceof Error ? error.message : "User creation rejected." }, { status }); } finally { closeAuth(auth); } }
