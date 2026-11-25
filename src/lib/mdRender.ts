import { Marked } from "marked";
import { slug } from "./dataDictionary";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Markdown -> HTML for the data dictionary preview. User text (descriptions, names) can contain
 * anything, so raw HTML is escaped (only `<br>` is allowed, used for line breaks in table cells),
 * unsafe link schemes are dropped, and h3 headings get GitHub-style ids for the overview links.
 */
const marked = new Marked({
  gfm: true,
  breaks: true, // a single newline in a description is a line break, as typed
  renderer: {
    html({ text }) {
      return /^<br\s*\/?>$/i.test(text.trim()) ? "<br>" : escapeHtml(text);
    },
    link({ href, title, tokens }) {
      const inner = this.parser.parseInline(tokens);
      if (!/^(https?:|mailto:|#)/i.test(href)) return inner;
      return `<a href="${escapeHtml(href)}"${title ? ` title="${escapeHtml(title)}"` : ""}>${inner}</a>`;
    },
    image({ text }) {
      return escapeHtml(text);
    },
    heading({ tokens, depth, text }) {
      const id = depth === 3 ? ` id="${escapeHtml(slug(text))}"` : "";
      return `<h${depth}${id}>${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
  },
});

/** Lets text wrap after `_`, `.` and `-` (e.g. customer_application) by adding <wbr> in text only, never inside tags. */
const addBreakPoints = (html: string): string =>
  html.replace(/(<[^>]*>)|([^<]+)/g, (_m, tag: string | undefined, text: string | undefined) =>
    tag ?? text!.replace(/([_.-])(?=[A-Za-z0-9])/g, "$1<wbr>"),
  );

export const renderMarkdown = (md: string): string =>
  addBreakPoints(marked.parse(md.replace(/\u00a0/g, " "), { async: false }) as string);
