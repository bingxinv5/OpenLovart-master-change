param(
    [string]$Root = '.',
    [switch]$NoHtml
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $projectRoot '.venv\Scripts\python.exe'

if (-not (Test-Path -LiteralPath $python)) {
    throw "Python virtual environment not found: $python"
}

$args = @(
    (Join-Path $projectRoot 'scripts\graphify_local_build.py'),
    $Root
)

if ($NoHtml) {
    $args += '--no-html'
}

& $python @args