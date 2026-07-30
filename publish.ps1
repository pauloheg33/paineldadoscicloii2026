param(
    [string]$Message = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step($text) {
    Write-Host ""
    Write-Host "==> $text" -ForegroundColor Cyan
}

function Resolve-PythonCommand {
    if (Get-Command python -ErrorAction SilentlyContinue) {
        return @("python")
    }
    if (Get-Command py -ErrorAction SilentlyContinue) {
        return @("py", "-3")
    }
    throw "Python não encontrado. Instale/configure o Python antes de publicar."
}

function Invoke-External {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$CommandParts
    )

    $command = $CommandParts[0]
    $arguments = @()
    if ($CommandParts.Length -gt 1) {
        $arguments = $CommandParts[1..($CommandParts.Length - 1)]
    }

    & $command @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao executar: $($CommandParts -join ' ')"
    }
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

Write-Step "Validando ambiente"
if (-not (Test-Path ".git")) {
    throw "Este script deve ser executado dentro do repositório do projeto."
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git não encontrado no sistema."
}

$pythonCmd = Resolve-PythonCommand
$branch = (git branch --show-current).Trim()
if ([string]::IsNullOrWhiteSpace($branch)) {
    throw "Não foi possível identificar a branch atual."
}

Write-Step "Limpando pasta temporária de validação, se existir"
if (Test-Path "dist_palette_check") {
    Remove-Item -LiteralPath "dist_palette_check" -Recurse -Force
}

Write-Step "Gerando build estático"
Invoke-External ($pythonCmd + @("build.py"))

Write-Step "Verificando alterações"
$statusBefore = git status --short
if ([string]::IsNullOrWhiteSpace(($statusBefore | Out-String).Trim())) {
    Write-Host "Nenhuma alteração detectada para publicar." -ForegroundColor Yellow
    exit 0
}

Write-Host $statusBefore

if ([string]::IsNullOrWhiteSpace($Message)) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    $Message = "Atualiza dados e publica painel ($timestamp)"
}

Write-Step "Preparando commit"
Invoke-External @("git", "add", "-A")

$statusStaged = git diff --cached --name-only
if ([string]::IsNullOrWhiteSpace(($statusStaged | Out-String).Trim())) {
    Write-Host "Não há arquivos staged para commit." -ForegroundColor Yellow
    exit 0
}

Write-Step "Criando commit"
Invoke-External @("git", "commit", "-m", $Message)

Write-Step "Enviando para o GitHub"
Invoke-External @("git", "push", "origin", $branch)

$pagesUrl = "https://pauloheg33.github.io/paineldadoscicloii2026/"

Write-Step "Publicação enviada"
Write-Host "Branch: $branch" -ForegroundColor Green
Write-Host "Commit: $Message" -ForegroundColor Green
Write-Host "GitHub Pages será atualizado pelo workflow automaticamente." -ForegroundColor Green
Write-Host "URL esperada: $pagesUrl" -ForegroundColor Green
