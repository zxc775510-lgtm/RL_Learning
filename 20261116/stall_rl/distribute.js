// 分散運算：把搜尋用不同亂數分成 N 份，每台電腦各跑一份，最後收回一台（使用者 2026-11-20 錄音後要求；盤面＝不同亂數）。
// 1) 主機：  node distribute.js make 4 [--rounds=10 --hour=12 ...]   → jobs/job1.json … job4.json（每份差在 --seedbase）
// 2) 每台電腦：node distribute.js run jobs/job2.json                  → 跑完把結果收進 results/job2/
// 3) 主機：  node distribute.js merge <放 job 結果資料夾的目錄>        → 收進 runs/，後台「歷史紀錄」就能載入
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const DIR = __dirname, [cmd, a1, ...rest] = process.argv.slice(2);
const DEFAULT = ['--mode=hour', '--hour=12', '--warm=3', '--map=1', '--relax=1', '--reward=cells', '--rounds=10', '--boards=1', '--seeds=3'];
const CSVS = ['history.csv', 'candidates.csv', 'stalls_by_round.csv', 'validation.csv', 'summary.csv', 'archive.csv'];
const cp = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.cpSync(from, to, { recursive: true }); };
if (cmd === 'make') {
  const n = +a1 || 4, extra = rest.filter(x => x.startsWith('--')), keys = new Set(extra.map(x => x.split('=')[0])), args = [...DEFAULT.filter(x => !keys.has(x.split('=')[0])), ...extra];
  fs.mkdirSync(path.join(DIR, 'jobs'), { recursive: true });
  for (let k = 1; k <= n; k++) { fs.writeFileSync(path.join(DIR, 'jobs', `job${k}.json`), JSON.stringify({ name: 'job' + k, args: [...args, '--seedbase=' + k, '--run=job' + k] }, null, 1)); }
  console.log(`已產生 ${n} 份：jobs/job1.json … job${n}.json（參數：${args.join(' ')}；每份 --seedbase 不同）`);
} else if (cmd === 'run') {
  const job = JSON.parse(fs.readFileSync(path.resolve(a1), 'utf8')), args = job.args.some(x => x.startsWith('--conc=')) ? job.args : [...job.args, '--conc=' + Math.max(1, os.cpus().length - 1)];
  const old = CSVS.filter(f => fs.existsSync(path.join(DIR, f))); // 上次殘留的結果：不刪，先收進 runs/（避免混進這份、也不弄丟）
  if (old.length) { const dest = path.join(DIR, 'runs', new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '_跑job前殘留'); for (const f of old) { cp(path.join(DIR, f), path.join(dest, f)); fs.unlinkSync(path.join(DIR, f)); } for (const f of ['state.js', 'rounds']) if (fs.existsSync(path.join(DIR, 'live', f))) { cp(path.join(DIR, 'live', f), path.join(dest, f)); fs.rmSync(path.join(DIR, 'live', f), { recursive: true }); } console.log('上次殘留的結果已收進 ' + dest); }
  console.log('開始：node search.js ' + args.join(' ')); const r = spawnSync(process.execPath, ['search.js', ...args], { cwd: DIR, stdio: 'inherit' });
  const out = path.join(DIR, 'results', job.name); for (const f of CSVS) if (fs.existsSync(path.join(DIR, f))) cp(path.join(DIR, f), path.join(out, f));
  for (const f of ['state.js', 'search.log', 'rounds']) if (fs.existsSync(path.join(DIR, 'live', f))) cp(path.join(DIR, 'live', f), path.join(out, f));
  fs.writeFileSync(path.join(out, 'job.json'), JSON.stringify(job)); console.log((r.status === 0 ? '完成' : '搜尋結束但狀態碼 ' + r.status) + '，結果在 ' + out + '（整個資料夾拷回主機）');
} else if (cmd === 'merge') {
  const src = path.resolve(a1 || path.join(DIR, 'results')), ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14); let n = 0;
  for (const d of fs.readdirSync(src)) { const p = path.join(src, d); if (fs.existsSync(path.join(p, 'state.js'))) { cp(p, path.join(DIR, 'runs', ts + '_' + d)); n++; } }
  console.log(`收進 runs/ ${n} 份；後台「歷史紀錄」按「重新整理清單」就看得到`);
} else console.log('用法：node distribute.js make <份數> [--rounds=10 ...] | run <job檔> | merge <結果目錄>');
