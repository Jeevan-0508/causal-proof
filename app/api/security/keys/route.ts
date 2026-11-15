import { NextResponse } from "next/server";
import { AuthError, closeAuth, requireAuth, requireCsrf, requirePermission } from "@/lib/security/auth";
import { defaultKeyDirectory, LocalFileKeyProvider } from "@/lib/security/keys";

export const runtime = "nodejs";

export async function GET(request: Request) { let auth = null; try { auth = requireAuth(request); requirePermission(auth, "security.manage_keys"); return NextResponse.json({ keys: auth.security.listKeys() }); } catch (error) { const status = error instanceof AuthError ? error.status : 400; return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to list trusted keys." }, { status }); } finally { closeAuth(auth); } }
export async function POST(request: Request) { let auth = null; try { auth = requireAuth(request); requireCsrf(request, auth); requirePermission(auth, "security.manage_keys"); const body = await request.json().catch(() => ({})); const key = new LocalFileKeyProvider(defaultKeyDirectory()).rotate(auth.security, auth.user.id, body.replacedKeyId ? String(body.replacedKeyId) : undefined); return NextResponse.json({ key }, { status: 201 }); } catch (error) { const status = error instanceof AuthError ? error.status : 400; return NextResponse.json({ error: error instanceof Error ? error.message : "Key rotation rejected." }, { status }); } finally { closeAuth(auth); } }
