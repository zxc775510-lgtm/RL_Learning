// 算力機常駐程式（放在 repo 的 cluster/ 底下，不用管理員權限）：
// 每 60 秒 git pull → config.json 的 version 變了 → 依設定跑搜尋（自己的 slot＝自己的亂數）→ 跑的時候每 60 秒回報進度 → 結果 commit＋push 回 GitHub。
// 用法：node cluster/worker.js --slot=2 [--once]
const fs = require('fs'), path = require('path'), os = require('os'), { spawn, spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), arg = k => (process.argv.find(x => x.startsWith('--' + k + '=')) || '').split('=')[1], SLOT = +arg('slot') || 1, ONCE = process.argv.includes('--once');
const STATE = path.join(ROOT, '.worker_state.json'), CFG = path.join(__dirname, 'config.json'), SR = path.join(ROOT, '20261116', 'stall_rl'), NAME = 'job' + SLOT;
/* 專屬 Token 檔在 repo 旁邊：每次呼叫 git 都直接指定它，並清掉其他 credential helper，資料夾搬到哪個磁碟都一樣 */
const CRED = path.resolve(ROOT, '..', '.git-credentials'), PRE = fs.existsSync(CRED) ? ['-c', 'credential.helper=', '-c', 'credential.helper=store --file=' + CRED.replace(/\\/g, '/')] : [];
const git = (...a) => spawnSync('git', [...PRE, ...a], { cwd: ROOT, encoding: 'utf8', windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }), sleep = ms => new Promise(r => setTimeout(r, ms));
const log = s => { const l = new Date().toLocaleString('zh-TW', { hour12: false }) + ' [slot ' + SLOT + '] ' + s; console.log(l); try { fs.appendFileSync(path.join(ROOT, 'worker.log'), l + '\n'); } catch (e) {} };
const load = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return { done: 0 }; } };
function publish(msg, retry = 4) { // 推上去；別台也在推時先 rebase 再推
  /* 把本機日誌最後 120 行一起上傳，主機（和 Claude）才看得到算力機的錯誤 */
  try { const t = fs.readFileSync(path.join(ROOT, 'worker.log'), 'utf8').split(String.fromCharCode(10)).slice(-120).join(String.fromCharCode(10)); fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'logs', NAME + '.log'), t); } catch (e) {}
  git('add', '-A', 'cluster'); const c = git('commit', '-m', msg); if (c.status !== 0) return true;
  for (let i = 0; i < retry; i++) { git('pull', '--rebase', '--autostash', 'origin', 'main'); const p = git('push', 'origin', 'main'); if (p.status === 0) return true; log('push 失敗：' + (p.stderr || '').trim().slice(0, 200)); }
  return false;
}
function setStatus(ver, state, extra) { const f = path.join(__dirname, 'status', NAME + '.json'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify({ host: os.hostname(), slot: SLOT, version: ver, state, time: new Date().toISOString(), ver: progVer(), ...extra })); }
const progress = () => { // 讀本機搜尋的即時狀態（live/state.js）：第幾輪、目前最好、起點
  try { const L = JSON.parse(fs.readFileSync(path.join(SR, 'live', 'state.js'), 'utf8').replace(/^window\.LIVE=/, '').replace(/;\s*$/, '')), tot = x => x && x.J != null ? -x.J : null;
    const sims = (L.progress && L.progress.sims) || [], frac = sims.length ? sims.reduce((a, s) => a + s.frac, 0) / sims.length : 0;
    return { round: L.round, rounds: L.rounds, phase: L.progress && L.progress.phase, frac: +frac.toFixed(2), start: tot(L.start), best: tot(L.best), elapsed: L.elapsed, reward: L.config && L.config.reward }; } catch (e) { return {}; }
};
let beat = 0;
/* 偵錯用：目前這份程式是哪一版（git 提交的短代號＋時間），顯示在視窗與回報裡 */
const codeVer = () => { const o = git('log', '-1', '--format=%h %cd', '--date=format:%m/%d %H:%M').stdout; return (o || '').trim() || '未知'; }, hhmmss = () => new Date().toLocaleTimeString('zh-TW', { hour12: false });
const titleNow = () => { process.title = '第 ' + SLOT + ' 號｜程式版本 ' + codeVer() + '｜最後檢查 ' + hhmmss(); };
async function once() {
  const pl = git('pull', '--rebase', '--autostash', 'origin', 'main'); if (pl.status !== 0) { log('pull 失敗：' + (pl.stderr || '').trim().slice(0, 200)); return; }
  const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8')), st = load();
  if (!cfg.enabled || SLOT > cfg.slots || st.done === cfg.version) { /* 待命心跳：每 4 分鐘回報一次「我在，待命中」，控制台才看得到 */ if (Date.now() - beat > 240000) { beat = Date.now(); setStatus(cfg.version, 'idle', { enabled: cfg.enabled, done: st.done === cfg.version }); publish(`${NAME} 待命`); } return; }
  log(`收到新設定 v${cfg.version}，開始跑：${cfg.args.join(' ')}`); setStatus(cfg.version, 'running', { args: cfg.args }); publish(`${NAME} v${cfg.version} 開始`);
  const jf = path.join(SR, 'jobs', NAME + '.json'); fs.mkdirSync(path.dirname(jf), { recursive: true });
  fs.writeFileSync(jf, JSON.stringify({ name: NAME, args: [...cfg.args, '--seedbase=' + ((cfg.seedOffset || 0) + SLOT), '--run=' + NAME] }));
  const child = spawn(process.execPath, ['distribute.js', 'run', jf], { cwd: SR, stdio: ['ignore', 'pipe', 'pipe'] }); /* 輸出照常顯示；含「錯誤／失敗／Error」的行另存進日誌 */ for (const [st, out] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) st.on('data', d => { out.write(d); String(d).split(String.fromCharCode(10)).filter(l => /錯誤|失敗|error|exception|fatal|EADDR|ENOENT|EPERM|EMFILE|heap/i.test(l)).forEach(l => { try { fs.appendFileSync(path.join(ROOT, 'worker.log'), '  ↳ ' + l.trim().slice(0, 300) + String.fromCharCode(10)); } catch (e) {} }); }); let code = null; child.on('close', c => { code = c; });
  const timer = setInterval(() => { try { setStatus(cfg.version, 'running', { args: cfg.args, ...progress() }); publish(`${NAME} v${cfg.version} 進度`);
    /* publish 已 pull：主機改了設定（換版本或暫停）就中止目前這輪，下一圈用新設定重跑 */
    const n = JSON.parse(fs.readFileSync(CFG, 'utf8')); if (n.version !== cfg.version || !n.enabled) { log('設定已更新或暫停，中止目前這輪'); if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F']); else child.kill(); } } catch (e) {} }, 60000);
  while (code === null) await sleep(2000); clearInterval(timer);
  const out = path.join(__dirname, 'results', 'v' + cfg.version, NAME), src = path.join(SR, 'results', NAME);
  const bad = (() => { try { return /"status":"error"/.test(fs.readFileSync(path.join(src, 'state.js'), 'utf8')); } catch (e) { return true; } })(); /* 搜尋崩潰也會回傳 0，要看 state.js 的 status */
  if (code === 0 && !bad) { fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.cpSync(src, out, { recursive: true }); setStatus(cfg.version, 'done', { args: cfg.args, ...progress() }); }
  else { setStatus(cfg.version, 'failed', { code, error: bad }); log('搜尋失敗，狀態碼 ' + code + (bad ? '（模擬崩潰，60 秒後重試）' : '')); }
  const ok = publish(`${NAME} v${cfg.version} 結果`); if (ok && code === 0) { fs.writeFileSync(STATE, JSON.stringify({ done: cfg.version })); log('完成並已上傳'); }
}
/* 在同一個視窗裡重新跑自己（程式更新、崩潰都用這個），黑視窗不會消失 */
const rerun = () => { const c = spawnSync(process.execPath, process.argv.slice(1), { cwd: ROOT, stdio: 'inherit', env: { ...process.env, WORKER_PARENT: String(process.pid) } }); process.exit(c.status || 0); };
process.on('uncaughtException', e => { log('未預期錯誤：' + (e && e.stack || e)); try { publish(NAME + ' 錯誤'); } catch (x) {} console.log('30 秒後在這個視窗重新啟動…'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30000); rerun(); });
(async () => {
  if (process.argv.includes('--hello')) { setStatus(0, 'installed'); log(publish(`job${SLOT} 安裝完成`) ? '已回報主機（Token 可用）' : '回報失敗：請確認 Token／寫入權限'); process.exit(0); }
  /* 大字顯示這台是幾號（視窗標題也會寫） */
  { const D = { 0: ['█████', '█   █', '█   █', '█   █', '█████'], 1: ['  █  ', ' ██  ', '  █  ', '  █  ', '█████'], 2: ['█████', '    █', '█████', '█    ', '█████'], 3: ['█████', '    █', '█████', '    █', '█████'], 4: ['█   █', '█   █', '█████', '    █', '    █'], 5: ['█████', '█    ', '█████', '    █', '█████'], 6: ['█████', '█    ', '█████', '█   █', '█████'], 7: ['█████', '    █', '   █ ', '  █  ', '  █  '], 8: ['█████', '█   █', '█████', '█   █', '█████'], 9: ['█████', '█   █', '█████', '    █', '█████'] };
    process.title = '第 ' + SLOT + ' 號算力機'; const rows = [0, 1, 2, 3, 4].map(r => String(SLOT).split('').map(ch => (D[ch] || D[0])[r]).join('   ').replace(/█/g, '██')), bar = '='.repeat(48);
    console.log(['', bar, '', '   這台是：第 ' + SLOT + ' 號算力機（' + os.hostname() + '）', '   程式版本：' + codeVer() + '（啟動於 ' + new Date().toLocaleString('zh-TW', { hour12: false }) + '）', '', ...rows.map(r => '        ' + r), '', '   待命中，由主機的控制台按「開始計算」才會跑。', '   請不要關閉這個視窗（最小化即可）。', '', bar, ''].join('\n')); }
  /* 自癒：資料夾搬家後，開機捷徑還指著舊位置 → 每次啟動都把捷徑改成指向這台實際的 start_worker.bat */
  if (process.platform === 'win32') { const bat = path.resolve(ROOT, '..', 'start_worker.bat'); if (fs.existsSync(bat)) { const r = spawnSync('powershell', ['-NoProfile', '-Command', "$l=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'cellmachine-worker.lnk')); if ($l.TargetPath -ne $env:BAT) { $l.TargetPath=$env:BAT; $l.WorkingDirectory=Split-Path $env:BAT; $l.WindowStyle=7; $l.Save(); 'fixed' }"], { env: { ...process.env, BAT: bat }, encoding: 'utf8', windowsHide: true }); if ((r.stdout || '').includes('fixed')) log('開機捷徑已更新到 ' + bat); } }
  /* 只允許一個在跑，但黑視窗絕不自己關：已有另一個在跑時，這個視窗保持開著待命，等對方結束就接手 */
  { const LOCK = path.join(ROOT, '.worker.pid'), alive = p => { try { process.kill(p, 0); return true; } catch (e) { return false; } }; let shown = false;
    for (;;) { let old = +(fs.existsSync(LOCK) ? fs.readFileSync(LOCK, 'utf8') : 0); if (old === +process.env.WORKER_PARENT) old = 0; /* 自己的上一版（正在等我）不算重複 */
      if (!old || old === process.pid || !alive(old)) break; if (!shown) { shown = true; console.log('已經有另一個算力機程式在跑（PID ' + old + '）。這個視窗保持開著待命，對方結束時會自動接手。'); } await sleep(5000); }
    fs.writeFileSync(LOCK, String(process.pid)); }
  log(ONCE ? '單次模式' : '常駐中，每 60 秒檢查一次設定');
  const mt = () => require('crypto').createHash('sha1').update(fs.readFileSync(__filename)).digest('hex'), m0 = mt(); /* 看內容不看修改時間：git 重寫同樣內容的檔案不會觸發重開 */
  for (;;) { titleNow(); try { await once(); } catch (e) { log('錯誤：' + (e.stack || e.message)); publish(NAME + ' 錯誤'); } if (ONCE) break; if (mt() !== m0) { log('程式有更新，重新啟動'); rerun(); } await sleep(60000); } /* start_worker.bat 會自動重開 */
})();
