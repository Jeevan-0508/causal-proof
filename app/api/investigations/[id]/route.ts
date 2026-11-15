import { NextResponse } from "next/server";
import { openInvestigationRepository } from "@/lib/persistence/sqlite";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const repo = openInvestigationRepository();
  try { return NextResponse.json({ investigation: repo.loadInvestigation(id), integrity: repo.verifyIntegrity(id), branches: repo.listBranches(id) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Investigation not found." }, { status: 404 }); }
  finally { repo.close(); }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const repo = openInvestigationRepository();
  try {
    const body = await request.json();
    if (body?.investigation?.id !== id) throw new Error("Investigation ID cannot change during save.");
    const investigation = repo.saveInvestigation(body.investigation, String(body.actorId ?? "local-investigator"));
    return NextResponse.json({ investigation, integrity: repo.verifyIntegrity(id) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save investigation." }, { status: 400 }); }
  finally { repo.close(); }
}
