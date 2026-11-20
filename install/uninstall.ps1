# 移除算力機：停掉程式、移除開機啟動、刪掉 cellmachine-worker 資料夾
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*cluster\worker.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Remove-Item (Join-Path ([Environment]::GetFolderPath('Startup')) 'cellmachine-worker.lnk') -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $env:USERPROFILE 'cellmachine-worker') -Recurse -Force -ErrorAction SilentlyContinue
Write-Host '已移除。'
