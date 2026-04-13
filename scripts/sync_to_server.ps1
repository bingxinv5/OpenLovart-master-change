param(
    [string]$TargetRoot = 'Z:\TD\TimeTable\AI\OpenLovart-master'
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'package.json'))) {
    throw "Project root is invalid: $projectRoot"
}

if (-not (Test-Path -LiteralPath $TargetRoot)) {
    New-Item -ItemType Directory -Path $TargetRoot -Force | Out-Null
}

$excludeDirs = @(
    'node_modules',
    '.next',
    '.git',
    'artifacts',
    'upscayl-api\outputs',
    'upscayl-api\uploads'
)

$excludeFiles = @(
    '.env',
    '.env.local',
    '.openlovart-deps-installed.stamp',
    'upscayl-api\.openlovart-upscayl-deps-installed.stamp',
    'tsconfig.tsbuildinfo'
)

$robocopyArgs = @(
    $projectRoot,
    $TargetRoot,
    '/E',
    '/R:2',
    '/W:1',
    '/NFL',
    '/NDL',
    '/NJH',
    '/NJS',
    '/NP'
)

if ($excludeDirs.Count -gt 0) {
    $robocopyArgs += '/XD'
    $robocopyArgs += $excludeDirs
}

if ($excludeFiles.Count -gt 0) {
    $robocopyArgs += '/XF'
    $robocopyArgs += $excludeFiles
}

Write-Host "[sync] Source: $projectRoot"
Write-Host "[sync] Target: $TargetRoot"

& robocopy @robocopyArgs | Out-Host

$exitCode = $LASTEXITCODE
if ($exitCode -ge 8) {
    throw "robocopy failed with exit code $exitCode"
}

Write-Host '[sync] Completed successfully.'
Write-Host '[sync] Production startup: run the release launcher in the target directory to start Next and the Upscayl API.'