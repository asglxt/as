<#
把本仓库推送到 GitHub（交互式，双击 push-to-github.cmd 也可以运行）。
#>
param(
  [string]$RepoUrl = '',
  [string]$UserName = '',
  [string]$UserEmail = ''
)
$ErrorActionPreference = 'Stop'

Write-Host '============================================' -ForegroundColor Cyan
Write-Host '  学校管理系统 - 推送到 GitHub' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ''

if ([string]::IsNullOrWhiteSpace($RepoUrl)) {
  Write-Host '请粘贴你的 GitHub 仓库地址，例如：https://github.com/你的账号/school-system.git' -ForegroundColor Yellow
  $RepoUrl = (Read-Host '仓库地址').Trim()
}
if ([string]::IsNullOrWhiteSpace($RepoUrl)) { throw '没有填写仓库地址，已取消。' }
if ($RepoUrl -notmatch '^(https://|git@)') { throw "仓库地址看起来不对：$RepoUrl（应以 https:// 或 git@ 开头）" }

$repo = 'C:\Users\Administrator\Documents\Codex\2026-08-13\superpowers-plugin-superpowers-openai-api-curated'
$git = (Get-Command git -ErrorAction SilentlyContinue).Source
if (-not $git) {
  $bundled = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe'
  if (Test-Path $bundled) { $git = $bundled } else { throw '未找到 git，请先安装 Git for Windows。' }
}

Set-Location $repo

$currentName = & $git config user.name
if ([string]::IsNullOrWhiteSpace($UserName) -and [string]::IsNullOrWhiteSpace($currentName)) {
  Write-Host ''
  Write-Host '首次推送需要设置提交者身份（可以留空直接回车跳过）：' -ForegroundColor Yellow
  $UserName = (Read-Host '你的名字（可留空）').Trim()
}
$currentEmail = & $git config user.email
if ([string]::IsNullOrWhiteSpace($UserEmail) -and [string]::IsNullOrWhiteSpace($currentEmail)) {
  $UserEmail = (Read-Host '你的邮箱（可留空）').Trim()
}
if (-not [string]::IsNullOrWhiteSpace($UserName))  { & $git config user.name  $UserName }
if (-not [string]::IsNullOrWhiteSpace($UserEmail)) { & $git config user.email $UserEmail }

$remotes = & $git remote
if ($remotes -contains 'origin') { & $git remote set-url origin $RepoUrl } else { & $git remote add origin $RepoUrl }

Write-Host ''
Write-Host "远端已配置：$RepoUrl" -ForegroundColor Green
Write-Host '开始推送 main 分支（首次会弹出 GitHub 登录窗口，或要求输入用户名 + Token）...' -ForegroundColor Yellow
Write-Host ''

& $git push -u origin main

Write-Host ''
Write-Host '推送完成！打开你的 GitHub 仓库页面即可看到代码。' -ForegroundColor Green