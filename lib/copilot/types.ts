import { z } from "zod";

export const CopilotModeSchema = z.enum(["deterministic", "llm"]);
export type CopilotMode = z.infer<typeof CopilotModeSchema>;

export const ClaimKindSchema = z.enum([
  "direct_observation",
  "investigator_assertion",
  "supported_hypothesis",
  "contradictory_evidence",
  "model_generated_suggestion",
  "counterfactual_simulation",
]);
export type ClaimKind = z.infer<typeof ClaimKindSchema>;

export const EvidenceReferenceSchema = z.object({
  evidenceId: z.string().min(1),
  investigationId: z.string().min(1),
  source: z.string().min(1),
  status: z.enum(["active", "challenged", "withdrawn"]),
  observedAt: z.string().datetime({ offset: true }),
  availableAt: z.string().datetime({ offset: true }),
  relation: z.enum(["supporting", "contradicting", "context"]),
  rationale: z.string().min(1),
});
export type EvidenceReference = z.infer<typeof EvidenceReferenceSchema>;

export const GroundedClaimSchema = z.object({
  claimId: z.string().min(1),
  investigationId: z.string().min(1),
  text: z.string().min(1),
  kind: ClaimKindSchema,
  evidenceReferences: z.array(EvidenceReferenceSchema),
  sourceIdentifiers: z.array(z.string().min(1)),
  chronology: z.object({
    observedAt: z.array(z.string().datetime({ offset: true })),
    availableAt: z.array(z.string().datetime({ offset: true })),
    knowledgeCutoff: z.string().datetime({ offset: true }).nullable(),
  }),
  supportingRationale: z.string().min(1),
  contradictingRationale: z.string().min(1),
  missingContext: z.array(z.string()),
  uncertainty: z.string().min(1),
  mode: CopilotModeSchema,
  provider: z.string().min(1),
  modelVersion: z.string().min(1),
  knowledgeCutoff: z.string().datetime({ offset: true }).nullable(),
});
export type GroundedClaim = z.infer<typeof GroundedClaimSchema>;

export const HypothesisComparisonSchema = z.object({
  hypothesisId: z.string().min(1),
  label: z.string().min(1),
  causalStatus: z.enum(["established", "plausible", "unidentifiable"]),
  supportingEvidenceIds: z.array(z.string()),
  contradictingEvidenceIds: z.array(z.string()),
  missingEvidence: z.array(z.string()),
  assumptions: z.array(z.string()),
  confounders: z.array(z.string()),
  identificationLimitations: z.array(z.string()),
  humanReviewStatus: z.enum(["not_reviewed", "awaiting_review", "accepted", "rejected", "needs_more_evidence"]),
});
export type HypothesisComparison = z.infer<typeof HypothesisComparisonSchema>;

export const RecommendationSchema = z.object({
  actionId: z.string().min(1),
  investigationId: z.string().min(1),
  title: z.string().min(1),
  rationale: z.string().min(1),
  supportingEvidenceIds: z.array(z.string()),
  expectedInformationValue: z.enum(["high", "moderate", "low", "unknown"]),
  risksAndLimitations: z.array(z.string().min(1)),
  authorizationPolicy: z.string().min(1),
  reviewStatus: z.enum(["draft_suggestion", "awaiting_review", "accepted", "rejected", "needs_more_evidence"]),
  autonomousExecution: z.literal(false),
});
export type NextInvestigativeAction = z.infer<typeof RecommendationSchema>;

export const CopilotAnswerSchema = z.object({
  runId: z.string().min(1),
  investigationId: z.string().min(1),
  question: z.string().min(1),
  answer: z.string().min(1),
  claims: z.array(GroundedClaimSchema),
  hypotheses: z.array(HypothesisComparisonSchema),
  recommendations: z.array(RecommendationSchema),
  promptInjectionFlags: z.array(z.string()),
  mode: CopilotModeSchema,
  provider: z.string().min(1),
  modelVersion: z.string().min(1),
  knowledgeCutoff: z.string().datetime({ offset: true }).nullable(),
  replayId: z.string().min(1).nullable(),
  replayHash: z.string().min(1).nullable(),
  inputHash: z.string().min(1),
  generatedAt: z.string().datetime({ offset: true }),
});
export type CopilotAnswer = z.infer<typeof CopilotAnswerSchema>;

export const ReviewDecisionSchema = z.enum(["accepted", "rejected", "needs_more_evidence"]);
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;

export type CopilotReview = {
  reviewId: string;
  investigationId: string;
  suggestionId: string;
  reviewerId: string;
  decision: ReviewDecision;
  rationale: string;
  reviewedAt: string;
};

export const ReviewAssignmentStatusSchema = z.enum(["queued", "assigned", "reassigned", "completed", "cancelled"]);
export type ReviewAssignmentStatus = z.infer<typeof ReviewAssignmentStatusSchema>;

export type CopilotReviewAssignment = {
  assignmentId: string;
  investigationId: string;
  suggestionId: string;
  assignedReviewerId: string;
  assignedBy: string;
  status: ReviewAssignmentStatus;
  rationale: string;
  assignedAt: string;
  previousAssignmentId: string | null;
};

export type CopilotRun = {
  runId: string;
  investigationId: string;
  actorUserId: string;
  question: string;
  mode: CopilotMode;
  provider: string;
  modelVersion: string;
  knowledgeCutoff: string | null;
  replayId: string | null;
  replayHash: string | null;
  inputHash: string;
  answer: CopilotAnswer;
  createdAt: string;
};

export type PromptInjectionFinding = {
  evidenceId: string;
  finding: string;
  deterministic: true;
};
