import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

// Whitelist: the protocol docs the File menu can copy to the clipboard.
const FILES: Record<string, string> = { json: "JSON_PROTOCOL.md", sql: "SQL_COMMENT_PROTOCOL.md" };

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const file = FILES[(await params).name];
  if (!file) return new Response("Not found", { status: 404 });
  const text = await readFile(path.join(process.cwd(), "docs", file), "utf8").catch(() => null);
  if (text === null) return new Response("Not found", { status: 404 });
  return new Response(text, { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
