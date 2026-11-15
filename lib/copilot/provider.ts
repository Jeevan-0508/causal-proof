import { CopilotAnswerSchema, type CopilotAnswer, type CopilotMode, type EvidenceReference } from "./types";

export type ModelRequest = {
  investigationId: string;
  question: string;
  knowledgeCutoff: string | null;
  evidenceContext: Array<Record<string, unknown>>;
  policy: string;
};

export type ModelProvider = {
  providerId: string;
  modelVersion: string;
  generate(request: ModelRequest, signal: AbortSignal): Promise<unknown>;
};

export type OptionalModelConfig = {
  enabled: boolean;
  operatorConsent: boolean;
  provider?: ModelProvider;
  timeoutMs?: number;
};

export class ModelProviderError extends Error {}

export const disabledModelConfig: OptionalModelConfig = { enabled: false, operatorConsent: false };

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ModelProviderError("Model provider timed out.")), timeoutMs);
    const abort = () => { clearTimeout(timer); reject(new ModelProviderError("Model provider request aborted.")); };
    if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
    promise.then((value) => { clearTimeout(timer); signal.removeEventListener("abort", abort); resolve(value); }, (error) => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(error); });
  });
}

function validateReferences(answer: CopilotAnswer, authorizedEvidenceIds: Set<string>, investigationId: string): void {
  for (const claim of answer.claims) {
    if (claim.investigationId !== investigationId) throw new ModelProviderError("Model returned a cross-investigation claim.");
    if (claim.evidenceReferences.length === 0 && claim.kind !== "model_generated_suggestion") throw new ModelProviderError(`Unsupported model claim ${claim.claimId} has no evidence references.`);
    for (const reference of claim.evidenceReferences) {
      if (reference.investigationId !== investigationId || !authorizedEvidenceIds.has(reference.evidenceId)) throw new ModelProviderError(`Model returned an unauthorized or fabricated evidence citation: ${reference.evidenceId}.`);
    }
  }
}

function validateContext(request: ModelRequest, authorizedEvidenceIds: Set<string>): void {
  if (JSON.stringify(request.evidenceContext).length > 120_000) throw new ModelProviderError("Model context exceeds the bounded evidence size.");
  for (const item of request.evidenceContext) {
    if (item.investigationId !== request.investigationId || typeof item.evidenceId !== "string" || !authorizedEvidenceIds.has(item.evidenceId)) throw new ModelProviderError("Model context contains an unauthorized investigation record.");
    if (JSON.stringify(item).match(/private[_ -]?key|backup[_ -]?passphrase|session[_ -]?token|authorization\s*:/i)) throw new ModelProviderError("Model context contains a prohibited secret-like field.");
  }
}

export async function generateWithOptionalModel(config: OptionalModelConfig, request: ModelRequest, authorizedEvidenceIds: Set<string>): Promise<{ answer: CopilotAnswer; mode: CopilotMode; provider: string; modelVersion: string }> {
  if (!config.enabled || !config.operatorConsent || !config.provider) throw new ModelProviderError("Optional LLM mode is disabled; explicit operator consent and a provider are required.");
  validateContext(request, authorizedEvidenceIds);
  const controller = new AbortController();
  const raw = await withTimeout(config.provider.generate(request, controller.signal), config.timeoutMs ?? 10_000, controller.signal);
  if (JSON.stringify(raw).length > 200_000) throw new ModelProviderError("Model response exceeds the bounded output size.");
  const parsed = CopilotAnswerSchema.safeParse(raw);
  if (!parsed.success) throw new ModelProviderError("Model returned malformed structured output.");
  validateReferences(parsed.data, authorizedEvidenceIds, request.investigationId);
  return { answer: parsed.data, mode: "llm", provider: config.provider.providerId, modelVersion: config.provider.modelVersion };
}

export function validateEvidenceReferences(references: EvidenceReference[], authorizedEvidenceIds: Set<string>, investigationId: string): EvidenceReference[] {
  for (const reference of references) {
    if (reference.investigationId !== investigationId || !authorizedEvidenceIds.has(reference.evidenceId)) throw new ModelProviderError(`Unauthorized evidence reference: ${reference.evidenceId}.`);
  }
  return references;
}
