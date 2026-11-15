import { NextResponse } from "next/server";
import { exportInvestigationPackage, importInvestigationPackage, verifyInvestigationPackage } from "@/lib/persistence/package";
import { openInvestigationRepository } from "@/lib/persistence/sqlite";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const repo = openInvestigationRepository();
  try { return NextResponse.json(exportInvestigationPackage(repo, id)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to export package." }, { status: 404 }); }
  finally { repo.close(); }
}

export async function POST(request: Request) {
  const repo = openInvestigationRepository();
  try {
    const body = await request.json();
    const verification = verifyInvestigationPackage(body);
    if (!verification.valid) return NextResponse.json({ verification }, { status: 422 });
    const investigation = importInvestigationPackage(repo, body);
    return NextResponse.json({ investigation, verification }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to import package." }, { status: 400 }); }
  finally { repo.close(); }
}
