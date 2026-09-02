param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ScriptArgs
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourcePath = Join-Path $ScriptDir "steam_achievement_sync.cs"

if (-not (Test-Path $SourcePath)) {
    Write-Output '{"ok":false,"error":"source_file_not_found"}'
    exit 1
}

Add-Type -Path $SourcePath
$passedArgs = if ($ScriptArgs) { [string[]]$ScriptArgs } else { [string[]]@() }
[SteamAchievementSync.Program]::Main($passedArgs)
