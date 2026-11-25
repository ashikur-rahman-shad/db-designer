import { NextResponse } from "next/server";
import { versionRepository } from "@/server/versionRepository";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; version: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const { id, version } = await params;
  const v = versionRepository.get(id, Number(version));
  return v ? NextResponse.json(v) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
