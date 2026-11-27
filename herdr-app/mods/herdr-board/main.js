import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { MACHINE } from "./config.js";
import { agents, terminals, machines, spaces, panes, props, run, theme, shared, setShared, window, layout, settings, openOverlay, closeOverlay, hc, exec, appHome, checking, readTextFile } from "herdr";

// 1:05, 12:40, 1:02:09
function clock(ms) {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// A terminal's space/tab as the app names them: labels on a machine omit its "<machine>/"
// prefix, which the app's ids (and the terminal's address) carry.
const prefixOf = (address) => (address.includes("/") ? address.slice(0, address.indexOf("/") + 1) : "");
const labelId = (k, key) => { const v = k.labels?.[key]; return v ? prefixOf(k.address) + v : null; };
// exec on the OpenRig machine (this computer when MACHINE is null).
const ON = { on: MACHINE };
// Addresses as that machine's own hc knows them.
const bare = (address) => address.slice(prefixOf(address).length);
const delay = (cx, ms) => new Promise(r => cx.timer.after(ms, () => r()));

// 950, 12.4k, 1.2M
function tok(n) {
  if (n < 1000) return String(n);
  if (n < 1e6) return `${(n / 1000).toFixed(n < 1e4 ? 1 : 0)}k`;
  return `${(n / 1e6).toFixed(1)}M`;
}

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// Follows the theme (light or dark); only the violet brand mark is fixed.
const C = { violet: "#7465db" };
const sync = () => { const t = theme(); Object.assign(C, { ink: t.foreground, muted: t.muted, line: t.border, bg: t.canvas, white: t.surface, dim: t.dim, raised: t.raised }); };
const STATES = [
  { key: "blocked", label: "Needs you", color: "#d79032" },
  { key: "working", label: "Working", color: "#7465db" },
  { key: "done", label: "Done", color: "#39a380" },
  { key: "idle", label: "Idle", color: "#99a0ad" },
];
const dot = (color, size = 7) => div().size(size).rounded(size).bg(color).flex_none();
const icon = (program, size = 18) => program?.icon
  ? (program.tint ? svg(program.icon).text_color(C.ink) : image(program.icon)).size(size).flex_none()
  : div().size(size).rounded(4).bg(C.violet);
const chip = (label, selected = false) => h_flex().h(27).px(11).gap(7).items_center().rounded(6)
  .bg(selected ? C.violet + "22" : C.white).border(1).border_color(selected ? C.violet + "55" : C.line)
  .text_size(11).text_color(selected ? C.violet : C.muted).child(label);
// A filter chip: click flips a shared value, so the header and the board copies agree.
// Its press is stopped so the header's window drag doesn't take it.
const toggle = (key, off, on, offLabel, onLabel) => {
  const now = shared(key) === on;
  return chip(now ? onLabel : offLabel, now).id(`chip-${key}`).cursor_pointer().hover(s => s.border_color(C.violet + "88"))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click(() => setShared(key, now ? off : on));
};
const SCOPE = "herdr-board.scope", WHO = "herdr-board.agents", TOKENS = "herdr-board.tokens", HIDDEN = "herdr-board.hidden", SEATS = "herdr-board.seats";

// Drops what an agent puts before its title: a status glyph or spinner and the separator
// after it, and Codex's "[ ! ] " / "[ . ] " mark (same rule as the shipped agents list).
const clean = (s) => (s ?? "").replace(/^(?:\[ [!.] \] |[✋⏳]\uFE0F?(?=\s)|(?!(?:\p{Emoji}\uFE0F|[#*]\u20E3))[^\p{L}\p{N}\p{Ps}\p{Pi}\p{Emoji_Presentation}])+/u, "").trim();

// What a card calls an agent: a tab name the person gave; else the pane's name; else what
// the agent says it's doing (its terminal title) when that says something; else its program.
// Herdr's automatic tab names are just positions ("1"), so they're never used.
function cardTitle(a, tab) {
  // A name given on the card (pane.rename) wins over the tab's name.
  if (a.pane_name) return a.pane_name;
  if (tab?.named) return tab.name;
  const prog = a.program?.name;
  const live = clean(a.title);
  const path = /^[~/]|^[A-Za-z]:\\/.test((a.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== a.address && live !== prog && !path && !live.includes("@") && live.toLowerCase() !== a.program?.key;
  return telling ? live : prog ?? "Agent";
}

// A sub-agent without a pane isn't in agents(): its raw word, error counting as blocked.
// It's never done: it reports to its parent (the shipped agents list does the same).
const kidStatus = (s) => (s === "error" ? "blocked" : s === "done" ? "idle" : s);

// Everything the board can show: agents() plus live sub-agents that have no pane.
// A sub-agent takes its space and tab from the nearest ancestor that is in agents().
// Each item carries `key`: address plus start time, so a reused address starts at zero.
function boardItems() {
  const terms = terminals();
  const byAddr = new Map(terms.map(t => [t.address, t]));
  const keyOf = (addr) => `${addr}@${byAddr.get(addr)?.created_ms ?? ""}`;
  const listed = new Map(agents().map(a => [a.address, a]));
  const tabs = new Map();
  for (const sp of spaces()) for (const t of sp.tabs) tabs.set(t.id, t);
  // An OpenRig seat shows up here as a terminal running `tmux attach -t =<seat>`: ending that
  // terminal closes only the view, the seat keeps running in OpenRig.
  const seatOf = (addr) => {
    const argv = byAddr.get(addr)?.argv ?? [];
    const i = argv.indexOf("attach");
    return argv.includes("tmux") && i >= 0 && argv[i + 1] === "-t" && /^=/.test(argv[i + 2] ?? "") ? argv[i + 2].slice(1) : null;
  };
  // OpenRig seats: the card's status is OpenRig's (rig ps, fetched by the board copy into
  // shared SEATS), not Herdr's. Herdr's seat status flips to working and back whenever the
  // pane is resized (Claude Code redraws inside tmux and reports it); OpenRig's working comes
  // from the seat's own turn hooks. A seat pane Herdr has no status for at all is added too.
  const seatState = shared(SEATS) ?? {};
  const items = agents().map(a => {
    const seat = seatOf(a.address), st = seat && seatState[seat];
    return { ...a, key: keyOf(a.address), sub: false, label: cardTitle(a, tabs.get(a.tab)), seat,
      ...(st ? { status: st, fromRig: true } : {}) };
  });
  const spaceById = new Map(spaces().map(sp => [sp.id, sp]));
  for (const k of terms) {
    if (k.state !== "live" || listed.has(k.address)) continue;
    const seat = seatOf(k.address), sp = spaceById.get(labelId(k, "herdr.space"));
    const st = seat && seatState[seat];
    if (!st || !sp) continue;
    const tab = sp.tabs.find(t => t.id === labelId(k, "herdr.tab"));
    items.push({
      address: k.address, key: keyOf(k.address), sub: false, seat, status: st, fromRig: true,
      program: k.program, pane: panes().find(p => p.terminal === k.address)?.pane ?? null,
      space: sp.id, space_name: sp.name, tab: tab?.id ?? null, tab_name: tab?.name ?? "",
      label: seat, pinned: Boolean(k.labels?.["herdr.pinned"]), seq: 0,
    });
  }
  for (const k of terms) {
    if (k.state !== "live" || !k.parent || listed.has(k.address)) continue;
    const st = kidStatus(k.status);
    if (!STATES.some(s => s.key === st)) continue;
    let root = null, p = k.parent;
    for (let i = 0; p && i < 16 && !root; i++) { root = listed.get(p) ?? null; p = byAddr.get(p)?.parent; }
    items.push({
      address: k.address, key: keyOf(k.address), sub: true, parent: k.parent, status: st,
      created: k.created_ms ?? 0,
      program: k.program, name: k.name ?? null,
      tab: root?.tab ?? null, tab_name: root?.tab_name ?? "",
      // Its hc name (what the parent called it), else its own title, else its program.
      label: k.labels?.["herdr-board.name"] || k.name || cardTitle({ address: k.address, title: k.title, program: k.program }, null),
      space: root?.space ?? null, space_name: root?.space_name ?? "",
      pinned: Boolean(k.labels?.["herdr.pinned"]),
    });
  }
  return items;
}

// The items the board shows: every space or the shown one; everyone or only pinned.
const filtered = (items, active) => items
  .filter(a => shared(SCOPE) !== "space" || a.space === active?.id)
  .filter(a => shared(WHO) !== "pinned" || a.pinned);

export default class Board extends View {
  init(_p, cx) {
    if (props()?.role === "rename") return this.initRename(cx);
    if (props()?.role === "end") { this.handle = cx.focus_handle(); this.handle.focus(); return; }
    if (props()?.role === "rigs") return this.initRigs(cx);
    // Only the board copy (no role) keeps time; the header and pane copies just draw.
    if (props()?.role) return;
    // Work time per agent: finished working stretches plus open runs, both saved, so a
    // layout switch or quit doesn't lose a run that is still going.
    const load = (k) => { try { const v = JSON.parse(localStorage.getItem(k) ?? "{}"); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; } };
    this.totals = load("work-totals");
    this.runs = load("work-runs");
    this.first = true;
    this.visibleWorking = false;
    // Tick once a second, only while a shown card is working and the window is on screen.
    cx.timer.every(1000, (cx) => {
      if (this.visibleWorking && window()?.visible !== false) cx.notify();
    });
    // Claude Code token counts, from its transcripts (tokens.py), every 5s while shown.
    this.tokens = {};
    if (checking()) return;
    this.fetchTokens(cx);
    cx.timer.every(5000, (cx) => { if (window()?.visible !== false) this.fetchTokens(cx); });
  }

  fetchTokens(cx) {
    this.fetchSeats(cx);
    if (this.fetching) return;
    const addrs = boardItems().filter(a => a.program?.key === "claude").map(a => a.address);
    if (!addrs.length) { this.tokens = {}; if (Object.keys(shared(TOKENS) ?? {}).length) setShared(TOKENS, {}); return; }
    this.fetching = true;
    cx.spawn(async (cx) => {
      try {
        // The script runs where the agents run; its source goes along (python3 -c), so nothing
        // has to be installed there. It gets bare addresses; answers are mapped back.
        this.tokenSrc ??= await readTextFile(`${appHome()}/mods/herdr-board/tokens.py`);
        const r = await exec("python3", ["-c", this.tokenSrc, ...addrs.map(bare)], { timeout: 20000, ...ON });
        if (r.code === 0) {
          const got = JSON.parse(r.stdout || "{}");
          this.tokens = Object.fromEntries(addrs.filter(a => got[bare(a)] != null).map(a => [a, got[bare(a)]]));
          // The header is another copy: hand it the counts, only when they change
          // (setShared redraws every mod).
          const text = JSON.stringify(this.tokens);
          if (text !== JSON.stringify(shared(TOKENS) ?? {})) setShared(TOKENS, this.tokens);
          cx.notify();
        }
        else console.log(`herdr-board tokens: ${r.stderr}`);
      } catch (e) {
        console.log(`herdr-board tokens: ${e}`);
      } finally {
        this.fetching = false;
      }
    });
  }

  // OpenRig seat activity (only when some live terminal is a seat view), for seat panes
  // Herdr has no status for yet. Shared only when it changes.
  fetchSeats(cx) {
    if (this.fetchingSeats) return;
    const anySeat = terminals().some(k => k.state === "live" && (k.argv ?? []).includes("tmux") && (k.argv ?? []).some(x => /^=[^@]+@/.test(x)));
    if (!anySeat) { if (Object.keys(shared(SEATS) ?? {}).length) setShared(SEATS, {}); return; }
    this.fetchingSeats = true;
    cx.spawn(async () => {
      try {
        const r = await exec("rig", ["ps", "--nodes", "-A", "--json"], { timeout: 20000, ...ON });
        if (r.code === 0) {
          const d = JSON.parse(r.stdout), nodes = Array.isArray(d) ? d : d.entries ?? [];
          const map = {}, before = shared(SEATS) ?? {};
          for (const n of nodes) {
            if (!["claude-code", "codex"].includes(n.runtime)) continue;
            const a = n.agentActivity?.state, name = n.canonicalSessionName;
            // "running" is screen output (a redraw included), not a turn: keep the last real state.
            const st = n.needsAttention ? "blocked" : a === "working" ? "working" : a === "idle" ? "idle" : before[name] ?? null;
            if (st) map[name] = st;
          }
          if (JSON.stringify(map) !== JSON.stringify(shared(SEATS) ?? {})) setShared(SEATS, map);
        }
      } catch (e) {
        console.log(`herdr-board seats: ${e}`);
      } finally {
        this.fetchingSeats = false;
      }
    });
  }

  // "worked 3:12 · 405k tok": tokens only for Claude Code agents with a transcript.
  usage(a) {
    const n = this.tokens?.[a.address];
    return n == null ? this.elapsed(a) : `${this.elapsed(a)} · ${tok(n)} tok`;
  }

  // The rename dialog (this mod opened as an overlay with role "rename").
  initRename(cx) {
    this.input = InputState.new({ value: props().value ?? "" });
    const v = props().value ?? "";
    if (v) this.input.set_selected_range({ start: 0, end: v.length });
    this.input.on("submit", () => this.submitRename());
    this.input.focus();
    cx.timer.after(300, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  // An agent with a pane: pane.rename ("" goes back to the automatic title).
  // A sub-agent has no pane: its name is kept as the terminal label herdr-board.name.
  submitRename() {
    const p = props(), name = this.input.value().trim();
    closeOverlay(p.overlay);
    if (p.pane) run("pane.rename", { pane: p.pane, name });
    else hc(["label", p.address, `herdr-board.name=${name}`]);
  }

  renderRename() {
    const t = theme(), p = props();
    const button = (id, text, primary, action) => h_flex().id(id).h(30).px(13).items_center().rounded(7)
      .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground).text_size(12).cursor_pointer()
      .hover(s => s.opacity(0.88)).on_click(action).child(text);
    return v_flex().id("rename").track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { closeOverlay(p.overlay); cx.stop_propagation(); } })
      .w_full().p(18).gap(8).bg(t.popover).text_color(t.foreground)
      .child(div().text_size(15).font_semibold().child("Rename agent"))
      .child(div().text_size(11.5).text_color(t.dim).child(`${p.address} · leave empty to use the agent's own title`))
      .child(Input.new(this.input).h(36).px(10).rounded(8).border_1().border_color(t.accent).bg(t.background).text_size(12.8))
      .child(h_flex().pt(8).gap(8).justify_end()
        .child(button("rn-cancel", "Cancel", false, () => closeOverlay(p.overlay)))
        .child(button("rn-save", "Save", true, () => this.submitRename())));
  }

  rename(a) {
    openOverlay({ mod: "herdr-board", kind: "dialog", width: 380,
      props: { role: "rename", address: a.address, pane: a.sub ? null : a.pane, value: a.label } });
  }

  save() {
    localStorage.setItem("work-totals", JSON.stringify(this.totals));
    localStorage.setItem("work-runs", JSON.stringify(this.runs));
  }

  // Opens a run when an agent starts working, adds it to its total when it stops.
  // Only right after start does a run reach back: to its tab's working_since when it is
  // the tab's only working agent, and a run that ended meanwhile ends at the tab's changed_at.
  track(items) {
    const now = Date.now(), tabs = {};
    for (const sp of spaces()) for (const t of sp.tabs) tabs[t.id] = t;
    const workers = {};
    for (const a of items) if (a.status === "working" && !a.sub) workers[a.tab] = (workers[a.tab] ?? 0) + 1;
    const seen = new Set();
    let changed = false;
    for (const a of items) {
      seen.add(a.key);
      const tab = tabs[a.tab];
      if (a.status === "working") {
        if (!(a.key in this.runs)) {
          const back = this.first && !a.sub && workers[a.tab] === 1 ? tab?.working_since : null;
          this.runs[a.key] = back ?? now;
          changed = true;
        }
      } else if (a.key in this.runs) {
        const end = this.first && !a.sub && tab?.changed_at ? Math.min(now, tab.changed_at) : now;
        this.totals[a.key] = (this.totals[a.key] ?? 0) + Math.max(0, end - this.runs[a.key]);
        delete this.runs[a.key];
        changed = true;
      }
    }
    // A run whose terminal is gone: ended while watched, count it to now; found gone at start, drop it.
    for (const k of Object.keys(this.runs)) if (!seen.has(k)) {
      if (!this.first) this.totals[k] = (this.totals[k] ?? 0) + Math.max(0, now - this.runs[k]);
      delete this.runs[k];
      changed = true;
    }
    // Forget totals of terminals that are gone, once every machine is loaded.
    if (changed || this.first) {
      const ready = machines().every(m => m.layout === "ready");
      if (ready && items.length) for (const k of Object.keys(this.totals)) if (!seen.has(k)) { delete this.totals[k]; changed = true; }
    }
    this.first = false;
    if (changed) this.save();
  }

  worked(key) {
    const start = this.runs[key];
    return (this.totals[key] ?? 0) + (start ? Math.max(0, Date.now() - start) : 0);
  }

  pin(a, size = 12) {
    // Pin: shown always, in violet when pinned. Its click doesn't open the card's agent.
    return div().id(`pin-${a.address}`).flex_none().p(2).rounded(4).cursor_pointer()
      .text_color(a.pinned ? C.violet : C.dim).hover(s => s.bg(C.raised).text_color(a.pinned ? C.violet : C.ink))
      .tooltip(a.pinned ? "Unpin" : "Pin")
      .on_click((_e, cx) => { cx.stop_propagation(); run("terminal.pin", { terminal: a.address, pinned: !a.pinned }); })
      .child(svg(`mods/workspace-chrome/${a.pinned ? "pin-off" : "pin"}.svg`).size(size));
  }

  elapsed(a) {
    const ms = this.worked(a.key);
    return ms >= 1000 ? `worked ${clock(ms)}` : "not worked yet";
  }

  // A top-level agent: the full card.
  card(a, state) {
    return h_flex().id(`agent-${a.address}`).w_full().h(86).flex_none().rounded(7).overflow_hidden()
      .bg(C.white).border(1).border_color(C.line).cursor_pointer().hover(s => s.border_color(state.color))
      .on_click(() => run("agent.focus", { terminal: a.address }))
      .child(div().w(3).h_full().bg(state.color).flex_none())
      .child(v_flex().flex_1().min_w(0).px(12).py(10).gap(7)
        .child(h_flex().gap(7).items_center().text_size(10).text_color(C.muted)
          .child(icon(a.program, 15)).child(div().min_w(0).truncate().child(a.program?.name ?? "Agent"))
          // An OpenRig seat: which team it belongs to.
          .when(Boolean(a.seat), el => el.child(div().flex_none().px(5).py(1).rounded(4).bg(C.violet + "22").text_color(C.violet).text_size(9)
            .tooltip(a.fromRig ? "OpenRig seat · status from OpenRig" : "OpenRig seat · OpenRig status not loaded yet").child(`rig · ${a.seat.split("@")[1]}`)))
          .child(div().flex_1()).child(div().flex_none().child(a.address)).child(this.pin(a)).child(this.hideButton(a)).child(this.endButton(a)))
        .child(div().id(`name-${a.address}`).text_size(13).font_semibold().text_color(C.ink).truncate().tooltip("Double-click to rename")
          .on_mouse_down("left", (e, cx) => { if (e.click_count === 2) { cx.stop_propagation(); this.rename(a); } }).child(a.label))
        .child(h_flex().items_center().justify_between().gap(6).text_size(10).text_color(C.muted)
          .child(div().min_w(0).truncate().child(a.space_name))
          .child(div().flex_none().text_color(a.status === "working" ? state.color : C.muted).child(this.usage(a)))));
  }

  // A sub-agent: a slim card hung under its parent by tree lines, indented one step per
  // level. `last` ends the vertical line at the elbow. When its parent isn't right above
  // (another column, or not shown), it names the parent.
  subCard(a, state, depth, last, underParent) {
    const H = 46, STEP = 26;
    // Tree lines only when the parent's card is right above; a sub-agent whose parent is in
    // another column gets a plain "↳" gutter, so it doesn't look tied to the card above it.
    const elbow = underParent
      ? v_flex().w(STEP).h(H).flex_none()
        .child(div().ml(12).w(STEP - 14).h(H / 2).border_l(1).border_b(1).border_color(C.dim))
        .child(div().ml(12).w(1).h(H / 2).when(!last, el => el.bg(C.dim)))
      : h_flex().w(STEP).h(H).flex_none().justify_center().items_center().text_size(12).text_color(C.dim).child("↳");
    // Under its parent, pulled up into the column gap so the line meets the card above.
    return h_flex().w_full().h(H).flex_none().when(underParent, el => el.mt(-7)).pl((depth - 1) * STEP)
      .child(elbow)
      .child(h_flex().id(`agent-${a.address}`).flex_1().min_w(0).h(H - 6).rounded(6).overflow_hidden()
        .bg(C.bg).border(1).border_color(C.line).cursor_pointer().hover(s => s.border_color(state.color))
        .on_click(() => run("agent.focus", { terminal: a.address }))
        .child(div().w(2).h_full().bg(state.color).flex_none())
        .child(v_flex().flex_1().min_w(0).px(9).gap(2).justify_center()
          .child(h_flex().gap(6).items_center()
            .child(icon(a.program, 12))
            .child(div().id(`name-${a.address}`).min_w(0).truncate().text_size(11.5).font_semibold().text_color(C.ink).tooltip("Double-click to rename")
              .on_mouse_down("left", (e, cx) => { if (e.click_count === 2) { cx.stop_propagation(); this.rename(a); } }).child(a.label))
            .child(div().flex_1())
            .child(div().flex_none().text_size(9.5).text_color(C.dim).child(a.address)).child(this.pin(a, 11)).child(this.hideButton(a, 11)).child(this.endButton(a, 11)))
          .child(h_flex().gap(6).items_center().text_size(9.5).text_color(C.muted)
            .child(div().min_w(0).truncate().child(underParent ? (a.program?.name ?? "Agent") : `↳ from ${a.parent}${a.space_name ? ` · ${a.space_name}` : ""}`))
            .child(div().flex_1())
            .child(div().flex_none().text_color(a.status === "working" ? state.color : C.muted).child(this.usage(a))))));
  }

  // Idle cards can be hidden from the board (the agent keeps running). Hidden ones show,
  // dimmed, only while "Show n hidden" is open, with a button to bring each back.
  hideButton(a, size = 12) {
    if (a.status !== "idle") return div();
    const hidden = Boolean((shared(HIDDEN) ?? {})[a.key]);
    return div().id(`hide-${a.address}`).flex_none().p(2).rounded(4).cursor_pointer()
      .text_color(C.dim).hover(s => s.bg(C.raised).text_color(C.ink))
      .tooltip(hidden ? "Show on board" : "Hide from board")
      .on_click((_e, cx) => { cx.stop_propagation(); this.setHidden([a.key], !hidden); })
      .child(svg(hidden ? "mods/workspace-chrome/plus.svg" : "mods/workspace-chrome/archive.svg").size(size));
  }

  // End an agent for good: asks first in a dialog. OpenRig seats get no button here (closing
  // their Herdr terminal only closes the view); their tooltip says to stop them in OpenRig.
  endButton(a, size = 12) {
    if (a.seat) return div().id(`end-${a.address}`).flex_none().p(2).text_color(C.line)
      .tooltip(`OpenRig seat ${a.seat}: stop it in OpenRig (rig seat stop), not here`)
      .child(svg("mods/workspace-chrome/x.svg").size(size));
    return div().id(`end-${a.address}`).flex_none().p(2).rounded(4).cursor_pointer()
      .text_color(C.dim).hover(s => s.bg("#d0525222").text_color("#d05252"))
      .tooltip("End this agent")
      .on_click((_e, cx) => {
        cx.stop_propagation();
        openOverlay({ mod: "herdr-board", kind: "dialog", width: 400,
          props: { role: "end", address: a.address, label: a.label, status: a.status, sub: a.sub, program: a.program?.name ?? "Agent" } });
      })
      .child(svg("mods/workspace-chrome/x.svg").size(size));
  }

  renderEnd() {
    const t = theme(), p = props();
    const kids = terminals().filter(k => k.state === "live" && k.parent === p.address).length;
    const button = (id, text, danger, action) => h_flex().id(id).h(30).px(13).items_center().rounded(7)
      .border_1().border_color(danger ? "#d05252" : t.input).bg(danger ? "#d05252" : t.raised)
      .text_color(danger ? "#ffffff" : t.foreground).text_size(12).cursor_pointer()
      .hover(s => s.opacity(0.88)).on_click(action).child(text);
    return v_flex().id("end").track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { closeOverlay(p.overlay); cx.stop_propagation(); } })
      .w_full().p(18).gap(8).bg(t.popover).text_color(t.foreground)
      .child(div().text_size(15).font_semibold().child("End this agent?"))
      .child(div().text_size(12.5).child(`${p.label} · ${p.program} · ${p.address} (${p.status})`))
      .child(div().text_size(11.5).text_color(t.dim).child(
        (p.sub ? "Stops the sub-agent." : "Stops the agent and closes its pane.") +
        (kids ? ` Its ${kids} sub-agent${kids > 1 ? "s" : ""} end too.` : "") +
        " Its conversation can't be continued from here." +
        (p.status === "working" ? " It is working right now." : "")))
      .child(h_flex().pt(8).gap(8).justify_end()
        .child(button("end-cancel", "Cancel", false, () => closeOverlay(p.overlay)))
        .child(button("end-ok", "End agent", true, () => { closeOverlay(p.overlay); run("terminal.kill", { terminal: p.address }); })));
  }

  // The "Rigs" popup: OpenRig's teams (rig ps) and whether each has a Herdr space; one
  // without gets "Add", which runs `rig terminal open <rig> --provider herdr-app` here.
  // Closing a team's space in Herdr leaves the team running in OpenRig; this brings it back.
  initRigs(cx) {
    this.rigs = null; this.rigError = null; this.opening = {};
    this.handle = cx.focus_handle(); this.handle.focus();
    if (checking()) return;
    this.loadRigs(cx);
  }

  loadRigs(cx) {
    cx.spawn(async (cx) => {
      try {
        const r = await exec("rig", ["ps", "--json"], { timeout: 20000, ...ON });
        if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim().split("\n").pop() || `exit ${r.code}`);
        this.rigs = JSON.parse(r.stdout).filter(x => !x.isArchived);
      } catch (e) {
        this.rigError = String(e.message ?? e);
      }
      cx.notify();
    });
  }

  // Which Herdr space shows each rig: the space of a live terminal attached to one of its
  // seats (`tmux attach -t =<seat>@<rig>`). Space names can't be trusted: an unnamed space
  // takes its folder's name ("ticketing"), not the rig's.
  rigSpaces() {
    const map = {};
    for (const k of terminals()) {
      if (k.state !== "live") continue;
      const argv = k.argv ?? [], i = argv.indexOf("attach");
      const target = i >= 0 && argv[i + 1] === "-t" ? argv[i + 2] ?? "" : "";
      const rig = /^=[^@]+@(.+)$/.exec(target)?.[1];
      const space = labelId(k, "herdr.space");
      if (rig && space && argv.includes("tmux")) map[rig] ??= space;
    }
    return map;
  }

  // Add a rig as a Herdr space: one terminal per seat, each attached to the seat's tmux
  // session (as OpenRig's own Herdr spaces are), laid out two by two. Closing that space
  // later only closes the views; the seats keep running in OpenRig.
  addRig(name, cx) {
    this.opening[name] = "opening";
    cx.notify();
    // Waits (up to ~10s) for the live data to show what a command made.
    const until = async (cx, find) => {
      for (let i = 0; i < 40; i++) { const v = find(); if (v) return v; await delay(cx, 250); }
      throw new Error("Herdr didn't show the new pane");
    };
    cx.spawn(async (cx) => {
      try {
        const r = await exec("rig", ["ps", "--nodes", "--rig", name, "--json", "--fields", "logicalId,canonicalSessionName,tmuxAttachCommand"], { timeout: 20000, ...ON });
        if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim().split("\n").pop());
        const seats = JSON.parse(r.stdout).entries ?? [];
        if (!seats.length) throw new Error("no seats");
        // "tmux attach -t dev-lead@tkt" (plus any socket flags) → exact-match target, outside any tmux.
        const argvOf = (s) => {
          const words = (s.tmuxAttachCommand || `tmux attach -t ${s.canonicalSessionName}`).split(/\s+/);
          const i = words.indexOf("-t");
          if (i >= 0 && words[i + 1] && !words[i + 1].startsWith("=")) words[i + 1] = `=${words[i + 1]}`;
          return ["env", "-u", "TMUX", ...words];
        };
        const before = new Set(spaces().map(sp => sp.id));
        run("space.new", { name, machine: MACHINE ?? "", argv: argvOf(seats[0]), focus: false });
        const sp = await until(cx, () => spaces().find(x => !before.has(x.id) && x.name === name));
        const first = await until(cx, () => panes().find(p => p.tab === sp.tabs[0]?.id && p.terminal));
        const made = [first.pane];
        // 2 seats side by side; then each further seat splits down under an earlier one.
        for (let i = 1; i < seats.length; i++) {
          const from = i === 1 ? made[0] : made[(i - 2) % 2];
          const known = new Set(panes().map(p => p.pane));
          run("pane.split", { pane: from, direction: i === 1 ? "right" : "down", argv: argvOf(seats[i]) });
          made.push((await until(cx, () => panes().find(p => p.tab === first.tab && !known.has(p.pane)))).pane);
        }
        this.opening[name] = "added";
      } catch (e) {
        this.opening[name] = `failed: ${e.message ?? e}`;
      }
      cx.notify();
    });
  }

  renderRigs() {
    const t = theme(), p = props();
    const shown = this.rigSpaces();
    const spaceOf = (name) => spaces().find(sp => sp.id === shown[name]);
    const btn = (id, text, primary, action) => h_flex().id(id).h(24).px(10).flex_none().items_center().rounded(6)
      .border_1().border_color(primary ? C.violet : t.input).bg(primary ? C.violet : t.raised)
      .text_color(primary ? "#ffffff" : t.foreground).text_size(11).cursor_pointer()
      .hover(s => s.opacity(0.88)).on_click(action).child(text);
    const row = (r) => {
      const sp = spaceOf(r.name), st = this.opening[r.name];
      const right = sp
        ? btn(`go-${r.name}`, "Go to", false, () => { closeOverlay(p.overlay); run("space.select", { id: sp.id }); })
        : st === "opening" ? div().text_size(11).text_color(t.dim).child("Adding…")
        : btn(`add-${r.name}`, "Add", true, (_e, cx) => this.addRig(r.name, cx));
      return v_flex().w_full().px(10).py(8).gap(3).rounded(7).bg(t.raised)
        .child(h_flex().gap(8).items_center()
          .child(dot(r.status === "running" ? "#39a380" : C.muted, 7))
          .child(div().text_size(12.5).font_semibold().child(r.name))
          .child(div().text_size(10.5).text_color(t.dim).child(`${r.runningCount}/${r.nodeCount} seats · ${r.status}`))
          .child(div().flex_1())
          .child(div().text_size(10.5).text_color(sp ? C.muted : t.dim).child(sp ? "in Herdr" : "not in Herdr"))
          .child(right))
        .when(Boolean(st && st !== "opening"), el => el.child(div().text_size(10.5).text_color(st === "added" ? "#39a380" : "#d05252").truncate().child(st === "added" ? "Added to Herdr" : st)));
    };
    return v_flex().id("rigs").track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { closeOverlay(p.overlay); cx.stop_propagation(); } })
      .w_full().p(14).gap(8).bg(t.popover).text_color(t.foreground)
      .child(h_flex().items_center().child(div().flex_1().text_size(14).font_semibold().child("OpenRig teams"))
        .child(div().text_size(10.5).text_color(t.dim).child("Esc")))
      .child(this.rigError ? div().text_size(11.5).text_color("#d05252").child(`Couldn't read rig ps: ${this.rigError}`)
        : !this.rigs ? div().text_size(11.5).text_color(t.dim).child("Loading…")
        : !this.rigs.length ? div().text_size(11.5).text_color(t.dim).child("No teams in OpenRig.")
        : v_flex().gap(6).children(this.rigs.map(row)));
  }

  setHidden(keys, on) {
    const h = { ...(shared(HIDDEN) ?? {}) };
    for (const k of keys) { if (on) h[k] = true; else delete h[k]; }
    setShared(HIDDEN, h);
  }

  // One column's cards in tree order: each top-level agent followed by its sub-agents
  // in this column (depth first); sub-agents whose parent isn't here come last.
  // Most recently changed first: agents by seq (Herdr's change order), sub-agents by
  // when this board last saw their status change (see render).
  columnCards(cards, state) {
    const here = new Set(cards.map(a => a.address));
    const recent = (x, y) => (y.changed ?? 0) - (x.changed ?? 0);
    const kids = (addr) => cards.filter(a => a.sub && a.parent === addr).sort(recent);
    const out = [];
    const walk = (addr, depth) => {
      const ks = kids(addr);
      ks.forEach((k, i) => { out.push(this.subCard(k, state, depth, i === ks.length - 1, true)); walk(k.address, depth + 1); });
    };
    for (const a of cards.filter(a => !a.sub).sort((x, y) => (y.seq ?? 0) - (x.seq ?? 0))) { out.push(this.card(a, state)); walk(a.address, 1); }
    const orphans = cards.filter(a => a.sub && !here.has(a.parent)).sort(recent);
    orphans.forEach((k, i) => { out.push(this.subCard(k, state, 1, i === orphans.length - 1, false)); walk(k.address, 2); });
    return out;
  }

  // On macOS with no title bar the window buttons sit over the top-left corner: leave
  // them room when the sidebar is hidden or narrow (as the shipped tab bar does).
  lightsPadding() {
    const root = layout(), w = window(), sidebar = find(root, "sidebar");
    if (!(w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights)) return 26;
    const zoom = settings().zoom || 1;
    return Math.max(26, (root.traffic_lights[0] + 64) / zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0));
  }

  render() {
    sync();
    const role = props()?.role;
    if (role === "rename") return this.renderRename();
    if (role === "end") return this.renderEnd();
    if (role === "rigs") return this.renderRigs();
    const active = spaces().find(s => s.active);
    const all = boardItems();
    const list = filtered(all, active);
    const counts = shared(TOKENS) ?? {};
    const known = list.filter(a => counts[a.address] != null);
    const totalTokens = known.length ? known.reduce((n, a) => n + counts[a.address], 0) : null;
    const where = shared(SCOPE) === "space" ? `in ${active?.name ?? "this space"}` : `across ${spaces().length} spaces`;
    if (role === "header") return v_flex().size_full().bg(C.white).px(26).pl(this.lightsPadding()).justify_center().gap(12)
      .child(h_flex().items_center().gap(10)
        .child(h_flex().gap(3).items_center().children([17, 12, 20].map(h => div().w(5).h(h).rounded(2).bg(C.violet))))
        .child(div().text_size(20).font_semibold().text_color(C.ink).child(active?.name ?? "Project board"))
        .child(div().text_size(19).text_color(C.dim).child("/"))
        .child(div().text_size(14).text_color(C.muted).child("Agent board"))
        .child(div().flex_1())
        .child(div().text_size(11).text_color(C.muted).child(`${list.length} ${shared(WHO) === "pinned" ? "pinned " : ""}agents ${where}`))
        // Linux/Windows draw no window buttons when the layout hides the title bar: draw them here.
        .when(Boolean(window()?.buttons), el => el.child(h_flex().gap(2).ml(8).children([
          ["win-min", "mods/tabs/win-min.svg", "window.minimize"],
          ["win-max", `mods/tabs/${window()?.maximized ? "win-restore" : "win-max"}.svg`, "window.maximize"],
          ["win-close", "mods/tabs/win-close.svg", "window.close"],
        ].map(([id, ic, cmd]) => div().id(id).size(28).flex().items_center().justify_center().rounded(6).text_color(C.muted)
          .hover(s => s.bg(id === "win-close" ? "#d05252" : C.raised).text_color(id === "win-close" ? "#ffffff" : C.ink))
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(() => run(cmd)).child(svg(ic).size(16))))))
        // Tokens of the agents counted on the left (Claude Code only), as a pill.
        .when(totalTokens != null, el => el.child(h_flex().h(22).px(8).gap(5).items_center().rounded(6).bg(C.violet + "22")
          .text_size(11).text_color(C.violet)
          .child(div().font_semibold().child(tok(totalTokens ?? 0))).child(div().child("tokens")))))
      .child(h_flex().gap(7).items_center().child(toggle(SCOPE, "all", "space", "All spaces", "This space"))
        .child(toggle(WHO, "all", "pinned", "All agents", "Pinned only"))
        .child(div().flex_1()).child(dot("#39a380", 6))
        .child(div().text_size(10).text_color(C.muted).child("Live updates")));
    if (role === "terminals") {
      const tab = active?.tabs.find(t => t.active);
      return h_flex().size_full().px(16).items_center().gap(8).bg(C.white)
        .child(dot(C.violet)).child(div().text_size(12).font_semibold().text_color(C.ink).child("Live workspace"))
        .child(div().text_size(11).text_color(C.muted).child(`${active?.name ?? ""} / ${tab?.name ?? ""}`))
        .child(div().flex_1())
        // Shows or hides the right Files panel (layout node "side-panel"); also cmd-shift-b.
        .child((() => {
          const side = find(layout(), "side-panel");
          if (!side) return div().text_size(10).text_color(C.muted).child("TERMINALS");
          const shown = !side.hidden;
          return chip(shown ? "Hide Files" : "Files", shown).id("chip-side-panel").cursor_pointer()
            .hover(s => s.border_color(C.violet + "88"))
            .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
            .tooltip("Show or hide the Files panel (⌘⇧B)")
            .on_click(() => run("layout.toggle", { id: "side-panel" }));
        })());
    }
    if (role === "pane") {
      const p = panes().find(p => p.pane === props()?.pane);
      // A renamed pane shows its name; a mod pane its title.
      const label = p?.name || (p?.terminal ? p?.program?.name : p?.title || p?.mod) || "Terminal";
      return h_flex().id(`pane-head-${p?.pane ?? "none"}`).size_full().px(13).items_center().gap(7).bg(C.raised).border_b(1).border_color(C.line)
        .on_click(() => p && run("pane.focus", { pane: p.pane }))
        .child(icon(p?.program, 14)).child(div().min_w(0).truncate().text_size(11).text_color(C.ink).child(label))
        .child(div().flex_1()).child(dot(STATES.find(s => s.key === p?.status)?.color ?? C.muted, 6));
    }
    // Time is kept for every agent; the 1s tick only runs while a shown card is working.
    // Navigation order (agent.next/prev) is left to the sidebar's agents list.
    this.track(all);
    // Sub-agents have no change order from Herdr (status_ms is null in terminals()):
    // stamp each one when this board sees its status change; first sighting uses its start time.
    this.subSeen ??= {};
    for (const a of all) if (a.sub) {
      const prev = this.subSeen[a.key];
      if (!prev || prev.status !== a.status) this.subSeen[a.key] = { status: a.status, at: prev ? Date.now() : a.created || Date.now() };
      a.changed = this.subSeen[a.key].at;
    }
    this.visibleWorking = list.some(a => a.status === "working");
    // A hidden agent comes back by itself once it's no longer idle; gone ones are forgotten.
    const h = shared(HIDDEN) ?? {};
    const byKey = new Map(all.map(a => [a.key, a]));
    const stale = Object.keys(h).filter(k => byKey.get(k)?.status !== "idle");
    if (stale.length && all.length) this.setHidden(stale, false);
    return h_flex().size_full().px(24).py(17).gap(16).bg(C.bg).children(STATES.map(state => {
      const cards = list.filter(a => a.status === state.key);
      const hiddenKeys = shared(HIDDEN) ?? {};
      const shown = cards.filter(a => !hiddenKeys[a.key]), hidden = cards.filter(a => hiddenKeys[a.key]);
      return v_flex().flex_1().min_w(0).h_full().gap(9)
        .child(h_flex().h(27).flex_none().items_center().gap(8).px(3)
          .child(dot(state.color, 8)).child(div().text_size(13).font_semibold().text_color(C.ink).child(state.label))
          .child(div().px(6).py(2).rounded(4).bg(state.color + "26").text_size(10).text_color(state.color).child(String(state.key === "idle" ? shown.length : cards.length)))
        .when(state.key === "idle" && shown.length > 0, el => el.child(div().flex_1()).child(
            h_flex().id("hide-all-idle").h(22).px(7).gap(5).items_center().rounded(5).cursor_pointer()
              .text_size(10.5).text_color(C.muted).hover(s => s.bg(C.raised).text_color(C.ink))
              .tooltip("Hide every idle agent from the board; they keep running")
              .on_click(() => this.setHidden(shown.map(a => a.key), true))
              .child(svg("mods/workspace-chrome/archive.svg").size(11)).child(div().child("Hide all")))))
        .child(v_flex().flex_1().min_h(0).overflow_y_scrollbar().gap(9).children([
          ...this.columnCards(state.key === "idle" ? shown : cards, state),
          ...(state.key === "idle" && hidden.length ? [
            h_flex().id("toggle-hidden").h(24).flex_none().px(4).gap(5).items_center().rounded(5).cursor_pointer()
              .text_size(10.5).text_color(C.muted).hover(s => s.text_color(C.ink))
              .on_click((_e, cx) => { this.showHidden = !this.showHidden; cx.notify(); })
              .child(svg(`mods/workspace-chrome/${this.showHidden ? "chevron-down" : "chevron-right"}.svg`).size(11))
              .child(div().child(`${this.showHidden ? "Hide" : "Show"} ${hidden.length} hidden`)),
            ...(this.showHidden ? [v_flex().w_full().flex_none().gap(9).opacity(0.55).children(this.columnCards(hidden, state))] : []),
          ] : []),
        ]));
    }));
  }
}
