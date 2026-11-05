$root = $PSScriptRoot
if (-not $root) { throw 'Run this file from the repository with PowerShell.' }
Push-Location $root
try {
  node scripts/generate-test-report.js
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}
