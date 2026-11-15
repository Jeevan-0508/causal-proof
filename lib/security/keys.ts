import fs from "node:fs";
import path from "node:path";
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import { hashCanonical } from "../domain/canonical";
import type { TrustedKey } from "./types";
import { SecurityStore } from "./store";

export interface SigningKeyProvider {
  sign(keyId: string, payload: unknown): string;
  publicKey(keyId: string): KeyObject;
}

export class LocalFileKeyProvider implements SigningKeyProvider {
  readonly directory: string;
  constructor(directory: string) { if (!directory.trim()) throw new Error("A protected key directory is required."); this.directory = path.resolve(directory); fs.mkdirSync(this.directory, { recursive: true }); }
  rotate(security: SecurityStore, actorUserId: string, replacedKeyId?: string, now = new Date().toISOString()): TrustedKey {
    const keyId = `key-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const pair = generateKeyPairSync("ed25519"); const privatePem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(); const publicPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
    const privatePath = path.join(this.directory, `${keyId}.private.pem`); const publicPath = path.join(this.directory, `${keyId}.public.pem`);
    fs.writeFileSync(privatePath, privatePem, { encoding: "utf8", flag: "wx", mode: 0o600 }); fs.writeFileSync(publicPath, publicPem, { encoding: "utf8", flag: "wx", mode: 0o644 });
    const key: TrustedKey = { keyId, algorithm: "Ed25519", publicKeyPem: publicPem, status: "active", validFrom: now, revokedAt: null, replacedBy: null, createdAt: now }; security.registerKey(key, actorUserId);
    if (replacedKeyId) security.revokeKey(replacedKeyId, keyId, actorUserId);
    security.appendSecurity("key.rotated", actorUserId, null, { keyId, replacedKeyId: replacedKeyId ?? null }, now);
    return key;
  }
  sign(keyId: string, payload: unknown): string { const privatePem = fs.readFileSync(path.join(this.directory, `${keyId}.private.pem`), "utf8"); return sign(null, Buffer.from(hashCanonical(payload), "utf8"), createPrivateKey(privatePem)).toString("base64"); }
  publicKey(keyId: string): KeyObject { return createPublicKey(fs.readFileSync(path.join(this.directory, `${keyId}.public.pem`), "utf8")); }
}

export function defaultKeyDirectory(): string { const configured = process.env.CAUSAL_PROOF_KEY_DIR; if (configured) return configured; return path.join(process.cwd(), ".data", "keys"); }

export function verifySignedPayload(payload: unknown, signature: string, publicKeyPem: string): boolean { return verify(null, Buffer.from(hashCanonical(payload), "utf8"), createPublicKey(publicKeyPem), Buffer.from(signature, "base64")); }
