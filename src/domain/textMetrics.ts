/**
 * Deterministic text measuring (no DOM), so layout is identical on the server and the client.
 * Widths are estimates of the rendered font; callers render the *pre-wrapped* lines, so a
 * small estimation error can only shift a few pixels, never change the line count.
 */
const NARROW = new Set("iljtfrI.,;:'|!()[]\" ".split(""));
const WIDE = new Set("mwMW@%".split(""));

export function textWidth(text: string, size: number, opts: { mono?: boolean; bold?: boolean } = {}): number {
  if (opts.mono) return text.length * size * 0.62;
  let em = 0;
  for (const ch of text) {
    if (NARROW.has(ch)) em += 0.3;
    else if (WIDE.has(ch)) em += 0.86;
    else if (ch >= "A" && ch <= "Z") em += 0.66;
    else if (ch >= "0" && ch <= "9") em += 0.57;
    else em += 0.53;
  }
  return Math.ceil(em * size * (opts.bold ? 1.14 : 1.1));
}

/** Greedy word wrap honoring explicit newlines; very long words are broken by character. */
export function wrapText(text: string, maxWidth: number, size: number, opts: { mono?: boolean } = {}): string[] {
  const w = (s: string) => textWidth(s, size, opts);
  const out: string[] = [];
  for (const para of text.replace(/\r/g, "").split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let rest = word;
      while (w(rest) > maxWidth && rest.length > 1) {
        let n = 1;
        while (n < rest.length - 1 && w(rest.slice(0, n + 1)) <= maxWidth) n++;
        if (line) { out.push(line); line = ""; }
        out.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      const cand = line ? `${line} ${rest}` : rest;
      if (line && w(cand) > maxWidth) { out.push(line); line = rest; } else line = cand;
    }
    out.push(line);
  }
  while (out.length > 1 && out[out.length - 1] === "") out.pop();
  return out;
}
