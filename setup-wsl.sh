#!/usr/bin/env bash
# Run INSIDE WSL2 (Ubuntu): installs what the agents and OpenRig need there.
#   bash setup-wsl.sh
# Installs: tmux, python3, git, curl (apt); Node.js 22 (NodeSource apt repo);
# Claude Code and OpenRig (npm, into ~/.local so no sudo is needed for them);
# links claude, rig, hc and herdr-core into /usr/local/bin so Herdr's core can run them;
# then runs `rig setup --providers claude --no-herdr` (Herdr runs on Windows, not here).
# Each step says what it does first. Safe to run again.
set -euo pipefail

say() { printf '\n==> %s\n' "$*"; }

say "apt: tmux python3 git curl ca-certificates (asks for your WSL password)"
sudo apt-get update
sudo apt-get install -y tmux python3 git curl ca-certificates

if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  say "Node.js 22 from NodeSource (apt)"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  say "Node.js $(node -v) already installed"
fi

say "npm global folder: ~/.local (so global installs need no sudo)"
npm config set prefix "$HOME/.local"
mkdir -p "$HOME/.local/bin"
# Shells opened in Herdr terminals must find ~/.local/bin (Herdr's core itself does not
# read this; see the /usr/local/bin links below).
if ! grep -q 'HOME/.local/bin' "$HOME/.profile" 2>/dev/null; then
  printf '\n# added by herdr-windows-setup\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$HOME/.profile"
fi
export PATH="$HOME/.local/bin:$PATH"

say "Claude Code and OpenRig (npm -g)"
npm install -g @anthropic-ai/claude-code @openrig/cli

say "Links in /usr/local/bin so Herdr's core finds claude, rig and hc"
# herdr-core runs as a systemd --user service (systemd-run), which does not read ~/.profile,
# so its PATH lacks ~/.local/bin. Without these links the board's `rig ps` (MACHINE = "wsl")
# and `hc run claude` fail with "No such file or directory". herdr-core and hc are installed
# later by `hc machine add`; their links stay dangling until then.
for b in claude rig hc herdr-core; do
  sudo ln -sfn "$HOME/.local/bin/$b" "/usr/local/bin/$b"
done

say "OpenRig setup for Claude Code (no Herdr TUI here)"
rig setup --providers claude --no-herdr

say "Versions"
tmux -V; node -v; python3 --version; claude --version || true; rig --version

cat <<'EOF'

Done in WSL. Next (see README.md):
  1. claude            # sign in once, then /exit
  2. on Windows: install Herdr, D2Coding, connect WSL as machine "wsl", run install-windows.ps1
  3. keep projects in WSL (e.g. ~/Projects/<project>), not under /mnt/c; start teams with rig start / rig up
EOF
