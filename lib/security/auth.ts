import { timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";
import { hashSecret, openSecurityStore, type SecurityStore } from "./store";
import type { Permission, Role, User } from "./types";

export const SESSION_COOKIE = "causal_proof_session";
export const SESSION_TTL_MINUTES = 480;

export type AuthenticatedRequest = { user: User; session: { id: string; userId: string; expiresAt: string; createdAt: string; lastSeenAt: string }; security: SecurityStore; csrfTokenHash: string };

function cookieValue(request: Request, name: string): string | null { const cookies = request.headers.get("cookie")?.split(";").map((part) => part.trim()) ?? []; const match = cookies.find((cookie) => cookie.startsWith(`${name}=`)); return match ? decodeURIComponent(match.slice(name.length + 1)) : null; }

export function clientKey(request: Request): string { return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local"; }
export function enforceRequestSize(request: Request, maxBytes = 2_000_000): void { const length = Number(request.headers.get("content-length") ?? 0); if (length > maxBytes) throw new AuthError("Request is too large", 413); }

export function authenticate(request: Request, security = openSecurityStore()): AuthenticatedRequest | null {
  const token = cookieValue(request, SESSION_COOKIE); if (!token) return null;
  const found = security.getSessionByToken(token); if (!found) return null;
  const user = security.getUserById(found.session.userId); if (!user || user.disabled) return null;
  return { user, session: found.session, security, csrfTokenHash: found.csrfTokenHash };
}

export function requireAuth(request: Request): AuthenticatedRequest {
  const security = openSecurityStore(); const auth = authenticate(request, security); if (!auth) { security.close(); throw new AuthError("Authentication required", 401); } return auth;
}

export function requireCsrf(request: Request, auth: AuthenticatedRequest): void {
  const csrf = request.headers.get("x-csrf-token"); if (!csrf || !safeEqual(hashSecret(csrf), auth.csrfTokenHash)) throw new AuthError("CSRF validation failed", 403);
}

function safeEqual(left: string, right: string): boolean { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }

const rolePermissions: Record<Role, readonly Permission[]> = {
  administrator: ["security.manage_users", "security.manage_keys", "investigation.create", "investigation.read", "investigation.write", "investigation.manage_members", "evidence.mutate", "replay.run", "branch.create", "investigation.export", "integrity.verify", "anchor.publish", "backup.manage", "retention.manage", "copilot.review"],
  lead_investigator: ["investigation.create", "investigation.read", "investigation.write", "investigation.manage_members", "evidence.mutate", "replay.run", "branch.create", "investigation.export", "integrity.verify", "anchor.publish", "backup.manage", "retention.manage", "copilot.review"],
  investigator: ["investigation.read", "evidence.mutate", "replay.run", "branch.create", "investigation.export", "integrity.verify", "copilot.review"],
  reviewer: ["investigation.read", "evidence.mutate", "replay.run", "investigation.export", "integrity.verify", "copilot.review"],
  read_only_auditor: ["investigation.read", "investigation.export", "integrity.verify"],
};

export function roleFor(auth: AuthenticatedRequest, investigationId?: string): Role | null { if (auth.user.role === "administrator") return "administrator"; return investigationId ? auth.security.membershipRole(investigationId, auth.user.id) : auth.user.role; }
export function isAllowed(auth: AuthenticatedRequest, permission: Permission, investigationId?: string): boolean { const role = roleFor(auth, investigationId); return Boolean(role && rolePermissions[role].includes(permission)); }
export function requirePermission(auth: AuthenticatedRequest, permission: Permission, investigationId?: string): void { if (!isAllowed(auth, permission, investigationId)) throw new AuthError("Access denied", 403); }

export function setSessionCookie(response: NextResponse, token: string): void { response.cookies.set({ name: SESSION_COOKIE, value: token, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: SESSION_TTL_MINUTES * 60 }); }
export function clearSessionCookie(response: NextResponse): void { response.cookies.set({ name: SESSION_COOKIE, value: "", httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 }); }

export class AuthError extends Error { constructor(message: string, readonly status: number) { super(message); this.name = "AuthError"; } }

export function closeAuth(auth: AuthenticatedRequest | null): void { auth?.security.close(); }
