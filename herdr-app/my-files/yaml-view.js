// YAML preview with real key/value coloring.
// The built-in Editor's YAML grammar tags keys and plain values alike as `string`,
// so the Files preview shows them in one color. This tokenizes each line itself
// and draws colored spans, with its own mouse selection and Cmd+C copy (no folding).
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";

export const YAML_EXT = new Set(["yaml", "yml"]);
export const MAX_LINES = 4000; // bigger files fall back to the Editor

// kinds: key, str (quoted), plain (unquoted value), num, const (true/null/...),
// kw (block indicators, ---), anchor (&a *a), tag (!!str), punct, comment, block (block-scalar text), ws
const CONST = /^(true|false|yes|no|on|off|null|~|True|False|TRUE|FALSE|Null|NULL|Yes|No|YES|NO|On|Off|ON|OFF|\.inf|-\.inf|\.nan|\.Inf|\.NaN)$/;
const NUM = /^[-+]?(0x[0-9a-fA-F_]+|0o[0-7_]+|(\d[\d_]*)?\.?\d[\d_]*([eE][-+]?\d+)?)$/;

function scalarKind(s) {
  return CONST.test(s) ? "const" : NUM.test(s) ? "num" : "plain";
}

// Tokenizes the "rest of line" after any key; flow = inside [] or {}.
function value(src, i, out, st) {
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t") { const j = src.slice(i).search(/[^ \t]/); const e = j < 0 ? src.length : i + j; out.push(["ws", src.slice(i, e)]); i = e; continue; }
    if (c === "#" && (i === 0 || /\s/.test(src[i - 1]))) { out.push(["comment", src.slice(i)]); return; }
    if (c === '"') { let j = i + 1; while (j < src.length && src[j] !== '"') j += src[j] === "\\" ? 2 : 1; j = Math.min(j + 1, src.length); i = keyOr(src, i, j, "str", out, st); continue; }
    if (c === "'") { let j = i + 1; while (j < src.length) { if (src[j] === "'" && src[j + 1] === "'") { j += 2; continue; } if (src[j] === "'") break; j++; } j = Math.min(j + 1, src.length); i = keyOr(src, i, j, "str", out, st); continue; }
    if ((c === "&" || c === "*") && /[^\s,\[\]{}]/.test(src[i + 1] ?? " ")) { const m = /^[&*][^\s,\[\]{}]+/.exec(src.slice(i))[0]; out.push(["anchor", m]); i += m.length; continue; }
    if (c === "!") { const m = /^![^\s,\[\]{}]*/.exec(src.slice(i))[0]; out.push(["tag", m]); i += m.length; continue; }
    if ("[{".includes(c)) { st.flow++; out.push(["punct", c]); i++; continue; }
    if ("]}".includes(c)) { st.flow = Math.max(0, st.flow - 1); out.push(["punct", c]); i++; continue; }
    if (c === "," && st.flow) { out.push(["punct", c]); i++; continue; }
    if (c === "-" && (src[i + 1] === " " || i + 1 === src.length) && !st.flow) { out.push(["punct", "-"]); st.owner = st.base + i; i++; continue; }
    if (!st.flow && /^[|>][-+0-9]*\s*(#.*)?$/.test(src.slice(i))) {
      const m = /^[|>][-+0-9]*/.exec(src.slice(i))[0]; out.push(["kw", m]); i += m.length; st.block = st.owner; continue;
    }
    // plain scalar: up to " #", or ": " (a key), or a flow indicator inside flow
    let j = i;
    while (j < src.length) {
      const d = src[j];
      if (d === "#" && /\s/.test(src[j - 1])) break;
      if (d === ":" && (j + 1 === src.length || /[\s,\[\]{}]/.test(src[j + 1]))) break;
      if (st.flow && ",[]{}".includes(d)) break;
      j++;
    }
    let e = j; while (e > i && /\s/.test(src[e - 1])) e--;
    if (e === i) { out.push(["punct", src[i]]); i++; continue; }
    const word = src.slice(i, e);
    if (src[j] === ":") { st.owner = st.base + i; out.push(["key", word]); if (e < j) out.push(["ws", src.slice(e, j)]); out.push(["punct", ":"]); i = j + 1; continue; }
    out.push([scalarKind(word), word]); i = e;
  }
}

// A quoted scalar followed by ":" is a key.
function keyOr(src, i, j, kind, out, st) {
  const m = /^\s*:(?=\s|$|[,\]}])/.exec(src.slice(j));
  if (m) { st.owner = st.base + i; out.push(["key", src.slice(i, j)]); if (m[0].length > 1) out.push(["ws", m[0].slice(0, -1)]); out.push(["punct", ":"]); return j + m[0].length; }
  out.push([kind, src.slice(i, j)]); return j;
}

export function tokenize(text) {
  const lines = text.split(/\r?\n/);
  const st = { flow: 0, block: null, base: 0, owner: 0 };
  return lines.map(line => {
    const indent = /^[ ]*/.exec(line)[0].length;
    if (st.block !== null) {
      if (line.trim() === "" || indent > st.block) return [["block", line]];
      st.block = null;
    }
    // block-scalar parent indent = the line's indent, or deeper after "- "
    st.base = indent; st.owner = indent;
    const out = [];
    if (indent) out.push(["ws", line.slice(0, indent)]);
    const rest = line.slice(indent);
    if (/^(---|\.\.\.)(\s|$)/.test(rest) && indent === 0) { out.push(["kw", rest.slice(0, 3)]); value(rest, 3, out, st); return out; }
    if (/^%/.test(rest) && indent === 0) { out.push(["kw", rest]); return out; }
    value(rest, 0, out, st);
    return out;
  });
}

export function colors(t) {
  return {
    key: t.ansi12 ?? t.ansi4, str: t.ansi2, plain: t.foreground, num: t.ansi1, const: t.ansi6,
    kw: t.ansi5, anchor: t.ansi3, tag: t.ansi5, punct: t.muted, comment: t.dim,
    block: t.ansi2, ws: t.foreground,
  };
}

// Wide (2-column) characters: Hangul, CJK, full-width forms.
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/;
const cw = ch => WIDE.test(ch) ? 2 : 1;

function cols(line) {
  let n = 0;
  for (const ch of line) n += cw(ch);
  return n;
}

export function widestLine(text) {
  let w = 0;
  for (const l of text.split(/\r?\n/)) { if (l.length > w / 2) w = Math.max(w, cols(l)); }
  return w;
}

// A YAML file shown with colors, with mouse selection and copy (the spans themselves can't be
// selected). Positions are {line, ch}: ch is a UTF-16 index into the line.
export class YamlDoc {
  constructor(text) {
    this.lines = text.split(/\r?\n/);
    this.tokens = tokenize(text);
    this.widest = widestLine(text);
    this.anchor = null; this.head = null; this.dragging = false;
    this.charW = null; this.wideW = null; // measured from hidden probe rows, in layout px
  }

  // Width in layout px of one character (Korean/CJK render wider than two Latin ones).
  w(ch, size) {
    const n = this.charW ?? size * 0.6;
    return WIDE.test(ch) ? (this.wideW ?? n * 2) : n;
  }

  // x (layout px, from the text start) where character index ch of a line starts.
  xOf(line, ch, size) {
    let x = 0;
    for (const c of this.lines[line].slice(0, ch)) x += this.w(c, size);
    return x;
  }

  // The {line, ch} nearest to a point inside the rows box (layout px).
  posAt(x, y, g) {
    const line = Math.max(0, Math.min(this.lines.length - 1, Math.floor((y - g.top) / g.lh)));
    const text = this.lines[line], target = x - g.left;
    let at = 0, i = 0;
    for (const ch of text) {
      const w = this.w(ch, g.size);
      if (target < at + w / 2) break;
      at += w; i += ch.length;
    }
    return { line, ch: i };
  }

  range() {
    if (!this.anchor || !this.head) return null;
    const [a, b] = [this.anchor, this.head].sort((p, q) => p.line - q.line || p.ch - q.ch);
    return a.line === b.line && a.ch === b.ch ? null : [a, b];
  }

  selectedText() {
    const r = this.range();
    if (!r) return "";
    const [a, b] = r;
    if (a.line === b.line) return this.lines[a.line].slice(a.ch, b.ch);
    return [this.lines[a.line].slice(a.ch), ...this.lines.slice(a.line + 1, b.line), this.lines[b.line].slice(0, b.ch)].join("\n");
  }

  wordAt(p) {
    const s = this.lines[p.line], isW = c => /[\p{L}\p{N}_\-.@/]/u.test(c);
    let a = p.ch, b = p.ch;
    while (a > 0 && isW(s[a - 1])) a--;
    while (b < s.length && isW(s[b])) b++;
    return [{ line: p.line, ch: a }, { line: p.line, ch: b }];
  }

  render(t, font, focus) {
    const C = colors(t), size = font.font_size, lh = Math.round(size * 1.55), zoom = font.zoom || 1;
    const unit = this.charW ?? size * 0.6;
    const gutter = String(this.tokens.length).length;
    const gutterW = Math.ceil((gutter + 2) * size * 0.62);
    const g = { top: 6, left: gutterW, lh, size };
    const width = Math.ceil((this.widest + 2) * Math.max(unit, (this.wideW ?? 2 * unit) / 2)) + gutterW + 32;
    const r = this.range();
    const local = (e) => e.local_position && { x: e.local_position.x / zoom, y: e.local_position.y / zoom };
    const sel = (n) => {
      if (!r || n < r[0].line || n > r[1].line) return null;
      const from = n === r[0].line ? this.xOf(n, r[0].ch, size) : 0;
      const to = n === r[1].line ? this.xOf(n, r[1].ch, size) : this.xOf(n, this.lines[n].length, size) + unit;
      if (to <= from) return null;
      return div().absolute().top(0).left(gutterW + from).w(to - from).h(lh).bg(t.selection);
    };
    const rows = v_flex().id("yaml-rows").relative().min_w(width).py(6).cursor_text()
      .on_mouse_down("left", (e, cx) => {
        const p0 = local(e); if (!p0) return;
        focus?.focus();
        const p = this.posAt(p0.x, p0.y, g);
        if (e.click_count === 2) { [this.anchor, this.head] = this.wordAt(p); }
        else if (e.click_count >= 3) { this.anchor = { line: p.line, ch: 0 }; this.head = { line: p.line, ch: this.lines[p.line].length }; }
        else if (e.modifiers?.shift && this.anchor) { this.head = p; this.dragging = true; }
        else { this.anchor = p; this.head = p; this.dragging = true; }
        cx.notify();
      })
      .on_window_mouse_move((e, cx) => {
        if (!this.dragging) return;
        if (e.pressed_button !== "left") { this.dragging = false; return; }
        const p0 = local(e); if (!p0) return;
        const p = this.posAt(p0.x, p0.y, g);
        if (p.line !== this.head?.line || p.ch !== this.head?.ch) { this.head = p; cx.notify(); }
      })
      .on_window_mouse_up("left", () => { this.dragging = false; })
      // Hidden probe: its width gives the real character width of this font.
      .child(div().id("yaml-probe").absolute().top(0).left(0).opacity(0).whitespace_nowrap().child("0123456789".repeat(10))
        .on_size_change((s, cx) => {
          const w = s.width / zoom / 100;
          if (w > 0 && Math.abs(w - (this.charW ?? 0)) > 0.01) { this.charW = w; cx.notify(); }
        }))
      .child(div().id("yaml-probe-wide").absolute().top(0).left(0).opacity(0).whitespace_nowrap().child("가".repeat(100))
        .on_size_change((s, cx) => {
          const w = s.width / zoom / 100;
          if (w > 0 && Math.abs(w - (this.wideW ?? 0)) > 0.01) { this.wideW = w; cx.notify(); }
        }))
      .children(this.tokens.map((toks, n) =>
        h_flex().relative().h(lh).flex_none().whitespace_nowrap()
          .when(Boolean(sel(n)), el => el.child(sel(n)))
          .child(div().w(gutterW).flex_none().pr(12).text_right().text_color(t.dim).child(String(n + 1)))
          .children(toks.map(([k, s]) => div().flex_none().whitespace_nowrap().text_color(C[k]).child(s)))));
    let el = div().id("yaml-scroll").flex_1().min_h(0).overflow_scrollbar().bg(t.background)
      .font_family(font.font_family).text_size(size);
    if (focus) el = el.track_focus(focus).on_key_down((e, cx) => {
      if (e.keystroke === "cmd-c") { const s = this.selectedText(); if (s) cx.write_to_clipboard(s); }
      else if (e.keystroke === "cmd-a") { this.anchor = { line: 0, ch: 0 }; const l = this.lines.length - 1; this.head = { line: l, ch: this.lines[l].length }; cx.notify(); }
      else if (e.keystroke === "escape" && this.range()) { this.anchor = this.head = null; cx.notify(); }
    });
    return el.child(rows);
  }
}
