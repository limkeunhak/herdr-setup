@echo off
rem OpenRig TUI wrapper: runs `openrig-tui` inside WSL Ubuntu.
rem Installed into %USERPROFILE%\.local\bin by install-windows.ps1.
wsl.exe -d Ubuntu --exec bash -lc "exec openrig-tui \"$@\"" openrig-tui %*
