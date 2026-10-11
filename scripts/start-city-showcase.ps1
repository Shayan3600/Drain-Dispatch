$ErrorActionPreference = 'Stop'
$cityProject = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$cityNode = (Get-Command node.exe -ErrorAction Stop).Source
$cityLogs = Join-Path $cityProject '.data/city-host-logs'
New-Item -ItemType Directory -Path $cityLogs -Force | Out-Null
$cityStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$cityPreviousEnvironment = [Environment]::GetEnvironmentVariable('NODE_ENV','Process')
[Environment]::SetEnvironmentVariable('NODE_ENV','development','Process')
try {
    $cityProcess = Start-Process -FilePath $cityNode -ArgumentList @('--import','tsx','scripts/city-showcase.ts') -WorkingDirectory $cityProject -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $cityLogs "showcase-$cityStamp.log") -RedirectStandardError (Join-Path $cityLogs "showcase-$cityStamp.error.log")
} finally {
    [Environment]::SetEnvironmentVariable('NODE_ENV',$cityPreviousEnvironment,'Process')
}
$cityManifest = Join-Path $cityProject '.data/city-showcase-active.json'
$cityReady = $false
for ($cityAttempt=0; $cityAttempt -lt 25; $cityAttempt++) {
    if ($cityProcess.HasExited) { break }
    try {
        $cityInfo = Get-Content -LiteralPath $cityManifest -Raw | ConvertFrom-Json
        if ($cityInfo.pid -eq $cityProcess.Id -and $cityInfo.synthetic -eq $true) {
            $cityHealth = Invoke-RestMethod "$($cityInfo.apiOrigin)/api/health" -TimeoutSec 2
            if ($cityHealth.ok -eq $true -and $cityHealth.databaseMode -eq 'local-postgresql') {
                $cityReady = $true
                break
            }
        }
    } catch {}
    Start-Sleep -Seconds 1
}
if (-not $cityReady) {
    if (-not $cityProcess.HasExited) { Stop-Process -Id $cityProcess.Id -ErrorAction SilentlyContinue }
    Get-Content -LiteralPath (Join-Path $cityLogs "showcase-$cityStamp.error.log") -ErrorAction SilentlyContinue
    throw "Demo server did not pass its local health check. See $cityLogs."
}
Write-Host "City showcase: $($cityInfo.url)"
Write-Host '48 DEMO reports; 152 submissions; 48 synthetic image illustrations; 200 history events.'
Write-Host 'Saved reports load automatically. Choose Community status > All statuses to see all 48.'
Write-Host "Stop only this demo server with: Stop-Process -Id $($cityProcess.Id)"
Start-Process $cityInfo.url
