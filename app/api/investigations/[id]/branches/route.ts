import { NextResponse } from "next/server";
import { openInvestigationRepository } from "@/lib/persistence/sqlite";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const repo = openInvestigationRepository();
  try {
    const body = await request.json();
    const branch = repo.persistBranch(id, body.branch, body.simulation, String(body.actorId ?? "local-investigator"));
    return NextResponse.json({ branch, integrity: repo.verifyIntegrity(id) }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to persist branch." }, { status: 400 }); }
  finally { repo.close(); }
}
