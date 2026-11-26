import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { closeOverlay, focused, hc, nextCommand, props, run, settings, theme } from "herdr";

// Edit these two things to make the example yours. Only repeatable actions
// start a timer: the first key after Ctrl+B can take as long as you like.
const REPEAT_MS = 500;
const BINDINGS = [
  ["c", "New tab", "tab.new"],
  ['"', "Split down", "pane.split", { direction: "down" }],
  ["v", "Split right", "pane.split", { direction: "right" }],
  ["s", "Split down", "pane.split", { direction: "down" }],
  ["x", "Close pane", "pane.close"],
  ["n", "Next tab", "tab.next"],
  ["p", "Previous tab", "tab.prev"],
  ["h", "Focus left", "pane.go", { direction: "left" }],
  ["j", "Focus down", "pane.go", { direction: "down" }],
  ["k", "Focus up", "pane.go", { direction: "up" }],
  ["l", "Focus right", "pane.go", { direction: "right" }],
  ["left", "Focus left", "pane.go", { direction: "left" }],
  ["down", "Focus down", "pane.go", { direction: "down" }],
  ["up", "Focus up", "pane.go", { direction: "up" }],
  ["right", "Focus right", "pane.go", { direction: "right" }],
  ["J", "Next space", "space.next", {}],
  ["K", "Previous space", "space.prev", {}],
  ["z", "Zoom pane", "pane.zoom"],
  ["d", "Minimize window", "window.minimize"],
  ...Array.from({ length: 10 }, (_, i) => [String(i), `Tab ${i === 0 ? 10 : i}`, "tab.select", { index: i === 0 ? 10 : i }]),
];

// US-layout shifted symbols, for when key_char is missing.
const SHIFTED = { "'": '"', "/": "?", "5": "%" };

// The character the binding table means. With a Korean (or other non-Latin) input
// source on, key_char is the composed letter (s → ㄴ, shift+j → ㅓ), so fall back to
// the physical key; also when key_char is missing.
function keyName(e) {
  const c = e.key_char;
  // Letters take their case from Shift, not Caps Lock (Caps Lock j must stay j, not J).
  if (c && /^[a-zA-Z]$/.test(c)) return e.modifiers.shift ? c.toUpperCase() : c.toLowerCase();
  if (c && /^[\x20-\x7e]$/.test(c)) return c;
  const k = e.key;
  if (e.modifiers.shift && k.length === 1) return SHIFTED[k] ?? k.toUpperCase();
  return k;
}

function forwardKey(e, key) {
  if (["enter", "tab", "backspace", "left", "right", "up", "down", "space"].includes(e.key)) return e.key;
  if (key === " ") return "space";
  if (/^[A-Z]$/.test(key)) return `shift+${key.toLowerCase()}`;
  if (key.length === 1 && "abcdefghijklmnopqrstuvwxyz0123456789`\\[],=-.';/".includes(key)) return key === "\\" ? "backslash" : key;
  return null;
}

export default class TmuxPrefix extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.repeat = false;
    this.generation = 0;
    this.all = false;
    // The mod-specific key binding beats the global opener while we're open.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (String(c).endsWith("send-prefix")) this.sendPrefix(cx);
      }
    });
  }

  dismiss() {
    closeOverlay(props().overlay);
  }

  send(key, cx) {
    this.generation++;
    // A terminal.show replacement is the one receiving keys.
    const terminal = focused()?.shown ?? focused()?.terminal;
    if (!terminal) return this.dismiss();
    // hc starts its subprocess at the call, before closing cancels this view's tasks.
    const pending = hc(["keys", terminal, key]);
    // owner: null so the check outlives this popup, which closes right below.
    cx.spawn(async () => {
      try {
        const result = await pending;
        if (result.code !== 0) console.log(`tmux-prefix: ${result.stderr}`);
      } catch (e) {
        console.log(`tmux-prefix: ${e}`);
      }
    }, { owner: null });
    this.dismiss();
  }

  sendPrefix(cx) {
    this.send("ctrl+b", cx);
  }

  key(e, cx) {
    cx.stop_propagation();
    const m = e.modifiers;
    if (e.key === "escape") return this.dismiss();
    if (m.control && !m.shift && !m.alt && !m.platform && e.key === "b") return this.sendPrefix(cx);
    const plain = !m.control && !m.alt && !m.platform;
    const key = plain ? keyName(e) : e.key;
    if (plain && key === "?") {
      this.all = !this.all;
      this.repeat = false;
      this.generation++;
      cx.notify();
      return;
    }
    const binding = plain && BINDINGS.find((b) => b[0] === key);
    if (!binding) {
      const forwarded = this.repeat && plain && forwardKey(e, key);
      if (forwarded) return this.send(forwarded, cx);
      return this.dismiss();
    }
    const [, , command, args = {}, repeatable = false] = binding;
    if (!repeatable) this.dismiss();
    run(command, args);
    if (repeatable) {
      this.repeat = true;
      const generation = ++this.generation;
      cx.timer.after(REPEAT_MS, () => {
        if (this.generation === generation) this.dismiss();
      });
      cx.notify();
    }
  }

  render() {
    const t = theme();
    // A transparent window-sized popup anchors the status to the window corner.
    // Closing the popup removes the indicator together with prefix mode.
    // The viewport is window px; element sizes are scaled by the app zoom.
    const zoom = settings().zoom || 1;
    const viewport = window.viewport_size();
    // Herdr insets top popups by 8px; undo that so footer coordinates
    // refer to the actual window edges rather than the popup's origin.
    const root = v_flex().id("tmux-prefix").relative().left(-8 / zoom).top(-8 / zoom)
      .w(viewport.width / zoom).h(viewport.height / zoom).items_center()
      .track_focus(this.handle)
      .on_key_down((e, cx) => this.key(e, cx))
      .on_mouse_down("left", () => this.dismiss())
      // A small opaque pill, so it reads on any layout (herdr-board has no status bar).
      .child(h_flex().absolute().right(124).bottom(4).h(20).px(6).items_center()
        .rounded(5).bg(t.popover).border(1).border_color(t.border)
        .text_color(t.muted).text_size(11.8).child("[prefix]"));
    if (!this.all) return root;
    const rows = BINDINGS;
    const help = v_flex().mt(64).w(520).max_w_full().h(420)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .p(14).gap(8).bg(t.popover).text_color(t.foreground).text_size(12)
      .child(h_flex().justify_between().child(div().font_semibold().child(this.repeat ? `Repeat · ${REPEAT_MS} ms` : "Ctrl+B · waiting for a key"))
        .child(div().text_color(t.muted).child("Esc cancel · ^B send prefix")))
      .child(v_flex().h(280).min_h(0).overflow_y_scrollbar().children(rows.map(([key, label, , , repeatable]) =>
        h_flex().h(20).flex_none().items_center().gap(12).child(div().w(40).text_color(t.accent).child(key))
          .child(div().flex_1().child(label)).child(div().text_color(t.dim).child(repeatable ? "repeat" : "")))))
      .child(div().text_color(t.muted).child("0–9 tabs (0 = 10) · arrows focus · ? hide help"));
    return root.child(help);
  }
}
