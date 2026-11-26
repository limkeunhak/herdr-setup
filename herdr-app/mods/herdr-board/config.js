// Where OpenRig (rig, tmux) and the Claude Code agents run, as Herdr names that machine.
// null: this computer (macOS/Linux). On Windows, OpenRig lives in WSL: the machine added with
//   hc machine add --via 'wsl.exe -d Ubuntu -e sh -c' --name wsl
// so set it to "wsl".
export const MACHINE = null;
