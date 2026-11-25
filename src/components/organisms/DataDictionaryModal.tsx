"use client";
import { useMemo, useRef, useState } from "react";
import { buildDataDictionary } from "@/lib/dataDictionary";
import { useDesignStamp } from "@/lib/designStamp";
import { safeFileName } from "@/lib/download";
import { printAsPdf } from "@/lib/printHtml";
import { renderMarkdown } from "@/lib/mdRender";
import { selectionToMarkdown } from "@/lib/mdSelection";
import { useEditor } from "@/store/editorStore";
import { Button } from "../atoms/Button";
import { FullScreenModal } from "../molecules/FullScreenModal";

/** Full-screen data dictionary generated from the latest edit state, shown as rendered Markdown. */
export function DataDictionaryModal({ onClose }: { onClose: () => void }) {
  const meta = useEditor((s) => s.meta);
  const data = useEditor((s) => s.data);
  const stamp = useDesignStamp();
  const dd = useMemo(() => buildDataDictionary(meta, data, new Date(), stamp), [meta, data, stamp]);
  const html = useMemo(() => dd.blocks.map((b) => renderMarkdown(b.md)), [dd]);
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const copyAll = async () => {
    await navigator.clipboard.writeText(dd.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <FullScreenModal
      title="Data dictionary"
      onClose={onClose}
      actions={
        <>
          <span className="hidden text-xs text-slate-400 sm:inline">Select text and copy to get Markdown</span>
          <Button onClick={copyAll}>{copied ? "Copied ✓" : "Copy Markdown"}</Button>
          <Button onClick={() => printAsPdf(`${safeFileName(meta.name)}_data_dictionary`, html.join("\n"))} title="Opens the print dialog: choose “Save as PDF” as the destination">Export PDF</Button>
        </>
      }
    >
      <div
        ref={ref}
        tabIndex={0}
        className="md-preview mx-auto my-6 max-w-5xl rounded-lg border border-slate-200 bg-white px-10 py-8 shadow-sm outline-none"
        onCopy={(e) => {
          // Copy selections as Markdown source instead of plain rendered text.
          const md = ref.current && selectionToMarkdown(ref.current, dd.blocks);
          if (md) { e.preventDefault(); e.clipboardData.setData("text/plain", md); }
        }}
        onKeyDown={(e) => {
          // Ctrl/Cmd+A selects only the document, not the whole page.
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && ref.current) {
            e.preventDefault();
            const sel = window.getSelection();
            sel?.removeAllRanges();
            const r = document.createRange();
            r.selectNodeContents(ref.current);
            sel?.addRange(r);
          }
        }}
        onClick={(e) => {
          // In-document links (#table) scroll inside the dialog instead of changing the URL.
          const a = (e.target as HTMLElement).closest("a");
          const href = a?.getAttribute("href");
          if (href?.startsWith("#")) {
            e.preventDefault();
            ref.current?.querySelector(`[id="${CSS.escape(href.slice(1))}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }}
      >
        {html.map((h, i) => (
          <div key={i} data-block={i} dangerouslySetInnerHTML={{ __html: h }} />
        ))}
      </div>
    </FullScreenModal>
  );
}
