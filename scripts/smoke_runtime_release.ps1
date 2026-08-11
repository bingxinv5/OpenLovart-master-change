param(
    [string]$SourceRoot = 'Z:\TD\AI\OpenLovart-master',
    [string]$LocalRoot = "$env:LOCALAPPDATA\OpenLovartRuntime\OpenLovart-runtime",
    [int]$AppPort = 3100,
    [int]$UpscaylPort = 3101
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$nextProcess = $null
$upscaylProcess = $null

function Test-PortIsFree {
    param([int]$Port)
    return -not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Wait-HttpEndpoint {
    param(
        [string]$Uri,
        [int]$TimeoutSec = 45
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
                return $response
            }
        }
        catch {
        }
        Start-Sleep -Milliseconds 500
    }
    throw "Endpoint did not become ready: $Uri"
}

function Test-ReleaseManifest {
    param([string]$Root)

    $manifest = Get-Content -LiteralPath (Join-Path $Root 'release-manifest.json') -Raw | ConvertFrom-Json
    foreach ($entry in $manifest.files) {
        $path = Join-Path $Root (([string]$entry.path).Replace('/', '\'))
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "Missing runtime file: $($entry.path)"
        }
        $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($hash -ne ([string]$entry.sha256).ToLowerInvariant()) {
            throw "Runtime hash mismatch: $($entry.path)"
        }
    }
    return $manifest
}

if (-not (Test-PortIsFree -Port $AppPort)) {
    throw "Smoke-test app port is occupied: $AppPort"
}
if (-not (Test-PortIsFree -Port $UpscaylPort)) {
    throw "Smoke-test Upscayl port is occupied: $UpscaylPort"
}

$SourceRoot = [System.IO.Path]::GetFullPath($SourceRoot).TrimEnd('\')
$LocalRoot = [System.IO.Path]::GetFullPath($LocalRoot).TrimEnd('\')
if (-not $LocalRoot.StartsWith(([System.IO.Path]::GetFullPath($env:LOCALAPPDATA).TrimEnd('\') + '\OpenLovartRuntime\'), [StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe local smoke-test root: $LocalRoot"
}

Test-ReleaseManifest -Root $SourceRoot | Out-Null
New-Item -ItemType Directory -Path $LocalRoot -Force | Out-Null
& robocopy $SourceRoot $LocalRoot /MIR /R:2 /W:1 /XJ /COPY:DAT /DCOPY:DAT /XD .runtime .cdn-cache .tmp-video uploads outputs /NFL /NDL /NJH /NJS /NP | Out-Host
if ($LASTEXITCODE -ge 8) {
    throw "Local runtime sync failed with robocopy exit code $LASTEXITCODE"
}
$manifest = Test-ReleaseManifest -Root $LocalRoot

$nodePath = Join-Path $LocalRoot 'node\node.exe'
$upscaylRoot = Join-Path $LocalRoot 'upscayl-api'
$runtimeRoot = Join-Path $LocalRoot '.runtime\smoke'
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null

$environmentNames = @(
    'PORT',
    'HOST',
    'HOSTNAME',
    'ALLOWED_ORIGIN',
    'PUBLIC_BASE_URL',
    'UPSCAYL_API_BASE_URL',
    'AI_API_KEY',
    'MAGICAPI_API_KEY',
    'JIEKOU_API_KEY',
    'VAPI_API_KEY',
    'MKEAI_API_KEY',
    'LAOMANDI_API_KEY'
)
$environmentBackup = @{}
foreach ($name in $environmentNames) {
    $environmentBackup[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

try {
    $env:PORT = [string]$UpscaylPort
    $env:HOST = '127.0.0.1'
    $env:ALLOWED_ORIGIN = "http://localhost:$AppPort"
    $env:PUBLIC_BASE_URL = "http://127.0.0.1:$UpscaylPort"
    $upscaylProcess = Start-Process -FilePath $nodePath -ArgumentList 'server.bundle.cjs' -WorkingDirectory $upscaylRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeRoot 'upscayl.out.log') -RedirectStandardError (Join-Path $runtimeRoot 'upscayl.err.log') -PassThru
    Wait-HttpEndpoint -Uri "http://127.0.0.1:$UpscaylPort/api/health" | Out-Null

    $env:PORT = [string]$AppPort
    $env:HOSTNAME = '127.0.0.1'
    $env:UPSCAYL_API_BASE_URL = "http://127.0.0.1:$UpscaylPort"
    foreach ($name in @('AI_API_KEY', 'MAGICAPI_API_KEY', 'JIEKOU_API_KEY', 'VAPI_API_KEY', 'MKEAI_API_KEY', 'LAOMANDI_API_KEY')) {
        Remove-Item -LiteralPath ("Env:" + $name) -ErrorAction SilentlyContinue
    }
    $nextProcess = Start-Process -FilePath $nodePath -ArgumentList 'server.js' -WorkingDirectory $LocalRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeRoot 'next.out.log') -RedirectStandardError (Join-Path $runtimeRoot 'next.err.log') -PassThru

    $projects = Wait-HttpEndpoint -Uri "http://127.0.0.1:$AppPort/projects"
    $canvas = Wait-HttpEndpoint -Uri "http://127.0.0.1:$AppPort/canvas"
    $proxyHealth = Wait-HttpEndpoint -Uri "http://127.0.0.1:$AppPort/api/upscale/health"

    $pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    $body = @{
        image = $pixel
        model = 'upscayl-standard-4x'
        scale = 4
        format = 'png'
        compression = 0
    } | ConvertTo-Json
    $upscaleResult = Invoke-RestMethod -Uri "http://127.0.0.1:$AppPort/api/upscale/base64" -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 180
    if ($upscaleResult.status -ne 'success' -or -not $upscaleResult.data.image) {
        throw 'Upscayl smoke request did not return an image.'
    }

    [pscustomobject]@{
        Result = 'SMOKE_RUNTIME_OK'
        BuildId = $manifest.buildId
        LocalRoot = $LocalRoot
        ProjectsStatus = $projects.StatusCode
        CanvasStatus = $canvas.StatusCode
        UpscaylHealthStatus = $proxyHealth.StatusCode
        UpscaledImageBytes = $upscaleResult.data.size
        AppPid = $nextProcess.Id
        UpscaylPid = $upscaylProcess.Id
    } | Format-List
}
finally {
    foreach ($process in @($nextProcess, $upscaylProcess)) {
        if ($process -and -not $process.HasExited) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
    }
    foreach ($name in $environmentBackup.Keys) {
        $value = $environmentBackup[$name]
        if ($null -eq $value) {
            Remove-Item -LiteralPath ("Env:" + $name) -ErrorAction SilentlyContinue
        }
        else {
            Set-Item -LiteralPath ("Env:" + $name) -Value $value
        }
    }
}
