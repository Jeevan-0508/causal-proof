import { z } from "zod";
import { NextResponse } from "next/server";
import { deterministicHistoricalAnswer, generateDeterministicAnswer } from "@/lib/copilot/deterministic";
import { CopilotModeSchema } from "@/lib/copilot/types";
import { replayDecisionPoint } from "@/lib/domain/replay";
import { openInvestigationRepository } from "@/lib/persistence/sqlite";
import { AuthError, closeAuth, enforceRequestSize, requireAuth, requireCsrf, requirePermission } from "@/lib/security/auth";

export const runtime = "nodejs";

const AnswerRequestSchema = z.object({ question: z.string().trim().min(3).max(4_000), decisionPointId: z.string().min(1).max(200).optional(), mode: CopilotModeSchema.default("deterministic") });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; const repo = openInvestigationRepository(); let auth = null;
  try { auth = requireAuth(request); requirePermission(auth, "investigation.read", id); return NextResponse.json({ run: repo.latestCopilotRun(id) }); }
  catch (error) { const status = error instanceof AuthError ? (error.status === 403 ? 404 : error.status) : 404; return NextResponse.json({ error: status === 404 ? "Investigation not found." : "Unable to load copilot run." }, { status }); }
  finally { closeAuth(auth); repo.close(); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; const repo = openInvestigationRepository(); let auth = null;
  try {
    enforceRequestSize(request, 120_000); auth = requireAuth(request); requireCsrf(request, auth); requirePermission(auth, "investigation.read", id);
    const rate = auth.security.rateLimit(`copilot:${auth.user.id}:${id}`, 30, 15); if (!rate.allowed) return NextResponse.json({ error: "Copilot request rate limit reached.", retryAfterSeconds: rate.retryAfterSeconds }, { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } });
    const parsed = AnswerRequestSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Invalid copilot request." }, { status: 400 });
    if (parsed.data.mode !== "deterministic") return NextResponse.json({ error: "Optional LLM mode is disabled in this deployment. Configure an approved provider and explicit operator consent before enabling it." }, { status: 503 });
    const investigation = repo.loadInvestigation(id); const replay = parsed.data.decisionPointId ? replayDecisionPoint(investigation, parsed.data.decisionPointId) : undefined;
    const answer = generateDeterministicAnswer({ investigation, question: parsed.data.question, replay });
    repo.persistCopilotRun(answer, auth.user.id); auth.security.appendSecurity("copilot.answer.created", auth.user.id, id, { runId: answer.runId, mode: answer.mode, inputHash: answer.inputHash, replayHash: answer.replayHash });
    return NextResponse.json({ answer, reviews: repo.listCopilotReviews(id) }, { status: 201 });
  } catch (error) { const status = error instanceof AuthError ? (error.status === 403 ? 404 : error.status) : 400; return NextResponse.json({ error: status === 404 ? "Investigation not found." : (error instanceof Error ? error.message : "Copilot request rejected.") }, { status }); }
  finally { closeAuth(auth); repo.close(); }
}
