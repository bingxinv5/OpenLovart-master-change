param(
    [string]$SourceRoot = 'Z:\TD\AI\OpenLovart-master',
    [string]$LocalRoot = "$env:LOCALAPPDATA\OpenLovartRuntime\OpenLovart-runtime"
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

trap {
    Write-Host ("[ERROR] " + $_.Exception.Message) -ForegroundColor Red
    exit 1
}

function Get-Sha256Hex {
    param([Parameter(Mandatory = $true)][string]$Path)

    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        try {
            return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
        }
        finally {
            $sha256.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }
}

function Test-ReleaseManifest {
    param([Parameter(Mandatory = $true)][string]$Root)

    $manifestPath = Join-Path $Root 'release-manifest.json'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        throw "Release manifest was not found: $manifestPath"
    }

    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    foreach ($entry in $manifest.files) {
        $relativePath = ([string]$entry.path).Replace('/', '\')
        $filePath = Join-Path $Root $relativePath
        if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
            throw "Runtime file is missing: $relativePath"
        }

        $actualHash = Get-Sha256Hex -Path $filePath
        if ($actualHash -ne ([string]$entry.sha256).ToLowerInvariant()) {
            throw "Runtime hash verification failed: $relativePath"
        }
    }

    return $manifest
}

function Get-PortListener {
    param([Parameter(Mandatory = $true)][int]$Port)
    return Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
}

function Test-ProcessTreeContainsPath {
    param(
        [Parameter(Mandatory = $true)][int]$OwnerPid,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $currentPid = $OwnerPid
    for ($depth = 0; $depth -lt 8 -and $currentPid -gt 0; $depth++) {
        $process = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $currentPid) -ErrorAction SilentlyContinue
        if (-not $process) {
            break
        }
        if ($process.CommandLine -and $process.CommandLine.IndexOf($Path, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
            return $true
        }
        if ($process.ParentProcessId -eq $currentPid) {
            break
        }
        $currentPid = [int]$process.ParentProcessId
    }
    return $false
}

function Get-FirstFreePort {
    param(
        [int]$StartPort,
        [int]$EndPort
    )

    for ($port = $StartPort; $port -le $EndPort; $port++) {
        if (-not (Get-PortListener -Port $port)) {
            return $port
        }
    }
    return $null
}

function Test-HttpEndpoint {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [int]$TimeoutSec = 3
    )

    try {
        $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec $TimeoutSec
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
    }
    catch {
        return $false
    }
}

function Sync-Runtime {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    $arguments = @(
        $Source,
        $Destination,
        '/MIR',
        '/R:2',
        '/W:1',
        '/XJ',
        '/COPY:DAT',
        '/DCOPY:DAT',
        '/XD',
        '.runtime',
        '.cdn-cache',
        '.tmp-video',
        'uploads',
        'outputs',
        '/NFL',
        '/NDL',
        '/NJH',
        '/NJS',
        '/NP'
    )

    & robocopy @arguments | Out-Host
    if ($LASTEXITCODE -ge 8) {
        throw "Runtime sync failed with robocopy exit code $LASTEXITCODE"
    }
}

$SourceRoot = [System.IO.Path]::GetFullPath($SourceRoot).TrimEnd('\')
$LocalRoot = [System.IO.Path]::GetFullPath($LocalRoot).TrimEnd('\')
$legacyLocalRoot = [System.IO.Path]::GetFullPath("$env:LOCALAPPDATA\OpenLovartRuntime\OpenLovart-master").TrimEnd('\')
$appUrl = 'http://localhost:3000/projects'

Write-Host ''
Write-Host '========================================'
Write-Host ' OpenLovart - Source-free Runtime'
Write-Host '========================================'
Write-Host ''

$existingListener = Get-PortListener -Port 3000
if ($existingListener) {
    $existingProcess = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $existingListener.OwningProcess) -ErrorAction SilentlyContinue
    if (Test-ProcessTreeContainsPath -OwnerPid $existingListener.OwningProcess -Path $LocalRoot) {
        Write-Host "[OK] OpenLovart is already running, PID $($existingProcess.ProcessId)"
        Start-Process $appUrl
        exit 0
    }

    if (Test-ProcessTreeContainsPath -OwnerPid $existingListener.OwningProcess -Path $legacyLocalRoot) {
        Write-Host "[WAIT] Legacy OpenLovart is still running, PID $($existingListener.OwningProcess)." -ForegroundColor Yellow
        Write-Host '[WAIT] Close the old OpenLovart window normally. Waiting up to 30 seconds...'
    }
    else {
        Write-Host "[WAIT] Port 3000 is occupied by another process, PID $($existingListener.OwningProcess)." -ForegroundColor Yellow
        Write-Host '[WAIT] Close that process normally. Waiting up to 30 seconds...'
    }

    $portDeadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $portDeadline -and (Get-PortListener -Port 3000)) {
        Start-Sleep -Milliseconds 500
    }
    $existingListener = Get-PortListener -Port 3000
    if ($existingListener) {
        Write-Host "[ERROR] Port 3000 is still occupied by PID $($existingListener.OwningProcess)." -ForegroundColor Red
        Write-Host '[ERROR] Port fallback is disabled to preserve browser-local data.' -ForegroundColor Red
        Write-Host '[ERROR] Close the old OpenLovart window, then run this launcher again.' -ForegroundColor Red
        exit 2
    }
    Write-Host '[OK] Port 3000 is now available.'
}

$sourceReady = $false
if (Test-Path -LiteralPath $SourceRoot -PathType Container) {
    try {
        $sourceManifest = Test-ReleaseManifest -Root $SourceRoot
        Write-Host "[OK] Network runtime verified: $($sourceManifest.buildId)"
        $sourceReady = $true
    }
    catch {
        Write-Warning "Network runtime is unavailable: $($_.Exception.Message)"
    }
}

if ($sourceReady) {
    Write-Host "[..] Syncing source-free runtime to: $LocalRoot"
    Sync-Runtime -Source $SourceRoot -Destination $LocalRoot
}
else {
    Write-Warning 'The network runtime is unavailable or invalid. Trying the verified local cache.'
}

$localManifest = Test-ReleaseManifest -Root $LocalRoot
Write-Host "[OK] Local runtime verified: $($localManifest.buildId)"

$nodePath = Join-Path $LocalRoot 'node\node.exe'
$serverPath = Join-Path $LocalRoot 'server.js'
$upscaylRoot = Join-Path $LocalRoot 'upscayl-api'
$upscaylServer = Join-Path $upscaylRoot 'server.bundle.cjs'
$runtimeRoot = Join-Path $LocalRoot '.runtime'
$logRoot = Join-Path $runtimeRoot 'logs'

foreach ($requiredFile in @($nodePath, $serverPath, $upscaylServer)) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        throw "Required runtime file was not found: $requiredFile"
    }
}
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null

$upscaylPort = 3001
$upscaylListener = Get-PortListener -Port $upscaylPort
$reuseUpscayl = $false
if ($upscaylListener) {
    $candidateHealthUrl = "http://127.0.0.1:$upscaylPort/api/health"
    if ((Test-ProcessTreeContainsPath -OwnerPid $upscaylListener.OwningProcess -Path $LocalRoot) -and (Test-HttpEndpoint -Uri $candidateHealthUrl)) {
        $reuseUpscayl = $true
    }
    else {
        $fallbackPort = Get-FirstFreePort -StartPort 3002 -EndPort 3010
        if ($null -eq $fallbackPort) {
            Write-Warning 'Ports 3001-3010 are occupied. Upscayl will not start.'
            $upscaylPort = $null
        }
        else {
            Write-Warning "Port 3001 is owned by another runtime, PID $($upscaylListener.OwningProcess). Using Upscayl port $fallbackPort."
            $upscaylPort = $fallbackPort
        }
    }
}

if ($reuseUpscayl) {
    Write-Host '[OK] Upscayl service is already running.'
}
elseif ($null -ne $upscaylPort) {
    $upscaylUrl = "http://127.0.0.1:$upscaylPort/api/health"
    if (-not (Test-HttpEndpoint -Uri $upscaylUrl)) {
        Write-Host '[..] Starting Upscayl service...'
        $oldPort = $env:PORT
        $oldHost = $env:HOST
        $oldOrigin = $env:ALLOWED_ORIGIN
        $oldPublicBaseUrl = $env:PUBLIC_BASE_URL
        try {
            $env:PORT = [string]$upscaylPort
            $env:HOST = '127.0.0.1'
            $env:ALLOWED_ORIGIN = 'http://localhost:3000'
            $env:PUBLIC_BASE_URL = "http://127.0.0.1:$upscaylPort"
            Start-Process -FilePath $nodePath -ArgumentList 'server.bundle.cjs' -WorkingDirectory $upscaylRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot ("upscayl-$upscaylPort.out.log")) -RedirectStandardError (Join-Path $logRoot ("upscayl-$upscaylPort.err.log")) | Out-Null
        }
        finally {
            $env:PORT = $oldPort
            $env:HOST = $oldHost
            $env:ALLOWED_ORIGIN = $oldOrigin
            $env:PUBLIC_BASE_URL = $oldPublicBaseUrl
        }

        $deadline = (Get-Date).AddSeconds(15)
        while ((Get-Date) -lt $deadline -and -not (Test-HttpEndpoint -Uri $upscaylUrl)) {
            Start-Sleep -Milliseconds 500
        }
        if (Test-HttpEndpoint -Uri $upscaylUrl) {
            Write-Host '[OK] Upscayl service is ready.'
        }
        else {
            Write-Warning "Upscayl failed to start. The main canvas will continue. Logs: $logRoot"
        }
    }
}

$browserJob = Start-Job -ScriptBlock {
    param($Uri)
    $deadline = (Get-Date).AddSeconds(45)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
                Start-Process $Uri
                return
            }
        }
        catch {
        }
        Start-Sleep -Milliseconds 750
    }
} -ArgumentList $appUrl

$environmentBackup = @{}
foreach ($name in @('PORT', 'HOSTNAME', 'UPSCAYL_API_BASE_URL', 'AI_API_KEY', 'MAGICAPI_API_KEY', 'JIEKOU_API_KEY', 'VAPI_API_KEY', 'MKEAI_API_KEY', 'LAOMANDI_API_KEY')) {
    $currentValue = [Environment]::GetEnvironmentVariable($name, 'Process')
    $environmentBackup[$name] = $currentValue
}

try {
    $env:PORT = '3000'
    $env:HOSTNAME = '127.0.0.1'
    if ($null -ne $upscaylPort) {
        $env:UPSCAYL_API_BASE_URL = "http://127.0.0.1:$upscaylPort"
    }
    else {
        Remove-Item -LiteralPath 'Env:UPSCAYL_API_BASE_URL' -ErrorAction SilentlyContinue
    }
    foreach ($name in @('AI_API_KEY', 'MAGICAPI_API_KEY', 'JIEKOU_API_KEY', 'VAPI_API_KEY', 'MKEAI_API_KEY', 'LAOMANDI_API_KEY')) {
        Remove-Item -LiteralPath ("Env:" + $name) -ErrorAction SilentlyContinue
    }

    Write-Host '[OK] Starting OpenLovart: http://localhost:3000'
    Write-Host '[..] Press Ctrl+C to stop the main service.'
    Push-Location $LocalRoot
    try {
        & $nodePath $serverPath
        $serverExitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }
}
finally {
    foreach ($name in $environmentBackup.Keys) {
        $value = $environmentBackup[$name]
        if ($null -eq $value) {
            Remove-Item -LiteralPath ("Env:" + $name) -ErrorAction SilentlyContinue
        }
        else {
            Set-Item -LiteralPath ("Env:" + $name) -Value $value
        }
    }
    if ($browserJob) {
        Remove-Job -Job $browserJob -Force -ErrorAction SilentlyContinue
    }
}

exit $serverExitCode
