<#
一键把本仓库推送到 GitHub。
用法（在普通 PowerShell 窗口里执行）：
  cd C:\Users\Administrator\Documents\Codex\2026-08-13\superpowers-plugin-superpowers-openai-api-curated
  powershell -ExecutionPolicy Bypass -File .\scripts\push-to-github.ps1 -RepoUrl https://github.com/你的账号/仓库名.git
可选参数（首次使用建议同时设置，之后可省略）：
  -UserName "你的名字" -UserEmail "你的邮箱"
#>
param(
  [Parameter(Mandatory = $true)][string]$RepoUrl,
  [string]$UserName = '',
  [string]$UserEmail = ''
)
$ErrorActionPreference = 'Stop'

$repo = 'C:\Users\Administrator\Documents\Codex\2026-08-13\superpowers-plugin-superpowers-openai-api-curated'
$git = (Get-Command git -ErrorAction SilentlyContinue).Source
if (-not $git) {
  $bundled = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe'
  if (Test-Path $bundled) { $git = $bundled } else { throw '未找到 git，请先安装 Git for Windows。' }
}

Set-Location $repo
& $git config --global --add safe.directory $repo
if ($UserName)  { & $git config --global user.name  $UserName }
if ($UserEmail) { & $git config --global user.email $UserEmail }

$remotes = & $git remote
if ($remotes -contains 'origin') {
  & $git remote set-url origin $RepoUrl
} else {
  & $git remote add origin $RepoUrl
}

Write-Host "远端已配置：$RepoUrl" -ForegroundColor Cyan
Write-Host "开始推送到 main 分支（首次会要求登录 GitHub）..." -ForegroundColor Cyan
& $git push -u origin main
Write-Host '推送完成。' -ForegroundColor Green