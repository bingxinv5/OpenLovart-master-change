param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot,
    [int]$Port = 3001,
    [int]$StartupTimeoutSec = 15,
    [switch]$InstallDependencies,
    [ValidateSet('inline', 'hidden', 'window')]
    [string]$OutputMode = 'inline',
    [string]$WindowTitle = 'OpenLovart Upscayl API'
)

$ErrorActionPreference = 'Stop'

$serviceRoot = Join-Path $ProjectRoot 'upscayl-api'
$packageJson = Join-Path $serviceRoot 'package.json'
$stampFile = Join-Path $serviceRoot '.openlovart-upscayl-deps-installed.stamp'
$runtimeRoot = Join-Path $ProjectRoot '.runtime'
$logRoot = Join-Path $runtimeRoot 'logs'
$logFile = Join-Path $logRoot 'upscayl-api.log'

if (-not (Test-Path -LiteralPath $packageJson)) {
    Write-Warning '[upscayl] upscayl-api was not found. Skipping dual-service startup.'
    exit 0
}

function Test-UpscaylHealth {
    param([int]$HealthPort)

    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$HealthPort/api/health" -UseBasicParsing -TimeoutSec 3
        return $response.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

function Get-NeedsInstall {
    if (-not (Test-Path -LiteralPath (Join-Path $serviceRoot 'node_modules'))) {
        return $true
    }

    if (-not (Test-Path -LiteralPath $stampFile)) {
        return $true
    }

    $stampTime = (Get-Item -LiteralPath $stampFile).LastWriteTimeUtc
    $latestConfigTime = @(
        (Get-Item -LiteralPath $packageJson).LastWriteTimeUtc,
        (Get-Item -LiteralPath (Join-Path $serviceRoot 'package-lock.json') -ErrorAction SilentlyContinue).LastWriteTimeUtc
    ) | Where-Object { $_ }

    if (-not $latestConfigTime) {
        return $false
    }

    return (($latestConfigTime | Sort-Object -Descending | Select-Object -First 1) -gt $stampTime)
}

function Start-UpscaylProcess {
    if ($OutputMode -eq 'window') {
        $command = 'cd /d "{0}" & set PORT={1} & npm start' -f $serviceRoot, $Port
        Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', $command -WorkingDirectory $serviceRoot -WindowStyle Normal | Out-Null
        return
    }

    if ($OutputMode -eq 'inline') {
        $command = 'start "" /b cmd /d /c "cd /d ""{0}"" & set PORT={1} & npm start"' -f $serviceRoot, $Port
        & cmd.exe /c $command
        return
    }

    if (-not (Test-Path -LiteralPath $logRoot)) {
        New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
    }

    Add-Content -LiteralPath $logFile -Value ("`r`n[{0}] Starting Upscayl API on port {1}" -f (Get-Date).ToString('s'), $Port) -Encoding ascii
    $command = 'cd /d "{0}" & set PORT={1} & npm start >> "{2}" 2>&1' -f $serviceRoot, $Port, $logFile
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $command -WorkingDirectory $serviceRoot -WindowStyle Hidden | Out-Null
}

if ($InstallDependencies.IsPresent -and (Get-NeedsInstall)) {
    Write-Host '[upscayl] Installing/updating upscayl-api dependencies...'
    Push-Location $serviceRoot
    try {
        & npm install --no-fund --no-audit
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed with exit code $LASTEXITCODE"
        }
        Set-Content -LiteralPath $stampFile -Value '' -Encoding ascii
    }
    finally {
        Pop-Location
    }
}

if (Test-UpscaylHealth -HealthPort $Port) {
    Write-Host "[upscayl] Service is ready: http://127.0.0.1:$Port"
    exit 0
}

$listeningProcess = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listeningProcess) {
    Write-Warning "[upscayl] Port $Port is already in use by another process and the health check failed. Free the port first."
    exit 1
}

Start-UpscaylProcess

$deadline = (Get-Date).AddSeconds($StartupTimeoutSec)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 800
    if (Test-UpscaylHealth -HealthPort $Port) {
        Write-Host "[upscayl] Service started: http://127.0.0.1:$Port"
        exit 0
    }
}

if ($OutputMode -eq 'window' -or $OutputMode -eq 'inline') {
    Write-Warning '[upscayl] Service startup timed out. The main app can continue, but AI upscale will be unavailable.'
} else {
    Write-Warning "[upscayl] Service startup timed out. Check $logFile for details. The main app can continue, but AI upscale will be unavailable."
}
exit 1