// 算力機常駐程式（放在 repo 的 cluster/ 底下，不用管理員權限）：
// 每 60 秒 git pull → config.json 的 version 變了 → 依設定跑搜尋（自己的 slot＝自己的亂數）→ 跑的時候每 60 秒回報進度 → 結果 commit＋push 回 GitHub。
// 用法：node cluster/worker.js --slot=2 [--once]
const fs = require('fs'), path = require('path'), os = require('os'), { spawn, spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), arg = k => (process.argv.find(x => x.startsWith('--' + k + '=')) || '').split('=')[1], SLOT = +arg('slot') || 1, ONCE = process.argv.includes('--once');
const STATE = path.join(ROOT, '.worker_state.json'), CFG = path.join(__dirname, 'config.json'), SR = path.join(ROOT, '20261116', 'stall_rl'), NAME = 'job' + SLOT;
const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' }), sleep = ms => new Promise(r => setTimeout(r, ms));
const log = s => { const l = new Date().toLocaleString('zh-TW', { hour12: false }) + ' [slot ' + SLOT + '] ' + s; console.log(l); try { fs.appendFileSync(path.join(ROOT, 'worker.log'), l + '\n'); } catch (e) {} };
const load = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return { done: 0 }; } };
function publish(msg, retry = 4) { // 推上去；別台也在推時先 rebase 再推
  git('add', '-A', 'cluster'); const c = git('commit', '-m', msg); if (c.status !== 0) return true;
  for (let i = 0; i < retry; i++) { git('pull', '--rebase', '--autostash'); const p = git('push'); if (p.status === 0) return true; log('push 失敗：' + (p.stderr || '').trim().slice(0, 200)); }
  return false;
}
function setStatus(ver, state, extra) { const f = path.join(__dirname, 'status', NAME + '.json'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify({ host: os.hostname(), slot: SLOT, version: ver, state, time: new Date().toISOString(), ...extra })); }
const progress = () => { // 讀本機搜尋的即時狀態（live/state.js）：第幾輪、目前最好、起點
  try { const L = JSON.parse(fs.readFileSync(path.join(SR, 'live', 'state.js'), 'utf8').replace(/^window\.LIVE=/, '').replace(/;\s*$/, '')), tot = x => x && x.J != null ? -x.J : null;
    const sims = (L.progress && L.progress.sims) || [], frac = sims.length ? sims.reduce((a, s) => a + s.frac, 0) / sims.length : 0;
    return { round: L.round, rounds: L.rounds, phase: L.progress && L.progress.phase, frac: +frac.toFixed(2), start: tot(L.start), best: tot(L.best), elapsed: L.elapsed, reward: L.config && L.config.reward }; } catch (e) { return {}; }
};
async function once() {
  const pl = git('pull', '--rebase', '--autostash'); if (pl.status !== 0) { log('pull 失敗：' + (pl.stderr || '').trim().slice(0, 200)); return; }
  const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8')), st = load();
  if (!cfg.enabled || SLOT > cfg.slots || st.done === cfg.version) return;
  log(`收到新設定 v${cfg.version}，開始跑：${cfg.args.join(' ')}`); setStatus(cfg.version, 'running', { args: cfg.args }); publish(`${NAME} v${cfg.version} 開始`);
  const jf = path.join(SR, 'jobs', NAME + '.json'); fs.mkdirSync(path.dirname(jf), { recursive: true });
  fs.writeFileSync(jf, JSON.stringify({ name: NAME, args: [...cfg.args, '--seedbase=' + ((cfg.seedOffset || 0) + SLOT), '--run=' + NAME] }));
  const child = spawn(process.execPath, ['distribute.js', 'run', jf], { cwd: SR, stdio: 'inherit' }); let code = null; child.on('close', c => { code = c; });
  const timer = setInterval(() => { try { setStatus(cfg.version, 'running', { args: cfg.args, ...progress() }); publish(`${NAME} v${cfg.version} 進度`); } catch (e) {} }, 60000);
  while (code === null) await sleep(2000); clearInterval(timer);
  const out = path.join(__dirname, 'results', 'v' + cfg.version, NAME), src = path.join(SR, 'results', NAME);
  const bad = (() => { try { return /"status":"error"/.test(fs.readFileSync(path.join(src, 'state.js'), 'utf8')); } catch (e) { return true; } })(); /* 搜尋崩潰也會回傳 0，要看 state.js 的 status */
  if (code === 0 && !bad) { fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.cpSync(src, out, { recursive: true }); setStatus(cfg.version, 'done', { args: cfg.args, ...progress() }); }
  else { setStatus(cfg.version, 'failed', { code, error: bad }); log('搜尋失敗，狀態碼 ' + code + (bad ? '（模擬崩潰，60 秒後重試）' : '')); }
  const ok = publish(`${NAME} v${cfg.version} 結果`); if (ok && code === 0) { fs.writeFileSync(STATE, JSON.stringify({ done: cfg.version })); log('完成並已上傳'); }
}
(async () => {
  if (process.argv.includes('--hello')) { setStatus(0, 'installed'); log(publish(`job${SLOT} 安裝完成`) ? '已回報主機（Token 可用）' : '回報失敗：請確認 Token／寫入權限'); process.exit(0); }
  log(ONCE ? '單次模式' : '常駐中，每 60 秒檢查一次設定');
  for (;;) { try { await once(); } catch (e) { log('錯誤：' + e.message); } if (ONCE) break; await sleep(60000); }
})();
