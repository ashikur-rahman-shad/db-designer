import { NextResponse } from "next/server";
import { versionRepository } from "@/server/versionRepository";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; version: string }> };

/** Replace the latest edit state with a saved version (history is kept untouched). */
export async function POST(_: Request, { params }: Ctx) {
  const { id, version } = await params;
  const d = versionRepository.restore(id, Number(version));
  return d
    ? NextResponse.json({ design: d, versionInfo: versionRepository.info(id) })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}
