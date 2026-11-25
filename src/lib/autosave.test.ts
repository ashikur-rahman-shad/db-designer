import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, newColumn, newTable } from "@/domain/factory";
import { useEditor } from "@/store/editorStore";
import { hasUnsavedChanges, resetAutosaveForTests, saveNow, scheduleSave } from "./designApi";

/** A fake network: every PUT stays pending until the test resolves / rejects it. */
function fakeNetwork() {
  const calls: { name: string; resolve: (ok?: boolean) => void; fail: () => void }[] = [];
  vi.stubGlobal("fetch", vi.fn((_url: string, init: { body: string }) => {
    return new Promise((resolve, reject) => {
      calls.push({
        name: JSON.parse(init.body).data.tables[0].name,
        resolve: (ok = true) => resolve({ ok }),
        fail: () => reject(new Error("offline")),
      });
    });
  }));
  return calls;
}

const rename = (name: string) => {
  useEditor.getState().updateTable(useEditor.getState().data.tables[0].id, { name });
  scheduleSave(); // (the editor does this from a store subscription)
};
const status = () => useEditor.getState().saveStatus;
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  resetAutosaveForTests();
  useEditor.getState().load({
    id: "d1", name: "n", shortDescription: "", longDescription: "", createdAt: "", updatedAt: "",
    data: { tableGroups: [], tables: [newTable({ name: "start", items: [newColumn({ name: "id" })] })], relationships: [], settings: { ...DEFAULT_SETTINGS } },
  }, undefined, null);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("autosave", () => {
  it("saves a change in the background after a short delay (no request before it)", async () => {
    const calls = fakeNetwork();
    rename("a");
    expect(hasUnsavedChanges()).toBe(true);
    await vi.advanceTimersByTimeAsync(299);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2);
    expect(calls.map((c) => c.name)).toEqual(["a"]);
    expect(status()).toBe("saving");
    calls[0].resolve(); await flush();
    expect(status()).toBe("saved");
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("waits for the running save; changes made meanwhile are merged into ONE follow-up with the latest state", async () => {
    const calls = fakeNetwork();
    rename("first");
    await vi.advanceTimersByTimeAsync(300);
    expect(calls.map((c) => c.name)).toEqual(["first"]);

    // more edits (and lots of timer time) while the first request is still pending
    rename("second"); rename("third"); rename("latest");
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(1); // nothing was sent in parallel
    expect(status()).toBe("saving");

    calls[0].resolve(); await flush();
    expect(calls.map((c) => c.name)).toEqual(["first", "latest"]); // intermediate states were never sent
    expect(hasUnsavedChanges()).toBe(true);

    calls[1].resolve(); await flush();
    expect(status()).toBe("saved");
    expect(hasUnsavedChanges()).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it("requests never overlap, however much is edited", async () => {
    const calls = fakeNetwork();
    let open = 0, maxOpen = 0;
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation((_u: string, init: { body: string }) => {
      open++; maxOpen = Math.max(maxOpen, open);
      return new Promise((resolve) => setTimeout(() => { open--; calls.push({ name: JSON.parse(init.body).data.tables[0].name, resolve: () => {}, fail: () => {} }); resolve({ ok: true }); }, 700));
    });
    for (let i = 0; i < 40; i++) { rename(`n${i}`); await vi.advanceTimersByTimeAsync(100); }
    await vi.advanceTimersByTimeAsync(5000);
    expect(maxOpen).toBe(1);
    expect(calls.at(-1)!.name).toBe("n39"); // the final state is what ended up saved
    expect(hasUnsavedChanges()).toBe(false);
    expect(status()).toBe("saved");
  });

  it("does not starve: continuous editing is still saved regularly", async () => {
    const calls = fakeNetwork();
    for (let i = 0; i < 20; i++) {
      rename(`keystroke${i}`);
      await vi.advanceTimersByTimeAsync(250); // typing faster than the old 700 ms pause
      calls.filter((c) => c).forEach((c) => c.resolve());
    }
    expect(calls.length).toBeGreaterThan(3); // before: zero saves until the typing stopped
  });

  it("a failed save keeps the changes unsaved, shows the error and retries with the latest state", async () => {
    const calls = fakeNetwork();
    rename("x");
    await vi.advanceTimersByTimeAsync(300);
    calls[0].fail(); await flush();
    expect(status()).toBe("error");
    expect(hasUnsavedChanges()).toBe(true);
    rename("y"); // edited while offline
    await vi.advanceTimersByTimeAsync(1000); // first retry delay
    expect(calls.map((c) => c.name)).toEqual(["x", "y"]);
    calls[1].resolve(); await flush();
    expect(status()).toBe("saved");
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("saveNow (Save version / history) saves immediately and resolves only when the latest state is stored", async () => {
    const calls = fakeNetwork();
    rename("a");
    let done = false;
    const p = saveNow().then((ok) => { done = ok; });
    await flush();
    expect(calls).toHaveLength(1); // no 300 ms wait
    rename("b"); // changed while that save is running
    calls[0].resolve(); await flush();
    expect(done).toBe(false); // still has to store "b"
    expect(calls.map((c) => c.name)).toEqual(["a", "b"]);
    calls[1].resolve(); await p;
    expect(done).toBe(true);
  });

  it("an old version (read-only view) never saves", async () => {
    const calls = fakeNetwork();
    useEditor.setState({ viewing: { version: 1, createdAt: "x", note: "" } });
    rename("hacked"); scheduleSave();
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(0);
    expect(await saveNow()).toBe(false);
    expect(hasUnsavedChanges()).toBe(false);
    useEditor.setState({ viewing: null });
  });

  it("loading another design is in sync (a save of the old one cannot make the new one look dirty)", async () => {
    const calls = fakeNetwork();
    rename("a");
    await vi.advanceTimersByTimeAsync(300);
    useEditor.getState().load({
      id: "d2", name: "n", shortDescription: "", longDescription: "", createdAt: "", updatedAt: "",
      data: { tableGroups: [], tables: [newTable({ name: "other" })], relationships: [], settings: { ...DEFAULT_SETTINGS } },
    }, undefined, null);
    expect(hasUnsavedChanges()).toBe(false);
    calls[0].resolve(); await flush();
    expect(hasUnsavedChanges()).toBe(false);
    expect(status()).toBe("saved");
  });
});
