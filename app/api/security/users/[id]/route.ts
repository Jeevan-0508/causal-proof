import { NextResponse } from "next/server";
import { AuthError, closeAuth, enforceRequestSize, requireAuth, requireCsrf, requirePermission } from "@/lib/security/auth";
import { RoleSchema } from "@/lib/security/types";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { const { id } = await context.params; let auth = null; try { enforceRequestSize(request, 20_000); auth = requireAuth(request); requireCsrf(request, auth); requirePermission(auth, "security.manage_users"); const body = await request.json(); const user = body.role ? auth.security.updateUserRole(id, RoleSchema.parse(body.role), auth.user.id) : auth.security.setUserDisabled(id, Boolean(body.disabled), auth.user.id); return NextResponse.json({ user }); } catch (error) { const status = error instanceof AuthError ? error.status : 400; return NextResponse.json({ error: error instanceof Error ? error.message : "User security change rejected." }, { status }); } finally { closeAuth(auth); } }
