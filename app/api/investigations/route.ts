import { NextResponse } from "next/server";
import { demoInvestigation } from "@/lib/domain/demo";
import { openInvestigationRepository } from "@/lib/persistence/sqlite";

export const runtime = "nodejs";

export async function GET() {
  const repo = openInvestigationRepository();
  try { return NextResponse.json({ investigations: repo.listInvestigations() }); }
  finally { repo.close(); }
}

export async function POST(request: Request) {
  const repo = openInvestigationRepository();
  try {
    const body = await request.json().catch(() => ({}));
    const investigation = repo.createInvestigation(body?.investigation ?? demoInvestigation, String(body?.actorId ?? "local-investigator"));
    return NextResponse.json({ investigation }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create investigation." }, { status: 400 }); }
  finally { repo.close(); }
}
