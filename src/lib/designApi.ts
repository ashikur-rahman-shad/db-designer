import type { Design, DesignVersion, DesignVersionSummary, VersionInfo } from "@/domain/types";
import { useEditor } from "@/store/editorStore";

const json = { "Content-Type": "application/json" };

// ---- Autosave: one save in flight at a time, always the latest state --------------------------------------
//
//  * The first change starts a short timer (FIRST_DELAY); further changes do NOT restart it, so continuous
//    editing is still saved regularly instead of waiting for you to stop.
//  * While a save request is running, nothing else is sent. Changes made meanwhile are merged: as soon as the
//    request finishes, exactly one more save is sent with the *latest* state (never the in-between states).
//  * Requests therefore never overlap, so an older state can never overwrite a newer one.
//  * A failed save is retried with a growing delay; the changes stay marked as unsaved until it succeeds.
//  * The UI never waits for any of this: it only shows the status text.
const FIRST_DELAY = 300;
const RETRY_DELAYS = [1000, 3000, 8000];

let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight: Promise<boolean> | null = null;
let synced = { seq: -1, rev: 0 }; // the last state known to be stored on the server
let failures = 0;

/** True when the editor holds changes that are not yet stored (or a save is running). */
export function hasUnsavedChanges(): boolean {
  const s = useEditor.getState();
  if (s.viewing) return false; // an old version is read-only: nothing to save
  // A freshly loaded design (rev 0) is by definition in sync.
  return s.rev !== (synced.seq === s.loadSeq ? synced.rev : 0);
}

async function putLatest(): Promise<void> {
  const { id, meta, data } = useEditor.getState();
  const body = JSON.stringify({ ...meta, data });
  const res = await fetch(`/api/designs/${id}`, {
    method: "PUT",
    headers: json,
    body,
    keepalive: body.length < 60_000, // lets small saves finish while the tab closes
  });
  if (!res.ok) throw new Error(String(res.status));
}

function pump(): Promise<boolean> {
  if (inFlight) return inFlight;
  if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
  const run = (async () => {
    // Loop: if more changes arrived while saving, save once more with the latest state.
    while (hasUnsavedChanges()) {
      const { loadSeq, rev, setSaveStatus } = useEditor.getState();
      setSaveStatus("saving");
      try {
        await putLatest();
        synced = { seq: loadSeq, rev };
        failures = 0;
      } catch {
        failures++;
        useEditor.getState().setSaveStatus("error");
        timer = setTimeout(() => { timer = undefined; void pump(); }, RETRY_DELAYS[Math.min(failures - 1, RETRY_DELAYS.length - 1)]);
        return false;
      }
    }
    useEditor.getState().setSaveStatus("saved");
    return true;
  })();
  inFlight = run.finally(() => { inFlight = null; });
  return inFlight;
}

/** Call after every change. Cheap and safe to call as often as you like. */
export function scheduleSave(): void {
  if (useEditor.getState().viewing) return;
  if (inFlight || timer !== undefined) return; // already saving (will pick up the latest) or a save is about to start
  timer = setTimeout(() => { timer = undefined; void pump(); }, FIRST_DELAY);
}

/** Save right now and wait until the latest state is stored. Returns false if it could not be saved. */
export async function saveNow(): Promise<boolean> {
  if (useEditor.getState().viewing) return false; // never overwrite the latest state from an old version
  if (!hasUnsavedChanges() && !inFlight) return true;
  return pump();
}

/** Test helper: forget all autosave state. */
export function resetAutosaveForTests(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined; inFlight = null; synced = { seq: -1, rev: 0 }; failures = 0;
}

/** Flush the latest edits, then snapshot them as the next version. */
export async function saveVersion(note: string): Promise<DesignVersionSummary> {
  if (!(await saveNow())) throw new Error("Could not save the latest changes.");
  const { id, rev } = useEditor.getState();
  const res = await fetch(`/api/designs/${id}/versions`, { method: "POST", headers: json, body: JSON.stringify({ note }) });
  if (!res.ok) throw new Error("Could not save the version.");
  const v = (await res.json()) as DesignVersionSummary;
  const st = useEditor.getState();
  st.setVersionInfo({ latest: v.version, changedSinceVersion: st.rev !== rev });
  return v;
}

export async function listVersions(): Promise<DesignVersionSummary[]> {
  const res = await fetch(`/api/designs/${useEditor.getState().id}/versions`);
  if (!res.ok) throw new Error("Could not load version history.");
  return res.json();
}

export async function fetchVersion(version: number): Promise<DesignVersion> {
  const res = await fetch(`/api/designs/${useEditor.getState().id}/versions/${version}`);
  if (!res.ok) throw new Error("Version not found.");
  return res.json();
}

/** Replace the latest edit state with a saved version. Returns the new latest state. */
export async function restoreVersion(version: number): Promise<{ design: Design; versionInfo: VersionInfo }> {
  const res = await fetch(`/api/designs/${useEditor.getState().id}/versions/${version}/restore`, { method: "POST" });
  if (!res.ok) throw new Error("Could not restore the version.");
  return (await res.json()) as { design: Design; versionInfo: VersionInfo };
}
