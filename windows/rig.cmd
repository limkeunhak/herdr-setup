@echo off
rem OpenRig wrapper: runs `rig` inside WSL Ubuntu (OpenRig does not support native Windows).
rem Installed into %USERPROFILE%\.local\bin by install-windows.ps1.
wsl.exe -d Ubuntu --exec bash -lc "exec rig \"$@\"" rig %*
