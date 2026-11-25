import { NextResponse } from "next/server";
import { normalizeDesignData } from "@/domain/factory";
import { designRepository } from "@/server/designRepository";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const d = designRepository.get((await params).id);
  return d ? NextResponse.json(d) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PUT(req: Request, { params }: Ctx) {
  const body = await req.json();
  const d = designRepository.update((await params).id, {
    name: body.name,
    shortDescription: body.shortDescription,
    longDescription: body.longDescription,
    data: body.data ? normalizeDesignData(body.data) : undefined,
  });
  return d ? NextResponse.json(d) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function DELETE(_: Request, { params }: Ctx) {
  return designRepository.delete((await params).id)
    ? new NextResponse(null, { status: 204 })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}
