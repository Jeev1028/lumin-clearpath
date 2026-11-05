@echo off
rem Puts the normal Windows desktop and taskbar back for this account.
reg delete "HKCU\Software\Microsoft\Windows NT\CurrentVersion\Winlogon" /v Shell /f >nul 2>&1
start "" explorer.exe
echo Windows desktop restored. Lumin mode is off the next time you sign in too.
timeout /t 3 >nul
