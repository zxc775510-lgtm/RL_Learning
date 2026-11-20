// 無頭版診斷：不開瀏覽器、不畫畫面，在 Node 裡跑模擬器的邏輯，跑完 7 天直接寫出寬表 CSV。
// 用法：node 99_diag_dashboard/headless.js [輸出檔=99_data/diagnostic/diagnostic_7days.csv] [--seed=數字]
// 做法：把 99_website 的設定／agent／診斷／地圖資料與 index.html 的主腳本放進 vm，畫圖與介面相關的全域一律用空殼（stub），只呼叫跟畫圖無關的 setup 那幾步。
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.resolve(__dirname, '..', '99_website'), args = process.argv.slice(2);
const outArg = args.find(a => !a.startsWith('--')), seedArg = args.find(a => a.startsWith('--seed=')), untilArg = args.find(a => a.startsWith('--until=')), offArg = args.find(a => a.startsWith('--off=')), fromArg = args.find(a => a.startsWith('--from=')), setArgs = args.filter(a => a.startsWith('--set=')), metrics = args.includes('--metrics'), dayArg = args.find(a => a.startsWith('--day=')); // --day=N：只跑第 N 天（0 起算，從 0 時到 24 時；種子加上 N），給 run_parallel.js 分天平行跑用
// // --set=參數=值（可多個，覆寫 CONFIG.params）、--from=模擬秒（從這個時刻開始，例：57600＝16:00）、--metrics（不寫 CSV，印出人流指標，試參數用）
// // --off=規則id,規則id：把這些規則關掉再跑（例：--off=Human.chairSeating＝不坐下）
// // --until=模擬秒：只跑到這個時刻（試跑用）
const OUT = path.resolve(outArg || path.join(__dirname, '..', '99_data', 'diagnostic', 'diagnostic_7days.csv'));

// 什麼都吞的空殼：任何屬性、呼叫、當建構子都回傳自己（介面、畫布相關）
const stub = () => { const f = function () { return p; }; const p = new Proxy(f, { get: (_, k) => k === Symbol.toPrimitive ? () => 0 : k === 'length' ? 0 : p, set: () => true, apply: () => p, construct: () => p, has: () => true }); return p; };
const sandbox = { console, performance, setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {}, Math, Date };
sandbox.window = sandbox; sandbox.globalThis = sandbox;
sandbox.document = stub(); sandbox.localStorage = { getItem: () => null, setItem: () => {} }; sandbox.navigator = { userAgent: 'node' };
sandbox.location = { search: '', hash: '', href: '' }; sandbox.requestAnimationFrame = () => 0; sandbox.addEventListener = () => {};
// p5 的全域函式／常數：只要不真的畫圖就用空殼
for (const n of ['createCanvas', 'createGraphics', 'color', 'textFont', 'drawingContext', 'noLoop', 'loop', 'resizeCanvas', 'image', 'fill', 'stroke', 'rect', 'frameRate', 'colorMode', 'noStroke', 'strokeWeight', 'background', 'text', 'push', 'pop', 'translate', 'createImage', 'loadImage', 'lerpColor', 'select', 'createDiv']) sandbox[n] = stub();
sandbox.windowWidth = 1600; sandbox.windowHeight = 900; sandbox.width = 1600; sandbox.height = 900; sandbox.mouseX = 0; sandbox.mouseY = 0;
const ctx = vm.createContext(sandbox);
const run = (code, file) => vm.runInContext(code, ctx, { filename: file });

if (seedArg) { // 固定亂數種子（mulberry32），同一個種子同一份結果
  let a = (+seedArg.split('=')[1] + (dayArg ? +dayArg.slice(6) * 1000 : 0)) | 0; ctx.Math.random = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const files = ['config_data.js', 'rule_switch.js', 'agents/customer.js', 'agents/vendorNew.js', 'agents/vendorOld.js', 'agents/vendorIdle.js', 'agents/cell.js', 'diagnostic.js', 'grid_data.js', 'era_data.js', 'stall_models/js/closed.js', 'stall_models/js/semi.js', 'stall_models/js/cart.js', 'stall_models/js/overrides.js', 'stall_models/props/chair.js'];
for (const f of files) run(fs.readFileSync(path.join(SITE, f), 'utf8'), f);
// index.html 的主腳本＝沒有 src 的 <script> 裡最長的一段
const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const main = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];
run(main, 'index.html');
if (args.includes('--fast') || args.includes('--fast2')) run(fs.readFileSync(path.join(__dirname, 'fast_patch.js'), 'utf8'), 'fast');
if (args.includes('--fast2')) run(fs.readFileSync(path.join(__dirname, 'fast_patch2.js'), 'utf8'), 'fast2'); // --fast2：再快一點（見 fast_patch2.js；輸出與 --fast 必須逐項相同）
// 原 --fast 那行： // --fast：結果相同、算得快的版本（見 fast_patch.js）
// --layout=檔案：用配置檔取代市場裡的攤位格（格式見 20261116/stall_rl/layout.js）：原本的攤位格全回走道，再放配置檔的格子；走道椅子清掉（座位只剩配置裡的用餐區格），除非檔裡 keepChairs:true
const layoutArg = args.find(a => a.startsWith('--layout='));
if (layoutArg) run(`(function (L) {
  for (const key in ERA_DATA.cells) { const d = ERA_DATA.cells[key], rc = key.split(',').map(Number);
    if (d.kind_2026 === 'stall') { GRID_DATA.cells[rc[0]][rc[1]] = 'aisle'; ERA_DATA.cells[key] = { kind_2026: 'aisle', kind_2020s: d.kind_2020s }; }
    else if (d.kind_2026 === 'aisle' && !L.keepChairs) d.occupiedBy = []; }
  GRID_DATA.stalls = {}; let id = 0;
  for (const s of L.cells) { id++; /* 板子一律照物理放進去：擋不擋路、走不走得上去、頭上過不過得去由 cell.js 的 Board Rules 算，不再略過任何一種 */ GRID_DATA.cells[s.r][s.c] = id; GRID_DATA.stalls[id] = { row: s.r, col: s.c, code: s.code, side: 'S' };
    ERA_DATA.cells[s.r + ',' + s.c] = { kind_2026: 'stall', zone_2026: s.zone, category_2026: s.cat, structure_2026: '半開放', entity_id: 'e_' + s.code, display_code: s.code, kind_2020s: 'aisle' };
    if (s.board) Object.assign(ERA_DATA.cells[s.r + ',' + s.c], { board_tilt: s.tilt, board_z: s.z, board_yaw: s.yaw }); } // 板子三量（Board Attribute）；沒有 yaw 時模擬器當 90°
})(${fs.readFileSync(layoutArg.slice(9), 'utf8')})`, 'layout');
run('parseGridData(); computeStallGroups(); computeMarketBBox(); resetSimulation(); Diag.on = true; Diag.paused = false; playing = false;', 'setup');
if (offArg) for (const id of offArg.slice(6).split(',')) run(`RuleSwitch.set(${JSON.stringify(id)}, false)`, 'off');
const apArg = args.find(a => a.startsWith('--ap=')); if (apArg) run(`Object.assign(CONFIG.params.ARRAY_PROB, ${JSON.stringify(Object.fromEntries(apArg.slice(5).split(',').map(x => x.split(':').map((y, i) => i ? +y : y))))})`, 'ap'); // --ap=肉類:0.3（指定類型進 array 的機率）
const wArg = args.find(a => a.startsWith('--w=')); if (wArg) run(`Object.assign(CONFIG.params.SHOP_TYPE_WEIGHT, ${JSON.stringify(Object.fromEntries(wArg.slice(4).split(',').map(x => x.split(':').map((y, i) => i ? +y : y))))})`, 'w'); // --w=肉類:2,熟食類:3（覆寫店種權重）
for (const a of setArgs) { const [k, v] = a.slice(6).split('='); run(`CONFIG.params[${JSON.stringify(k)}] = ${+v}`, 'set'); }
if (fromArg) run(`simSec = ${+fromArg.split('=')[1]}; tick = 0; dayCounter = Math.floor(simSec / 86400); syncCellClock();`, 'from');
if (dayArg) run(`simSec = ${+dayArg.slice(6) * 86400}; tick = 0; dayCounter = ${+dayArg.slice(6)}; syncCellClock();`, 'day');
if (metrics) run(`(function(){ window.__m = { n: 0, dur: 0, crowdSamples: 0, crowdPeople: 0, people: 0 }; const arr = Cell.arrive.bind(Cell), vac = Cell.vacate.bind(Cell);
  Cell.arrive = p => { if (p._t0 === undefined) p._t0 = simSec; arr(p); };
  Cell.vacate = function (p, r, c) { if (r === undefined && p._t0 !== undefined) { __m.n++; __m.dur += simSec - p._t0; } vac(p, r, c); }; })()`, 'metrics');

if (args.includes('--arrivals')) { // 印出週二每小時的預期來客（人／小時），檢查來客權重與營業時段
  console.log(run(`(function(){ const o = []; dayCounter = 3; for (let h = 0; h < 24; h++) { simSec = 3 * 86400 + h * 3600; tick = 0; syncCellClock(); const a = hourlyArrivals(); o.push(h + '時 ' + Math.round(a) + '（營業 ' + World.shops.filter(s => Cell.isOpenNow(s)).length + ' 家）'); } return o.join(' ｜ '); })()`, 'arr'));
  process.exit(0);
}
// --shops：不寫 CSV，跑完印出每家店的到訪次數與當天營業小時數（給「到訪平均」實驗用；到訪＝_visitTick／VISIT_NORM，只在不跑到 Vendor 回合重置的短時間內有效）
const winArg = args.find(a => a.startsWith('--win=')), [W0, W1] = winArg ? winArg.slice(6).split('-').map(Number) : [0, 24]; // --win=5-22：營業小時只算這段內（跟 --shops 用）
if (args.includes('--shops')) run(`window.__m = { people: 0, crowdPeople: 0 }; window.__mWin = [${W0 * 3600}, ${W1 * 3600}]`, 'crowdInit'); // 擁擠指標：窗內每 10 秒數一次場上人數與「站在 ≥2 人格子」的人數
// --dwell（要跟 --shops 一起用）：記「停留」——只追蹤窗口開始後 30 分鐘內進場的顧客（cohort），每人最多追 60 分鐘（還沒走就算 60）；記到過哪些攤位，輸出 DWELL（平均與各攤「來過它的人」的平均停留分鐘）。用 vm 內包 Customer.move，不改 99_website。
if (args.includes('--dwell')) run(`(function () {
  const W0 = ${W0 * 3600}, COH = 1800, CAP = 3600, rec = new Map(), pending = new Set(); window.__dw = { rec };
  const mv = Customer.move.bind(Customer);
  Customer.move = function (th) {
    const sod = Cell.simSec % 86400;
    for (const p of this.pedestrians) if (!p.__s) { p.__s = true; if (sod >= W0 && sod < W0 + COH) { const r = { t0: Cell.simSec, dwell: null, vis: null, p, cs: new Set(), crowd: 0, steps: 0, pa: [] }; rec.set(p, r); pending.add(r); } }
    mv(th);
    if (pending.size) { const alive = new Set(this.pedestrians); for (const r of pending) { if (alive.has(r.p)) { r.cs.add(r.p.row + ',' + r.p.col); { const k = r.p.row * 1000 + r.p.col; if (r.pa[r.pa.length - 1] !== k) r.pa.push(k); } r.steps++; if (Cell.occAt(r.p.row, r.p.col) >= 2) r.crowd++; } const age = Cell.simSec - r.t0; if (age >= CAP) { r.dwell = CAP; r.vis = [...r.p.visited]; pending.delete(r); } else if (!alive.has(r.p)) { r.dwell = age; r.vis = [...r.p.visited]; pending.delete(r); } } }
  };
})()`, 'dwell');
if (args.includes('--shops')) run(`window.__openH = Object.fromEntries(World.shops.map(s => [s.code, Array.from({ length: 24 }, (_, h) => h).filter(h => h >= ${W0} && h < ${W1} && Cell.isOpenAt(s, h + 0.5)).length]))`, 'openH');
const t0 = Date.now();
const until = dayArg ? (+dayArg.slice(6) + 1) * 86400 : untilArg ? +untilArg.split('=')[1] : Infinity;
// --macro：用模擬器內建的宏觀模式（每小時取樣放大）。2026-11-16 實測：跑到 08:00 會卡住（取樣的 8 位顧客裡有 1 位鎖定魚類店 L 卻走不到、也離不了場，walkProfile 永遠等不到全部離場），原配置與最小單位配置都一樣，所以目前不能用
if (args.includes('--macro')) run(`(function(){ while (!runDone() && simSec < ${until}) macroHour(); })()`, 'macro');
else run(`(function(){ let last = 0; let maxOcc = 0; while (!runDone() && simSec < ${until}) { microStep(); ${args.includes('--shops') ? `if (simSec % 600 === 0) console.log('PROG ' + ((simSec - ${fromArg ? +fromArg.split('=')[1] : 0}) / (${until} - ${fromArg ? +fromArg.split('=')[1] : 0})).toFixed(3));` : ''} if (window.__m && simSec % 10 === 0 && (!window.__mWin || (simSec % 86400 >= window.__mWin[0] && simSec % 86400 < window.__mWin[1]))) { for (const p of Customer.pedestrians) { __m.people++; if (Cell.occAt(p.row, p.col) >= 2) __m.crowdPeople++; } } if (simSec % 10 === 0) { const m = Math.max(0, ...Cell.occ.values()); if (m > maxOcc) maxOcc = m; } if (simSec - last >= 21600) { last = simSec; console.log('每格最多人數 ' + maxOcc + '｜' + 'x'.repeat(0) + '模擬時間 ' + (simSec / 86400).toFixed(2) + ' 天，場上 ' + (Customer.pedestrians.length) + ' 人'); } } })()`, 'loop');
console.log('跑完，用時', Math.round((Date.now() - t0) / 1000), '秒');
if (args.includes('--shops')) { if (args.includes('--dwell')) console.log('DWELL ' + run(`JSON.stringify((function () { const per = {}, A = [], K = [], P = [], med = a => { if (!a.length) return 0; const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }; let n = 0, s = 0, cens = 0, st = 0, cw = 0; for (const r of window.__dw.rec.values()) { if (r.dwell == null) { r.dwell = Cell.simSec - r.t0; r.vis = [...r.p.visited]; cens++; } n++; s += r.dwell; A.push(r.dwell / 60); K.push(r.cs.size); P.push(r.pa); st += r.steps; cw += r.crowd; for (const c of r.vis) { (per[c] || (per[c] = { n: 0, s: 0, d: [], k: [] })); per[c].n++; per[c].s += r.dwell; per[c].d.push(r.dwell / 60); per[c].k.push(r.cs.size); } } const out = {}; for (const c in per) out[c] = { n: per[c].n, mean: per[c].s / per[c].n / 60, med: med(per[c].d), cells: med(per[c].k) }; return { n, mean: n ? s / n / 60 : 0, med: med(A), cells: med(K), minPerCell: med(A.map((d, i) => K[i] ? d / K[i] : 0)), crowdFrac: st ? cw / st : 0, cens, perStall: out, paths: P }; })())`, 'dwellOut'));
  console.log('CROWD ' + run('JSON.stringify(window.__m)', 'crowd')); console.log('SHOPS ' + run(`JSON.stringify(World.shops.map(s => ({ code: s.code, cat: Cell.categoryOf(s), openH: __openH[s.code], visits: Math.round((s._visitTick || 0) / VISIT_NORM) })))`, 'shops')); process.exit(0); }
if (metrics) {
  const m = JSON.parse(run('JSON.stringify(__m)', 'm')), sl = run(`(function(){ let t = 0; for (const [k, v] of Diag.data) { const d = Diag.decode(k); if (d.kind === 1) t += v[1]; } return t; })()`, 'sl');
  console.log(JSON.stringify({ sets: setArgs.map(a => a.slice(6)), 離場人數: m.n, 平均停留秒: Math.round(m.dur / Math.max(1, m.n)), 在擁擠格的人時比例: +(m.crowdPeople / Math.max(1, m.people)).toFixed(3), 擁擠慢下來秒: Math.round(sl), 到訪店鋪數: +run('World.shops.reduce((t, s) => t + (s._visitTick || 0), 0) / VISIT_NORM', 'v').toFixed(0), 場上人數: +run('Customer.pedestrians.length', 'n') }));
  process.exit(0);
}
const csv = run('Diag.csv()', 'csv');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
let dest = OUT;
try { fs.writeFileSync(OUT, '﻿' + csv); } catch (e) { dest = OUT.replace(/(\.csv)?$/, '_' + Date.now() + '.csv'); fs.writeFileSync(dest, '﻿' + csv); console.log(OUT, '被鎖住（' + e.code + '），改存', dest); }
console.log('已寫出', dest, '，', csv.split('\n').length - 1, '列');
