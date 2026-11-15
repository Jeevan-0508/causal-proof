import { z } from "zod";

export const RoleSchema = z.enum(["administrator", "lead_investigator", "investigator", "reviewer", "read_only_auditor"]);
export type Role = z.infer<typeof RoleSchema>;

export const PermissionSchema = z.enum([
  "security.manage_users",
  "security.manage_keys",
  "investigation.create",
  "investigation.read",
  "investigation.write",
  "investigation.manage_members",
  "evidence.mutate",
  "replay.run",
  "branch.create",
  "investigation.export",
  "integrity.verify",
  "anchor.publish",
  "backup.manage",
  "retention.manage",
  "copilot.review",
]);
export type Permission = z.infer<typeof PermissionSchema>;

export const UserSchema = z.object({ id: z.string().min(1), username: z.string().min(3), displayName: z.string().min(1), role: RoleSchema, disabled: z.boolean(), createdAt: z.string(), updatedAt: z.string() });
export type User = z.infer<typeof UserSchema>;

export type Session = { id: string; userId: string; expiresAt: string; csrfToken: string; createdAt: string; lastSeenAt: string };
export type AuthContext = { user: User; session: Session; security: unknown };

export const RetentionPolicySchema = z.object({ retentionDays: z.number().int().positive(), legalHold: z.boolean(), backupRetentionDays: z.number().int().positive(), exportRetentionDays: z.number().int().positive() });
export type RetentionPolicy = z.infer<typeof RetentionPolicySchema>;

export type RetentionPreview = { status: "policy_missing" | "hold_active" | "eligible"; cutoff: string | null; eligibleEvidenceIds: string[]; preservedEvidenceIds: string[]; note: string };

export type SecurityActivity = { activityId: string; action: string; actorUserId: string | null; investigationId: string | null; recordedAt: string; payload: Record<string, string | number | boolean | null> };

export type TrustedKey = { keyId: string; algorithm: "Ed25519"; publicKeyPem: string; status: "active" | "revoked"; validFrom: string; revokedAt: string | null; replacedBy: string | null; createdAt: string };

export type AnchorCheckpoint = {
  checkpointId: string;
  investigationId: string;
  checkpointSequence: number;
  eventCount: number;
  ledgerHeadHash: string;
  schemaVersion: number;
  createdAt: string;
  keyId: string;
  algorithm: "Ed25519";
  signature: string;
  manifest: Record<string, unknown>;
  anchorPath: string;
};

export type AnchorVerification = {
  status: "externally_anchored" | "anchor_mismatch" | "signature_invalid" | "unknown_signer" | "missing_anchor" | "integrity_failure" | "authenticity_unknown";
  valid: boolean;
  checkpoint?: AnchorCheckpoint;
  issues: string[];
  trustNote: string;
};
