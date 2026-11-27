#!/usr/bin/env bash
# macOS: put the herdr-board layout and its mods into Herdr's home.
#   bash install-mac.sh                 # Herdr home: $HERDR_APP_HOME or ~/.config/herdr-app
#   bash install-mac.sh --home <dir>    # another Herdr home
#   bash install-mac.sh --no-switch     # don't check the mods or switch Herdr's layout
#
# Copies layout herdr-board and mods herdr-board, tab-notes, tmux-prefix; makes my-spaces from
# this Herdr's own `spaces` mod plus my-spaces.patch.json; sets the terminal font to D2Coding and
# copies its .ttf files into Herdr's fonts/ folder;
# adds the two Ctrl+B keys (never replacing a key already bound to something else).
# Everything it replaces is backed up first. Start Herdr once before this, so its home exists.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
src="$here/herdr-app"
home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
switch=1
while [ $# -gt 0 ]; do
  case "$1" in
    --home) home="$2"; shift 2 ;;
    --no-switch) switch=0; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

[ -d "$home" ] || { echo "Herdr home not found: $home (start Herdr once, or pass --home)" >&2; exit 1; }
[ -d "$home/mods/spaces" ] || { echo "$home/mods/spaces is missing: start Herdr once so it installs its mods" >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 is needed" >&2; exit 1; }
echo "Herdr home: $home"

stamp="$(date +%Y%m%d-%H%M%S)"
backup="$home/backup-before-herdr-board-$stamp"
mkdir -p "$backup"
for f in keys.json settings.json layouts/herdr-board.json; do
  [ -e "$home/$f" ] && cp "$home/$f" "$backup/$(echo "$f" | tr / _)"
done
for m in herdr-board my-spaces tab-notes tmux-prefix; do
  [ -d "$home/mods/$m" ] && cp -R "$home/mods/$m" "$backup/mods_$m"
done
echo "Backup: $backup"

mkdir -p "$home/layouts" "$home/mods"
cp "$src/layouts/herdr-board.json" "$home/layouts/"
for m in herdr-board tab-notes tmux-prefix; do
  rm -rf "$home/mods/$m"
  cp -R "$src/mods/$m" "$home/mods/$m"
done
echo "Copied layout herdr-board and mods herdr-board, tab-notes, tmux-prefix"

# my-spaces: a copy of this Herdr's `spaces` (its asset paths renamed, as mod.clone does) plus the patch.
rm -rf "$home/mods/my-spaces"
cp -R "$home/mods/spaces" "$home/mods/my-spaces"

HOME_DIR="$home" SRC="$src" python3 - <<'PY'
import json, os
home, src = os.environ["HOME_DIR"], os.environ["SRC"]

def load(p, default):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default

def save(p, v):
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(v, f, ensure_ascii=False, indent=2)
    os.replace(tmp, p)

# my-spaces
main = os.path.join(home, "mods/my-spaces/main.js")
code = open(main, encoding="utf-8").read().replace("mods/spaces/", "mods/my-spaces/")
patch = load(os.path.join(src, "my-spaces.patch.json"), {"edits": []})
missed = [e for e in patch["edits"] if code.count(e["find"]) != 1]
if missed:
    print(f"WARNING my-spaces: this Herdr's spaces mod differs from the one the patch was made for "
          f"({len(missed)} of {len(patch['edits'])} edits didn't match). Left unpatched: Spaces works, "
          f"without the OpenRig badge and button.")
else:
    for e in patch["edits"]:
        code = code.replace(e["find"], e["replace"])
    print("my-spaces: copied from this Herdr's spaces and patched")
open(main, "w", encoding="utf-8").write(code)
mj = os.path.join(home, "mods/my-spaces/mod.json")
m = load(mj, {})
m["cloned_from"] = {"name": "spaces"}
save(mj, m)

# settings.json: terminal font
sp = os.path.join(home, "settings.json")
s = load(sp, {})
s["font"] = "D2Coding"
save(sp, s)
print('settings.json: "font": "D2Coding"')

# keys.json: add, never replace
kp = os.path.join(home, "keys.json")
if not os.path.exists(kp):
    print("WARNING keys.json not found: start Herdr once, then run this again for the Ctrl+B keys")
else:
    keys = load(kp, {})
    for section, binds in load(os.path.join(src, "keys-add.json"), {}).items():
        target = keys.setdefault(section, {})
        for k, v in binds.items():
            if k in target and target[k] != v:
                print(f"WARNING keys.json [{section}] {k} is already {target[k]!r}; left as is")
            elif k not in target:
                target[k] = v
                print(f"keys.json [{section}] {k} -> {v}")
    save(kp, keys)
PY

if ! ls "$HOME/Library/Fonts" /Library/Fonts 2>/dev/null | grep -qi d2coding; then
  echo "WARNING D2Coding isn't installed: brew install --cask font-d2coding"
fi

# Herdr's own fonts/ folder: Herdr can fail to load the system's D2Coding .ttc at startup and fall
# back to a font with wide Korean spacing. Separate .ttf files in fonts/ load every time.
ttf=""
for d in "$(brew --prefix 2>/dev/null || echo /opt/homebrew)"/Caskroom/font-d2coding/*/D2Coding "$HOME/Library/Fonts" /Library/Fonts; do
  r=$(ls "$d"/D2Coding-Ver*.ttf 2>/dev/null | grep -v -i ligature | tail -1 || true)
  b=$(ls "$d"/D2CodingBold-Ver*.ttf 2>/dev/null | grep -v -i ligature | tail -1 || true)
  if [ -n "$r" ] && [ -n "$b" ]; then ttf="$r|$b"; break; fi
done
if [ -n "$ttf" ]; then
  mkdir -p "$home/fonts"
  for f in D2Coding.ttf D2CodingBold.ttf; do [ -e "$home/fonts/$f" ] && cp "$home/fonts/$f" "$backup/fonts_$f"; done
  cp "${ttf%%|*}" "$home/fonts/D2Coding.ttf"
  cp "${ttf##*|}" "$home/fonts/D2CodingBold.ttf"
  echo "Copied D2Coding.ttf and D2CodingBold.ttf into $home/fonts"
else
  echo "WARNING D2Coding .ttf files not found (brew install --cask font-d2coding); Korean spacing may be wide"
fi

if [ "$switch" = 1 ] && command -v herdr-app >/dev/null; then
  for m in herdr-board my-spaces tab-notes tmux-prefix; do herdr-app check "$home/mods/$m" | head -1; done
  herdr-app do layout.switch --name herdr-board >/dev/null && echo "Switched Herdr to the herdr-board layout."
fi
echo "Done. Backup of anything replaced: $backup"
