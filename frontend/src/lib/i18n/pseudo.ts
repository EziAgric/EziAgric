/**
 * Pseudo-localization transform. Accents every Latin letter and pads the string
 * ~35% longer, wrapped in brackets. Any literal that renders as plain ASCII in
 * pseudo-locale builds is a hardcoded string that skipped the message catalog.
 */
const ACCENT_MAP: Record<string, string> = {
  a: "å", b: "ƀ", c: "ç", d: "ð", e: "é", f: "ƒ",
  g: "ĝ", h: "ĥ", i: "î", j: "ĵ", k: "ķ", l: "ļ",
  m: "ḿ", n: "ñ", o: "ö", p: "þ", q: "ǫ", r: "ŕ",
  s: "š", t: "ţ", u: "ü", v: "ṽ", w: "ŵ", x: "ẋ",
  y: "ý", z: "ž",
  A: "Å", B: "Ɓ", C: "Ç", D: "Ð", E: "É", F: "Ƒ",
  G: "Ĝ", H: "Ĥ", I: "Î", J: "Ĵ", K: "Ķ", L: "Ļ",
  M: "Ḿ", N: "Ñ", O: "Ö", P: "Þ", Q: "Ǫ", R: "Ŕ",
  S: "Š", T: "Ţ", U: "Ü", V: "Ṽ", W: "Ŵ", X: "Ẋ",
  Y: "Ý", Z: "Ž",
};

const PAD = "···"; // middle dots, easy to spot in a screenshot

export function pseudoLocalize(input: string): string {
  let inPlaceholder = false;
  let accented = "";
  for (const char of input) {
    // Leave ICU placeholders like {name} untouched.
    if (char === "{") inPlaceholder = true;
    if (char === "}") inPlaceholder = false;
    accented += inPlaceholder ? char : (ACCENT_MAP[char] ?? char);
  }
  const padCount = Math.max(1, Math.round(input.replace(/\{[^}]*\}/g, "").length * 0.35));
  const pad = PAD.repeat(Math.ceil(padCount / PAD.length)).slice(0, padCount);
  return `⟦${accented} ${pad}⟧`;
}
