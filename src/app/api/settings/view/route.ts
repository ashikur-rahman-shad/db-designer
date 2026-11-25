import { NextResponse } from "next/server";
import { DEFAULT_VIEW_OPTIONS } from "@/domain/viewOptions";
import { settingsRepository } from "@/server/settingsRepository";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(settingsRepository.getViewOptions() ?? DEFAULT_VIEW_OPTIONS);
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  return NextResponse.json(settingsRepository.setViewOptions(body));
}
