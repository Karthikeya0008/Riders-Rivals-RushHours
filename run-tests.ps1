# Runs the backend test-suite (pytest) and, if dependencies are installed, the frontend type-check + build.
$ErrorActionPreference = "Stop"
$backend = Join-Path $PSScriptRoot "backend"
$python = Join-Path $backend ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    throw "backend\.venv not found. Run .\start-backend.ps1 once to create it."
}
Push-Location $backend
$env:RRR_PREWARM = "0"
& $python -m pytest -q
$backendStatus = $LASTEXITCODE
Pop-Location
if ($backendStatus -ne 0) {
    Write-Host "Backend tests FAILED" -ForegroundColor Red
    exit $backendStatus
}
Write-Host "Backend tests passed" -ForegroundColor Green

$frontend = Join-Path $PSScriptRoot "frontend"
if (Test-Path (Join-Path $frontend "node_modules")) {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        $env:Path = "C:\Program Files\nodejs;$env:Path"
    }
    Push-Location $frontend
    npm run build
    $frontendStatus = $LASTEXITCODE
    Pop-Location
    if ($frontendStatus -ne 0) {
        Write-Host "Frontend type-check/build FAILED" -ForegroundColor Red
        exit $frontendStatus
    }
    Write-Host "Frontend type-check and build passed" -ForegroundColor Green
} else {
    Write-Host "Skipping frontend checks (run .\start-frontend.ps1 once to install packages)."
}
