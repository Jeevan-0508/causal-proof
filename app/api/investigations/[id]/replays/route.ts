import { NextResponse } from "next/server";
import { openInvestigationRepository } from "@/lib/persistence/sqlite";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const repo = openInvestigationRepository();
  try {
    const body = await request.json();
    repo.persistReplay(id, body.replay, String(body.actorId ?? "local-investigator"));
    return NextResponse.json({ ok: true, integrity: repo.verifyIntegrity(id) }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to persist replay." }, { status: 400 }); }
  finally { repo.close(); }
}
