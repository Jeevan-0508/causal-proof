import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { hashCanonical } from "../domain/canonical";

export type SignatureAlgorithm = "Ed25519";

export type ForensicReceipt = {
  receiptVersion: 1;
  keyId: string;
  algorithm: SignatureAlgorithm;
  payloadHash: string;
  payload: unknown;
  signature: string;
};

export type SignatureVerification = {
  valid: boolean;
  keyId: string;
  algorithm: SignatureAlgorithm;
  trustAssumption: string;
  reason: string;
};

export type ForensicSigner = {
  keyId: string;
  algorithm: SignatureAlgorithm;
  privateKey: KeyObject;
  publicKey: KeyObject;
};

export function createEd25519Signer(keyId: string, privateKeyPem: string, publicKeyPem?: string): ForensicSigner {
  if (!keyId.trim() || !privateKeyPem.trim()) throw new Error("A key identifier and private key are required for optional signing.");
  const privateKey = createPrivateKey(privateKeyPem);
  const publicKey = publicKeyPem ? createPublicKey(publicKeyPem) : createPublicKey(privateKey);
  return { keyId, algorithm: "Ed25519", privateKey, publicKey };
}

function signingBytes(payload: unknown): Buffer { return Buffer.from(hashCanonical(payload), "utf8"); }

export function createForensicReceipt(payload: unknown, signer: ForensicSigner): ForensicReceipt {
  const payloadHash = hashCanonical(payload);
  const signature = sign(null, signingBytes(payload), signer.privateKey).toString("base64");
  return { receiptVersion: 1, keyId: signer.keyId, algorithm: signer.algorithm, payloadHash, payload, signature };
}

export function verifyForensicReceipt(receipt: ForensicReceipt, publicKey: KeyObject): SignatureVerification {
  const payloadHash = hashCanonical(receipt.payload);
  if (payloadHash !== receipt.payloadHash) return { valid: false, keyId: receipt.keyId, algorithm: receipt.algorithm, trustAssumption: "The verifier must obtain and trust the public key identified by keyId out of band.", reason: "Payload hash does not match the signed receipt." };
  if (receipt.algorithm !== "Ed25519") return { valid: false, keyId: receipt.keyId, algorithm: receipt.algorithm, trustAssumption: "Only standard Ed25519 verification is supported.", reason: "Unsupported signature algorithm." };
  const valid = verify(null, signingBytes(receipt.payload), publicKey, Buffer.from(receipt.signature, "base64"));
  return { valid, keyId: receipt.keyId, algorithm: receipt.algorithm, trustAssumption: "A valid signature establishes integrity relative to the trusted public key; it does not establish that the underlying evidence is truthful.", reason: valid ? "Signature and payload hash verified." : "Signature verification failed." };
}
