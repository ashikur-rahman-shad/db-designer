export type TokType = "word" | "ident" | "string" | "number" | "punct" | "comment";

export interface Tok {
  type: TokType;
  /** Decoded text (identifier without quotes, comment body without `--`). */
  value: string;
  start: number;
  end: number;
}

export function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    const start = i;
    if (ch === "-" && src[i + 1] === "-") {
      while (i < n && src[i] !== "\n") i++;
      toks.push({ type: "comment", value: src.slice(start + 2, i).replace(/\r$/, "").replace(/^ /, ""), start, end: i });
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const e = src.indexOf("*/", i + 2);
      i = e < 0 ? n : e + 2;
      toks.push({ type: "comment", value: src.slice(start + 2, Math.max(start + 2, i - 2)).trim(), start, end: i });
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`" || ch === "[") {
      const close = ch === "[" ? "]" : ch;
      let val = "";
      i++;
      while (i < n) {
        if (src[i] === close) {
          if (close !== "]" && src[i + 1] === close) { val += close; i += 2; continue; }
          break;
        }
        val += src[i++];
      }
      i++;
      toks.push({ type: ch === "'" ? "string" : "ident", value: val, start, end: i });
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      while (i < n && /[\w$]/.test(src[i])) i++;
      toks.push({ type: "word", value: src.slice(start, i), start, end: i });
      continue;
    }
    if (/[0-9]/.test(ch)) {
      while (i < n && /[0-9.]/.test(src[i])) i++;
      toks.push({ type: "number", value: src.slice(start, i), start, end: i });
      continue;
    }
    i++;
    toks.push({ type: "punct", value: ch, start, end: i });
  }
  return toks;
}
