# Makes Lumin the desktop (Windows "shell") for YOUR Windows account only.
# No admin needed. Undo any time with Restore-Windows-Desktop.cmd.
#
# While Lumin mode is on, Windows' own desktop, taskbar and Start menu are NOT
# running. Apps still run normally and Ctrl+Shift+Esc (Task Manager) still works.
param([string]$LuminExe = "")

$ErrorActionPreference = "Stop"
$key = "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Winlogon"

if (-not $LuminExe) {
  $candidates = @(
    "$env:LOCALAPPDATA\Programs\Lumin\Lumin.exe",
    "$env:ProgramFiles\Lumin\Lumin.exe"
  )
  $LuminExe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $LuminExe -or -not (Test-Path $LuminExe)) {
  Write-Host "Could not find Lumin.exe. Install Lumin for Windows first, or run:" -ForegroundColor Red
  Write-Host '  .\Install-Lumin-Mode.ps1 -LuminExe "C:\path\to\Lumin.exe"'
  exit 1
}

Write-Host ""
Write-Host "Lumin mode will replace the Windows desktop for user '$env:USERNAME'." -ForegroundColor Cyan
Write-Host "  - Takes effect the NEXT time you sign in."
Write-Host "  - No taskbar, Start menu, Win-key shortcuts, system tray icons or Windows notifications."
Write-Host "  - Startup apps that Windows normally launches for you will not auto-start."
Write-Host "  - Escape hatches: Ctrl+Alt+Shift+E inside Lumin, the 'Windows desktop' button in the"
Write-Host "    launcher (Ctrl+Space), or Task Manager (Ctrl+Shift+Esc) > Run new task >"
Write-Host "    the Restore-Windows-Desktop.cmd saved in your Documents folder."
Write-Host ""
$answer = Read-Host "Type LUMIN to turn it on"
if ($answer -ne "LUMIN") { Write-Host "Cancelled. Nothing changed."; exit 0 }

# Leave a restore script somewhere easy to find from Task Manager.
$restoreSrc = Join-Path $PSScriptRoot "Restore-Windows-Desktop.cmd"
$restoreDst = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "Restore-Windows-Desktop.cmd"
if (Test-Path $restoreSrc) { Copy-Item $restoreSrc $restoreDst -Force }

Set-ItemProperty -Path $key -Name "Shell" -Value ('"' + $LuminExe + '" --shell') -Type String
Write-Host ""
Write-Host "Done. Sign out and back in to enter Lumin mode." -ForegroundColor Green
Write-Host "To undo: run $restoreDst (or Restore-Windows-Desktop.cmd from this folder)."
