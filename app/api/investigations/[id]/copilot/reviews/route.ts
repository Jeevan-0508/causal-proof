import { randomUUID } from "node:crypto";
import { z } from "zod";
import { NextResponse } from "next/server";
import { ReviewAssignmentStatusSchema, ReviewDecisionSchema, type CopilotReview, type CopilotReviewAssignment } from "@/lib/copilot/types";
import { openInvestigationRepository } from "@/lib/persistence/sqlite";
import { AuthError, closeAuth, enforceRequestSize, requireAuth, requireCsrf, requirePermission } from "@/lib/security/auth";

export const runtime = "nodejs";

const ReviewRequestSchema = z.object({ suggestionId: z.string().min(1).max(200), decision: ReviewDecisionSchema.optional(), rationale: z.string().trim().min(3).max(4_000), assignedReviewerId: z.string().min(1).optional(), status: ReviewAssignmentStatusSchema.optional(), previousAssignmentId: z.string().min(1).nullable().optional() });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; const repo = openInvestigationRepository(); let auth = null;
  try { auth = requireAuth(request); requirePermission(auth, "investigation.read", id); const status = new URL(request.url).searchParams.get("status") as CopilotReviewAssignment["status"] | null; return NextResponse.json({ reviews: repo.listCopilotReviews(id), assignments: repo.listCopilotReviewAssignments(id, status ?? undefined) }); }
  catch (error) { const status = error instanceof AuthError ? (error.status === 403 ? 404 : error.status) : 404; return NextResponse.json({ error: status === 404 ? "Investigation not found." : "Unable to load copilot reviews." }, { status }); }
  finally { closeAuth(auth); repo.close(); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; const repo = openInvestigationRepository(); let auth = null;
  try {
    enforceRequestSize(request, 20_000); auth = requireAuth(request); requireCsrf(request, auth); requirePermission(auth, "copilot.review", id);
    const parsed = ReviewRequestSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Invalid copilot review." }, { status: 400 });
    if (parsed.data.assignedReviewerId) {
      requirePermission(auth, "copilot.review", id);
      if (!auth.security.membershipRole(id, parsed.data.assignedReviewerId)) throw new Error("Assigned reviewer is not a member of this investigation.");
      const assignment: CopilotReviewAssignment = { assignmentId: `assignment-${randomUUID()}`, investigationId: id, suggestionId: parsed.data.suggestionId, assignedReviewerId: parsed.data.assignedReviewerId, assignedBy: auth.user.id, status: parsed.data.status ?? "assigned", rationale: parsed.data.rationale, assignedAt: new Date().toISOString(), previousAssignmentId: parsed.data.previousAssignmentId ?? null };
      repo.assignCopilotReview(assignment); auth.security.appendSecurity("copilot.review.assigned", auth.user.id, id, { assignmentId: assignment.assignmentId, suggestionId: assignment.suggestionId, assignedReviewerId: assignment.assignedReviewerId });
      return NextResponse.json({ assignment }, { status: 201 });
    }
    if (!parsed.data.decision) return NextResponse.json({ error: "A review decision is required." }, { status: 400 });
    const review: CopilotReview = { reviewId: `review-${randomUUID()}`, investigationId: id, suggestionId: parsed.data.suggestionId, reviewerId: auth.user.id, decision: parsed.data.decision, rationale: parsed.data.rationale, reviewedAt: new Date().toISOString() };
    repo.persistCopilotReview(review); auth.security.appendSecurity("copilot.review.created", auth.user.id, id, { reviewId: review.reviewId, suggestionId: review.suggestionId, decision: review.decision });
    return NextResponse.json({ review }, { status: 201 });
  } catch (error) { const status = error instanceof AuthError ? (error.status === 403 ? 404 : error.status) : 400; return NextResponse.json({ error: status === 404 ? "Investigation not found." : (error instanceof Error ? error.message : "Copilot review rejected.") }, { status }); }
  finally { closeAuth(auth); repo.close(); }
}
