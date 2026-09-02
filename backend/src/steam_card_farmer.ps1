param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ScriptArgs
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourcePath = Join-Path $ScriptDir "steam_card_farmer.cs"

if (-not (Test-Path $SourcePath)) {
    exit 1
}

Add-Type -Path $SourcePath
$passedArgs = if ($ScriptArgs) { [string[]]$ScriptArgs } else { [string[]]@() }
[SteamCardFarmer.Program]::Main($passedArgs)
