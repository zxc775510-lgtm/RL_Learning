# 算力機安裝（免管理員）：右鍵 → 用 PowerShell 執行，或在這個資料夾執行  powershell -ExecutionPolicy Bypass -File install.ps1 -Slot 2
# 做的事：解壓縮隨附的 Node／Git → 從 GitHub 抓程式 → 記下專屬 Token 並回報 → 設成開機自動啟動 → 立刻開始。之後所有設定都由主機遙控。
# Token：GitHub 上建的「只限這個倉庫、可讀寫」專屬 Token（不是帳號密碼）；安裝時貼一次，只存在這台的 cellmachine-worker 資料夾，uninstall.ps1 會一起刪掉。
param([int]$Slot = 1, [string]$Token = '')
$ErrorActionPreference = 'Stop'
$pkg = $PSScriptRoot; $base = Join-Path $env:USERPROFILE 'cellmachine-worker'
New-Item -ItemType Directory -Force $base | Out-Null
$url = 'https://github.com/zxc775510-lgtm/RL_Learning.git'; $urlFile = Join-Path $pkg 'repo-url.txt'; if (Test-Path $urlFile) { $url = (Get-Content $urlFile -Raw).Trim() }

# 1) Node、Git：用隨附的免安裝版；沒有隨附就從官網下載（Node 驗雜湊、Git 驗數位簽章）；電腦上本來就有就直接用
$nodeZip = Join-Path $pkg 'tools\node.zip'; $gitExe = Join-Path $pkg 'tools\PortableGit.exe'; $dl = Join-Path $base 'dl'
if (-not (Test-Path $nodeZip) -and -not (Get-Command node -ErrorAction SilentlyContinue)) {
  New-Item -ItemType Directory -Force $dl | Out-Null; $nodeZip = Join-Path $dl 'node.zip'
  Write-Host '下載 Node（約 37 MB，nodejs.org）…'; Invoke-WebRequest 'https://nodejs.org/dist/v24.16.0/node-v24.16.0-win-x64.zip' -OutFile $nodeZip -UseBasicParsing
  if ((Get-FileHash $nodeZip -Algorithm SHA256).Hash -ne 'EDACA9BD58EC8E92037DAC4E877D52F6B8F430B81C18B57E264B4E2FB111CD56') { throw 'Node 下載檔的雜湊值不符，已中止' }
}
if (-not (Test-Path $gitExe) -and -not (Get-Command git -ErrorAction SilentlyContinue)) {
  New-Item -ItemType Directory -Force $dl | Out-Null; $gitExe = Join-Path $dl 'PortableGit.exe'
  Write-Host '下載 Git（約 59 MB，github.com/git-for-windows）…'; Invoke-WebRequest 'https://github.com/git-for-windows/git/releases/download/v2.54.0.windows.1/PortableGit-2.54.0-64-bit.7z.exe' -OutFile $gitExe -UseBasicParsing
  if ((Get-AuthenticodeSignature $gitExe).Status -ne 'Valid') { throw 'Git 下載檔的數位簽章無效，已中止' }
}
if (Test-Path $nodeZip) { $t = Join-Path $base 'node-tmp'; Expand-Archive $nodeZip $t -Force; Remove-Item (Join-Path $base 'node') -Recurse -Force -ErrorAction SilentlyContinue; Move-Item (Get-ChildItem $t -Directory | Select-Object -First 1).FullName (Join-Path $base 'node'); Remove-Item $t -Recurse -Force }
if (Test-Path $gitExe) { & $gitExe -y "-o$(Join-Path $base 'git')" | Out-Null }
$env:PATH = "$(Join-Path $base 'node');$(Join-Path $base 'git\cmd');$env:PATH"
foreach ($c in 'node', 'git') { if (-not (Get-Command $c -ErrorAction SilentlyContinue)) { throw "找不到 $c：請把免安裝版放進 tools\（node.zip、PortableGit.exe）再重跑" } }

# 2) 抓程式
$repo = Join-Path $base 'repo'
if (Test-Path (Join-Path $repo '.git')) { git -C $repo pull --rebase --autostash } else { git clone $url $repo }
git -C $repo config user.name "worker$Slot"; git -C $repo config user.email "worker$Slot@cellmachine.local"

# 2.5) 專屬 Token：存成這個倉庫專用的憑證檔（不經過 Windows 認證管理員，不會留在別人的登入裡）
if (-not $Token) { $sec = Read-Host '請貼上專屬 Token（輸入時不會顯示）' -AsSecureString; $Token = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)) }
if (-not $Token) { throw '沒有 Token，無法上傳結果' }
$cred = Join-Path $base '.git-credentials'; $hostName = ([Uri]$url).Host
[IO.File]::WriteAllText($cred, "https://x-access-token:${Token}@${hostName}`n")
git -C $repo config --replace-all credential.helper ''
git -C $repo config --add credential.helper "store --file=$($cred.Replace('\', '/'))"

# 3) 啟動檔＋開機自動啟動（使用者的啟動資料夾，不需要管理員）
$bat = Join-Path $base 'start_worker.bat'
@"
@echo off
set PATH=%~dp0node;%~dp0git\cmd;%PATH%
set GIT_TERMINAL_PROMPT=0
cd /d %~dp0repo
node cluster\worker.js --slot=$Slot
"@ | Set-Content $bat -Encoding ASCII
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'cellmachine-worker.lnk'
$sh = New-Object -ComObject WScript.Shell; $s = $sh.CreateShortcut($lnk); $s.TargetPath = $bat; $s.WindowStyle = 7; $s.WorkingDirectory = $base; $s.Save()

# 4) 第一次回報：用 Token 推一筆「安裝完成」，主機 status 立刻看得到這台
$env:GIT_TERMINAL_PROMPT = '0'
Push-Location $repo; node cluster\worker.js --slot=$Slot --hello; Pop-Location

# 5) 開始工作
Start-Process $bat -WindowStyle Minimized
Write-Host "完成：這台是第 $Slot 號算力機，已開始待命，開機會自動啟動。"
