// Customer（顧客）— 規則來源：agent_setting.md「Customer」＋isovist_algorithm.md pseudocode。
// 對照範例：20260824/isovist_sim.html 的 isVisible()，函式名稱刻意保持一致方便對照。
// 興趣目標（Interest Target）：生成時決定 array（店鋪類型清單，makeArray），目標＝現在營業中、類型還在 array 裡的店（isTarget）；熟食類的還要有空位。
// 離開：array 走完、或看到的走道格比例達 fogTh（wantsLeave，Fog Rule）；沒有放棄計時器。
// 探索多寡＝fogTh（離開閾值）與 array 長度：看得越多才走、array 越長，留得越久。
const Customer = {
  macroSampleN: CONFIG.params.CUSTOMER_MACRO_SAMPLE_N, // 宏觀取樣人數：取樣太少會漏掉某些類型
  visionRadius: CONFIG.params.VISION_RADIUS_CELLS, // 數值來源：99_config/agents/customer.json；      // 監測範圍：100公尺 ÷ 每格1公尺 ≈ 100格半徑（本圖對角線~28.6格，目前不太會擋到誰，公式保留供之後放大場景重算）
  pedestrians: [], nextId: 0, // id：Board Sight Rule 用來讓同一位顧客對同一塊板的結果固定

  reset() {
    this.pedestrians = [];
    this.bfsCache.clear(); this.bfsCacheTick = -1; this.shopFieldCache.clear(); this.shopFieldStamp = -1; // 重設時店鋪狀態回開局，舊的 BFS 快取作廢
  },

  // Array Rule：生成時決定這位顧客的 array＝現在營業中的店鋪類型（不重複）。預設全部營業類型；「ARRAY 隨機」開關開啟時，從中隨機抽 1 到全部項（不重複）。
  makeArray() {
    let a = [...new Set(World.shops.filter(s => Cell.isOpenNow(s)).map(s => Cell.categoryOf(s)))]; // 現在沒有任何店營業時是空的（來客數本來就是 0，不會走到這裡）
    if (RuleSwitch.on('Customer.arrayRandom')) {
      const all = a, AP = CONFIG.params.ARRAY_PROB || {}, fixed = a.filter(c => c in AP); // ARRAY_PROB：指定了「進 array 機率」的類型（沒指定的照下面均勻抽）
      const W = CONFIG.params.SHOP_TYPE_WEIGHT, // 店種權重＝被抽進 array 的相對機率（加權隨機排序：key＝隨機數^(1/w)，權重全相同＝均勻隨機）
        rest = a.filter(c => !(c in AP)).map(c => [Math.random() ** (1 / (W[c] ?? 1)), c]).sort((x, y) => y[0] - x[0]).map(x => x[1]), inc = fixed.filter(c => Math.random() < AP[c]);
      const k = fixed.length ? (inc.length ? Math.floor(Math.random() * (rest.length + 1)) : rest.length ? 1 + Math.floor(Math.random() * rest.length) : 0) : 1 + Math.floor(Math.random() * rest.length); // 有指定類型進了 array → 其餘抽 0 到全部項；沒進 → 其餘至少抽 1 項
      a = inc.concat(rest.slice(0, k));
      if (!a.length && all.length) a = [all[Math.floor(Math.random() * all.length)]]; // 保底：array 不能是空的
    }
    return new Set(a);
  },

  // 這位顧客現在的目標店鋪：現在營業、類型還在 array 裡（到訪過的類型已劃掉）；熟食類的還要有空位。
  isTarget(p, shop) {
    const c = Cell.categoryOf(shop);
    return Cell.isOpenNow(shop) && p.array.has(c) && !p.visited.has(shop.code) && (c !== '熟食類' || Cell.hasSeat(shop));
  },
  // Done Rule：array 走完或看到的比例達 fogTh（this.wantsLeave）→ true，該離場；array 只剩熟食類、營業的熟食店都沒空位 → 也離場（座位坐滿離場）。
  done(p) {
    if (this.wantsLeave(p)) return true;
    if (p.array.size && [...p.array].every(cat => !World.shops.some(s => Cell.isOpenNow(s) && Cell.categoryOf(s) === cat))) return true; // array 剩下的類型現在都沒有營業的店（打烊）→ 離場，不在原地來回走
    if (p.array.size === 1 && p.array.has('熟食類')) {
      let anyOpen = false;
      for (const s of World.shops) {
        if (!Cell.isOpenNow(s) || Cell.categoryOf(s) !== '熟食類') continue;
        anyOpen = true;
        if (this.isTarget(p, s)) return false;
      }
      return anyOpen;
    }
    return false;
  },
  // Done Rule 離場：走向最近入口（走向最近入口，不走走過的路）。
  leaveStep(p) {
    const targets = World.entryCells.map(e => ({ row: e.r, col: e.c }));
    const field = this.bfsFieldFromTargets(targets, p, false, true); return this.bestStepByField(p, field) || (this.fieldGet(field, p.row, p.col) === Infinity ? this.randomStep(p) : null); // Walked Avoid Rule：離場也不走走過的路
  },

  // 演算法第6點 bfsFieldFromTargets：多來源 BFS，起點＝targets 全部同時展開，field[r][c]＝走到最近一個目標的實際步數。
  // 效能（2026-09-14，見 cellmachine-grid-system-design 記憶）：field 只會被 bestStepByField 拿來查
  // stopAt 那一格跟它的4鄰格，BFS 本身「一格的距離值一旦指定就不會再變」，所以搜到 stopAt 那格當下就能停，
  // 跟跑完全圖的結果完全等價，不是打折的近似值——把 O(全圖格數) 降成 O(離最近目標的實際步數)。
  // dist 也從整張網格大小的陣列改成 Map（只存真的算過的格子），避免每次呼叫都配置一個跟地圖同大小的陣列。
  // Pass Cost Rule（agent_setting.md）：路徑成本＝每格 Cell.passCost 加總，不再是單位步數。成本只有 1／2 這種小整數，
  // 用 Dial 分桶（buckets[累計成本]）取代 heap。反向展開：鄰格走進 (r,c) 要付 (r,c) 的成本，所以 nd＝d＋passCost(r,c)。
  // 停止條件：一桶（同成本）一定要整桶展開完才停——同桶裡成本較低的格子（1）可能把 stopAt 鄰格的值壓低（stopAt 若是 2），
  // 鄰格值才確定；而且要在 stopAt 展開之後（鄰格拿到值之後）停，理由同單位成本版。
  // Walked Avoid Rule：avoidWalked＝true 時先排除這趟走過的格子（stopAt 自己除外），排除後走不到 stopAt 才退回不排除的最短路。
  bfsFieldFromTargets(targets, stopAt, noChair = false, avoidWalked = false) { // noChair＝true：每格成本都當沒椅子（診斷用，求「本來會走的路」）
    if (avoidWalked && stopAt && stopAt.walked && RuleSwitch.on('Customer.walkedAvoid')) {
      const f = this.bfsField(targets, stopAt, noChair, stopAt);
      if (this.fieldGet(f, stopAt.row, stopAt.col) !== Infinity) return f;
    }
    let f = this.bfsField(targets, stopAt, noChair, null);
    if (stopAt && stopAt.avoidCells && stopAt.avoidCells.size && this.fieldGet(f, stopAt.row, stopAt.col) === Infinity) { stopAt.avoidCells.clear(); f = this.bfsField(targets, stopAt, noChair, null); } // Blocked Reroute：繞開之後走不到 → 不繞了
    return f;
  },
  bfsField(targets, stopAt, noChair, avoid, noStall = false) { // noStall：不穿過攤位格；遠距迷霧（目標＝最近沒看過的格）探索用，不然會走進營業中的店再被 exitStep 請出來
    const dist = new Map();
    const key = (r, c) => r * World.COLS + c;
    const buckets = [[]];
    for (const s of targets) { const k = key(s.row, s.col); if (!dist.has(k)) { dist.set(k, 0); buckets[0].push([s.row, s.col]); } }
    for (let d = 0; d < buckets.length; d++) {
      let found = false;
      for (const [r, c] of buckets[d] || []) {
        if (dist.get(key(r, c)) !== d) continue; // 已被更便宜的路徑更新過
        const nd = d + (noChair ? CONFIG.params.PASS_COST_OPEN : Cell.passCost(r, c));
        for (const [dr, dc] of World.DIRS4) {
          const nr = r + dr, nc = c + dc;
          if (!this.passableFor(nr, nc)) continue;
          if (noStall && World.cellType[nr][nc] === 'stallslot') continue;
          if (avoid && avoid.walked.has(key(nr, nc)) && !(nr === avoid.row && nc === avoid.col)) continue;
          if (stopAt && stopAt.avoidCells && (stopAt.avoidCells.get(key(nr, nc)) || 0) > Cell.simSec) continue; // Blocked Reroute：被擋住的那幾格暫時當牆
          const nk = key(nr, nc), old = dist.get(nk);
          if (old !== undefined && old <= nd) continue;
          dist.set(nk, nd);
          (buckets[nd] || (buckets[nd] = [])).push([nr, nc]);
        }
        if (stopAt && r === stopAt.row && c === stopAt.col) found = true;
      }
      if (found) break;
    }
    return dist;
  },

  // Walked Avoid Rule：記錄這趟走過的格子 p.walked（含 p.row,p.col；旁邊 WALK_NEAR 格內也算，晚 2 步才標，不擋住眼前與正前方）。
  trackWalk(p) {
    const wk = p.walked || (p.walked = new Set()), tr = p.trail || (p.trail = []), N = CONFIG.params.WALK_NEAR, K = (r, c) => r * World.COLS + c;
    tr.push([p.row, p.col]); wk.add(K(p.row, p.col));
    if (tr.length > 3) tr.shift();
    if (tr.length === 3) { const [r0, c0] = tr[0]; for (let dr = -N; dr <= N; dr++) for (let dc = -N; dc <= N; dc++) wk.add(K(r0 + dr, c0 + dc)); }
  },

  // Fog Rule：戰爭迷霧。fogCells＝走道＋入口＋共融區（World.trailCells）中，從入口走得到的格子（靜態，攤位格與椅子格不算），算一次；
  // p.fog＝這位行人這趟看到的 fogCells 格（站的格＋視野內看得到的格，同 this.coneKeys）；比例＝看到的格數 ÷ fogCells 格數（0~1）。
  _fogFor: null, _fog: null,
  fogCells() {
    if (this._fogFor === World.trailCells) return this._fog;
    const all = new Set(World.trailCells.map(c => c.row * World.COLS + c.col)), got = new Set(), q = [];
    for (const e of World.entryCells) { const k = e.r * World.COLS + e.c; if (!got.has(k)) { got.add(k); q.push(k); } }
    while (q.length) {
      const k = q.pop(), r = Math.floor(k / World.COLS), c = k % World.COLS;
      for (const [dr, dc] of World.DIRS4) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= World.ROWS || nc >= World.COLS) continue;
        const nk = nr * World.COLS + nc;
        if (!got.has(nk) && (all.has(nk) || Cell.passable(nr, nc))) { got.add(nk); q.push(nk); } // 沿靜態可走格展開，攤位格只當過道、不算進分母
      }
    }
    this._fogFor = World.trailCells; return (this._fog = new Set([...got].filter(k => all.has(k))));
  },
  fogInit(p) { p.fog = new Set(); p.fogTh = CONFIG.params.FOG_TH_MIN + Math.random() * (CONFIG.params.FOG_TH_MAX - CONFIG.params.FOG_TH_MIN); },
  // keys＝this.coneKeys 的看到的格 key 清單；站的那一格也算看到。
  fogSee(p, keys) {
    const own = p.row * World.COLS + p.col;
    if (this.fogCells().has(own)) p.fog.add(own);
    for (const k of keys) p.fog.add(k);
  },
  fogRatio(p) { return p.fog.size / (this.fogCells().size || 1); }, // 迷霧比例＝看到的格數 ÷ 迷霧格數（0~1）
  // 離開條件（先到的離開）：array 走完（Array Rule）、或看到的比例 ≥ 自己的閾值（Fog Rule）。兩條都被關掉時退回 array，避免行人永遠不走。
  wantsLeave(p) {
    const A = RuleSwitch.on('Customer.arrayLeave'), F = RuleSwitch.on('Customer.fogLeave');
    return ((A || !F) && p.array.size === 0) || (F && this.fogRatio(p) >= p.fogTh);
  },
  // 出生朝向＝從入口朝市場中心（4 方向），決定 60° 錐形的朝向。
  spawnFace(e) {
    const bb = World.marketBBox || { minRow: e.r, maxRow: e.r + 1, minCol: e.c, maxCol: e.c }, dr = (bb.minRow + bb.maxRow) / 2 - e.r, dc = (bb.minCol + bb.maxCol) / 2 - e.c;
    return Math.abs(dc) >= Math.abs(dr) ? [0, Math.sign(dc) || 1] : [Math.sign(dr) || 1, 0];
  },

  randomStep(p) {
    const opts = [];
    for (const [dr, dc] of World.DIRS4) {
      const nr = p.row + dr, nc = p.col + dc;
      if (this.passableFor(nr, nc) && !Cell.full(nr, nc)) opts.push([nr, nc]);
    }
    return opts.length ? opts[Math.floor(Math.random() * opts.length)] : null;
  },

  // 走場值最小的可通行鄰格，同分隨機；bfsFieldFromTargets 產出的 field 都用這個取下一步。
  bestStepByField(p, field) { const m = this.moveStep(p, { goal: field }); return m ? m.next : null; }, // 只有目標項的 Move Rule（走場值最小的鄰格）
  // Move Step Rule：對四個可通行鄰格各算分數＝各項相加，走最高的；離場只開目標項，找店開其餘各項（見 o）。
  //   goal  目標項（吸力）：－走到目標的路徑成本（o.goal＝bfsFieldFromTargets 的走場；成本、不走走過的路已含在走場裡）。離場只有這一項。
  //   fog   迷霧項（吸力）：那時看得到、還沒看過的迷霧格，格數相加，1 格＝1 步
  //   shops 店面得分（吸力）：那時偵測到的目標店裡，只放權重：「權重×WEIGHT_CELLS－到店成本」最高那家的 權重×WEIGHT_CELLS（this.shopWeight）；到店成本放在 path、cost 兩項
  //   wander 沒有目標店時，path 的目標＝最近一塊沒看過的格（o.wander＝this.fogDist 的走場，椅子、擁擠格較貴）
  //   walked 走過的路（斥力）：這格這趟走過 → －1 步（回頭路白走一步）
  //   cost／path 路徑成本（斥力）：走到目標的成本，cost＝走進的這一格的 passCost，path＝這格之後到目標的走場（椅子、擁擠格多算）；目標＝目標店，沒有就是最近沒看過的格，都沒有就只有 cost
  // 同分：o.straight優先直走，再 passCost 低的（Pass Cost Rule），再隨機。回傳 {next, shop, total, dr, dc, t（各項分數）, all（四個鄰格）}；沒有可走的鄰格 → null。
  moveStep(p, o) {
    const P = CONFIG.params, K = World.COLS;
    const hereV = o.goal ? this.fieldGet(o.goal, p.row, p.col) : 0;
    if (o.goal && hereV === Infinity) return null; // 現在這格就走不到目標
    let best = -Infinity, cands = [], all = [], sawFull = false;
    for (const [dr, dc] of World.DIRS4) {
      const r = p.row + dr, c = p.col + dc;
      if (!this.passableFor(r, c)) continue;
      if (Cell.full(r, c)) { sawFull = true; continue; } // Passability Rule：滿了（CROWD_CAP 人）的格子進不去
      const t = { goal: 0, fog: 0, shop: 0, walked: 0, cost: 0, path: 0 }; let top = null;
      if (o.goal) { const v = this.fieldGet(o.goal, r, c); if (v === Infinity || v > hereV) continue; t.goal = -v; } // 走向目標：不往比現在這格更遠的格走（前面進不去就原地等，不會被擠到市場外）
      if (o.fog || o.shops) {
        const q = Object.create(p); q.row = r; q.col = c; q.faceDr = dr; q.faceDc = dc; // 假想站在那格、朝那個方向
        if (o.fog) for (const k of this.coneKeys(q)) if (!p.fog.has(k)) t.fog++;
        if (o.shops) { let bv = -Infinity; for (const sh of this.detectShops(q).keys()) { const f = this.fieldGet(this.shopField(sh), r, c); if (f === Infinity) continue; const w = this.shopWeight(sh), v = w - Cell.passCost(r, c) - f; if (v > bv) { bv = v; top = sh; t.shop = w; t.path = -f; } } } // 目標店＝權重減到店成本最高的那家；店面得分只放權重，成本放 path
      }
      if (o.cost && !top && o.wander) t.path = -(o.wander.get(r * K + c) ?? ((o.wander.get(p.row * K + p.col) ?? 0) + 1)); // 沒有目標店：目標＝最近沒看過的格；走場沒有的格（攤位格）＝比現在這格多一步
      if (o.walked && p.walked && p.walked.has(r * K + c)) t.walked = -1;
      if (o.cost) t.cost = -Cell.passCost(r, c);
      const total = t.goal + t.fog + t.shop + t.walked + t.cost + t.path, x = { next: [r, c], shop: top, total, dr, dc, t };
      all.push(x);
      if (total > best) { best = total; cands = [x]; } else if (total === best) cands.push(x); // 分數都是整數，同分直接比
    }
    if (!cands.length) { if (sawFull) Diag.wait(p); return null; } // 診斷：卡住（前面滿格、原地等）
    const str = o.straight ? cands.find(x => x.dr === p.faceDr && x.dc === p.faceDc) : null;
    const done = pick => { // 診斷用：這一步有沒有真的在拉（走近最近沒看過的格、走進走過的格）
      const g = { wander: 0, walked: pick.t.walked < 0 ? 1 : 0 };
      if (o.wander && !pick.shop && (o.wander.get(pick.next[0] * K + pick.next[1]) ?? Infinity) < (o.wander.get(p.row * K + p.col) ?? Infinity)) g.wander = 1;
      pick.g = g; pick.all = all; return pick;
    };
    if (str) return done(str);
    const cheap = Cell.preferLowCost(cands.map(x => x.next)); // Pass Cost Rule：分數平手時優先走 passCost 低的格子
    const pool = cands.filter(x => cheap.some(([r, c]) => r === x.next[0] && c === x.next[1])), pick = pool[Math.floor(Math.random() * pool.length)];
    return done(pick);
  },

  // 通行限制（Passability Rule）：格子本身能不能走看 Cell.passable；攤位格另外只有所屬店鋪現在營業中才能踏入，否則視同牆。
  // 營業查詢走 Cell.isOpenNow(s.shop)（同編號＝同店鋪，狀態記在店鋪上；時段見 Open Hours）。
  passableFor(r, c) {
    if (!Cell.passable(r, c)) return false;
    const s = World.stallAtRC[r + ',' + c];
    return !s || Cell.isOpenNow(s.shop);
  },

  // 演算法「Bresenham」：回傳 (r0,c0)→(r1,c1) 之間的格子，不含起點、含終點。
  bresenhamCells(r0, c0, r1, c1) {
    const pts = [];
    const dr = Math.abs(r1 - r0), dc = Math.abs(c1 - c0);
    const sr = r0 < r1 ? 1 : -1, sc = c0 < c1 ? 1 : -1;
    let err = dr - dc, r = r0, c = c0;
    while (true) {
      if (!(r === r0 && c === c0)) pts.push([r, c]);
      if (r === r1 && c === c1) break;
      const e2 = 2 * err;
      if (e2 > -dc) { err -= dc; r += sr; }
      if (e2 < dr) { err += dr; c += sc; }
    }
    return pts;
  },

  // 演算法第1點 isVisible：阻擋（牆/設施/建物/任何攤位格，終點本身除外）＋距離上限，兩者疊加才算看得到。
  // building 加入阻擋清單：20260914 使用者需求，見 agent_setting.md「監測範圍」。
  // 效能：結果只跟靜態地圖（cellType）與 visionRadius 有關，開局之後不變，所以整組 (起點,終點) 結果快取起來；
  // 高倍率播放時每步要查「每位行人×每個攤位格」的視線，不快取會佔掉大半運算。
  // 格子編成小整數 id，結果存成「起點 id × 終點 id」的 Uint8Array（0 未算／1 看不到／2 看得到）；
  // 用 Map 或把 (起點,終點) 合成大數字當 key 實測比不快取還慢。id 超過 VIS_CAP 的格子退回直接算（不快取）。
  VIS_CAP: 4096,
  visId: null, visNext: 0, visRows: [],
  isVisible(r0, c0, r1, c1, who) { // who＝看的顧客：穿過機率介於 0～1 的板子，結果依（顧客, 板子）固定（Board Sight Rule）；沒給 who 時機率 ≥ 0.5 算看穿
    if (!this.visId) this.visId = new Int32Array(World.ROWS * World.COLS).fill(-1);
    const k0 = r0 * World.COLS + c0, k1 = r1 * World.COLS + c1;
    let i0 = this.visId[k0]; if (i0 < 0) i0 = this.visId[k0] = this.visNext++;
    let i1 = this.visId[k1]; if (i1 < 0) i1 = this.visId[k1] = this.visNext++;
    if (i0 >= this.VIS_CAP || i1 >= this.VIS_CAP) return this.computeVisible(r0, c0, r1, c1, who);
    const row = this.visRows[i0] || (this.visRows[i0] = new Uint8Array(this.VIS_CAP));
    let v = row[i1];
    if (!v) { this._prob = false; const ok = this.computeVisible(r0, c0, r1, c1, null); v = this._prob ? (ok ? 4 : 3) : (ok ? 2 : 1); row[i1] = v; } // 3／4＝視線穿過機率介於 0～1 的板子（預設結果），有 who 時重算
    if (v > 2 && who) { const G = CONFIG.params.BOARD_SEE_GROUPS, key = (k0 * World.ROWS * World.COLS + k1) * G + who.id % G; let o = this.visProb.get(key); if (o === undefined) this.visProb.set(key, o = this.computeVisible(r0, c0, r1, c1, who)); return o; } // 依顧客組別（編號 % BOARD_SEE_GROUPS）快取
    return v === 2 || v === 4;
  },
  // 從某格看得到的攤位格清單（順序同 World.stalls），也只跟靜態地圖有關，每個起點格只算一次。
  stallsSeen: new Map(),
  visibleStalls(r, c) {
    const k = r * World.COLS + c;
    let l = this.stallsSeen.get(k);
    if (!l) { l = World.stalls.filter(s => this.isVisible(r, c, s.row, s.col)); this.stallsSeen.set(k, l); }
    return l;
  },
  _prob: false, visProb: new Map(),
  boardHash(id, r, c) { const x = Math.sin(id * 12.9898 + r * 78.233 + c * 37.719) * 43758.5453; return x - Math.floor(x); }, // 同一（顧客, 板子）固定的 0～1
  computeVisible(r0, c0, r1, c1, who) {
    if (Math.hypot(r1 - r0, c1 - c0) > this.visionRadius) return false;
    const line = this.bresenhamCells(r0, c0, r1, c1);
    for (const [r, c] of line) {
      if (r === r1 && c === c1) continue; // 終點本身不擋自己
      const t = World.cellType[r][c];
      if (t === 'stallslot') { // 攤位格擋視線；有板子的格依 Board Sight Rule：穿過機率 p
        const cs = World.cellSpace[r][c];
        if (cs && cs.boardTilt != null) { const p = Cell.boardSeeP(cs); if (p >= 1) continue; if (p > 0) { this._prob = true; if (who ? this.boardHash(who.id % CONFIG.params.BOARD_SEE_GROUPS, r, c) < p : p >= 0.5) continue; } }
        return false;
      }
      if (t === 'wall' || (t === 'facility' && !World.isCommonArea(r, c)) || t === 'building') return false; // 共融區是可走的開放空間，不擋視線
    }
    return true;
  },


  // 從某格看得到的椅子格（只算走道上的；攤位格自己的用餐區已在 visibleStalls），同樣只跟靜態地圖有關，每個起點格只算一次。
  chairSeen: new Map(), chairAisle: null,
  visibleChairCells(r, c) {
    const k = r * World.COLS + c;
    let l = this.chairSeen.get(k);
    if (!l) {
      if (!this.chairAisle) this.chairAisle = World.chairCells.filter(a => World.cellType[a.row][a.col] === 'aisle');
      l = this.chairAisle.filter(a => this.isVisible(r, c, a.row, a.col));
      this.chairSeen.set(k, l);
    }
    return l;
  },

  // 看得到一家想去（營業、類型在 array 裡、沒去過）的熟食店卻滿座 ＝ 被拒絕（Cell.rejectFull，只記診斷）。
  rejectIfFull(p, shop) {
    if (Cell.categoryOf(shop) === '熟食類' && p.array.has('熟食類') && !p.visited.has(shop.code) && Cell.isOpenNow(shop) && Cell.chairsOut() && !Cell.hasSeat(shop)) Cell.rejectFull(p, shop);
  },
  // 演算法第2點 findVisibleTarget：看得到的目標（isTarget）裡，score(距離−可見度加分)最小者，同分隨機。
  // 店鋪「現在的身體」＝自己的攤位格＋擺椅時段內椅子延伸出去的走道格（Cell.extentCells）：看到任何一格都算看到這家店，距離算到看得到的最近一格。
  // 擺椅時段外椅子格不算，所以看得到的範圍隨椅子膨脹與收縮。到訪判定以店鋪為單位：同店鋪的其他格子不會被當成沒去過的新目標。
  // Shop Detect Rule：偵測範圍＝身邊方形（前後左右各 NEAR_SEE_CELLS 格）＋面向方向再往前拓增 FRONT_EXT_CELLS 列（朝向＝最後移動方向 faceDr/faceDc）；Target Lock：看到後鎖定到到訪為止；
  // 範圍內的店鋪格，只要它前方（上下左右相鄰）的走道格視線通（或人就站在那格）就算看到，整家店即偵測到；找店不用錐形與認店距離。
  // 看到後去處＝這家店離自己最近的 visitCells（擺椅的店＝椅子格，人要坐在椅子上）。
  inCone(p, r, c) {
    const dr = r - p.row, dc = c - p.col, d = Math.hypot(dr, dc);
    return !d || !RuleSwitch.on('Customer.coneVision') || Math.max(Math.abs(dr), Math.abs(dc)) <= CONFIG.params.NEAR_SEE_CELLS || // 身邊 NEAR_SEE_CELLS 格內（方形）不受錐形限制，仍受視線阻擋
       (dr * p.faceDr + dc * p.faceDc) / (d * Math.hypot(p.faceDr, p.faceDc)) >= Math.cos(CONFIG.params.CONE_DEG / 2 * Math.PI / 180) - 1e-9;
  },
  // Shop Detect Rule：偵測範圍是否含 (r,c)——以面向為前：左右各 NEAR、後 NEAR、前 NEAR＋FRONT_EXT（Customer.shopDetect 關掉＝不拓增）。
  inDetectBox(p, r, c, extra = 0) { // extra：高過人的板子讓店面偵測範圍多延伸的列數（Board Sight Rule）
    const near = CONFIG.params.NEAR_SEE_CELLS, ext = (RuleSwitch.on('Customer.shopDetect') ? CONFIG.params.FRONT_EXT_CELLS : 0) + extra;
    const dr = r - p.row, dc = c - p.col, fwd = dr * p.faceDr + dc * p.faceDc, lat = dr * p.faceDc - dc * p.faceDr;
    return Math.abs(lat) <= near && fwd >= -near && fwd <= near + ext;
  },
  // 店鋪格 (r,c) 算不算看得到：它前方相鄰的迷霧格（走道、入口、共融區）視線通，或人就站在那格。視線改看店面前方的走道格，沿走道才看得到兩側店面。
  seesShopFront(p, r, c) {
    const fc = this.fogCells();
    for (const [dr, dc] of World.DIRS4) {
      const fr = r + dr, fcc = c + dc;
      if (fr < 0 || fcc < 0 || fr >= World.ROWS || fcc >= World.COLS || !fc.has(fr * World.COLS + fcc)) continue;
      if ((fr === p.row && fcc === p.col) || this.isVisible(p.row, p.col, fr, fcc, p)) return true;
    }
    return false;
  },
  // Attraction Sum Rule：偵測到的、還是目標的店 → Map(店 → 到它最近 visitCells 的距離)。p 可以是假想的（Object.create(p) 蓋掉位置與朝向）。
  detectShops(q) {
    const m = new Map();
    for (const sh of this.shopsSeen(q)) { this.rejectIfFull(q, sh); if (!this.isTarget(q, sh)) continue; m.set(sh, Math.min(...Cell.visitCells(sh).map(x => Math.hypot(x.row - q.row, x.col - q.col)))); }
    return m;
  },
  // Shop Detect Rule 本體：偵測範圍內、店面前方視線通的店鋪（不看是不是目標）。detectShops 用。
  shopsSeen(q) {
    const out = new Set();
    for (const s of World.stalls) if (this.inDetectBox(q, s.row, s.col, Cell.overheadOf(s.shop) ? CONFIG.params.BOARD_HEAD_EXT_ROWS : 0) && this.seesShopFront(q, s.row, s.col)) out.add(s.shop);
    if (Cell.chairsOut()) {
      if (!this.chairAisle) this.chairAisle = World.chairCells.filter(a => World.cellType[a.row][a.col] === 'aisle');
      for (const a of this.chairAisle) if (this.inDetectBox(q, a.row, a.col) && ((a.row === q.row && a.col === q.col) || this.isVisible(q.row, q.col, a.row, a.col, q)))
        for (const code of World.cellSpace[a.row][a.col].occupiedBy) { const sh = World.shopByCode[code]; if (sh) out.add(sh); }
    }
    return out;
  },

  // Fog Rule：此刻看得到的迷霧格（this.fogCells）的 key 清單：視野錐形內（身邊 NEAR_SEE_CELLS 格內不受錐形限制）、視線通、在 VISION_RADIUS_CELLS 內。
  // 看到就算，不分遠近。結果只跟位置、朝向、靜態地圖有關，每個（格, 朝向）只算一次。
  coneSeen: new Map(),
  chairAisle: null,
  coneKeys(p) {
    const f = p.faceDr ? (p.faceDr > 0 ? 0 : 1) : (p.faceDc > 0 ? 2 : 3), G = Cell.probBoards ? CONFIG.params.BOARD_SEE_GROUPS : 1, k = ((p.row * World.COLS + p.col) * 4 + f) * G + (Cell.probBoards ? p.id % G : 0);
    let l = this.coneSeen.get(k); // 有依顧客而變的板子時，按顧客組別分開存
    if (!l) {
      l = [];
      for (const key of this.fogCells()) {
        const r = Math.floor(key / World.COLS), c = key % World.COLS, d = Math.hypot(r - p.row, c - p.col);
        if (!d || d > this.visionRadius) continue;
        if (this.inCone(p, r, c) && this.isVisible(p.row, p.col, r, c, p)) l.push(key);
      }
      this.coneSeen.set(k, l);
    }
    return l;
  },




  // 使用者需求(2)：逛完店鋪（或暫時找不到下一個可見目標）時不留在店內閒晃，直接找最近走道走出去。
  // 多來源 BFS：起點＝所有走道格（開場算好存在 World.aisleCells，不重掃全圖），field＝走到最近走道的實際步數；
  // 跟 bfsFieldFromTargets 同一套寫法。
  //
  // 效能（2026-09-14，見 cellmachine-grid-system-design 記憶）：地圖從市場858格擴大到研究範圍266,832格後，
  // 這裡原本每次呼叫都配置＋掃過一張跟地圖同大小的陣列——但 bestStepByField 只會查 stopAt 這一格跟它的4鄰格，
  // BFS「距離值一旦指定就不會再變」，搜到 stopAt 就能停，結果完全等價、不是打折的近似值。dist 也從陣列改成
  // 只存真的算過的格子的 Map。
  // 效能：結果只跟「這格(stopAt)」與店鋪營業狀態有關，狀態在 stepTick 改變、營業時段每小時換一次、公休每天換一次，所以每格快取、換 tick／日／小時或重設時清掉。
  // Move Rule 的路徑成本要用「到店的路徑成本」：每家店各算一次走場（從它的 visitCells 往外的 passCost 累計），營業開關依 tick、日、小時而變，所以跟 bfsCache 同一個戳記，換了就清。
  // ponytail: 擁擠在一小時內的變化不更新走場（擁擠由走進這格的成本補）。
  shopFieldCache: new Map(), shopFieldStamp: -1,
  shopWeight(shop) { const P = CONFIG.params; return (P.SHOP_TYPE_WEIGHT[Cell.categoryOf(shop)] ?? 1) * P.WEIGHT_CELLS; }, // 店面得分＝店面權重 w × WEIGHT_CELLS（步）
  shopField(shop) {
    const stamp = (tick * 100000 + dayCounter) * 24 + Math.floor(Cell.hourNow());
    if (this.shopFieldStamp !== stamp) { this.shopFieldCache.clear(); this.shopFieldStamp = stamp; }
    let f = this.shopFieldCache.get(shop.code);
    if (!f) { f = this.bfsField(Cell.visitCells(shop), null, false, null); this.shopFieldCache.set(shop.code, f); }
    return f;
  },
  // 遠距迷霧（沒有目標店時路徑成本的目標）要用的走場：從所有「還沒看過的迷霧格」往外的路徑成本（passCost 累計，椅子、擁擠格較貴）；全看到了 → null。
  fogDist(p) {
    const targets = []; for (const k of this.fogCells()) if (!p.fog.has(k)) targets.push({ row: Math.floor(k / World.COLS), col: k % World.COLS });
    return targets.length ? this.bfsField(targets, null, false, null, true) : null; // 不穿過攤位格
  },
  // 診斷（繞開椅子）用：這家店「假裝沒有椅子」的走場，同 shopField 的快取戳記。
  shopFieldNoChair(shop) {
    this.shopField(shop); // 先讓快取戳記更新（換了就清）
    const key = shop.code + '|nc'; let f = this.shopFieldCache.get(key);
    if (!f) { f = this.bfsField(Cell.visitCells(shop), null, true, null); this.shopFieldCache.set(key, f); }
    return f;
  },
  // Move Step Rule 找店的各項：店面得分、沒看過的格數、走過、路徑成本；沒有目標店時路徑成本的目標＝最近沒看過的格（規則開關：Customer.wanderRule）。
  moveCustomer(p) {
    const wander = RuleSwitch.on('Customer.wanderRule') ? this.fogDist(p) : null;
    return this.moveStep(p, { straight: true, fog: true, shops: true, wander, walked: true, cost: true });
  },
  // 診斷：選的方向不是「假裝沒有椅子、擁擠」時的最高分方向，而那個方向有別家椅子 → 繞開椅子（記錄見 Diag.detour）。
  // 假裝沒有＝路徑成本改用沒椅子的走場（只換目前的目標店）。
  diagDetour(p, m) {
    if (!Diag.on || Diag.paused || !Cell.chairsOut()) return;
    const P = CONFIG.params, f0 = m.shop ? this.shopFieldNoChair(m.shop) : null, score = x => x.total - x.t.cost - (f0 ? x.t.path : 0) - P.PASS_COST_OPEN - (f0 ? Math.min(this.fieldGet(f0, x.next[0], x.next[1]), 99) : 0);
    let best = -Infinity; for (const x of m.all) best = Math.max(best, score(x));
    const alt = m.all.filter(x => Math.abs(score(x) - best) <= 1e-9);
    if (alt.some(x => x.next[0] === m.next[0] && x.next[1] === m.next[1])) return;
    const own = p.destShop ? p.destShop.code : null, avoided = alt.map(x => x.next).filter(([r, c]) => Cell.chairExtra(r, c, own) > 0);
    if (avoided.length) Diag.detour(p, 'T', own, avoided, m.next[0], m.next[1]);
  },
  bfsCache: new Map(), bfsCacheTick: -1,
  bfsFieldToAisle(stopAt) {
    const stamp = (tick * 100000 + dayCounter) * 24 + Math.floor(Cell.hourNow()); // 營業開關依 tick、日（公休）、小時（營業時段）而變
    if (this.bfsCacheTick !== stamp) { this.bfsCache.clear(); this.bfsCacheTick = stamp; }
    const key = stopAt ? stopAt.row * World.COLS + stopAt.col : -1;
    let dist = this.bfsCache.get(key);
    if (!dist) { dist = this.computeBfsFieldToAisle(stopAt); this.bfsCache.set(key, dist); }
    return dist;
  },
  computeBfsFieldToAisle(stopAt) {
    const dist = new Map();
    const key = (r, c) => r * World.COLS + c;
    const q = [];
    for (const cell of World.aisleCells) { dist.set(key(cell.row, cell.col), 0); q.push([cell.row, cell.col]); }
    let head = 0;
    while (head < q.length) {
      const [r, c] = q[head++];
      const d = dist.get(key(r, c));
      for (const [dr, dc] of World.DIRS4) {
        const nr = r + dr, nc = c + dc;
        if (!this.passableFor(nr, nc)) continue;
        const nk = key(nr, nc);
        if (dist.has(nk)) continue;
        dist.set(nk, d + 1);
        q.push([nr, nc]);
      }
      if (stopAt && r === stopAt.row && c === stopAt.col) break; // 展開完鄰格才能停，見上方說明
    }
    return dist;
  },
  fieldGet(field, r, c) {
    const v = field.get(r * World.COLS + c);
    return v === undefined ? Infinity : v;
  },
  bestStepByDist(p, field) {
    if (this.fieldGet(field, p.row, p.col) === Infinity) return null;
    let best = Infinity, cands = [];
    for (const [dr, dc] of World.DIRS4) {
      const nr = p.row + dr, nc = p.col + dc;
      if (!this.passableFor(nr, nc)) continue;
      const v = this.fieldGet(field, nr, nc);
      if (v < best) { best = v; cands = [[nr, nc]]; }
      else if (v === best) cands.push([nr, nc]);
    }
    cands = Cell.preferLowCost(cands); // Pass Cost Rule
    return cands.length ? cands[Math.floor(Math.random() * cands.length)] : null;
  },
  exitStep(p) {
    return this.bestStepByDist(p, this.bfsFieldToAisle(p));
  },

  // 生成規則：由入口格產生，數量隨興趣目標類型的攤位數增加（實際換算在 index.html 的 spawnPedestriansContinuous）。
  spawnExpected(expected) {
    if (World.entryCells.length === 0) return;
    let n = Math.floor(expected);
    if (Math.random() < (expected - n)) n++;
    for (let i = 0; i < n; i++) {
      const open = World.entryCells.filter(x => !Cell.full(x.r, x.c)); if (!open.length) continue; // 入口都滿了：這位不生成
      const e = open[Math.floor(Math.random() * open.length)];
      // faceDr/faceDc：最後一次移動方向，決定 Monitor Range 的 60° 錐形朝向；出生朝向＝從入口朝市場中心（4 方向）。
      const array = this.makeArray();
      if (!array.size) continue;
      const [fr, fc] = this.spawnFace(e), p = { id: ++this.nextId, row: e.r, col: e.c, visited: new Set(), rej: new Set(), faceDr: fr, faceDc: fc, array, leaving: false }; // array：還沒逛的店鋪類型，到訪一家就劃掉該類型
      this.fogInit(p); this.pedestrians.push(p); Cell.arrive(p);
    }
  },

  // 演算法第5點 touristStep：可見未訪目標(椅子／可見度加分) → 看不到就往沒看過的地方探索 → 都沒有就隨機走。
  // 使用者需求(2)：站在店鋪格子裡、沒有下一個可見目標時，不亂走，直接走最近走道出去（逛完就走，不閒晃）。
  // 結束規則：到訪一攤不會消失，繼續逛（多站購物），直到 Done Rule 判定該離場（array 走完、或看到的走道格比例達 fogTh）。沒有放棄計時器。
  move(trailHeat) {
    const stillAlive = [];
    for (const p of this.pedestrians) {
      if (!Cell.tickPause(p)) this.step(p, trailHeat); // 停留中（走慢／坐下）這一步不移動
      const left = p.leaving && !p.sitShop && World.cellType[p.row][p.col] === 'entry'; // Done Rule：走到入口＝離場
      Diag.seen(p); // 診斷：被看見（這一秒他站在這格、看得到哪些營業中的店）
      if (!left) stillAlive.push(p);
      else { Cell.release(p); Cell.vacate(p); }
    }
    this.pedestrians = stillAlive;
  },

  step(p, trailHeat) {
      Cell.ejectIfTrapped(p); // 店打烊時還站在店裡 → 請到最近的可走格
      this.trackWalk(p); // Walked Avoid Rule：站的這格＝走過
      this.fogSee(p, this.coneKeys(p)); // Fog Rule：此刻錐形內看得到的走道格＝看到
      if (!p.leaving && this.done(p)) p.leaving = true; // Done Rule
      const prev = p.destShop; let next, m = null;
      if (p.leaving) next = this.leaveStep(p);                                                // Done Rule 離場：只有目標項（朝最近入口），不走走過的路
      else if (World.cellType[p.row][p.col] === 'stallslot') next = this.exitStep(p);         // 站在攤位格：先走出來
      else { m = this.moveCustomer(p); next = m ? m.next : this.randomStep(p); }           // Move Rule：各項分數相加，走最高的鄰格
      p.destShop = m ? m.shop : null; // 現在要去哪家店（目標店；沒有＝null）
      if (prev && prev !== p.destShop && Cell.categoryOf(prev) === '熟食類' && !p.visited.has(prev.code) && Cell.isOpenNow(prev) && !Cell.hasSeat(prev) && (p.leaving || p.destShop)) Diag.full(p, prev, p.leaving); // 診斷：原本要去的熟食店坐滿了 → 改去別家／離場
      if (m) { Diag.pull(p, m); this.diagDetour(p, m); } // 診斷：各項吸力、斥力；繞開椅子
      if (next) {
        const dr = next[0] - p.row, dc = next[1] - p.col; // 記朝向（純視覺，見 spawnExpected 註解）
        if (dr !== 0 || dc !== 0) { p.faceDr = dr; p.faceDc = dc; }
        const r0 = p.row, c0 = p.col; p.row = next[0]; p.col = next[1]; Cell.moved(p, r0, c0);
        const own = p.destShop ? p.destShop.code : null, cs = Cell.slowedSec(p.row, p.col), ap = Cell.approachSlowSec(p.row, p.col, own);
        p.pause = Math.max(cs, ap); Diag.slow(p, 'T', cs, ap, own); // 走進格子多停 Cell.slowedSec 秒；近椅子（別家）再放慢，見 Chair Approach Rule
      }

      trailHeat[p.row][p.col] += TRAIL_STEP_ADD * heatW; // 不衰減、不封頂，見 simulator_setting.md
      Diag.trail(p); // 診斷：同一個動作也記進診斷（每小時、視角分開），所以後台的軌跡＝模擬器的動線熱度

      if (!p.leaving) for (const shop of Cell.reachableShops(p.row, p.col)) { // Visit Rule：站在店面前／店面延伸的椅子格也算到訪；只認目標（想吃飯的到了沒位子就不算）
        if (!this.isTarget(p, shop)) continue;
        if (Cell.browse(p, shop)) break; // Browse Rule：到訪前先停一會兒
        shop._visitTick = (shop._visitTick || 0) + visitW; // 人氣熱度記在店鋪上，供 VendorNew 用
        p.visited.add(shop.code); p.array.delete(Cell.categoryOf(shop)); // 到訪一家，劃掉該類型
        if (Cell.categoryOf(shop) === '熟食類') { Cell.trySit(p, shop); if (p.sitShop === shop) Diag.sit(p, 'T', shop); } // Chair Seating Rule：到訪熟食店才坐
        break; // 一步最多到訪一家（同步驟再多家，下一步照樣到訪）
      }
  },

  // 使用者需求(2)：定格在格子中心，不逐幀隨機偏移，避免視覺抖動。
  // 2026-09-14：座標改用鏡頭(camera)換算，理由同 this.draw()。
  draw(p5c) {
    p5c.fill('#dd6b20'); p5c.stroke('#9c4221'); p5c.strokeWeight(0.8);
    const s = Math.min(4.2, camera.cellPx * 0.5);
    for (const p of this.pedestrians) {
      const cx = worldToScreenX(p.col) + camera.cellPx / 2;
      const cy = worldToScreenY(p.row, OFFSET_Y) + camera.cellPx / 2;
      p5c.triangle(cx, cy - s, cx - s, cy + s, cx + s, cy + s);
    }
    p5c.noStroke();
  },

  // ISO 標記（20260914 使用者需求#3：沿用2D原本的三角形圖形，只是變成有厚度的等角版本）：
  // 2D 版是 p5c.triangle(cx,cy-s, cx-s,cy+s, cx+s,cy+s)（頂點朝上）；這裡把同一個三角形往上
  // 擠出真人身高（ISO_PERSON_HEIGHT_M，1格=1公尺換算），畫3個側面(較暗) + 頂面(原色三角形)。
  drawIso(p5c) {
    if (!isoBBox) return;
    const hPx = isoHeightPx(ISO_PERSON_HEIGHT_M);
    const s = Math.min(4.2, isoCamera.u * 0.5); // 跟 2D 版 camera.cellPx*0.5 換算邏輯一致
    for (const p of this.pedestrians) {
      const g = isoProject(p.row, p.col, 0);
      const bA = { x: g.x, y: g.y - s }, bL = { x: g.x - s, y: g.y + s }, bR = { x: g.x + s, y: g.y + s };
      const tA = { x: bA.x, y: bA.y - hPx }, tL = { x: bL.x, y: bL.y - hPx }, tR = { x: bR.x, y: bR.y - hPx };
      drawingContext.fillStyle = isoShade('#dd6b20', 0.6);
      isoDrawPoly([bA, bL, tL, tA]);
      isoDrawPoly([bL, bR, tR, tL]);
      isoDrawPoly([bR, bA, tA, tR]);
      drawingContext.fillStyle = '#dd6b20';
      isoDrawPoly([tA, tL, tR]);
    }
  },

  // 掃半徑內每一格，套用「演算法第1點 isVisible」本身（不是另一套判定），回傳真的看得到的格子清單。
  // 給下面的視域高亮用（形狀＝真實計算結果，不是脫鉤的裝飾形狀）。
  getVisibleCells(p, radius = this.visionRadius) {
    const cells = [];
    const R = radius;
    for (let dr = -R; dr <= R; dr++) {
      for (let dc = -R; dc <= R; dc++) {
        const r = p.row + dr, c = p.col + dc;
        if (r < 0 || r >= World.ROWS || c < 0 || c >= World.COLS) continue;
        if (this.isVisible(p.row, p.col, r, c)) cells.push([r, c]);
      }
    }
    return cells;
  },

  _visKey: null, _visCells: null,

  // 20260914 使用者需求#1/#2：視域呈現從「metaball 融合形狀」改成直接把看得到的格子高亮——
  // 比抽象的融合形狀更直覺，2D/畫面一跟 ISO 面板也才能共用同一份資料呈現同一件事（需求#2）。
  // 只示範陣列第一個顧客；每次移到新格子才重算一次（不是每個 render frame 都重算(2R+1)²格）。
  getDemoVisibleCells() {
    const p = this.pedestrians[0];
    if (!p) return null;
    const key = p.row + ',' + p.col;
    if (this._visKey !== key) { this._visKey = key; this._visCells = this.getVisibleCells(p); }
    return this._visCells;
  },

  // 畫面一（2D）：可見格直接疊一層亮黃色半透明色塊，蓋在格子原本的顏色上面。
  drawVisionHighlight2D() {
    const cells = this.getDemoVisibleCells();
    if (!cells) return;
    drawingContext.save();
    drawingContext.fillStyle = visionHighlightPattern; // 20260914 需求#1：白色斜線疊圖，不是純色色塊
    for (const [r, c] of cells) {
      drawingContext.fillRect(worldToScreenX(c), worldToScreenY(r, OFFSET_Y), camera.cellPx, camera.cellPx);
    }
    drawingContext.restore();
  },

  // ISO：同一份可見格，貼在每格「自己的」地形高度上面一點點（不同型別高度不同，見 ISO_HEIGHT_M），
  // 裁掉 isoBBox 範圍外的格子（ISO 面板的資料範圍就只到市場+4街廓，見 computeIsoScope）。
  drawVisionHighlightIso() {
    const cells = this.getDemoVisibleCells();
    if (!cells || !isoBBox) return;
    drawingContext.save();
    drawingContext.fillStyle = visionHighlightPattern;
    for (const [r, c] of cells) {
      if (r < isoBBox.minRow || r > isoBBox.maxRow || c < isoBBox.minCol || c > isoBBox.maxCol) continue;
      const h = isoHeightPx(ISO_HEIGHT_M[World.cellType[r][c]] || 0) + 1;
      const TL = isoProject(r, c, h), TR = isoProject(r, c + 1, h), BR = isoProject(r + 1, c + 1, h), BL = isoProject(r + 1, c, h);
      isoDrawPoly([TL, TR, BR, BL]);
    }
    drawingContext.restore();
  }
};
