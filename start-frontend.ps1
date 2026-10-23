# Starts the Vite dev server on http://localhost:5173 (installs npm packages on first run).
$ErrorActionPreference = "Stop"
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    $nodeDir = "C:\Program Files\nodejs"
    if (Test-Path (Join-Path $nodeDir "npm.cmd")) {
        $env:Path = "$nodeDir;$env:Path"
    } else {
        throw "Node.js was not found. Install Node LTS (winget install OpenJS.NodeJS.LTS) and reopen PowerShell."
    }
}
$frontend = Join-Path $PSScriptRoot "frontend"
Push-Location $frontend
try {
    if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
        Write-Host "Installing npm packages ..."
        npm install
    }
    Write-Host "Frontend: http://localhost:5173  (start the backend first with .\start-backend.ps1)"
    npm run dev
} finally { Pop-Location }
