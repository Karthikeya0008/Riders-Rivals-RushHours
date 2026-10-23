# Regenerates every report figure (reports/figures/*.png) and docs/RESULTS.md from the default configuration.
$ErrorActionPreference = "Stop"
$python = Join-Path $PSScriptRoot "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    throw "backend\.venv not found. Run .\start-backend.ps1 once to create it."
}
Push-Location $PSScriptRoot
& $python reports\make_figures.py
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
& $python reports\generate_results.py
$status = $LASTEXITCODE
Pop-Location
exit $status
