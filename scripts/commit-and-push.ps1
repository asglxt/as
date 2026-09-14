<#
一键提交并推送：
  1. 把项目里的改动加入版本库
  2. 有改动就提交（会让你填一句修改说明，直接回车用默认值）
  3. 推送到 GitHub
双击 commit-and-push.cmd 即可运行，也可以在 PowerShell 里执行：
  powershell -ExecutionPolicy Bypass -File .\scripts\commit-and-push.ps1
#>
param(
  [string]$Message = ''
)
$ErrorActionPreference = 'Stop'

Write-Host '============================================' -ForegroundColor Cyan
Write-Host '  学校管理系统 - 提交并推送到 GitHub' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ''

$repo = 'C:\Users\Administrator\Documents\Codex\2026-08-13\superpowers-plugin-superpowers-openai-api-curated'
$git = (Get-Command git -ErrorAction SilentlyContinue).Source
if (-not $git) {
  $bundled = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe'
  if (Test-Path $bundled) { $git = $bundled } else { throw '未找到 git，请先安装 Git 或把 git 加入 PATH。' }
}

Set-Location $repo
& $git config --global --add safe.directory $repo

$changes = & $git status --porcelain
if ($changes) {
  Write-Host '本次将提交以下改动：' -ForegroundColor Cyan
  & $git status --short
  Write-Host ''

  if ([string]::IsNullOrWhiteSpace($Message)) {
    $answer = (Read-Host '请输入本次修改说明（直接回车则使用「update」）').Trim()
    $Message = if ([string]::IsNullOrWhiteSpace($answer)) { 'update' } else { $answer }
  }

  & $git add -A
  & $git commit -m $Message
} else {
  Write-Host '工作区没有未提交的改动，直接检查是否有需要推送的提交。' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '正在推送到 GitHub...' -ForegroundColor Yellow
& $git push

Write-Host ''
Write-Host '完成！可以打开 https://github.com/asglxt/as 查看。' -ForegroundColor Green