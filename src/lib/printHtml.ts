const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const PRINT_CSS = `
@page { size: A4; margin: 14mm 12mm; }
html, body { height: auto; background: #fff; }
body { padding: 0; font-size: 12px; }
.md-preview { font-size: 12px; }
.md-preview h1 { font-size: 1.6rem; }
.md-preview h2 { break-after: avoid; }
.md-preview h3, .md-preview h4 { break-after: avoid; }
.md-preview h3 { break-before: auto; }
.md-preview table { font-size: .8rem; break-inside: auto; }
.md-preview tr, .md-preview th, .md-preview td { break-inside: avoid; }
.md-preview thead { display: table-header-group; }
.md-preview a { color: inherit; text-decoration: none; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;

/**
 * Opens the browser's print dialog for an HTML fragment styled like the data dictionary (choose "Save as PDF"
 * as the destination). The fragment is printed from a hidden frame, so the editor behind it is not affected.
 */
export function printAsPdf(title: string, html: string): void {
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((n) => n.outerHTML)
    .join("\n");
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>${styles}<style>${PRINT_CSS}</style></head><body><div class="md-preview">${html}</div></body></html>`;
  const previousTitle = document.title;
  const cleanup = () => {
    document.title = previousTitle;
    frame.remove();
  };
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) return cleanup();
    win.addEventListener("afterprint", cleanup);
    document.title = title; // browsers suggest the page title as the PDF file name
    win.focus();
    win.print();
  };
  document.body.appendChild(frame);
}
