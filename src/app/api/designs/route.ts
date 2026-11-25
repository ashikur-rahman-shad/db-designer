import { NextResponse } from "next/server";
import { normalizeDesignData } from "@/domain/factory";
import { designRepository } from "@/server/designRepository";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(designRepository.list());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const design = designRepository.create({
    name: body.name,
    shortDescription: body.shortDescription,
    longDescription: body.longDescription,
    data: body.data ? normalizeDesignData(body.data) : undefined,
  });
  return NextResponse.json(design, { status: 201 });
}
