param([string]$ReleaseRoot)

$ErrorActionPreference = 'Stop'
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('openlovart-manifest-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
# Exercise the production validators without running their startup/publish code.
foreach ($scriptName in @('runtime-launcher.ps1', 'sync_to_server.ps1')) {
    $tokens = $null
    $parseErrors = $null
    $ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $scriptName), [ref]$tokens, [ref]$parseErrors)
    if ($parseErrors.Count) { throw "Parse errors in $scriptName" }
    foreach ($name in @('Get-Sha256Hex', 'Test-ReleaseManifest')) {
        $definition = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
        if (-not $definition) { throw "Missing function: $name" }
        . ([scriptblock]::Create($definition.Extent.Text))
    }
    $fileName = 'AI' + [char]0x753B + [char]0x5E03 + [char]0x542F + [char]0x52A8 + [char]0x670D + [char]0x52A1 + '.bat'
    $fixtureFile = Join-Path $fixtureRoot $fileName
    $manifestFile = Join-Path $fixtureRoot 'release-manifest.json'
    foreach ($withBom in @($false, $true)) {
        [IO.File]::WriteAllText($fixtureFile, 'test payload')
        $fixtureManifest = @{ buildId = 'encoding-test'; files = @(@{ path = $fileName; sha256 = Get-Sha256Hex $fixtureFile }) }
        [IO.File]::WriteAllText($manifestFile, ($fixtureManifest | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($withBom))
        $null = Test-ReleaseManifest -Root $fixtureRoot
        [IO.File]::WriteAllText($fixtureFile, 'modified payload')
        $rejected = $false
        try { $null = Test-ReleaseManifest -Root $fixtureRoot } catch { $rejected = $_.Exception.Message -match 'hash' }
        if (-not $rejected) { throw 'Hash mismatch was not rejected' }
        Write-Host "PASS $scriptName UTF8 BOM=$withBom; tamper rejected"
    }
    if ($ReleaseRoot) {
        $null = Test-ReleaseManifest -Root $ReleaseRoot
        Write-Host "PASS $scriptName full release verification: $ReleaseRoot"
    }
}
Write-Host "PASS PowerShell $($PSVersionTable.PSVersion)"
