# 移除算力機：停掉程式、移除開機啟動、刪掉 cellmachine-worker 資料夾
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*cluster\worker.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
# 資料夾位置：優先用開機捷徑指向的（裝在別的磁碟也找得到），否則用預設
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'cellmachine-worker.lnk'; $dir = Join-Path $env:USERPROFILE 'cellmachine-worker'
if (Test-Path $lnk) { $t = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk).TargetPath; if ($t) { $dir = Split-Path $t } }
Remove-Item $lnk -Force -ErrorAction SilentlyContinue
Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host '已移除。'
