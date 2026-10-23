# Starts the FastAPI backend on http://127.0.0.1:8000 (creates backend/.venv on first run).
param([switch]$Reload, [int]$Port = 8000)
$ErrorActionPreference = "Stop"
$backend = Join-Path $PSScriptRoot "backend"
$venv = Join-Path $backend ".venv"
$python = Join-Path $venv "Scripts\python.exe"
if (-not (Test-Path $python)) {
    Write-Host "Creating virtual environment in backend\.venv ..."
    python -m venv $venv
    & $python -m pip install --upgrade pip
    & $python -m pip install -r (Join-Path $backend "requirements.txt")
}
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $Port is already in use - the backend is probably already running (or pass -Port 8001)."
}
$uvicornArgs = @("-m", "uvicorn", "api.main:app", "--host", "127.0.0.1", "--port", "$Port")
if ($Reload) { $uvicornArgs += "--reload" }
Write-Host "Backend: http://127.0.0.1:$Port  (API docs at /docs). Results for the default config are pre-computed in the background."
Push-Location $backend
try { & $python @uvicornArgs } finally { Pop-Location }
