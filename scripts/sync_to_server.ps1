param(
    [string]$TargetRoot = 'Z:\TD\AI\OpenLovart-master',
    [string]$BuildBase = 'D:\test\OpenLovart-build',
    [string]$NodeVersion = '24.14.1'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$launcherFileName = 'AI' + [char]0x753B + [char]0x5E03 + [char]0x542F + [char]0x52A8 + [char]0x670D + [char]0x52A1 + '.bat'

function Get-FullPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    return [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
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

function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Description,
        [Parameter(Mandatory = $true)][scriptblock]$Command
    )

    Write-Host "[release] $Description"
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Description failed with exit code $LASTEXITCODE"
    }
}

function Invoke-Robocopy {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination,
        [string[]]$ExtraArgs = @()
    )

    $arguments = @(
        $Source,
        $Destination,
        '/MIR',
        '/R:2',
        '/W:1',
        '/XJ',
        '/COPY:DAT',
        '/DCOPY:DAT',
        '/NFL',
        '/NDL',
        '/NJH',
        '/NJS',
        '/NP'
    ) + $ExtraArgs

    & robocopy @arguments | Out-Host
    if ($LASTEXITCODE -ge 8) {
        throw "robocopy failed with exit code ${LASTEXITCODE}: $Source -> $Destination"
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
            throw "Release file is missing: $relativePath"
        }

        $actualHash = Get-Sha256Hex -Path $filePath
        if ($actualHash -ne ([string]$entry.sha256).ToLowerInvariant()) {
            throw "Release hash mismatch: $relativePath"
        }
    }
}

function Test-ReleaseContents {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$SourceRoot
    )

    foreach ($directoryName in @('src', 'scripts', '.git', '.github', 'test', 'tests', '__tests__')) {
        if (Test-Path -LiteralPath (Join-Path $Root $directoryName)) {
            throw "Forbidden source directory in release: $directoryName"
        }
    }

    if (Test-Path -LiteralPath (Join-Path $Root 'upscayl-api\server.js')) {
        throw 'The original Upscayl server.js must not be published.'
    }

    $releaseFiles = Get-ChildItem -LiteralPath $Root -Recurse -File -Force
    $projectSourceFiles = $releaseFiles | Where-Object {
        $_.FullName -notmatch '\\node_modules\\' -and (
            $_.Extension -in @('.ts', '.tsx', '.jsx', '.map') -or
            $_.Name -match '\.(test|spec)\.' -or
            $_.Name -like '.env*'
        )
    }
    if ($projectSourceFiles) {
        $sample = ($projectSourceFiles | Select-Object -First 10 -ExpandProperty FullName) -join [Environment]::NewLine
        throw "Forbidden source/config files in release:`n$sample"
    }

    $sensitiveValues = New-Object System.Collections.Generic.List[string]
    foreach ($envName in @('.env', '.env.local')) {
        $envPath = Join-Path $SourceRoot $envName
        if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
            continue
        }

        foreach ($line in Get-Content -LiteralPath $envPath) {
            if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
                continue
            }

            $name = $Matches[1]
            $value = $Matches[2].Trim().Trim('"').Trim("'")
            if ($name -notmatch '(KEY|SECRET|TOKEN|PASSWORD)$' -or $value.Length -lt 8) {
                continue
            }
            if ($value -match 'your_|placeholder|example|changeme') {
                continue
            }
            $sensitiveValues.Add($value)
        }
    }

    $textExtensions = @('.js', '.cjs', '.mjs', '.json', '.html', '.css', '.txt', '.ps1', '.bat')
    $sourceMarkers = @(
        $SourceRoot,
        $SourceRoot.Replace('\', '/'),
        'D:\test\OpenLovart-build',
        'D:/test/OpenLovart-build'
    )

    foreach ($file in $releaseFiles | Where-Object { $_.Extension -in $textExtensions }) {
        $text = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction SilentlyContinue
        if ($null -eq $text) {
            continue
        }

        if ($file.FullName -notmatch '\\node_modules\\' -and $text.Contains('sourceMappingURL=')) {
            throw "Source map reference found in release: $($file.FullName)"
        }
        foreach ($marker in $sourceMarkers) {
            if ($marker -and $text.IndexOf($marker, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
                throw "Absolute source/build path found in release: $($file.FullName)"
            }
        }
        foreach ($secretValue in $sensitiveValues) {
            if ($text.Contains($secretValue)) {
                throw "A private configuration value was found in release: $($file.FullName)"
            }
        }
    }
}

$projectRoot = Get-FullPath (Split-Path -Parent $PSScriptRoot)
$targetFullPath = Get-FullPath $TargetRoot
$buildBaseFullPath = Get-FullPath $BuildBase

if ($targetFullPath -ieq $projectRoot -or $targetFullPath.StartsWith($projectRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The release target must not be the source directory or a child of it.'
}
if ($targetFullPath.StartsWith('Z:\TD\TimeTable\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Publishing under the legacy TimeTable directory is forbidden.'
}
if (-not $targetFullPath.StartsWith('Z:\TD\AI\', [StringComparison]::OrdinalIgnoreCase)) {
    throw "Unexpected release target: $targetFullPath"
}

$gitSha = (& git -C $projectRoot rev-parse --short=12 HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or -not $gitSha) {
    throw 'Unable to resolve the source Git SHA.'
}
$sourceDirty = [bool](& git -C $projectRoot status --porcelain)
$dirtySuffix = if ($sourceDirty) { '-dirty' } else { '' }
$buildId = '{0}-{1}{2}' -f (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss'), $gitSha, $dirtySuffix
$buildRoot = Join-Path $buildBaseFullPath $buildId
$workRoot = Join-Path $buildRoot 'work'
$publishRoot = Join-Path $buildRoot 'publish'
$downloadRoot = Join-Path $buildBaseFullPath 'downloads'

Write-Host "[release] Source : $projectRoot"
Write-Host "[release] Build  : $buildRoot"
Write-Host "[release] Target : $targetFullPath"
Write-Host "[release] Build ID: $buildId"

New-Item -ItemType Directory -Path $workRoot, $publishRoot, $downloadRoot -Force | Out-Null

$excludeDirectories = @(
    (Join-Path $projectRoot '.git'),
    (Join-Path $projectRoot '.github'),
    (Join-Path $projectRoot '.next'),
    (Join-Path $projectRoot 'node_modules'),
    (Join-Path $projectRoot '.cdn-cache'),
    (Join-Path $projectRoot '.playwright-cli'),
    (Join-Path $projectRoot '.runtime'),
    (Join-Path $projectRoot '.tsupgrader'),
    (Join-Path $projectRoot '.venv'),
    (Join-Path $projectRoot '.vscode'),
    (Join-Path $projectRoot 'artifacts'),
    (Join-Path $projectRoot 'coverage'),
    (Join-Path $projectRoot 'graphify-out'),
    (Join-Path $projectRoot 'output'),
    (Join-Path $projectRoot 'upscayl-api\node_modules'),
    (Join-Path $projectRoot 'upscayl-api\outputs'),
    (Join-Path $projectRoot 'upscayl-api\uploads')
)
$copyExtraArgs = @('/XD') + $excludeDirectories + @('/XF', '.env*', '*.log', '*.tsbuildinfo', '.openlovart-*-installed.stamp')
Invoke-Robocopy -Source $projectRoot -Destination $workRoot -ExtraArgs $copyExtraArgs

$environmentBackup = @{}
$sensitiveEnvironmentPattern = '^(AI_|MAGICAPI_|JIEKOU_|VAPI_|MKEAI_|LAOMANDI_|OPENLOVART_|NEXT_PUBLIC_|CLERK_|SUPABASE_|UPSCAYL_)'
foreach ($item in Get-ChildItem Env: | Where-Object { $_.Name -match $sensitiveEnvironmentPattern }) {
    $environmentBackup[$item.Name] = $item.Value
    Remove-Item -LiteralPath ("Env:" + $item.Name)
}

try {
    Push-Location $workRoot
    try {
        Invoke-NativeCommand -Description 'Installing clean root dependencies' -Command { & npm.cmd ci --no-fund --no-audit }
        Invoke-NativeCommand -Description 'Running TypeScript checks' -Command { & npm.cmd run typecheck }
        Invoke-NativeCommand -Description 'Running unit tests' -Command { & npm.cmd test }
        Invoke-NativeCommand -Description 'Checking canvas boundaries' -Command { & npm.cmd run check:canvas-boundaries }
        Invoke-NativeCommand -Description 'Building Next.js standalone runtime' -Command { & npm.cmd run build -- --webpack }
    }
    finally {
        Pop-Location
    }

    $upscaylRoot = Join-Path $workRoot 'upscayl-api'
    Push-Location $upscaylRoot
    try {
        Invoke-NativeCommand -Description 'Installing clean Upscayl build dependencies' -Command { & npm.cmd ci --omit=dev --no-fund --no-audit }
    }
    finally {
        Pop-Location
    }
}
finally {
    foreach ($name in $environmentBackup.Keys) {
        Set-Item -LiteralPath ("Env:" + $name) -Value $environmentBackup[$name]
    }
}

$standaloneRoot = Join-Path $workRoot '.next\standalone'
if (-not (Test-Path -LiteralPath (Join-Path $standaloneRoot 'server.js') -PathType Leaf)) {
    throw "Next.js standalone server was not generated: $standaloneRoot"
}
Invoke-Robocopy -Source $standaloneRoot -Destination $publishRoot

$staticSource = Join-Path $workRoot '.next\static'
$staticTarget = Join-Path $publishRoot '.next\static'
Invoke-Robocopy -Source $staticSource -Destination $staticTarget

$publicSource = Join-Path $workRoot 'public'
if (Test-Path -LiteralPath $publicSource -PathType Container) {
    Invoke-Robocopy -Source $publicSource -Destination (Join-Path $publishRoot 'public')
}

$upscaylPublishRoot = Join-Path $publishRoot 'upscayl-api'
New-Item -ItemType Directory -Path $upscaylPublishRoot -Force | Out-Null
$esbuild = Join-Path $workRoot 'node_modules\.bin\esbuild.cmd'
$upscaylSource = Join-Path $workRoot 'upscayl-api\server.js'
$upscaylBundle = Join-Path $upscaylPublishRoot 'server.bundle.cjs'
Invoke-NativeCommand -Description 'Bundling the Upscayl runtime' -Command {
    & $esbuild $upscaylSource --bundle --platform=node --target=node24 --format=cjs --minify --legal-comments=external "--outfile=$upscaylBundle"
}
Invoke-Robocopy -Source (Join-Path $workRoot 'upscayl-api\bin') -Destination (Join-Path $upscaylPublishRoot 'bin')
Invoke-Robocopy -Source (Join-Path $workRoot 'upscayl-api\models') -Destination (Join-Path $upscaylPublishRoot 'models')

$upscaylLicenseRoot = Join-Path $publishRoot 'licenses\upscayl'
$upscaylNodeModules = Join-Path $workRoot 'upscayl-api\node_modules'
foreach ($licenseFile in Get-ChildItem -LiteralPath $upscaylNodeModules -Recurse -File -Force | Where-Object { $_.Name -match '^(LICENSE|LICENCE|NOTICE|COPYING)(\..*)?$' }) {
    $relativeLicensePath = $licenseFile.FullName.Substring($upscaylNodeModules.Length + 1)
    $licenseTarget = Join-Path $upscaylLicenseRoot $relativeLicensePath
    New-Item -ItemType Directory -Path (Split-Path -Parent $licenseTarget) -Force | Out-Null
    Copy-Item -LiteralPath $licenseFile.FullName -Destination $licenseTarget -Force
}

$nodeZipName = "node-v$NodeVersion-win-x64.zip"
$nodeZipPath = Join-Path $downloadRoot $nodeZipName
$nodeBaseUri = "https://nodejs.org/dist/v$NodeVersion"
$checksumPath = Join-Path $buildRoot 'SHASUMS256.txt'
Invoke-WebRequest -Uri "$nodeBaseUri/SHASUMS256.txt" -OutFile $checksumPath -UseBasicParsing
$checksumLine = Get-Content -LiteralPath $checksumPath | Where-Object { $_ -match ("\s" + [regex]::Escape($nodeZipName) + '$') } | Select-Object -First 1
if (-not $checksumLine) {
    throw "Official checksum was not found for $nodeZipName"
}
$expectedNodeHash = ($checksumLine -split '\s+')[0].ToLowerInvariant()
if (-not (Test-Path -LiteralPath $nodeZipPath -PathType Leaf) -or (Get-Sha256Hex -Path $nodeZipPath) -ne $expectedNodeHash) {
    Write-Host "[release] Downloading official Node.js $NodeVersion runtime"
    Invoke-WebRequest -Uri "$nodeBaseUri/$nodeZipName" -OutFile $nodeZipPath -UseBasicParsing
}
$actualNodeHash = Get-Sha256Hex -Path $nodeZipPath
if ($actualNodeHash -ne $expectedNodeHash) {
    throw "Node.js archive checksum mismatch: $nodeZipPath"
}

$nodeExtractRoot = Join-Path $buildRoot 'node'
Expand-Archive -LiteralPath $nodeZipPath -DestinationPath $nodeExtractRoot -Force
$nodeDistributionRoot = Join-Path $nodeExtractRoot ("node-v$NodeVersion-win-x64")
$nodePublishRoot = Join-Path $publishRoot 'node'
New-Item -ItemType Directory -Path $nodePublishRoot -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $nodeDistributionRoot 'node.exe') -Destination $nodePublishRoot -Force
Copy-Item -LiteralPath (Join-Path $nodeDistributionRoot 'LICENSE') -Destination $nodePublishRoot -Force

Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'runtime-launcher.ps1') -Destination (Join-Path $publishRoot 'runtime-launcher.ps1') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'runtime-launcher.bat') -Destination (Join-Path $publishRoot $launcherFileName) -Force

Get-ChildItem -LiteralPath $publishRoot -Recurse -File -Filter '*.map' -Force | Remove-Item -Force
Test-ReleaseContents -Root $publishRoot -SourceRoot $projectRoot

$nextVersion = (Get-Content -LiteralPath (Join-Path $workRoot 'package.json') -Raw | ConvertFrom-Json).dependencies.next
$manifestFiles = @(
    Get-ChildItem -LiteralPath $publishRoot -Recurse -File -Force |
        Sort-Object FullName |
        ForEach-Object {
            [pscustomobject]@{
                path = $_.FullName.Substring($publishRoot.Length + 1).Replace('\', '/')
                size = $_.Length
                sha256 = Get-Sha256Hex -Path $_.FullName
            }
        }
)
$manifest = [ordered]@{
    schemaVersion = 1
    appName = 'OpenLovart'
    buildId = $buildId
    sourceGitSha = $gitSha
    sourceDirty = $sourceDirty
    builtAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    nodeVersion = $NodeVersion
    nextVersion = $nextVersion
    files = $manifestFiles
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $publishRoot 'release-manifest.json') -Encoding UTF8
Test-ReleaseManifest -Root $publishRoot

$targetParent = Split-Path -Parent $targetFullPath
New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
$networkStagingRoot = Join-Path $targetParent ('.OpenLovart-master.staging-' + $buildId)
if (Test-Path -LiteralPath $networkStagingRoot) {
    $resolvedStaging = Get-FullPath $networkStagingRoot
    if (-not $resolvedStaging.StartsWith($targetParent + '\.OpenLovart-master.staging-', [StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe staging path: $resolvedStaging"
    }
    Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
}
Invoke-Robocopy -Source $publishRoot -Destination $networkStagingRoot
Test-ReleaseManifest -Root $networkStagingRoot
Test-ReleaseContents -Root $networkStagingRoot -SourceRoot $projectRoot

$previousRoot = Join-Path $targetParent 'OpenLovart-master.previous'
if (Test-Path -LiteralPath $previousRoot) {
    $resolvedPrevious = Get-FullPath $previousRoot
    if ($resolvedPrevious -ine (Get-FullPath (Join-Path $targetParent 'OpenLovart-master.previous'))) {
        throw "Unsafe previous-release path: $resolvedPrevious"
    }
    Remove-Item -LiteralPath $resolvedPrevious -Recurse -Force
}

$movedCurrent = $false
try {
    if (Test-Path -LiteralPath $targetFullPath) {
        Move-Item -LiteralPath $targetFullPath -Destination $previousRoot
        $movedCurrent = $true
    }
    Move-Item -LiteralPath $networkStagingRoot -Destination $targetFullPath
}
catch {
    if ($movedCurrent -and -not (Test-Path -LiteralPath $targetFullPath) -and (Test-Path -LiteralPath $previousRoot)) {
        Move-Item -LiteralPath $previousRoot -Destination $targetFullPath
    }
    throw
}

Test-ReleaseManifest -Root $targetFullPath
Test-ReleaseContents -Root $targetFullPath -SourceRoot $projectRoot
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'runtime-launcher.bat') -Destination (Join-Path $targetParent $launcherFileName) -Force

Write-Host '[release] Source-free runtime published successfully.'
Write-Host "[release] Runtime : $targetFullPath"
Write-Host "[release] Launcher: $(Join-Path $targetParent $launcherFileName)"
Write-Host "[release] Build ID: $buildId"
