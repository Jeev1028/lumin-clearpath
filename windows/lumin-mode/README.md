# Lumin mode

Lumin becomes your desktop: wallpaper desktop with a clock, Ask-Lumin box and
file browser, a floating dock with your running windows, and a launcher
(Ctrl+Space) for every installed app plus power options.

## Try it safely first (nothing changes in Windows)

    Lumin.exe --desktop

Windows' own desktop keeps running underneath. Press Ctrl+Alt+Shift+E (or use
"Windows desktop" in the launcher) to leave; or just close it from Task Manager.

## Make it your real desktop

1. Install Lumin for Windows (the installer from the GitHub release).
2. Run `Install-Lumin-Mode.ps1` in PowerShell (right-click > Run with PowerShell).
3. Sign out and back in.

It only affects your own Windows account (no admin needed).

## Undo

- In Lumin: Ctrl+Alt+Shift+E, or launcher > "Windows desktop".
- From anywhere: Ctrl+Shift+Esc > Run new task > browse to
  `Documents\Restore-Windows-Desktop.cmd`.
- Another admin account can also delete the `Shell` value under
  `HKCU\Software\Microsoft\Windows NT\CurrentVersion\Winlogon` for your user.

## What is different from normal Windows

No taskbar, Start menu, Win-key shortcuts, system tray icons or Windows toast
notifications, and apps listed in your startup folder/registry do not auto-start
(Explorer normally launches those). Everything else runs as usual.
