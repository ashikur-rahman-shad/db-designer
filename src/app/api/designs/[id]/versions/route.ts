import { NextResponse } from "next/server";
import { designRepository } from "@/server/designRepository";
import { versionRepository } from "@/server/versionRepository";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const { id } = await params;
  if (!designRepository.get(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(versionRepository.list(id));
}

/** Save the design's current state as a new version (version number = previous + 1). */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const v = versionRepository.create(id, typeof body.note === "string" ? body.note : "");
  return v ? NextResponse.json(v, { status: 201 }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
