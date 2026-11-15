import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID, scryptSync, createCipheriv, createDecipheriv } from "node:crypto";
import Database from "better-sqlite3";
import { DATABASE_SCHEMA_VERSION, migrateDatabase } from "../persistence/schema";
import { InvestigationRepository } from "../persistence/sqlite";

export type EncryptedBackup = { format: "causal-proof-encrypted-backup"; version: 1; algorithm: "aes-256-gcm"; kdf: "scrypt"; createdAt: string; schemaVersion: number; salt: string; iv: string; authTag: string; ciphertext: string };

function requirePassphrase(passphrase: string): void { if (passphrase.length < 16) throw new Error("Backup passphrases must contain at least 16 characters."); }

export function createEncryptedBackup(filename: string, passphrase: string, createdAt = new Date().toISOString()): EncryptedBackup {
  requirePassphrase(passphrase); const database = new Database(filename); database.pragma("wal_checkpoint(TRUNCATE)"); const bytes = fs.readFileSync(filename); const schemaVersion = Number(database.pragma("user_version", { simple: true })); database.close(); const salt = randomBytes(16); const iv = randomBytes(12); const key = scryptSync(passphrase, salt, 32); const cipher = createCipheriv("aes-256-gcm", key, iv); const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]); return { format: "causal-proof-encrypted-backup", version: 1, algorithm: "aes-256-gcm", kdf: "scrypt", createdAt, schemaVersion, salt: salt.toString("base64url"), iv: iv.toString("base64url"), authTag: cipher.getAuthTag().toString("base64url"), ciphertext: ciphertext.toString("base64url") };
}

export function decryptBackup(backup: EncryptedBackup, passphrase: string): Buffer {
  requirePassphrase(passphrase); if (backup.format !== "causal-proof-encrypted-backup" || backup.version !== 1 || backup.algorithm !== "aes-256-gcm" || backup.kdf !== "scrypt") throw new Error("Unsupported backup format."); const key = scryptSync(passphrase, Buffer.from(backup.salt, "base64url"), 32); const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(backup.iv, "base64url")); decipher.setAuthTag(Buffer.from(backup.authTag, "base64url")); return Buffer.concat([decipher.update(Buffer.from(backup.ciphertext, "base64url")), decipher.final()]);
}

export function validateRestoredDatabase(bytes: Buffer): { schemaVersion: number; investigationIds: string[] } {
  const tempPath = path.join(process.cwd(), `.restore-validate-${randomUUID()}.sqlite`); fs.writeFileSync(tempPath, bytes, { flag: "wx" }); const db = new Database(tempPath); try { migrateDatabase(db); const rows = db.prepare("SELECT id FROM investigations ORDER BY id").all() as Array<{ id: string }>; return { schemaVersion: Number(db.pragma("user_version", { simple: true })), investigationIds: rows.map((row) => row.id) }; } finally { db.close(); fs.rmSync(tempPath, { force: true }); }
}

export function restoreEncryptedBackup(backup: EncryptedBackup, passphrase: string, targetFilename: string): { schemaVersion: number; investigationIds: string[] } {
  if (fs.existsSync(targetFilename)) throw new Error("Atomic restore requires a clean target path; refusing to overwrite an existing database.");
  if (backup.schemaVersion > DATABASE_SCHEMA_VERSION) throw new Error(`Backup schema ${backup.schemaVersion} is newer than this application supports (${DATABASE_SCHEMA_VERSION}).`);
  const bytes = decryptBackup(backup, passphrase); const validation = validateRestoredDatabase(bytes);
  if (validation.schemaVersion > DATABASE_SCHEMA_VERSION) throw new Error(`Restored schema ${validation.schemaVersion} is newer than this application supports (${DATABASE_SCHEMA_VERSION}).`);
  const tempPath = `${targetFilename}.${randomUUID()}.restore.tmp`; fs.mkdirSync(path.dirname(targetFilename), { recursive: true }); try { fs.writeFileSync(tempPath, bytes, { flag: "wx" }); fs.renameSync(tempPath, targetFilename); const repo = new InvestigationRepository({ filename: targetFilename }); for (const id of validation.investigationIds) { if (!repo.verifyIntegrity(id).valid) throw new Error(`Restored investigation failed integrity verification: ${id}`); } repo.close(); return validation; } catch (error) { fs.rmSync(tempPath, { force: true }); fs.rmSync(targetFilename, { force: true }); throw error; }
}
