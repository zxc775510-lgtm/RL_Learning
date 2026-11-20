# RL_Learning：算力機

市場攤位 RL 模擬的分散運算，由主機遙控；每台電腦只要安裝一次。

## 安裝（第 N 台，N＝1–4）
在要幫忙算的電腦開 PowerShell，貼上（把最後的 1 換成第幾台）：

```powershell
iwr https://raw.githubusercontent.com/zxc775510-lgtm/RL_Learning/main/install/install.ps1 -OutFile install.ps1; powershell -ExecutionPolicy Bypass -File .\install.ps1 -Slot 1
```

過程：自動從官網下載免安裝版 Node／Git（會驗證）→ 抓程式 → 提示貼上「專屬 Token」（由主機管理者提供）→ 開機自動啟動。免管理員權限。

移除：執行 install/uninstall.ps1
