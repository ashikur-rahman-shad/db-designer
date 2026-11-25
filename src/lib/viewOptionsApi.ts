import type { ViewOptions } from "@/domain/viewOptions";

/** Remember the view options for this user (shared by all diagrams). `keepalive` lets it finish during navigation. */
export async function saveViewOptions(options: ViewOptions): Promise<void> {
  try {
    await fetch("/api/settings/view", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(options), keepalive: true });
  } catch {
    /* a failed preference save must never disturb editing */
  }
}
