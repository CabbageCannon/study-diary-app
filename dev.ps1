param(
    [switch]$CheckOnly,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"
$DesktopPetDir = Join-Path $Root "desktop-pet"
$PythonExe = Join-Path $BackendDir ".venv\Scripts\python.exe"
$BackendHealthUrl = "http://127.0.0.1:8000/api/health"
$FrontendUrl = "http://127.0.0.1:5173"

function Stop-WithMessage {
    param([string]$Message)
    Write-Host "错误：$Message" -ForegroundColor Red
    exit 1
}

function Test-UrlAvailable {
    param([string]$Url)

    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec 2 -UseBasicParsing
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
    }
    catch {
        return $false
    }
}

function Get-PortOwnerPids {
    param([int]$Port)

    try {
        return @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop |
            Select-Object -ExpandProperty OwningProcess -Unique)
    }
    catch {
        $matches = netstat -ano -p tcp | Select-String -Pattern (":$Port\s+.*LISTENING\s+(\d+)$")
        return @($matches | ForEach-Object {
            if ($_.Matches[0].Groups[1].Value) { [int]$_.Matches[0].Groups[1].Value }
        } | Select-Object -Unique)
    }
}

function Assert-UsablePort {
    param(
        [int]$Port,
        [string]$Url,
        [string]$ServiceName
    )

    $owners = Get-PortOwnerPids -Port $Port
    if ($owners.Count -eq 0) {
        return $false
    }

    if (Test-UrlAvailable -Url $Url) {
        Write-Host "$ServiceName 已在运行，复用现有服务。" -ForegroundColor Yellow
        return $true
    }

    Stop-WithMessage "端口 $Port 已被其他程序占用（PID：$($owners -join ', ')），但 $ServiceName 无法正常访问。请检查该进程后重试。"
}

function Wait-ForUrl {
    param(
        [string]$Url,
        [string]$ServiceName
    )

    for ($second = 1; $second -le 60; $second++) {
        if (Test-UrlAvailable -Url $Url) {
            Write-Host "$ServiceName 已就绪。" -ForegroundColor Green
            return
        }
        Start-Sleep -Seconds 1
    }

    Stop-WithMessage "$ServiceName 启动超时，请查看对应终端。"
}

function Start-ServiceTerminal {
    param(
        [string]$Title,
        [string]$WorkingDirectory,
        [string]$Command
    )

    $escapedTitle = $Title.Replace("'", "''")
    $terminalCommand = "`$Host.UI.RawUI.WindowTitle = '$escapedTitle'; $Command"
    Start-Process -FilePath "powershell.exe" -WorkingDirectory $WorkingDirectory -ArgumentList @(
        "-NoExit",
        "-Command",
        $terminalCommand
    ) | Out-Null
}

try {
    foreach ($path in @($BackendDir, $FrontendDir, $DesktopPetDir)) {
        if (-not (Test-Path -LiteralPath $path -PathType Container)) {
            Stop-WithMessage "缺少目录：$path"
        }
    }
    foreach ($path in @($PythonExe, (Join-Path $FrontendDir "package.json"), (Join-Path $DesktopPetDir "package.json"))) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            Stop-WithMessage "缺少必要文件：$path"
        }
    }

    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Stop-WithMessage "未找到 npm。请安装 Node.js，并重新打开终端后重试。"
    }
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        Stop-WithMessage "未找到 cargo。请安装 Rust/Cargo，并重新打开终端后重试。"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $FrontendDir "node_modules\.bin\vite.cmd"))) {
        Stop-WithMessage "前端依赖未安装。请在 frontend 目录执行 npm install。"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $DesktopPetDir "node_modules\.bin\tauri.cmd"))) {
        Stop-WithMessage "桌宠依赖未安装。请在 desktop-pet 目录执行 npm install。"
    }
    try {
        & $PythonExe -c "import uvicorn" 2>$null
        if ($LASTEXITCODE -ne 0) { throw "uvicorn unavailable" }
    }
    catch {
        Stop-WithMessage "后端依赖未安装或不完整。请在 backend 目录使用 .venv\Scripts\python.exe -m pip install -r requirements.txt。"
    }

    if ($CheckOnly) {
        Write-Host "启动条件检查通过：后端、Web 前端和桌宠依赖均已就绪。" -ForegroundColor Green
        exit 0
    }

    $backendRunning = Assert-UsablePort -Port 8000 -Url $BackendHealthUrl -ServiceName "后端"
    if (-not $backendRunning) {
        Write-Host "正在启动后端..."
        Start-ServiceTerminal -Title "Study Diary Backend" -WorkingDirectory $BackendDir -Command ".\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
        Wait-ForUrl -Url $BackendHealthUrl -ServiceName "后端"
    }

    $frontendRunning = Assert-UsablePort -Port 5173 -Url $FrontendUrl -ServiceName "前端"
    if (-not $frontendRunning) {
        Write-Host "正在启动 Web 前端..."
        Start-ServiceTerminal -Title "Study Diary Frontend" -WorkingDirectory $FrontendDir -Command "npm run dev"
        Wait-ForUrl -Url $FrontendUrl -ServiceName "前端"
    }

    $desktopProcess = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        ($_.Name -eq "powershell.exe" -and $_.CommandLine -match "Study Diary Desktop Pet") -or
        ($_.Name -match '^(cargo|tauri|study-desktop-pet)(\.exe)?$' -and $_.CommandLine -match [regex]::Escape($DesktopPetDir))
    } | Select-Object -First 1
    if ($desktopProcess) {
        Write-Host "桌宠开发进程似乎已在运行（PID：$($desktopProcess.ProcessId)），不重复启动。" -ForegroundColor Yellow
    }
    else {
        Write-Host "正在启动桌宠..."
        Start-ServiceTerminal -Title "Study Diary Desktop Pet" -WorkingDirectory $DesktopPetDir -Command "npm run tauri dev"
    }

    Write-Host ""
    Write-Host "后端：http://127.0.0.1:8000"
    Write-Host "前端：http://127.0.0.1:5173"
    Write-Host "桌宠：Tauri 开发模式"
    Write-Host "关闭项目时，请在对应终端按 Ctrl + C。" -ForegroundColor Cyan

    if (-not $NoBrowser) {
        Write-Host "正在打开学习日记..."
        Start-Process -FilePath $FrontendUrl | Out-Null
    }
}
catch {
    Write-Host "错误：$($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
