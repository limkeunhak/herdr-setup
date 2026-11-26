Based on https://github.com/Gwynbleid85/herdr-tmux-prefix (commit 0b66394), Apache-2.0 (see LICENSE).
Changed here: `v` splits right and `s` splits down (`%` removed); no repeat window; keys matched by
physical key when a non-Latin input source (Korean) is on, and by Shift not Caps Lock; Ctrl+B only
without other modifiers; literal Ctrl+B goes to a `terminal.show` replacement; viewport divided by
zoom; `[prefix]` drawn as a small opaque pill.
