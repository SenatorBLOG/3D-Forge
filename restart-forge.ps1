# One-click restart for the demo. Frees the app ports, then starts server + client.
# Run from a PowerShell terminal in this folder:  .\restart-forge.ps1
Write-Host "Freeing ports 3001 / 5173..." -ForegroundColor Cyan
Get-NetTCPConnection -LocalPort 3001,5173 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } catch {} }
Start-Sleep -Milliseconds 800
Set-Location $PSScriptRoot
Write-Host "Starting 3D Forge (client :5173 + server :3001)..." -ForegroundColor Green
npm run dev
