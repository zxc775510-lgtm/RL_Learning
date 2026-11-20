// 算力機常駐程式（放在 repo 的 cluster/ 底下，不用管理員權限）：
// 每 60 秒 git pull → config.json 的 version 變了 → 依設定跑搜尋（自己的 slot＝自己的亂數）→ 結果 commit＋push 回 GitHub。
// 用法：node cluster/worker.js --slot=2 [--once]
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), arg = k => (process.argv.find(x => x.startsWith('--' + k + '=')) || '').split('=')[1], SLOT = +arg('slot') || 1, ONCE = process.argv.includes('--once');
const STATE = path.join(ROOT, '.worker_state.json'), CFG = path.join(__dirname, 'config.json'), SR = path.join(ROOT, '20261116', 'stall_rl'), NAME = 'job' + SLOT;
const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
const log = s => { const l = new Date().toLocaleString('zh-TW', { hour12: false }) + ' [slot ' + SLOT + '] ' + s; console.log(l); try { fs.appendFileSync(path.join(ROOT, 'worker.log'), l + '\n'); } catch (e) {} };
const load = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return { done: 0 }; } };
function publish(msg, retry = 4) { // 推上去；別台也在推時先 rebase 再推
  git('add', '-A', 'cluster'); const c = git('commit', '-m', msg); if (c.status !== 0) return true;
  for (let i = 0; i < retry; i++) { git('pull', '--rebase', '--autostash'); const p = git('push'); if (p.status === 0) return true; log('push 失敗：' + (p.stderr || '').trim().slice(0, 200)); }
  return false;
}
function setStatus(ver, state, extra) { const f = path.join(__dirname, 'status', NAME + '.json'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify({ host: os.hostname(), slot: SLOT, version: ver, state, time: new Date().toISOString(), ...extra })); }
function once() {
  const pl = git('pull', '--rebase', '--autostash'); if (pl.status !== 0) { log('pull 失敗：' + (pl.stderr || '').trim().slice(0, 200)); return; }
  const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8')), st = load();
  if (!cfg.enabled || SLOT > cfg.slots || st.done === cfg.version) return;
  log(`收到新設定 v${cfg.version}，開始跑：${cfg.args.join(' ')}`); setStatus(cfg.version, 'running'); publish(`${NAME} v${cfg.version} 開始`);
  const jf = path.join(SR, 'jobs', NAME + '.json'); fs.mkdirSync(path.dirname(jf), { recursive: true });
  fs.writeFileSync(jf, JSON.stringify({ name: NAME, args: [...cfg.args, '--seedbase=' + ((cfg.seedOffset || 0) + SLOT), '--run=' + NAME] }));
  const r = spawnSync(process.execPath, ['distribute.js', 'run', jf], { cwd: SR, stdio: 'inherit' });
  const out = path.join(__dirname, 'results', 'v' + cfg.version, NAME), src = path.join(SR, 'results', NAME);
  if (r.status === 0 && fs.existsSync(path.join(src, 'state.js'))) { fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.cpSync(src, out, { recursive: true }); setStatus(cfg.version, 'done'); }
  else { setStatus(cfg.version, 'failed', { code: r.status }); log('搜尋失敗，狀態碼 ' + r.status); }
  const ok = publish(`${NAME} v${cfg.version} 結果`); if (ok && r.status === 0) { fs.writeFileSync(STATE, JSON.stringify({ done: cfg.version })); log('完成並已上傳'); }
}
if (process.argv.includes('--hello')) { setStatus(0, 'installed'); log(publish(`job${SLOT} 安裝完成`) ? '已回報主機（GitHub 登入成功）' : '回報失敗：請確認 GitHub 登入／寫入權限'); process.exit(0); }
log(ONCE ? '單次模式' : '常駐中，每 60 秒檢查一次設定');
for (;;) { try { once(); } catch (e) { log('錯誤：' + e.message); } if (ONCE) break; spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},60000)']); }
