// 診斷紀錄（Diagnostic）— 規格：simulator_setting.md「診斷紀錄」＋設計論述《格子變動與斥力吸力》。
// 只記錄，不改任何 agent 行為：行人被擋住／被拉過去的那一刻，在「產生力的那一格」記一筆（力的種類、天、小時、視角、中心、量）。
// 階段 1a：接近椅子要放慢、擁擠拖慢、有空位坐下、被看見（顧客在走道格的人·秒）。階段 1b：繞開椅子（被避開的椅子格＋反應點）、繞出去的路、座位坐滿而改去別家／離場。只在微觀模式記錄（宏觀取樣期間 Diag.paused）。
// 中心：店鋪（代號）、入口（離場的人）、無目標（亂走的人）。視角：T＝Customer（R＝舊版 CSV 的 Resident，只在載入舊檔時出現）。
const Diag = {
  // 力（FORCES）：一種行為一種力。cat 類別、name 行為名稱、unit 單位、byCount＝畫面與 CSV 的「值」用次數（否則用量）；顏色依行為＝FORCES 的 index 對 BEH。
  FORCES: [
    { cat: '斥力', name: '慢下來', unit: '秒' },
    { cat: '吸力', name: '坐下', unit: '次', byCount: true },
    { cat: '斥力', name: '繞開', unit: '次', byCount: true },
    { cat: '吸力', name: '朝店走', unit: '吸力值' },
    { cat: '吸力', name: '探索', unit: '次', byCount: true },
    { cat: '斥力', name: '不走回頭', unit: '次', byCount: true },
    { cat: '斥力', name: '換目標', unit: '次', byCount: true },
    { cat: '斥力', name: '卡住', unit: '次', byCount: true },
  ],
  // 記錄種類（index 即 key 裡的 kind）：f＝屬於哪一種力（FORCES 的 index），why＝原因（同一種力的不同成因，記錄的欄位）；f＝-1 是事件（不是人做出的行為，只留紀錄、不畫在圖層）。
  KINDS: [
    { f: 0, why: '椅子' }, { f: 0, why: '擁擠' }, { f: 1, why: '有空位' },
    { f: 2, why: '椅子' }, { f: 2, why: '路被擋' },
    { f: 3, why: '偵測到的店' }, { f: 3, why: '目標店' },
    { f: 4, why: '近處迷霧' }, { f: 4, why: '遠處迷霧' },
    { f: 5, why: '走過的格' },
    { f: 6, why: '座位坐滿' }, { f: 6, why: '撲空' }, { f: -1, cat: '事件', name: '離場', why: '座位坐滿', unit: '次' },
    { f: -1, cat: '事件', name: '被看見', why: '曝光', unit: '人·秒' },
    { f: -1, cat: '事件', name: '被拒絕', why: '熟食店滿座', unit: '次' },
    { f: -1, cat: '事件', name: '經過', why: '軌跡', unit: '次' }, // 人的軌跡：行人每走進一個新格記 1（站著不動、坐著不重複記），記在走進的格；中心＝無目標
    { f: 7, why: '前面滿格' }, // 卡住：想走的下一格滿了（CROWD_CAP 人）、這一步原地等；記在人站的格，中心＝他要去的店
  ],
  kd(k) { const K = this.KINDS[k], F = K.f >= 0 ? this.FORCES[K.f] : K; return { cat: F.cat, name: F.name, unit: K.unit || F.unit, why: K.why }; },
  val(k, v) { const f = this.KINDS[k].f; return f >= 0 && this.FORCES[f].byCount ? v[0] : v[1]; },
  // 顏色全部用對比色（色相盡量拉開，避開灰階底圖）：依類別＝斥力紅／吸力天藍；依行為＝每種行為一色。同一格有多種時按強度混色。
  CAT: [{ name: '斥力', rgb: [255, 40, 40] }, { name: '吸力', rgb: [0, 170, 255] }],
  BEH: [
    { name: '斥力·慢下來', rgb: [255, 40, 40] }, { name: '吸力·坐下', rgb: [0, 205, 255] }, { name: '斥力·繞開', rgb: [235, 235, 0] },
    { name: '吸力·朝店走', rgb: [0, 225, 110] }, { name: '吸力·探索', rgb: [60, 100, 255] },
    { name: '斥力·不走回頭', rgb: [200, 120, 70] }, { name: '斥力·換目標', rgb: [255, 130, 0] }, { name: '斥力·卡住', rgb: [170, 70, 255] },
  ],
  // 同一格同時有斥力與吸力時的分段色階（不降透明度）：吸力占比由低到高，紅→藍五段。
  MIX: [[255, 40, 40], [210, 50, 120], [150, 60, 190], [90, 100, 235], [0, 150, 255]],
  on: true, paused: false,
  data: new Map(),   // key（數字編碼）→ [次數, 量]
  centers: [], cidx: {}, NC: 0, NCELL: 0, ENTRY: 0, NONE: 0, D: 7,
  ver: 0, viewVer: -1, view: null, lastBuild: 0,
  f: { scope: 'all', cls: 'cat', kind: 'all', day: 'all', band: 'all' }, // 畫面篩選（UI 綁定）：scope all／rep／att／off；cls cat／beh
  source: '尚無資料', running: false,
  hasData() { return this.data.size > 0 && this.f.scope !== 'off'; },
  isRep(f) { return this.FORCES[f].cat === '斥力'; },
  shown(k) { const f = this.f, F = this.KINDS[k].f; return F >= 0 && f.scope !== 'off' && (f.scope === 'all' || (f.scope === 'rep') === this.isRep(F)) && (f.kind === 'all' || +f.kind === F); },
  group(F) { return this.f.cls === 'cat' ? (this.isRep(F) ? 0 : 1) : F; },
  groupRgb(g) { return (this.f.cls === 'cat' ? this.CAT : this.BEH)[g].rgb; },

  // 開局／重設：中心清單（店鋪＋入口＋無目標）、清空紀錄。
  reset() {
    this.centers = World.shops.map(s => ({ id: s.code, name: s.code, r: s.cells.reduce((a, x) => a + x.row, 0) / s.cells.length, c: s.cells.reduce((a, x) => a + x.col, 0) / s.cells.length }));
    this.centers.push({ id: '入口', name: '入口' }, { id: '無目標', name: '無目標' });
    this.cidx = {}; this.centers.forEach((x, i) => { this.cidx[x.id] = i; });
    this.NC = this.centers.length; this.ENTRY = this.NC - 2; this.NONE = this.NC - 1; this.NCELL = World.ROWS * World.COLS; this.D = SIM_DAYS;
    this.data = new Map(); this.ver++; this.viewVer = -1; this.source = '目前的模擬'; this.exitAnim();
  },

  add(kind, cls, r, c, center, amount, share = 1) {
    if (!this.on || this.paused) return;
    const day = Math.min(this.D - 1, Math.floor(simSec / SEC_PER_DAY)), hour = Math.floor(Cell.daySec / 3600);
    const key = ((((kind * this.D + day) * 24 + hour) * 2 + (cls === 'R' ? 1 : 0)) * this.NC + center) * this.NCELL + r * World.COLS + c;
    const v = this.data.get(key);
    if (v) { v[0] += share; v[1] += amount; } else this.data.set(key, [share, amount]);
    this.ver++;
  },

  // 這個人現在要去哪：現在選中的店（離場＝入口，沒目標＝無目標）。
  destOf(a) {
    if ('targetShop' in a) return a.done || !a.targetShop ? this.ENTRY : this.cidx[a.targetShop.code];
    return a.leaving ? this.ENTRY : a.destShop ? this.cidx[a.destShop.code] : this.NONE;
  },

  // 擁擠類的力：責任按「同一格其他人」的目的地人數比例分給各中心。
  crowd(kind, cls, p, r, c, amount) {
    const m = new Map(); let n = 0;
    for (const a of Cell.at.get(r * World.COLS + c) || []) { if (a === p) continue; const d = this.destOf(a); m.set(d, (m.get(d) || 0) + 1); n++; }
    if (!n) return this.add(kind, cls, r, c, this.NONE, amount);
    for (const [d, k] of m) this.add(kind, cls, r, c, d, amount * k / n, k / n);
  },

  // 走進格子多停 pause 秒（取 擁擠 cs 與 近椅子 ap 較大者）：兩者同時成立各記一半。近椅子的責任平分給周圍擺椅的別家店。
  slow(p, cls, cs, ap, own) {
    const sec = Math.max(cs, ap);
    if (!(sec > 0)) return;
    const chairSec = ap > 0 ? (cs > 0 ? sec / 2 : sec) : 0, crowdSec = cs > 0 ? (ap > 0 ? sec / 2 : sec) : 0, r = p.row, c = p.col;
    if (chairSec) {
      const codes = Cell.chairNearbyShops(r, c).filter(code => code !== own && Cell.isOpenNow(World.shopByCode[code]));
      codes.forEach(code => this.add(0, cls, r, c, this.cidx[code], chairSec / codes.length, 1 / codes.length));
    }
    if (crowdSec) this.crowd(1, cls, p, r, c, crowdSec);
  },
  // 繞開（椅子）：這一步選的路不在「沒有椅子時的最短路」上，而那些最短路的下一格有別家椅子（avoided＝[[r,c]…]）→ 一次繞開記一筆，記在人現在站的格（責任平分給擺椅的別家店）。
  detour(p, cls, own, avoided) {
    const all = [...new Set(avoided.flatMap(([r, c]) => (World.cellSpace[r][c] ? World.cellSpace[r][c].occupiedBy : []).filter(x => x !== own && Cell.isOpenNow(World.shopByCode[x]))))];
    all.forEach(x => this.add(3, cls, p.row, p.col, this.cidx[x], 1 / all.length, 1 / all.length));
  },
  // 換目標／離場（原因＝座位坐滿）：原本要去的熟食店坐滿了 → 改去別家（left＝false）或離場（left＝true）；記在人當下站的格，中心＝坐滿的那家店。
  full(p, shop, left) { this.add(left ? 12 : 10, this.clsOf(p), p.row, p.col, this.cidx[shop.code], 1); },
  // 經過（事件）：跟模擬器動線熱度（trailHeat）同一個時點、同一個格：行人每走完一步，在自己站的格記 1（人次；軌跡圖的來源，所以加總會等於動線熱度）。
  trail(p) { this.add(15, this.clsOf(p), p.row, p.col, this.NONE, 1); },
  // 事件（不是力）：被拒絕（熟食店滿座）。記在人當下站的格。
  clsOf(p) { return 'T'; },
  reject(p, shop) { this.add(14, this.clsOf(p), p.row, p.col, this.cidx[shop.code], 1); },
  wait(p) { this.add(16, this.clsOf(p), p.row, p.col, this.destOf(p), 1); }, // 卡住：moveStep 四個鄰格都進不去（滿格）
  // Move Step Rule：選中的那一步，各項分數各記一筆，記在人當下站的格（移動前）：沒看過的格數（探索，近）、店面得分（朝店走）、沒有目標店時走近最近沒看過的格（探索，遠）、走過的路（不走回頭）。
  pull(p, m) { const t = m.t, r = p.row, c = p.col; if (t.fog > 0) this.add(7, 'T', r, c, this.NONE, t.fog); if (t.shop > 0 && m.shop && t.shop + t.path + t.cost > 0) this.add(5, 'T', r, c, this.cidx[m.shop.code], t.shop + t.path + t.cost); if (m.g.wander > 0) this.add(8, 'T', r, c, this.NONE, 1); if (m.g.walked > 0) this.add(9, 'T', r, c, this.NONE, 1); },
  sit(p, cls, shop) { this.add(2, cls, p.row, p.col, this.cidx[shop.code], CONFIG.params.SIT_SEC); },

  // 被看見（有人看到才算）：顧客每站一秒，對「Shop Detect Rule 偵測得到、現在營業」的店各記 1 人·秒（記在站的走道格，中心＝那家店）。
  // 偵測＝身邊 NEAR_SEE_CELLS 方形＋面向再往前 FRONT_EXT_CELLS 列、店面前方的走道格視線通（Customer.shopsSeen，擺椅時段含椅子延伸的店面）；坐著的人不算路過。
  seeCache: new Map(),
  seen(p) {
    if (!this.on || this.paused || p.sitShop || World.cellType[p.row][p.col] !== 'aisle') return;
    const f = p.faceDr ? (p.faceDr > 0 ? 0 : 1) : (p.faceDc > 0 ? 2 : 3), k = ((p.row * World.COLS + p.col) * 4 + f) * 2 + (Cell.chairsOut() ? 1 : 0);
    let l = this.seeCache.get(k);
    if (!l) { l = [...Customer.shopsSeen(p)].map(s => s.code); this.seeCache.set(k, l); }
    for (const code of l) if (Cell.isOpenNow(World.shopByCode[code])) this.add(13, 'T', p.row, p.col, this.cidx[code], 1);
  },

  // key 解碼：回傳 {kind, day, hour, cls, center, cell}
  decode(key) {
    const cell = key % this.NCELL; let k = (key - cell) / this.NCELL;
    const center = k % this.NC; k = (k - center) / this.NC;
    const cls = k % 2; k = (k - cls) / 2;
    const hour = k % 24; k = (k - hour) / 24;
    const day = k % this.D, kind = (k - day) / this.D;
    return { kind, day, hour, cls: cls ? 'R' : 'T', center, cell };
  },
  inBand(hour) { const P = CONFIG.params, ch = hour >= P.CHAIR_START_HOUR && hour < P.CHAIR_END_HOUR; return this.f.band === 'all' || (this.f.band === 'chair' ? ch : !ch); },

  // 依篩選把紀錄彙總：每種力一張「格子→數值」，每種力各自以自己的最大值標準化（單位不同不相加）；
  // 同一組（類別或行為）內多種力以 1−Π(1−強度) 合併；一格有多組時按強度混色（顏色加權平均、不透明度合併）。
  // 同時整理每個中心被哪些力當過中心（中心點的顏色用）。
  buildView() {
    const f = this.f, N = this.FORCES.length, fr = this.anim; // fr：播放中的那一小時（第幾天、幾點），null＝累計
    if (fr) this.calcHourMax();
    const km = this.FORCES.map(() => new Map()), ck = new Map(); // ck：中心 → 當過中心的力（Set）
    const mark = (center, k) => { if (!ck.has(center)) ck.set(center, new Set()); ck.get(center).add(k); };
    for (const [key, v] of this.data) {
      const d = this.decode(key);
      if (!this.shown(d.kind) || (fr ? d.day !== fr.day || d.hour !== fr.hour : (f.day !== 'all' && d.day !== +f.day) || !this.inBand(d.hour))) continue;
      const F = this.KINDS[d.kind].f; km[F].set(d.cell, (km[F].get(d.cell) || 0) + this.val(d.kind, v));
      mark(d.center, F);
    }
    const kmax = fr ? this.hm : km.map(m => { let x = 0; for (const v of m.values()) if (v > x) x = v; return x; }); // 播放時用「任何一小時」的最大值，各格才能前後比較
    const ramp = (x, mx) => mx > 0 ? 0.2 + 0.75 * Math.log1p(x) / Math.log1p(mx) : 0;
    const cellG = new Map(); // cell → Map(組 → 強度)
    for (let k = 0; k < N; k++) {
      const g = this.group(k);
      for (const [cell, x] of km[k]) {
        const m = cellG.get(cell) || cellG.set(cell, new Map()).get(cell), a = ramp(x, kmax[k]);
        m.set(g, 1 - (1 - (m.get(g) || 0)) * (1 - a));
      }
    }
    const colors = new Map(), pillars = new Map(), tone = (c, v) => c.map(x => x + (255 - x) * 0.6 * (1 - v)), hex = c => '#' + c.map(x => Math.round(x).toString(16).padStart(2, '0')).join(''), isRep = g => this.f.cls === 'cat' ? g === 0 : g < 4;
    for (const [cell, m] of cellG) {
      let sw = 0, r = 0, g2 = 0, b = 0, keep = 1, kr = 1, ka = 1;
      for (const [g, w] of m) { const c = this.groupRgb(g); sw += w; r += c[0] * w; g2 += c[1] * w; b += c[2] * w; keep *= 1 - w; if (isRep(g)) kr *= 1 - w; else ka *= 1 - w; }
      const R = 1 - kr, A = 1 - ka, net = A - R, v = Math.abs(net); // 斥力與吸力互減：淨值＝吸力−斥力
      if (v < 0.005) continue; // 正好抵銷的格子不畫
      if (kr < 1 && ka < 1) { // 同格兩邊都有：不透明，依淨值（−1…+1）分五段由紅到藍，段內依 |淨值| 由淡到飽和
        const tc = tone(this.MIX[Math.min(this.MIX.length - 1, Math.floor((net + 1) / 2 * this.MIX.length))], v);
        colors.set(cell, `rgb(${tc.map(Math.round)})`); pillars.set(cell, { hex: hex(tc), v, neg: net < 0 });
      } else { colors.set(cell, `rgba(${Math.round(r / sw)},${Math.round(g2 / sw)},${Math.round(b / sw)},${(1 - keep).toFixed(3)})`); pillars.set(cell, { hex: hex(tone([r / sw, g2 / sw, b / sw], 1 - keep)), v, neg: net < 0 }); }
    }
    const centerColor = new Map();
    for (const [center, ks] of ck) {
      const gs = new Set([...ks].map(k => this.group(k))); let r = 0, g2 = 0, b = 0;
      for (const g of gs) { const c = this.groupRgb(g); r += c[0]; g2 += c[1]; b += c[2]; }
      centerColor.set(center, `rgb(${Math.round(r / gs.size)},${Math.round(g2 / gs.size)},${Math.round(b / gs.size)})`);
    }
    this.view = { colors, centerColor, kmax, pillars: [...pillars].sort((a, b) => a[0] - b[0]) }; // 由遠到近（row、col 由小到大）排好，ISO 柱狀圖照順序畫
    this.viewVer = this.ver; this.lastBuild = performance.now();
  },

  // 播放：把紀錄依「第幾天、幾點」一小時一小時放出來（168 格），畫面一與 ISO 柱子都跟著動。
  // 每種力的標準化最大值＝任何一小時、任一格的值（calcHourMax），前後才能比較高低。
  anim: null, animI: 0, animTimer: null, hm: null, hmVer: -1,
  WD: ['日', '一', '二', '三', '四', '五', '六'],
  calcHourMax() {
    if (this.hm && this.hmVer === this.ver) return;
    const agg = new Map(), hm = this.FORCES.map(() => 0);
    for (const [key, v] of this.data) {
      const d = this.decode(key), F = this.KINDS[d.kind].f; if (F < 0) continue; const k = (((F * this.D + d.day) * 24 + d.hour) * this.NCELL) + d.cell, x = (agg.get(k) || 0) + this.val(d.kind, v);
      agg.set(k, x); if (x > hm[F]) hm[F] = x;
    }
    this.hm = hm; this.hmVer = this.ver;
  },
  frameLabel() {
    const a = this.anim; if (!a) return '';
    const dt = new Date(Date.UTC(SIM_START_YEAR, SIM_START_MONTH - 1, 1 + a.day));
    return `第 ${a.day + 1} 天（${dt.toISOString().slice(0, 10)} 週${this.WD[dt.getUTCDay()]}）${String(a.hour).padStart(2, '0')}:00`;
  },
  setFrame(i) {
    this.animI = i; this.anim = { day: Math.floor(i / 24), hour: i % 24 }; this.viewVer = -1;
    const sl = document.getElementById('diagSlider'), fl = document.getElementById('diagFrame');
    if (sl) sl.value = i; if (fl) fl.textContent = '播放：' + this.frameLabel();
    this.legend();
  },
  stopTimer() { clearInterval(this.animTimer); this.animTimer = null; const b = document.getElementById('diagPlay'); if (b) b.textContent = '▶ 播放 ' + this.D + ' 天變化'; },
  exitAnim() { // 回到累計
    this.stopTimer(); this.anim = null; this.viewVer = -1;
    const fl = document.getElementById('diagFrame'); if (fl) fl.textContent = '播放：一格＝一小時，高度與顏色是那一小時的值（不是累計）';
  },
  togglePlay() {
    if (this.animTimer) return this.stopTimer();
    const total = this.D * 24, speed = +document.getElementById('diagSpeed').value;
    this.setFrame(this.anim && this.animI < total - 1 ? this.animI : 0); // 播到最後再按＝從頭重播
    document.getElementById('diagPlay').textContent = '■ 停止';
    this.animTimer = setInterval(() => { if (this.animI >= total - 1) this.stopTimer(); else this.setFrame(this.animI + 1); }, speed);
  },

  // 底圖灰階：診斷圖層有資料且開著時，年代對照的顏色依亮度壓成三階（黑／灰／淺灰），讓診斷圖層看得清楚。圖樣（CanvasPattern）一律給中灰。
  grayCache: new Map(),
  gray3(color) {
    if (typeof color !== 'string' || color[0] !== '#' || color.length !== 7) return '#6e6e6e';
    let g = this.grayCache.get(color);
    if (!g) {
      const n = parseInt(color.slice(1), 16), L = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
      g = L < 0.45 ? '#141414' : L < 0.62 ? '#6e6e6e' : '#c4c4c4'; this.grayCache.set(color, g);
    }
    return g;
  },

  // 滑鼠停的格子屬於哪些店鋪（攤位格；擺椅時段內加上椅子格所屬的店）
  hoverShops(r, c) {
    const out = [], st = World.stallAtRC[r + ',' + c];
    if (st) out.push(this.cidx[st.shop.code]);
    const cs = World.cellSpace[r][c];
    if (cs && cs.occupiedBy && Cell.chairsOut()) for (const code of cs.occupiedBy) { const i = this.cidx[code]; if (i !== undefined && !out.includes(i)) out.push(i); }
    return out;
  },

  ensureView() { if (!this.view || this.viewVer === -1 || (this.viewVer !== this.ver && performance.now() - this.lastBuild > 1500)) { this.buildView(); this.legend(); } },

  // ISO：每個有力的格子長成一根柱子（淨值為正＝吸力向上、為負＝斥力向下），高度＝該格的數值強度（0.2–0.95，同 2D 的深淺）× HMAX_M 公尺，顏色同 2D。ISO 畫面不畫中心點。
  HMAX_M: 6, // 最高柱的高度（公尺，示意值：市場牆高 3 m 的兩倍）
  drawIso() {
    if (this.f.scope === 'off' || !World.shops || !isoBBox) return;
    this.ensureView();
    const b = isoVisibleRowColRange();
    for (const [k, p] of this.view.pillars) {
      const r = Math.floor(k / World.COLS), c = k % World.COLS;
      if (r < b.minRow || r > b.maxRow || c < b.minCol || c > b.maxCol) continue;
      const h = p.v * this.HMAX_M;
      if (p.neg) isoBox(r, c, r + 1, c + 1, -h, 0, p.hex); else isoBox(r, c, r + 1, c + 1, 0, h, p.hex); // 斥力是負數往下長，吸力是正數往上長
    }
  },

  // 畫面一最上層：每格一個混色的方塊（斥力、吸力都是整格）；中心點只有在滑鼠停在該店鋪上、且它當過中心時才出現，顏色同它的力。
  drawOverlay() {
    const f = this.f;
    if (f.scope === 'off' || !World.shops) return;
    this.ensureView();
    const v = this.view, cs = camera.cellPx, ctx = drawingContext, W = World.COLS;
    const vis = (x, y) => x > OFFSET_X - cs && x < OFFSET_X + VIEW_W && y > OFFSET_Y - cs && y < OFFSET_Y + VIEW_H;
    ctx.save();
    for (const [k, css] of v.colors) {
      const sx = worldToScreenX(k % W), sy = worldToScreenY(Math.floor(k / W), OFFSET_Y);
      if (!vis(sx, sy)) continue;
      ctx.fillStyle = css; ctx.fillRect(sx, sy, cs, cs);
    }
    if (overCameraViewport(mouseX, mouseY) && !camera.dragging) {
      const c = Math.floor(camera.col0 + (mouseX - OFFSET_X) / cs), r = Math.floor(camera.row0 + (mouseY - OFFSET_Y) / cs);
      if (r >= 0 && c >= 0 && r < World.ROWS && c < World.COLS) {
        const r0 = Math.max(5, Math.min(10, cs * 0.5));
        for (const i of this.hoverShops(r, c)) {
          const col = v.centerColor.get(i), ct = this.centers[i];
          if (!col || ct.r === undefined) continue;
          const px = worldToScreenX(ct.c + 0.5), py = worldToScreenY(ct.r + 0.5, OFFSET_Y);
          ctx.beginPath(); ctx.moveTo(px, py - r0); ctx.lineTo(px + r0, py); ctx.lineTo(px, py + r0); ctx.lineTo(px - r0, py); ctx.closePath();
          ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
          ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(ct.name, px + r0 + 4, py); ctx.fillStyle = '#fff'; ctx.fillText(ct.name, px + r0 + 4, py);
        }
      }
    }
    ctx.restore();
  },

  legend() {
    const el = document.getElementById('diagLegend');
    document.getElementById('eraLegend').classList.toggle('gray', this.hasData());
    if (!el) return;
    if (!this.data.size) { el.textContent = '尚無資料：按「跑完 7 天」（約 1–2 分鐘），或「載入 CSV」，或直接播放模擬（要用 1 秒＝1 分到 1 小時的微觀速度，宏觀速度不記錄；力主要出現在 16–20 時）'; return; }
    if (this.f.scope === 'off') { el.textContent = '診斷圖層已關閉'; return; }
    const v = this.view; if (!v) { el.textContent = ''; return; }
    const rgb = k => this.groupRgb(this.group(k)), sw = k => `<span style="color:rgb(${rgb(k)})">■</span>`;
    const lines = this.FORCES.map((F, k) => this.shown(this.KINDS.findIndex(K => K.f === k)) && v.kmax[k] > 0 ? `${sw(k)} ${F.cat}·${F.name}　最高 ${F.unit === '次' ? v.kmax[k].toFixed(F.name === '坐下' ? 0 : 1) + ' 次' : v.kmax[k].toFixed(1) + ' ' + F.unit}` : null).filter(Boolean);
    el.innerHTML = `資料：${this.source}<br>${lines.join('<br>') || '（目前篩選下沒有資料）'}<br>每種力各自以自己的最大值定深淺；同一格只有斥力（或只有吸力）時多種力混色；斥力與吸力同格時互減（淨值＝吸力−斥力，各自先以最大值標準化，正好抵銷的格子不畫），不透明，依淨值分五段、段內依淨值絕對值由淡到飽和 <span style="color:rgb(255,40,40)">■</span><span style="color:rgb(210,50,120)">■</span><span style="color:rgb(150,60,190)">■</span><span style="color:rgb(90,100,235)">■</span><span style="color:rgb(0,150,255)">■</span>（紅＝全斥力，藍＝全吸力）。中心點：滑鼠停在店鋪上才顯示。底圖已轉灰階。`;
  },

  // CSV（全部天、全部小時，不受畫面篩選影響）：寬表，見 csv()。
  colName(k) { const x = this.kd(k); return x.cat[0] + '·' + x.name + '·' + x.why + (x.unit === '次' ? '' : '(' + x.unit + ')'); }, // 欄名：類別首字·力·原因(單位；次不寫)
  csv() { // 寬表：一列＝一格（row, col）在某個時間戳記、某個視角；每一種（力／原因）一欄，值＝該力的單位量（次數或量，見 FORCES.byCount）；0 留空
    const W = World.COLS, wd = ['日', '一', '二', '三', '四', '五', '六'], K = this.KINDS.length, m = new Map();
    for (const [key, v] of this.data) {
      const d = this.decode(key), k = d.cell + '|' + d.day + '|' + d.hour + '|' + d.cls;
      let e = m.get(k); if (!e) m.set(k, e = { cell: d.cell, day: d.day, hour: d.hour, cls: d.cls, v: new Float64Array(K) });
      e.v[d.kind] += this.val(d.kind, v);
    }
    const names = this.KINDS.map((_, k) => this.colName(k));
    const rows = ['row,col,格型,時間戳記,視角,' + names.join(',')], recs = [...m.values()].sort((x, y) => x.cell - y.cell || x.day - y.day || x.hour - y.hour || (x.cls < y.cls ? -1 : 1));
    for (const e of recs) {
      const r = Math.floor(e.cell / W), c = e.cell % W, dt = new Date(Date.UTC(SIM_START_YEAR, SIM_START_MONTH - 1, 1 + e.day));
      rows.push([r, c, World.cellType[r][c], dt.toISOString().slice(0, 10) + ' ' + String(e.hour).padStart(2, '0') + ':00', e.cls === 'R' ? 'Resident' : 'Customer', ...Array.from(e.v, x => x ? +x.toFixed(3) : '')].join(','));
    }
    return rows.join('\n');
  },
  // 格子彙總（一列＝一格）：這一格整段時間各種力與事件發生幾次（次數欄；各力的量見長表）。T／R 分欄。給人一格一格檢查用。
  csvCells() {
    const W = World.COLS, names = this.KINDS.map((_, k) => { const K = this.kd(k); return K.name + '/' + K.why; }), cells = new Map();
    for (const [key, v] of this.data) {
      const d = this.decode(key), m = cells.get(d.cell) || cells.set(d.cell, new Map()).get(d.cell), kk = d.kind * 2 + (d.cls === 'R' ? 1 : 0);
      m.set(kk, (m.get(kk) || 0) + v[0]);
    }
    const head = ['row', 'col', '格型'];
    this.KINDS.forEach((_, k) => { head.push(names[k] + '（T次數）', names[k] + '（R次數）'); });
    const rows = [head.join(',')];
    for (const cell of [...cells.keys()].sort((a, b) => a - b)) {
      const r = Math.floor(cell / W), c = cell % W, m = cells.get(cell);
      rows.push([r, c, World.cellType[r][c], ...this.KINDS.flatMap((_, k) => [+(m.get(k * 2) || 0).toFixed(3), +(m.get(k * 2 + 1) || 0).toFixed(3)])].join(','));
    }
    return rows.join('\n');
  },
  download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + this.csv()], { type: 'text/csv;charset=utf-8' }));
    a.download = `diagnostic_${this.D}days.csv`; a.click(); URL.revokeObjectURL(a.href);
  },
  downloadCells() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + this.csvCells()], { type: 'text/csv;charset=utf-8' }));
    a.download = `diagnostic_${this.D}days_cells.csv`; a.click(); URL.revokeObjectURL(a.href);
  },

  // 跑完整段模擬（不播放、不畫面），累積診斷紀錄；跑完自動把 CSV 存到 99_data/diagnostic/（診斷後台的伺服器在才存得到，不在就用「匯出 CSV」）。再按一次可中止。
  // 為什麼比以前快：①跑的時候停掉 p5 的 draw（不再每格都重畫）②讓出執行權用 MessageChannel（setTimeout(0) 在背景分頁會被瀏覽器壓到每秒一次，7 天要跑好幾倍的時間）。
  async runAll() {
    const btn = document.getElementById('diagRun');
    if (this.running) { this.running = false; return; }
    this.running = true; playing = false; resetSimulation(); this.source = '目前的模擬';
    const yieldNow = () => new Promise(r => { const m = new MessageChannel(); m.port1.onmessage = () => r(); m.port2.postMessage(0); }), t00 = performance.now();
    let lastUi = 0;
    if (typeof noLoop === 'function') noLoop();
    while (this.running && !runDone()) {
      const t0 = performance.now();
      while (performance.now() - t0 < 250 && !runDone()) microStep();
      if (t0 - lastUi > 500) {
        lastUi = t0; const f = simSec / SIM_END_SEC, eta = f > 0.01 ? Math.round((performance.now() - t00) / f * (1 - f) / 1000) : null;
        btn.textContent = '■ 中止（' + Math.floor(100 * f) + '%' + (eta !== null ? '，約剩 ' + Math.floor(eta / 60) + ' 分 ' + (eta % 60) + ' 秒' : '') + '）';
      }
      await yieldNow();
    }
    const done = runDone();
    this.running = false; if (typeof loop === 'function') loop();
    this.viewVer = -1; this.legend();
    if (done) { this.focusMarket(); btn.textContent = '存檔中…'; const saved = await this.autoSave(); btn.textContent = saved ? '▶ 跑完 ' + this.D + ' 天（已存到 99_data/diagnostic/' + saved + '）' : '▶ 跑完 ' + this.D + ' 天（沒存到：請按「匯出 CSV」）'; }
    else btn.textContent = '▶ 跑完 ' + this.D + ' 天';
  },
  // 把長表 CSV 送給診斷後台的伺服器（99_diag_dashboard/server.js，埠 8939），它寫到 99_data/diagnostic/diagnostic_7days.csv。連不到就回傳 false。
  async autoSave() {
    try { const r = await fetch('http://127.0.0.1:8939/save?name=diagnostic_' + this.D + 'days.csv', { method: 'POST', body: '﻿' + this.csv() }); return r.ok ? await r.text() : false; } catch (e) { return false; }
  },

  // 鏡頭對準市場（預設鏡頭拉得很遠，市場只有幾個像素，圖層看不清楚）。
  focusMarket() {
    const b = World.marketBBox, w = b.maxCol - b.minCol + 7, h = b.maxRow - b.minRow + 7;
    camera.cellPx = Math.floor(Math.min(VIEW_W / w, VIEW_H / h)); camera.col0 = b.minCol - 3; camera.row0 = b.minRow - 3; clampCamera();
  },

  // 載入 csv()／匯出的檔案，把紀錄放回圖層（不用重跑）。
  loadCsv(text, name) { // 讀回 csv() 的寬表；中心沒有存，一律放「無目標」；量與次數都放同一個值（畫面依力的單位取用）
    this.reset();
    const lines = text.replace(/^\ufeff/, '').split('\n'), H = lines[0].split(','), iR = H.indexOf('row'), iC = H.indexOf('col'), iT = H.indexOf('時間戳記'), iV = H.indexOf('視角');
    if (iR < 0 || iC < 0 || iT < 0 || iV < 0) { this.source = '載入失敗：不是新版 CSV（欄位不同）'; this.legend(); return; }
    const colKind = H.map(h => this.KINDS.findIndex((_, k) => this.colName(k) === h));
    const t0 = Date.UTC(SIM_START_YEAR, SIM_START_MONTH - 1, 1);
    lines.slice(1).forEach(line => {
      const c = line.split(','); if (c.length < H.length) return;
      const day = Math.round((Date.parse(c[iT].slice(0, 10)) - t0) / 864e5), hour = +c[iT].slice(11, 13), cell = +c[iR] * World.COLS + +c[iC];
      for (let q = 5; q < H.length; q++) {
        if (colKind[q] < 0 || !c[q]) continue;
        const key = ((((colKind[q] * this.D + day) * 24 + hour) * 2 + (c[iV] === 'Resident' ? 1 : 0)) * this.NC + this.NONE) * this.NCELL + cell;
        this.data.set(key, [+c[q], +c[q]]);
      }
    });
    this.source = '載入的 CSV（' + name + '）'; this.ver++; this.viewVer = -1; this.legend(); this.focusMarket();
  },

  // 細項選單：依「顯示」範圍列出可選的力
  fillKindSelect() {
    const el = document.getElementById('diagKind'), sc = this.f.scope;
    el.innerHTML = '<option value="all">全部細項</option>' + this.FORCES.map((F, k) => (sc === 'all' || (sc === 'rep') === (F.cat === '斥力')) ? `<option value="${k}">${F.cat}·${F.name}</option>` : '').join('');
    if (![...el.options].some(o => o.value === this.f.kind)) this.f.kind = 'all';
    el.value = this.f.kind;
  },
  bindUI() {
    const ids = { diagScope: 'scope', diagClass: 'cls', diagKind: 'kind', diagDay: 'day', diagBand: 'band' };
    const day = document.getElementById('diagDay');
    day.innerHTML = '<option value="all">全部 ' + this.D + ' 天</option>' + Array.from({ length: this.D }, (_, i) => `<option value="${i}">第 ${i + 1} 天</option>`).join('');
    this.fillKindSelect();
    for (const [id, key] of Object.entries(ids)) {
      const el = document.getElementById(id);
      el.value = this.f[key];
      el.addEventListener('change', () => { this.f[key] = el.value; if (key === 'scope') this.fillKindSelect(); if (key === 'day' || key === 'band') this.exitAnim(); this.viewVer = -1; this.legend(); });
    }
    document.getElementById('diagRun').addEventListener('click', () => this.runAll());
    const sl = document.getElementById('diagSlider'); sl.max = this.D * 24 - 1;
    document.getElementById('diagPlay').addEventListener('click', () => this.togglePlay());
    document.getElementById('diagCum').addEventListener('click', () => { this.exitAnim(); this.legend(); });
    sl.addEventListener('input', () => { this.stopTimer(); this.setFrame(+sl.value); });
    document.getElementById('diagSpeed').addEventListener('change', () => { if (this.animTimer) { this.stopTimer(); this.togglePlay(); } });
    document.getElementById('diagFocus').addEventListener('click', () => this.focusMarket());
    const file = document.getElementById('diagFile');
    document.getElementById('diagLoad').addEventListener('click', () => file.click());
    file.addEventListener('change', () => { const r = new FileReader(); r.onload = () => this.loadCsv(r.result, file.files[0].name); r.readAsText(file.files[0]); file.value = ''; });
    document.getElementById('diagCsv').addEventListener('click', () => this.download());
    document.getElementById('diagCsvCells').addEventListener('click', () => this.downloadCells());
    this.legend();
  },
};
