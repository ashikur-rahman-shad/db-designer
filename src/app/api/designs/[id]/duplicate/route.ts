import { NextResponse } from "next/server";
import { designRepository } from "@/server/designRepository";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const copy = designRepository.duplicate((await params).id);
  return copy ? NextResponse.json(copy, { status: 201 }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
