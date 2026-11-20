// 平行爬山法（退火式接受）：每輪 10 個候選各跑一天（--cand= 可改） → 前 3 名換 2 個新亂數確認 → 接受／拒絕。
// 評估＝headless 跑週二（--from/--until）、每個攤位到訪次數 ÷ 營業小時；成績 J＝變異係數 ＋ pZero × 0 次攤位數（越小越好）。
// 用法：node search.js [--rounds=15] [--conc=20]    停止：在 live/ 放一個 STOP 檔案（這一輪結束後停）
// 輸出：live/state.js（即時畫面讀）、history.csv、candidates.csv、stalls_by_round.csv、validation.csv、summary.csv
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { spawn } = require('child_process');
const SL = require('./layout.js'), { ERA } = require('./load_data.js')();
const DIR = __dirname, LIVE = path.join(DIR, 'live'), WORK = path.join(DIR, 'work'), ROOT = path.resolve(DIR, '..', '..'), HEADLESS = path.join(ROOT, '99_diag_dashboard', 'headless.js');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const HOUR = arg('mode', 'day') === 'hour', H0 = +arg('hour', 18), RELAX = arg('relax', '') !== '', CELLS = HOUR && arg('reward', 'visits') === 'cells', DWELL = HOUR && (CELLS || arg('reward', 'visits') === 'dwell'), DK = CELLS ? 'cells' : 'med', /* --reward=cells（2026-11-20）：獎勵＝來過這攤的顧客「走過的不同格子數」中位數；dwell 也改中位數 */ SOLO = arg('solo', ''), POOL = (() => { const f = arg('pool', ''); try { return f ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; } catch (e) { return null; } })(), // --pool=檔案：前面攤位找到的好板子參數
  // --solo=攤位代號：只動這一個攤位（其他固定在起點）
   UN = CELLS ? ' 格' : DWELL ? ' 分' : ' 次', // --reward=dwell：獎勵改成「顧客停留」（見 headless --dwell）：每個攤位＝來過它的顧客的平均停留分鐘，全市場＝這批顧客平均停留分鐘
   MOVES = (L, E) => SL.moves(L, E); // --relax=1：板子不預設形式（見 layout.js randomFree）
// 小時模式（--mode=hour --hour=18 --warm=3）：每次模擬只量 [hour, hour+1) 一小時（前面暖機 warm 小時讓場上有人），分數＝這一小時全市場到訪總數（越高越好）；不退火，只接受比目前高的
const SB = +arg('seedbase', 0), C = { day: +arg('day', 3), w0: HOUR ? H0 : 5, w1: HOUR ? H0 + 1 : 22, warm: HOUR ? +arg('warm', 3) : 0, rounds: +arg('rounds', 15), conc: +arg('conc', 20), nCand: +arg('cand', 10), nInformed: +arg('informed', 5), top: 3, pZero: 0.25, T0: 0.01, decay: 0.85, seeds: Array.from({ length: Math.max(1, +arg('seeds', 3)) }, (_, i) => i + 1 + SB * 100) }; // --seedbase=K：換一組亂數（模擬器的亂數與搜尋的亂數都整組平移），分給多台電腦各跑一份時每台用不同的 K（見 distribute.js） // --seeds=N：每個配置用幾個亂數（預設 3；校準按鈕會找出建議值）
fs.mkdirSync(LIVE, { recursive: true }); fs.mkdirSync(WORK, { recursive: true });
const rng = seed0 => { let seed = seed0 + SB * 100000; return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;

// ---- 平行跑模擬 ----
let running = 0; const queue = [];
const pump = () => { while (running < C.conc && queue.length) { const j = queue.shift(); running++; j.task().then(j.res, j.rej).finally(() => { running--; pump(); }); } };
const pool = task => new Promise((res, rej) => { queue.push({ task, res, rej }); pump(); });
function runSim(L, day, seed, ev) {
  const h = crypto.createHash('sha1').update(SL.hash(L)).digest('hex').slice(0, 10), file = path.join(WORK, 'L_' + h + '.json');
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(L));
  const from = day * 86400 + (C.w0 - C.warm) * 3600, until = day * 86400 + C.w1 * 3600 + (DWELL ? 1800 : 0); // 停留：追蹤 cohort（窗口後 30 分鐘內進場）每人 60 分鐘，所以多跑 30 分鐘
  return pool(() => new Promise((res, rej) => {
    const p = spawn(process.execPath, [HEADLESS, '--shops', '--fast2', `--from=${from}`, `--until=${until}`, `--seed=${seed}`, `--win=${C.w0}-${C.w1}`, `--layout=${file}`, ...(DWELL ? ['--dwell'] : [])], { cwd: ROOT });
    let out = ''; ev && ev.start && ev.start();
    p.stdout.on('data', d => { out += d; if (ev && ev.prog) { const m = String(d).match(/PROG ([\d.]+)/g); if (m) ev.prog(Math.min(0.99, +m[m.length - 1].slice(5))); } }); p.stderr.on('data', d => out += d);
    p.on('close', () => { ev && ev.done && ev.done(); const l = out.split('\n').find(x => x.startsWith('SHOPS ')), cl = out.split('\n').find(x => x.startsWith('CROWD ')), dl = out.split('\n').find(x => x.startsWith('DWELL ')); l ? res(Object.assign(JSON.parse(l.slice(6)), { crowd: cl ? JSON.parse(cl.slice(6)) : null, dwell: dl ? JSON.parse(dl.slice(6)) : null })) : rej(new Error('模擬沒有輸出：' + out.slice(-300))); });
  }));
}
const cache = new Map();
const evalSeed = (L, seed, day = C.day, ev = null) => { const k = SL.hash(L) + '|' + day + '|' + seed; if (!cache.has(k)) cache.set(k, runSim(L, day, seed, ev).then(scoreOf)); else if (ev) { ev.start && ev.start(); ev.done && ev.done(); } return cache.get(k); };

// ---- 成績 ----
function scoreOf(shops) {
  const dwell = DWELL ? shops.dwell : null, crowdObj = shops.crowd; // 停留模式：每攤的 visits 欄改放「來過它的顧客平均停留（分）」，全市場 total＝這批顧客平均停留（分）；原到訪數留在 raw（種類多樣用）
  if (dwell) { shops = shops.map(x => ({ ...x, raw: x.visits, visits: (dwell.perStall[x.code] || { [DK]: 0 })[DK] })); shops.crowd = crowdObj; }
  const live = shops.filter(s => s.openH > 0), ph = live.map(s => s.visits / s.openH), m = mean(ph), cv = Math.sqrt(mean(ph.map(x => (x - m) ** 2))) / m, zeros = live.filter(s => s.visits === 0).length;
  const total = dwell ? dwell[DK] : shops.reduce((s, x) => s + x.visits, 0);
  // 現實可觀察的檢查指標（不是獎勵）：擁擠＝窗內站在 ≥2 人格子的人數比例；種類多樣＝各店種到訪占比的夏農熵（bit，越高越多樣）
  const crowd = shops.crowd && shops.crowd.people ? shops.crowd.crowdPeople / shops.crowd.people : 0, byCat = {}; shops.forEach(x => { byCat[x.cat] = (byCat[x.cat] || 0) + (x.raw ?? x.visits); });
  const divTot = Object.values(byCat).reduce((s, v) => s + v, 0), diversity = divTot ? -Object.values(byCat).filter(v => v > 0).reduce((s, v) => s + (v / divTot) * Math.log2(v / divTot), 0) : 0;
  return { J: HOUR ? -total : cv + C.pZero * zeros, total, trails: dwell ? dwell.paths : null, ex: dwell ? { dmed: dwell.med, cells: dwell.cells, mpc: dwell.minPerCell, cf: dwell.crowdFrac } : null, crowd, diversity, cv, zeros, mean: m, stalls: Object.fromEntries(live.map(s => [s.code, { visits: s.visits, openH: s.openH, perHour: s.visits / s.openH }])) };
}
function aggregate(scs) {
  const codes = Object.keys(scs[0].stalls);
  return { J: mean(scs.map(s => s.J)), total: mean(scs.map(s => s.total)), crowd: mean(scs.map(s => s.crowd || 0)), diversity: mean(scs.map(s => s.diversity || 0)), cv: mean(scs.map(s => s.cv)), zeros: mean(scs.map(s => s.zeros)), mean: mean(scs.map(s => s.mean)), n: scs.length, trails: scs[0].trails || null, ex: scs[0].ex ? Object.fromEntries(['dmed', 'cells', 'mpc', 'cf'].map(k => [k, mean(scs.map(s => s.ex[k]))])) : null,
    stalls: Object.fromEntries(codes.map(c => [c, { visits: mean(scs.map(s => s.stalls[c].visits)), openH: scs[0].stalls[c].openH, perHour: mean(scs.map(s => s.stalls[c].perHour)) }])) };
}

// ---- 狀態輸出（即時畫面讀 live/state.js）----
const state = { runId: arg('run', ''), status: 'init', round: 0, rounds: C.rounds, config: { mode: HOUR ? 'hour' : 'day', solo: SOLO || null, reward: CELLS ? 'cells' : DWELL ? 'dwell' : 'visits', warm: C.warm, day: ['週日','週一','週二','週三','週四','週五','週六'][(C.day + 6) % 7] + '（day=' + C.day + '）', window: C.w0 + ':00–' + C.w1 + ':00', seeds: C.seeds, pZero: C.pZero, candidates: C.nCand, top: C.top, conc: C.conc }, start: null, current: null, best: null, original: null, history: [], candidates: [], lastMove: null, log: [], stallBest: {}, t0: Date.now(), updated: null, validation: null };
// ---- 進度（即時畫面的進度條）：每個階段一組模擬，每個模擬的 frac＝0~1（headless 每 10 分鐘模擬時間回報一次）----
let dirty = false; setInterval(() => { if (dirty) { dirty = false; writeState(); } }, 1500);
const prog = { phase: '', sims: [] }; state.progress = prog;
const newPhase = (name, labels) => { prog.phase = name; prog.sims = labels.map(l => ({ label: l, frac: 0, done: false })); dirty = true; };
const simEv = (i, extra) => ({ start() { prog.sims[i].frac = Math.max(prog.sims[i].frac, 0.001); extra && extra('run', 0); dirty = true; }, prog(f) { prog.sims[i].frac = f; extra && extra('run', f); dirty = true; }, done() { prog.sims[i].frac = 1; prog.sims[i].done = true; extra && extra('done', 1); dirty = true; } });
const log = s => { state.log.push(new Date().toLocaleTimeString('zh-TW', { hour12: false }) + ' ' + s); state.log = state.log.slice(-60); console.log(s); };
// ---- 每攤一份政策（強化學習）：傾角、朝向、貼地／離地、動作種類都由政策抽，獎勵來了才更新（見 layout.js 的 newPolicy／learn）----
const POLS = {}, polOf = code => POLS[code] || (POLS[code] = SL.newPolicy()), LR = +arg('lr', 0.3);
const repairOrphans = (K, base, kept, moves) => { // 各攤改法合併後，如果有板子沒碰到任何板子（例如它靠的是別攤的板子，而那攤這輪被退回），把相關的保留攤退回原樣，直到全市場都碰得到
  while (kept.size) { const bad = SL.orphanCodes(K.cells); if (!bad.size) break; const code = [...bad].find(c => kept.has(c)) || [...kept][0];
    K = { ...K, cells: [...K.cells.filter(x => x.code !== code), ...base.cells.filter(x => x.code === code)] }; kept.delete(code);
    const i = moves.findIndex(m => m.code === code); if (i >= 0 && state.candidates[i]) { state.candidates[i].better = false; state.candidates[i].verdict = 'rejected'; } }
  return K;
};
const polSnap = L => { // 這一輪結束時，每攤政策的預期傾角（度）、預期朝向（度），和這攤板子實際的平均離地高度（m）——後台折線圖用
  const E = (q, L) => q.reduce((a, p, i) => a + p * L[i], 0), per = {}; for (const [c, p] of Object.entries(POLS)) { const q = SL.policyProbs(p), bz = L.cells.filter(x => x.code === c && x.board); per[c] = [+E(q.tilt, SL.TILTS).toFixed(2), +E(q.yaw, SL.YAWS).toFixed(2), bz.length ? +(bz.reduce((a, x) => a + x.z, 0) / bz.length).toFixed(2) : 0]; }
  (state.polHist = state.polHist || []).push({ round: state.round, per });
};
const learnAll = (moves, kept, L) => { moves.forEach(m => SL.learn(polOf(m.code), m.ms || [m], kept.has(m.code) ? 1 : 0, LR)); polSnap(L); }; // 這一輪這攤的停留比自己上次高（保留）＝1，否則 0
function writeState() {
  state.policy = Object.fromEntries(Object.entries(POLS).map(([c, p]) => [c, { ...SL.policyProbs(p), n: p.n }]));
  state.updated = new Date().toISOString(); state.elapsed = Math.round((Date.now() - state.t0) / 1000);
  const f = path.join(LIVE, 'state.js'), tmp = f + '.tmp', body = 'window.LIVE=' + JSON.stringify(state) + ';';
  try { fs.writeFileSync(tmp, body); fs.renameSync(tmp, f); } catch (e) { fs.writeFileSync(f, body); }
}
function saveRound(n) { // 每輪結束存一份當下配置，viewer 的時間條可以拉回任一輪（live/rounds/<輪>.json）
  try { const d = path.join(LIVE, 'rounds'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, n + '.json'), JSON.stringify({ round: n, current: state.current, best: state.best, lastMove: state.lastMove })); } catch (e) {}
}
const stallRows = (L, agg, changed) => [...new Set(L.cells.map(x => x.code))].sort().map(code => {
  const a = agg.stalls[code] || {}, cat = L.cells.find(x => x.code === code).cat;
  return { code, cat, tables: SL.tablesOf(L, code).length, seats: SL.seatsOf(L, code).length, visits: +(a.visits || 0).toFixed(1), openH: a.openH || 0, perHour: +(a.perHour || 0).toFixed(2), changed: changed[code] || 0 };
});
const snapshot = (L, agg, changed) => ({ layout: { cells: L.cells, fronts: L.fronts }, J: agg.J, cv: agg.cv, zeros: agg.zeros, mean: agg.mean, crowd: agg.crowd, diversity: agg.diversity, trails: agg.trails || null, stalls: stallRows(L, agg, changed) });

const csv = (f, header, rows, append) => { const p = path.join(DIR, f); if (!append || !fs.existsSync(p)) fs.writeFileSync(p, '﻿' + header + '\n'); fs.appendFileSync(p, rows.map(r => r.map(x => typeof x === 'string' && /[,"\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x).join(',')).join('\n') + (rows.length ? '\n' : '')); };

// ---- 板子擺放紀錄（給畫面「板子擺放紀錄」分頁）：保留下來的攤位，若它整攤的擺法（以設備格為原點的相對位置＋形式）是這次執行裡第一次出現，就記一筆 ----
const seenPat = new Set(), sigOf = cells => { const e = cells.find(x => x.zone === '工作設備區') || cells[0]; return cells.map(x => (x.r - e.r) + ',' + (x.c - e.c) + ',' + x.zone + ',' + (x.board ? x.tilt + ':' + x.z + ':' + x.yaw : '')).sort().join('|'); };
const regStart = L => [...new Set(L.cells.map(x => x.code))].forEach(code => seenPat.add(sigOf(L.cells.filter(x => x.code === code)))); // 起點的擺法不算新
const slimCells = cells => cells.map(x => ({ r: x.r, c: x.c, zone: x.zone, board: !!x.board, tilt: x.tilt, z: x.z, yaw: x.yaw, over: !!x.over, ramp: !!x.ramp, code: x.code, cat: x.cat }));
function notePlacements(L, kept, moves, prevAgg, propAgg, n) {
  state.placements = state.placements || [];
  kept.forEach(code => {
    const cells = L.cells.filter(x => x.code === code);
    { const v = (propAgg.stalls[code] || {}).visits || 0, sb = state.stallBest[code]; if (!sb || v > sb.value) state.stallBest[code] = { value: v, start: (state.stallStart || {})[code], round: n, cells: slimCells(cells) }; } // 各攤最好的型態
    const sig = sigOf(cells); if (seenPat.has(sig)) return; seenPat.add(sig);
    const m = moves.find(x => x.code === code);
    state.placements.push({ round: n, code, cat: cells[0].cat, move: m ? SL.describe(m) : '', before: (prevAgg.stalls[code] || {}).visits || 0, after: (propAgg.stalls[code] || {}).visits || 0, cells: cells.map(x => ({ r: x.r, c: x.c, zone: x.zone, board: !!x.board, tilt: x.tilt, z: x.z, over: !!x.over, ramp: !!x.ramp, code: x.code, cat: x.cat })) });
  });
  if (state.placements.length > 400) state.placements = state.placements.slice(-400);
}

// ---- 候選動作 ----
function pickCandidates(L, agg, n) {
  const R = rng(1000 + n), legal = SL.moves(L, ERA).filter(m => SL.connected(SL.apply(L, m), ERA).ok);
  const pick = a => a[Math.floor(R() * a.length)], chosen = [], key = m => m.type + m.code + m.r + ',' + m.c, seen = new Set();
  const add = m => { if (m && !seen.has(key(m))) { seen.add(key(m)); chosen.push(m); } };
  const codes = Object.entries(agg.stalls).sort((a, b) => a[1].perHour - b[1].perHour).map(x => x[0]);
  const low = codes.slice(0, 8), high = codes.slice(-8).reverse();
  for (let i = 0; i < 8 && chosen.length < C.nInformed; i++) { // 到訪最少的加桌、最多的減桌（交錯）
    add(pick(legal.filter(m => m.code === low[i] && m.type === 'add') .concat([null]).filter(Boolean)));
    if (chosen.length < C.nInformed) add(pick(legal.filter(m => m.code === high[i] && m.type === 'remove').concat([null]).filter(Boolean)));
  }
  const covered = new Set(chosen.map(m => m.code)); // 再讓每個還沒被試到的攤位各有一個候選（候選數夠多時覆蓋全部攤位）
  [...new Set(legal.map(m => m.code))].sort(() => R() - 0.5).forEach(code => { if (chosen.length < C.nCand && !covered.has(code)) { add(pick(legal.filter(m => m.code === code))); covered.add(code); } });
  let guard = 0; while (chosen.length < C.nCand && guard++ < 500) add(pick(legal));
  return { chosen, legalCount: legal.length };
}

// ---- 最後驗證＋輸出（也可單獨跑：node search.js --validate-only，從 live/state.js 讀上一次的最佳配置）----
// 試跑早停（校準用，--stopthr=雜訊門檻 --stopmin=最少輪數）：最近 W 輪「到目前最好的到訪」只增加 ≤ 門檻（W＝max(30, 已跑輪數的 30%)）就停
const ES = arg('stopthr', '') !== '' ? { thr: +arg('stopthr', 0), min: +arg('stopmin', 60) } : null;
function stopCheck() {
  if (!ES) return false;
  const h = state.history, last = h[h.length - 1]; if (!last || last.bestTotal == null || last.round < ES.min) return false;
  const W = Math.max(30, Math.round(last.round * 0.3)), old = [...h].reverse().find(x => x.round <= last.round - W);
  if (!old || old.bestTotal == null || last.bestTotal - old.bestTotal > ES.thr) return false;
  log(`早停：第 ${last.round} 輪，最近 ${W} 輪最好的到訪只增加 ${(last.bestTotal - old.bestTotal).toFixed(1)}（≤ 雜訊門檻 ${ES.thr.toFixed(1)}）`); return true;
}
async function finish(START, ORIG, bestL) {
  if (arg('novalidate', '') !== '') { state.status = 'done'; log('完成（試跑：略過最後驗證）'); writeState(); return; } // 校準的試跑不做最後驗證
  // ---- 最後驗證：原配置（已合併更正）、最小單位起點、搜尋最佳，各跑 7 天（週六起），不同亂數 ----
  state.status = 'validating'; state.candidates = state.candidates.map(c => ({ ...c, verdict: c.verdict || 'dropped' })); log('最後驗證：3 種配置 × 7 天');
  const sets = { 原配置: ORIG, 最小單位起點: START, 搜尋最佳: bestL }, val = {};
  newPhase('validating', Object.keys(sets).flatMap(n => [0, 1, 2, 3, 4, 5, 6].map(d => n + '・第 ' + (d + 1) + ' 天'))); writeState();
  for (const [name, L] of Object.entries(sets)) {
    const bi = Object.keys(sets).indexOf(name) * 7;
    const days = await Promise.all([0, 1, 2, 3, 4, 5, 6].map(d => evalSeed(L, 11 + d, d, simEv(bi + d))));
    const codes = [...new Set(days.flatMap(d => Object.keys(d.stalls)))].sort(), pooled = codes.map(c => days.reduce((s, d) => s + (d.stalls[c] ? d.stalls[c].visits : 0), 0) / Math.max(1, days.reduce((s, d) => s + (d.stalls[c] ? d.stalls[c].openH : 0), 0)));
    const m = mean(pooled), cv = Math.sqrt(mean(pooled.map(x => (x - m) ** 2))) / m, zeros = codes.filter((c, i) => pooled[i] === 0).length;
    val[name] = { total: mean(days.map(d => d.total)), cv, zeros, J: HOUR ? -mean(days.map(d => d.total)) : cv + C.pZero * zeros, dailyCV: days.map(d => d.cv), perHour: Object.fromEntries(codes.map((c, i) => [c, pooled[i]])) };
  }
  state.validation = val;
  csv('validation.csv', 'layout,visits_per_day_window,cv_7days,zeros_7days,J_7days,daily_cv', Object.entries(val).map(([k, v]) => [k, v.total.toFixed(1), v.cv.toFixed(4), v.zeros, v.J.toFixed(4), v.dailyCV.map(x => x.toFixed(3)).join('|')]));
  csv('summary.csv', 'item,start,best,original_fixed', [[HOUR ? 'visits_tuesday_hour_3seeds' : 'J_tuesday_3seeds', (HOUR ? -state.start.J : state.start.J).toFixed(4), (HOUR ? -state.best.J : state.best.J).toFixed(4), ''], ['cv_7days', val['最小單位起點'].cv.toFixed(4), val['搜尋最佳'].cv.toFixed(4), val['原配置'].cv.toFixed(4)], ['zeros_7days', val['最小單位起點'].zeros, val['搜尋最佳'].zeros, val['原配置'].zeros], ['accepted_rounds', '', state.history.filter(h => h.accepted).length, '']]);
  state.status = 'done'; log('完成'); writeState();
}

// ---- 主流程 ----
(async () => {
  const START = SL.minimal(ERA); if (START.report.length) log('起點配置提醒：' + START.report.join('；'));
  const ORIG = SL.original(ERA), changed = {};
  if (arg('validate-only', '') !== '') {
    global.window = {}; (0, eval)(fs.readFileSync(path.join(LIVE, 'state.js'), 'utf8')); const prev = window.LIVE;
    Object.assign(state, { runId: arg('run', prev.runId || ''), round: prev.round, start: prev.start, best: prev.best, current: prev.current, history: prev.history, lastMove: prev.lastMove, candidates: [] });
    log('只做最後驗證（沿用上一次的搜尋結果）'); await finish(START, ORIG, prev.best.layout); process.exit(0);
  }
  log(`最小單位起點：${new Set(START.cells.map(x => x.code)).size} 個攤位、${START.cells.length} 格；連通：${JSON.stringify(SL.connected(START, ERA))}`);
  state.status = 'baseline'; writeState();
  newPhase('baseline', C.seeds.map(s => '起點・亂數 ' + s));
  const base = await Promise.all(C.seeds.map((s, i) => evalSeed(START, s, C.day, simEv(i))));
  let cur = { L: START, agg: aggregate(base), J1: base[0].J };
  state.start = snapshot(START, cur.agg, changed); state.current = state.start; state.best = state.start;
  let best = cur;
  if (HOUR) log(`起點：${C.w0}:00–${C.w1}:00 ${DWELL ? '這批顧客平均停留' : '這一小時全市場到訪'} ${cur.agg.total.toFixed(DWELL ? 1 : 0)}${UN}（暖機 ${C.warm} 小時）`); else log(`起點成績 J=${cur.agg.J.toFixed(3)}（不平均 ${cur.agg.cv.toFixed(3)}，0 次攤位 ${cur.agg.zeros.toFixed(1)}）`);
  csv('history.csv', 'round,status,J_before,J_best_candidate,J_after,cv,zeros,accepted,move,elapsed_s,crowd,diversity,suspect', [[0, 'baseline', '', '', cur.agg.J.toFixed(4), cur.agg.cv.toFixed(4), cur.agg.zeros, '', '', Math.round((Date.now() - state.t0) / 1000), (cur.agg.crowd || 0).toFixed(4), (cur.agg.diversity || 0).toFixed(3), '']]);
  csv('stalls_by_round.csv', 'round,code,cat,tables,seats,visits,openH,perHour', stallRows(START, cur.agg, changed).map(r => [0, r.code, r.cat, r.tables, r.seats, r.visits, r.openH, r.perHour]));
  csv('candidates.csv', 'round,rank,move,J_seed1,cv_seed1,zeros_seed1,J_confirmed', []);
  state.history.push({ round: 0, J: cur.agg.J, cv: cur.agg.cv, zeros: cur.agg.zeros, accepted: null, move: null, bestTotal: cur.agg.total, ex: cur.agg.ex });
  writeState();

  // ---- 小時模式：每個攤位是獨立 agent（2026-11-16 使用者拍板）----
  // 每輪：①27 攤各自提一個改法（加／減一格桌面），全部一起套用、跑一次（3 個亂數取平均）；②每個攤位只比「自己」的到訪有沒有比上次高：高＝得 1 分、保留自己的改法，沒高＝只把自己的改法退回去；
  // ③把保留的合在一起再量一次，當下一輪「自己上次」的基準。本輪得分＝到訪變高的攤位數。
  if (HOUR) {
    regStart(START);
    const BOARDS = Math.max(1, Math.min(8, +arg('boards', 1))), S = C.seeds, ownCells = (L, set, same) => L.cells.filter(x => set.has(x.code) === same);
    const propose = (L, n, open) => { // 只有這個時段有營業的攤位才算 agent（沒營業的不提改法、不進計算）
      const R = rng(5000 + n); let W = L; const moves = [];
      [...new Set(L.cells.map(x => x.code))].filter(c => open.has(c) && (!SOLO || c === SOLO)).sort(() => R() - 0.5).forEach(code => {
        let m = null;
        if (RELAX) { // --boards=N：每個攤位一輪連續動 N 塊（全部攤位各自同時進行）；合成一個動作 { ...第一塊, ms:[每一塊] }，其他地方照舊讀第一塊
          const ms = []; let X = W;
          for (let b = 0; b < BOARDS; b++) { let x = null; for (let k = 0; k < 15 && !x; k++) x = SL.randomFree(X, ERA, code, R, POOL, polOf(code)); if (!x) break; ms.push(x); X = SL.apply(X, x); }
          if (ms.length) { m = { ...ms[0], ms }; W = X; moves.push(m); m = null; }
        } // 板子不預設形式：隨機抽一個動作（限制：周圍 2 格內、板子要相連，已在 randomFree 內保證；不再檢查桌子走不走得到，2026-11-18 使用者拍板）
        else { const legal = MOVES(W, ERA).filter(x => x.code === code).sort(() => R() - 0.5); m = legal.find(x => SL.connected(SL.apply(W, x), ERA).ok) || null; }
        if (m) { W = SL.apply(W, m); moves.push(m); }
      });
      return { W, moves };
    };
    csv('candidates.csv', 'round,stall,move,visits_after,visits_before,improved', []);
    const T = () => Math.round((Date.now() - state.t0) / 1000);
    let totalScore = 0;
    // 各攤最好的型態（stallBest）：起點先放進去，之後保留下來的攤位若自己的分數創新高就更新（notePlacements 裡）
    state.stallStart = Object.fromEntries(Object.entries(cur.agg.stalls).map(([c, s]) => [c, s.visits]));
    for (const c of Object.keys(cur.agg.stalls)) state.stallBest[c] = { value: cur.agg.stalls[c].visits, start: cur.agg.stalls[c].visits, round: 0, cells: slimCells(START.cells.filter(x => x.code === c)) };
    // ---- 只動一個攤位（--solo=代號）：其他攤固定在起點，這個攤每輪抽 NC 個候選動作各跑一次，最好的比目前高才採用（爬山）；跑完用新亂數驗證，存 live/limits_<代號>.json ----
    if (SOLO) {
      if (!cur.agg.stalls[SOLO]) { log(`${SOLO} 在這個時段沒營業，不用做`); process.exit(0); }
      const NC = Math.max(2, +arg('cand', Math.max(2, Math.floor(20 / S.length)))), STEP = Math.max(1, +arg('step', 2)), R = rng(9000 + [...SOLO].reduce((a, ch) => a + ch.charCodeAt(0), 0)), val = x => (x.stalls[SOLO] || {}).visits || 0;
      const startV = val(cur.agg), curve = [startV]; let X = START, curV = startV;
      for (let n = 1; n <= C.rounds; n++) {
        if (fs.existsSync(path.join(LIVE, 'STOP'))) { log('偵測到 STOP，停止'); break; }
        if (stopCheck()) break; // 校準的單攤試跑：最近進步小於雜訊就停
        state.round = n; state.status = 'screening';
        const cands = []; for (let k = 0; k < NC * 4 && cands.length < NC; k++) { let L = X; const ms = []; for (let s = 0; s < STEP; s++) { const m = SL.randomFree(L, ERA, SOLO, R, POOL, polOf(SOLO)); if (!m) break; ms.push(m); L = SL.apply(L, m); } if (ms.length) cands.push({ ms, L }); } // 每個候選連續動 STEP 塊（步子大一點，收斂快）
        if (!cands.length) { log(`第 ${n} 輪：${SOLO} 沒有可動的動作`); continue; }
        state.candidates = cands.map((m, i) => ({ i, move: m.ms.map(SL.describe).join('＋'), mv: m.ms[0], status: 'running', frac: 0, J1: null, cv: null, zeros: null, top: false, J3: null, verdict: null, better: null }));
        newPhase('screening', cands.flatMap((m, i) => S.map(s => `候選 ${i + 1}・亂數 ${s}`))); writeState();
        const res = await Promise.all(cands.map(async (m, i) => {
          const L = m.L, agg = aggregate(await Promise.all(S.map((s, j) => evalSeed(L, s, C.day, simEv(i * S.length + j))))), c = state.candidates[i];
          c.status = 'done'; c.frac = 1; c.J1 = -val(agg); c.J3 = -curV; c.better = val(agg) > curV; c.verdict = c.better ? 'accepted' : 'rejected'; return { m, L, agg, v: val(agg) };
        }));
        res.sort((a, b) => b.v - a.v); const w = res[0], acc = w.v > curV;
        res.forEach(x => SL.learn(polOf(SOLO), x.m.ms, x.v > curV ? 1 : 0, LR)); polSnap(acc ? w.L : X); // 每個候選：比目前高＝1
        if (acc) { X = w.L; curV = w.v; cur = { L: X, agg: w.agg, J1: 0 }; cur.agg.J = -cur.agg.total; changed[SOLO] = n; state.stallBest[SOLO] = { value: curV, start: startV, round: n, cells: slimCells(X.cells.filter(x => x.code === SOLO)) }; }
        curve.push(curV);
        const txt = `${SOLO} ${acc ? '接受' : '沒改'}：${w.m.ms.map(SL.describe).join('＋')}｜${SOLO} 目前 ${curV.toFixed(2)}（起點 ${startV.toFixed(2)}）`;
        state.lastMove = { round: n, text: txt, code: '', type: 'multi' };
        state.history.push({ round: n, J: -curV, cv: 0, zeros: 0, Jcand: -w.v, accepted: acc, move: txt, bestTotal: curV, crowd: cur.agg.crowd, diversity: cur.agg.diversity, ex: cur.agg.ex });
        state.current = snapshot(cur.L, cur.agg, changed); state.best = state.current; state.status = 'idle'; writeState(); log(`第 ${n} 輪：${txt}`);
      }
      if (arg('pilot', '') !== '') { state.status = 'done'; log('試跑完成（校準用：不驗證、不寫極限結果檔）'); writeState(); process.exit(0); }
      const VS = Array.from({ length: S.length * 2 }, (_, i) => 100 + i); // 驗證：用沒用過的亂數重量「最後的」與「起點」，免得被雜訊墊高
      const [vb, v0] = await Promise.all([Promise.all(VS.map(s => evalSeed(X, s, C.day))), Promise.all(VS.map(s => evalSeed(START, s, C.day)))]).then(([a, b]) => [mean(a.map(val)), mean(b.map(val))]);
      const bd = X.cells.filter(x => x.code === SOLO), out = { code: SOLO, cat: bd[0].cat, hour: C.w0, seeds: S.length, rounds: C.rounds, cand: NC, start: startV, best: curV, validatedStart: v0, validatedBest: vb, curve, boards: bd.filter(x => x.board).length, cells: slimCells(bd) };
      fs.writeFileSync(path.join(LIVE, `limits_${SOLO}.json`), JSON.stringify(out)); state.status = 'done'; log(`${SOLO} 完成：搜尋時 ${startV.toFixed(2)}→${curV.toFixed(2)}，新亂數驗證 ${v0.toFixed(2)}→${vb.toFixed(2)}`); writeState(); process.exit(0);
    }
    // ---- MAP-Elites（--map=1，2026-11-18 使用者拍板）：不只留最高分的，而是依「樣子」分格、每格留最好的一個 ----
    // 樣子兩軸：桌面總格數（每 10 格一級）× 板子作用（數量最多的：1 桌面／2 擋路／3 高於人不擋路；0 沒有板子；要勾 --relax=1 才有板子）
    // 每輪：從有配置的格子隨機挑一個當起點 → 各攤各提一個改法、一起跑 → 各攤只比自己（起點配置裡的自己）高才保留 → 合併後重量 → 放進對應的格子，比原占位者好才取代（取代前兩邊都多量 2 個亂數）
    if (arg('map', '') !== '') {
      const tcount = L => L.cells.filter(x => x.zone === '桌面空間' || x.zone === '工作桌面混合').length;
      const formOf = L => { const c = [0, 0, 0, 0]; L.cells.forEach(x => { if (x.board) c[x.over ? 3 : (x.zone === '桌面空間' || x.zone === '工作桌面混合') ? 1 : 2]++; }); const m = Math.max(...c.slice(1)); return m ? c.indexOf(m, 1) : 0; }; // 第二軸＝板子在模擬器裡的作用，數量最多的那種（0 沒有板子／1 桌面／2 擋路／3 高於人不擋路）；不是預設形式，是幾何規則推出來的
      const binOf = L => Math.floor(tcount(L) / 10) + '|' + formOf(L);
      const archive = new Map(), R = rng(777), EX = [S.length + 1, S.length + 2], mean5 = (agg, ex) => (agg.total * S.length + ex.reduce((s, x) => s + x.total, 0)) / (S.length + ex.length);
      const put = (L, agg, n) => archive.set(binOf(L), { L, agg, n });
      const dump = () => { const es = [...archive.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })); state.archive = es.map(([b, e]) => ({ bin: b, tables: tcount(e.L), total: e.agg.total, round: e.n }));
        csv('archive.csv', 'bin,table_cells,form,visits,found_round', es.map(([b, e]) => [b, tcount(e.L), formOf(e.L), e.agg.total.toFixed(1), e.n])); };
      put(START, cur.agg, 0); dump();
      for (let n = 1; n <= C.rounds; n++) {
        if (fs.existsSync(path.join(LIVE, 'STOP'))) { log('偵測到 STOP，停止'); break; } if (stopCheck()) break;
        const ents = [...archive.values()], par = ents[Math.floor(R() * ents.length)], before = par.agg.total;
        state.round = n; state.status = 'screening';
        const { W, moves } = propose(par.L, n, new Set(Object.keys(par.agg.stalls)));
        if (!moves.length) { log(`第 ${n} 輪：沒有可改的攤位`); continue; }
        state.candidates = moves.map((m, i) => ({ i, move: SL.describe(m), mv: m, status: 'running', frac: 0, J1: null, cv: null, zeros: null, top: false, J3: null, verdict: null, better: null }));
        log(`第 ${n} 輪：從格 ${binOf(par.L)}（${before.toFixed(DWELL ? 1 : 0)}${UN}）出發，${moves.length} 個營業中的攤位各提一個改法（每攤連續動 ${BOARDS} 塊板子）`); newPhase('screening', S.map(s => '全部改法一起・亂數 ' + s)); writeState();
        const prop = aggregate(await Promise.all(S.map((s, i) => evalSeed(W, s, C.day, simEv(i)))));
        const kept = new Set();
        moves.forEach((m, i) => { const c = state.candidates[i], v = (prop.stalls[m.code] || {}).visits || 0, p = (par.agg.stalls[m.code] || {}).visits || 0;
          c.status = 'done'; c.frac = 1; c.J1 = -v; c.J3 = -p; c.better = v > p; c.verdict = c.better ? 'accepted' : 'rejected'; if (c.better) kept.add(m.code); });
        let K = par.L;
        [...kept].forEach(code => {
          const K2 = { ...K, cells: [...K.cells.filter(x => x.code !== code), ...W.cells.filter(x => x.code === code)] };
          if (RELAX || SL.connected(K2, ERA).ok) K = K2; else { kept.delete(code); const i = moves.findIndex(m => m.code === code); state.candidates[i].better = false; state.candidates[i].verdict = 'rejected'; }
        });
        K = repairOrphans(K, par.L, kept, moves); notePlacements(K, kept, moves, par.agg, prop, n); learnAll(moves, kept, K);
        let result = '沒有攤位變高，不產生新配置', shown = par;
        if (kept.size) {
          newPhase('baseline', S.map(s => '保留後重量・亂數 ' + s)); writeState();
          const agg = aggregate(await Promise.all(S.map((s, i) => evalSeed(K, s, C.day, simEv(i))))); kept.forEach(code => { changed[code] = n; }); shown = { L: K, agg };
          const b = binOf(K), occ = archive.get(b);
          if (!occ) { put(K, agg, n); result = `放進空格 ${b}`; }
          else if (agg.total > occ.agg.total) {
            newPhase('confirming', ['新配置・亂數 4', '新配置・亂數 5', '原占位者・亂數 4', '原占位者・亂數 5']); writeState();
            const [c5, o5] = await Promise.all([Promise.all(EX.map(s => evalSeed(K, s, C.day))), Promise.all(EX.map(s => evalSeed(occ.L, s, C.day)))]);
            if (mean5(agg, c5) > mean5(occ.agg, o5)) { put(K, agg, n); result = `取代格 ${b} 的原占位者`; } else result = `格 ${b} 落選（原占位者重量後較好）`;
          } else result = `格 ${b} 落選（沒比原占位者高）`;
        }
        const top = [...archive.values()].sort((a, b) => b.agg.total - a.agg.total)[0]; best = { L: top.L, agg: top.agg };
        totalScore += kept.size; shown.agg.J = -shown.agg.total;
        const sus = shown !== par && shown.agg.total > before && shown.agg.crowd > par.agg.crowd + 0.05; // 檢查指標：到訪升、擁擠也升超過 5 個百分點＝疑似鑽空子（只標記，不擋）
        const txt = `得分 ${kept.size}/${moves.length}（保留 ${[...kept].join('、') || '無'}）→ ${result}｜擁擠 ${(shown.agg.crowd * 100).toFixed(1)}%、種類多樣 ${shown.agg.diversity.toFixed(2)}${sus ? (DWELL ? '｜疑似繞路或塞車（停留變長、擁擠也升）' : '｜疑似鑽空子（到訪升、擁擠也升）') : ''}`;
        state.lastMove = { round: n, text: txt, code: '', type: 'multi' };
        log(`第 ${n} 輪：${txt}｜這個配置 ${shown.agg.total.toFixed(DWELL ? 1 : 0)}${UN}，地圖已填 ${archive.size} 格，最高 ${top.agg.total.toFixed(DWELL ? 1 : 0)}${UN}`);
        state.current = snapshot(shown.L, shown.agg, changed); state.best = snapshot(best.L, best.agg, changed); dump();
        state.history.push({ round: n, J: shown.agg.J, cv: shown.agg.cv, zeros: shown.agg.zeros, Jcand: -prop.total, accepted: result.startsWith('放進') || result.startsWith('取代'), move: txt, crowd: shown.agg.crowd, diversity: shown.agg.diversity, ex: shown.agg.ex, suspect: sus, bestTotal: best.agg.total }); saveRound(n); state.status = 'idle'; writeState();
        csv('history.csv', '', [[n, 'round', before.toFixed(1), prop.total.toFixed(1), shown.agg.total.toFixed(1), shown.agg.cv.toFixed(4), shown.agg.zeros, kept.size, txt, T(), shown.agg.crowd.toFixed(4), shown.agg.diversity.toFixed(3), sus ? 1 : 0]], true);
        csv('candidates.csv', '', moves.map((m, i) => [n, m.code, SL.describe(m), (-state.candidates[i].J1).toFixed(2), (-state.candidates[i].J3).toFixed(2), state.candidates[i].better ? 1 : 0]), true);
        csv('stalls_by_round.csv', '', stallRows(shown.L, shown.agg, changed).map(r => [n, r.code, r.cat, r.tables, r.seats, r.visits, r.openH, r.perHour]), true);
      }
      log(`${C.rounds} 輪結束：地圖共 ${archive.size} 格，累計得分 ${totalScore}`); await finish(START, ORIG, best.L); process.exit(0);
    }
    for (let n = 1; n <= C.rounds; n++) {
      if (fs.existsSync(path.join(LIVE, 'STOP'))) { log('偵測到 STOP，停止'); break; } if (stopCheck()) break;
      state.round = n; state.status = 'screening'; const before = cur.agg.total, bc = cur.agg.crowd;
      const { W, moves } = propose(cur.L, n, new Set(Object.keys(cur.agg.stalls)));
      state.candidates = moves.map((m, i) => ({ i, move: SL.describe(m), mv: m, status: 'running', frac: 0, J1: null, cv: null, zeros: null, top: false, J3: null, verdict: null, better: null }));
      log(`第 ${n} 輪：${moves.length} 個營業中的攤位各提一個改法（每攤連續動 ${BOARDS} 塊板子），一起跑`); newPhase('screening', S.map(s => '全部改法一起・亂數 ' + s)); writeState();
      const prop = aggregate(await Promise.all(S.map((s, i) => evalSeed(W, s, C.day, simEv(i)))));
      const kept = new Set();
      moves.forEach((m, i) => { const c = state.candidates[i], v = (prop.stalls[m.code] || {}).visits || 0, p = (cur.agg.stalls[m.code] || {}).visits || 0;
        c.status = 'done'; c.frac = 1; c.J1 = -v; c.J3 = -p; c.better = v > p; c.verdict = c.better ? 'accepted' : 'rejected'; if (c.better) kept.add(m.code); });
      let K = cur.L; // 一個一個把保留的攤位換進來；換進來會讓某張桌子走不到的，就退回那個攤位的改法
      [...kept].forEach(code => {
        const K2 = { ...K, cells: [...K.cells.filter(x => x.code !== code), ...W.cells.filter(x => x.code === code)] };
        if (RELAX || SL.connected(K2, ERA).ok) K = K2; else { kept.delete(code); const i = moves.findIndex(m => m.code === code); state.candidates[i].better = false; state.candidates[i].verdict = 'rejected'; log(`  ${code} 的改法會讓別處桌子走不到，退回`); }
      });
      K = repairOrphans(K, cur.L, kept, moves); notePlacements(K, kept, moves, cur.agg, prop, n); learnAll(moves, kept, K);
      if (kept.size) { state.status = 'confirming'; newPhase('baseline', S.map(s => '保留後重量・亂數 ' + s)); writeState(); cur = { L: K, agg: aggregate(await Promise.all(S.map((s, i) => evalSeed(K, s, C.day, simEv(i))))), J1: 0 }; kept.forEach(code => { changed[code] = n; }); }
      totalScore += kept.size;
      cur.agg.J = -cur.agg.total; if (cur.agg.total > best.agg.total) best = cur;
      const sus = kept.size > 0 && cur.agg.total > before && cur.agg.crowd > bc + 0.05; // 檢查指標：到訪升、擁擠也升超過 5 個百分點＝疑似鑽空子（只標記，不擋）
      const txt = `得分 ${kept.size}/${moves.length}（保留 ${[...kept].join('、') || '無'}）｜擁擠 ${(cur.agg.crowd * 100).toFixed(1)}%、種類多樣 ${cur.agg.diversity.toFixed(2)}${sus ? (DWELL ? '｜疑似繞路或塞車（停留變長、擁擠也升）' : '｜疑似鑽空子（到訪升、擁擠也升）') : ''}`;
      state.lastMove = { round: n, text: txt, code: '', type: 'multi' };
      log(`第 ${n} 輪：${txt}｜${DWELL ? '這批顧客平均停留' : '全市場這一小時到訪'} ${cur.agg.total.toFixed(DWELL ? 1 : 0)}${UN}（上一輪 ${before.toFixed(DWELL ? 1 : 0)}），累計得分 ${totalScore}`);
      state.current = snapshot(cur.L, cur.agg, changed); state.best = snapshot(best.L, best.agg, changed);
      state.history.push({ round: n, J: cur.agg.J, cv: cur.agg.cv, zeros: cur.agg.zeros, Jcand: -prop.total, accepted: kept.size > 0, move: txt, crowd: cur.agg.crowd, diversity: cur.agg.diversity, ex: cur.agg.ex, suspect: sus, bestTotal: best.agg.total }); saveRound(n); state.status = 'idle'; writeState();
      csv('history.csv', '', [[n, 'round', before.toFixed(1), prop.total.toFixed(1), cur.agg.total.toFixed(1), cur.agg.cv.toFixed(4), cur.agg.zeros, kept.size, txt, T(), cur.agg.crowd.toFixed(4), cur.agg.diversity.toFixed(3), sus ? 1 : 0]], true);
      csv('candidates.csv', '', moves.map((m, i) => [n, m.code, SL.describe(m), (-state.candidates[i].J1).toFixed(2), (-state.candidates[i].J3).toFixed(2), state.candidates[i].better ? 1 : 0]), true);
      csv('stalls_by_round.csv', '', stallRows(cur.L, cur.agg, changed).map(r => [n, r.code, r.cat, r.tables, r.seats, r.visits, r.openH, r.perHour]), true);
    }
    log(`${C.rounds} 輪結束：累計得分 ${totalScore}`); await finish(START, ORIG, best.L); process.exit(0);
  }

  for (let n = 1; n <= C.rounds; n++) {
    if (fs.existsSync(path.join(LIVE, 'STOP'))) { log('偵測到 STOP，停止'); break; } if (stopCheck()) break;
    state.round = n; state.status = 'screening';
    const { chosen, legalCount } = pickCandidates(cur.L, cur.agg.stalls ? cur.agg : cur.agg, n);
    log(`第 ${n} 輪：合法動作 ${legalCount} 個，篩選 ${chosen.length} 個候選`);
    state.candidates = chosen.map((m, i) => ({ i, move: SL.describe(m), mv: m, status: 'queued', frac: 0, J1: null, cv: null, zeros: null, top: false, J3: null, verdict: null }));
    state.curJ1 = cur.J1; state.status = 'screening'; newPhase('screening', chosen.map((m, i) => `候選 ${i + 1}：${SL.describe(m)}`)); writeState();
    const res = await Promise.all(chosen.map(async (m, i) => {
      const L = SL.apply(cur.L, m), c = state.candidates[i];
      const sc = await evalSeed(L, 1, C.day, simEv(i, (st, f) => { c.status = st === 'done' ? 'done' : 'running'; c.frac = f; }));
      c.J1 = sc.J; c.cv = sc.cv; c.zeros = sc.zeros; c.status = 'done'; dirty = true; return { m, L, sc, i };
    }));
    res.sort((a, b) => a.sc.J - b.sc.J);
    const top = res.slice(0, C.top); top.forEach(r => { state.candidates[r.i].top = true; });
    state.status = 'confirming'; newPhase('confirming', top.flatMap(r => C.seeds.slice(1).map(s => `候選 ${r.i + 1}・亂數 ${s}`))); writeState();
    await Promise.all(top.map(async (r, k) => { const ex = await Promise.all(C.seeds.slice(1).map((s, j) => evalSeed(r.L, s, C.day, simEv(k * (C.seeds.length - 1) + j)))); r.agg = aggregate([r.sc, ...ex]); state.candidates[r.i].J3 = r.agg.J; }));
    top.sort((a, b) => a.agg.J - b.agg.J);
    const win = top[0], delta = win.agg.J - cur.agg.J, T = C.T0 * Math.pow(C.decay, n - 1);
    const accepted = HOUR ? delta < 0 : (delta <= 0 || Math.random() < Math.exp(-delta / T)); // 小時模式：J＝−到訪總數，delta<0＝到訪變多才採用
    const before = cur.agg.J;
    state.candidates[win.i].verdict = accepted ? 'accepted' : 'rejected'; state.curJ1 = accepted ? win.sc.J : state.curJ1;
    if (accepted) { cur = { L: win.L, agg: win.agg, J1: win.sc.J }; changed[win.m.code] = n; state.lastMove = { round: n, text: SL.describe(win.m), code: win.m.code, type: win.m.type, r: win.m.r, c: win.m.c, seat: win.m.seat || null }; if (cur.agg.J < best.agg.J) best = cur; }
    log(HOUR ? `第 ${n} 輪：${SL.describe(win.m)}｜確認到訪 ${win.agg.total.toFixed(0)} 次（目前 ${(-before).toFixed(0)}）→ ${accepted ? '接受' : '拒絕'}` : `第 ${n} 輪：${SL.describe(win.m)}｜確認成績 ${win.agg.J.toFixed(3)}（目前 ${before.toFixed(3)}）→ ${accepted ? '接受' : '拒絕'}${delta > 0 && accepted ? '（退火接受較差）' : ''}`);
    state.current = snapshot(cur.L, cur.agg, changed); state.best = snapshot(best.L, best.agg, changed);
    state.history.push({ round: n, J: cur.agg.J, cv: cur.agg.cv, zeros: cur.agg.zeros, Jcand: win.agg.J, accepted, move: SL.describe(win.m) });
    state.status = 'idle'; writeState();
    csv('history.csv', '', [[n, 'round', before.toFixed(4), win.agg.J.toFixed(4), cur.agg.J.toFixed(4), cur.agg.cv.toFixed(4), cur.agg.zeros, accepted ? 1 : 0, SL.describe(win.m), Math.round((Date.now() - state.t0) / 1000)]], true);
    csv('candidates.csv', '', res.map((r, i) => [n, i + 1, SL.describe(r.m), r.sc.J.toFixed(4), r.sc.cv.toFixed(4), r.sc.zeros, r.agg ? r.agg.J.toFixed(4) : '']), true);
    csv('stalls_by_round.csv', '', stallRows(cur.L, cur.agg, changed).map(r => [n, r.code, r.cat, r.tables, r.seats, r.visits, r.openH, r.perHour]), true);
  }

  await finish(START, ORIG, best.L);
  process.exit(0);
})().catch(e => { console.error(e); state.status = 'error'; log('錯誤：' + e.message); writeState(); process.exit(1); });
