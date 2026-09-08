param(
  [string]$ReportDate = (Get-Date -Format "yyyyMMdd"),
  [int]$MaxItems = 20,
  [switch]$DryRun,
  [switch]$UseConvex
)

$ErrorActionPreference = "Stop"
Write-Host "Legacy local Telegram summary sender is disabled."
Write-Host "Convex cloud is the single source for DART polling, DB writes, and Telegram alerts."
Write-Host "This stub prevents duplicate public-channel messages and old numbered formats."
Write-Host "ReportDate: $ReportDate"
exit 0
