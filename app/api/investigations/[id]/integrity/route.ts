import { NextResponse } from "next/server";
import { openInvestigationRepository } from "@/lib/persistence/sqlite";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const repo = openInvestigationRepository();
  try { return NextResponse.json(repo.verifyIntegrity(id)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to verify integrity." }, { status: 404 }); }
  finally { repo.close(); }
}
