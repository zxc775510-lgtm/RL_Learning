// 攤位配置（最小單位）產生、合法動作、連通檢查。Node 與瀏覽器共用（UMD）。
// 配置格式：{ cells: [{ r, c, code, cat, zone }], fronts: { 攤位: 'N'|'S' } }
// 只列「攤位格」：設備格（zone＝工作設備區，固定原位）＋每攤的最小單位（垂直線：座位→桌面→工作空間→設備）。
// 其餘原本的攤位格一律回到走道。資料更正：G→M、H→L、I→K、A-4→A-3 合併；W 改雜貨類；倉庫不參與。
// 動作：在自己格子的前後左右加一格桌面（熟食類座位跟著長在桌前），或減一格桌面（座位一起拿掉）；每張桌子都要有人碰得到。
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.StallLayout = factory(); })(this, function () {
  const kk = (r, c) => r + ',' + c, DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const MERGE = { G: 'M', H: 'L', I: 'K', 'A-4': 'A-3' }, CAT_FIX = { W: '雜貨類' };
  const FOOD = '熟食類', TABLE = '桌面空間', MIXED = '工作桌面混合', WORK = '工作空間', SEAT = '用餐區', EQUIP = '工作設備區';
  const isTableZone = z => z === TABLE || z === MIXED;
  const vec = f => f === 'S' ? [1, 0] : f === 'N' ? [-1, 0] : [0, 0];

  // 讀原始資料（套用合併與更正）：每攤的格子、入口、可站的地板
  function world(ERA) {
    const kind = (r, c) => (ERA.cells[kk(r, c)] || {}).kind_2026;
    const entries = Object.keys(ERA.cells).filter(k => ERA.cells[k].kind_2026 === 'entry').map(k => k.split(',').map(Number));
    const nearEntry = (r, c) => entries.some(([er, ec]) => Math.abs(er - r) <= 1 && Math.abs(ec - c) <= 1);
    const common = (r, c) => kind(r, c) === 'facility' && (ERA.cells[kk(r, c)] || {}).category_2026 === '共融區';
    const stalls = {};
    for (const key in ERA.cells) {
      const d = ERA.cells[key]; if (d.kind_2026 !== 'stall') continue;
      const [r, c] = key.split(',').map(Number), code0 = d.display_code, code = MERGE[code0] || code0, cat = CAT_FIX[code0] || d.category_2026;
      if (cat === '倉庫') continue;
      (stalls[code] || (stalls[code] = { code, cat, cells: [] })).cells.push({ r, c, zone: d.zone_2026 });
    }
    return { kind, entries, nearEntry, common, stalls };
  }

  // 原配置（只套用合併與更正，不縮小；保留走道椅子）——最後驗證時當對照
  function original(ERA) {
    const W = world(ERA), cells = [];
    for (const s of Object.values(W.stalls)) for (const x of s.cells) cells.push({ r: x.r, c: x.c, code: s.code, cat: s.cat, zone: x.zone });
    return { cells, fronts: {}, keepChairs: true };
  }

  // 最小單位：每個 zone（設備、工作空間、桌面、座位區）各佔一格，最多 4 格、最少 1 格，排成一條南北向垂直線
  function minimal(ERA) {
    const W = world(ERA), cells = [], fronts = {}, report = [], occ = new Set();
    const list = Object.values(W.stalls).sort((a, b) => a.code < b.code ? -1 : 1);
    const free = (r, c) => { const k = W.kind(r, c); return (k === 'aisle' || k === 'stall') && !occ.has(kk(r, c)) && !W.nearEntry(r, c); };
    const put = (s, rows, c, zones, f) => { rows.forEach((r, i) => { cells.push({ r, c, code: s.code, cat: s.cat, zone: zones[i] }); occ.add(kk(r, c)); }); fronts[s.code] = f; };
    const med = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
    const rest = [];
    // ① 含設備的攤位：垂直線從設備往桌面方向長（設備 → 工作空間 → 桌面 → 座位）
    for (const s of list) {
      const eq = s.cells.filter(x => x.zone === EQUIP), mixed = s.cells.every(x => x.zone === MIXED);
      if (!eq.length || mixed) { rest.push(s); continue; }
      const tb = s.cells.filter(x => x.zone === TABLE), eqR = eq.reduce((t, x) => t + x.r, 0) / eq.length, tbR = (tb.length ? tb : s.cells).reduce((t, x) => t + x.r, 0) / (tb.length ? tb.length : s.cells.length);
      const pref = Math.abs(tbR - eqR) >= 0.5 ? (tbR > eqR ? 'S' : 'N') : 'S', fs = [pref, pref === 'S' ? 'N' : 'S'];
      const food = s.cat === FOOD, n = food ? 3 : 2, mc = med(eq.map(x => x.c)), cols = [...new Set(eq.map(x => x.c))].sort((a, b) => Math.abs(a - mc) - Math.abs(b - mc));
      let done = false;
      for (const f of fs) { if (done) break; const d = f === 'S' ? 1 : -1;
        for (const c of cols) {
          const rows = eq.filter(x => x.c === c).map(x => x.r), base = f === 'S' ? Math.max(...rows) : Math.min(...rows), rr = Array.from({ length: n }, (_, i) => base + d * (i + 1));
          if (!free(base, c) || !rr.every(r => free(r, c))) continue;
          cells.push({ r: base, c, code: s.code, cat: s.cat, zone: EQUIP }); occ.add(kk(base, c)); // 設備只留這一格（在原設備區裡、離桌面最近的那格）
          put(s, rr, c, food ? [WORK, TABLE, SEAT] : [WORK, TABLE], f); done = true; break;
        } }
      if (!done) { report.push(s.code + '：設備線放不下，改用一般放法'); rest.push(s); }
    }
    // ② 其他攤位：放在原攤位中心附近
    for (const s of rest) {
      const own = s.cells.filter(x => x.zone !== EQUIP), base = own.length ? own : s.cells;
      const cr = base.reduce((t, x) => t + x.r, 0) / base.length, cc = base.reduce((t, x) => t + x.c, 0) / base.length;
      if (s.cells.every(x => x.zone === MIXED)) { // 推車、鐵門攤：1 格工作桌面混合
        const x = [...s.cells].sort((a, b) => Math.hypot(a.r - cr, a.c - cc) - Math.hypot(b.r - cr, b.c - cc))[0];
        cells.push({ r: x.r, c: x.c, code: s.code, cat: s.cat, zone: MIXED }); occ.add(kk(x.r, x.c)); continue;
      }
      const food = s.cat === FOOD, n = food ? 3 : 2; let best = null;
      for (let c = ERA.bounds.minCol; c <= ERA.bounds.maxCol; c++) for (let r0 = ERA.bounds.minRow; r0 <= ERA.bounds.maxRow; r0++) for (const f of ['S', 'N']) {
        let ok = true; for (let i = 0; i < n; i++) if (!free(r0 + i, c)) { ok = false; break; }
        if (!ok) continue;
        const tr = food ? r0 + 1 : (f === 'S' ? r0 + 1 : r0), side = [[tr, c - 1], [tr, c + 1]].filter(([a, b]) => W.kind(a, b) === 'aisle' && !occ.has(kk(a, b))).length;
        const beyond = f === 'S' ? r0 + n : r0 - 1, open = free(beyond, c) || W.kind(beyond, c) === 'aisle' ? 0 : 1.5;
        const score = Math.hypot(r0 + (n - 1) / 2 - cr, c - cc) + open + (side ? 0 : 3);
        if (!best || score < best.score) best = { r0, c, f, score };
      }
      if (!best) { report.push(s.code + '：找不到位置'); continue; }
      const rows = Array.from({ length: n }, (_, i) => best.r0 + i), zs = food ? (best.f === 'S' ? [WORK, TABLE, SEAT] : [SEAT, TABLE, WORK]) : (best.f === 'S' ? [WORK, TABLE] : [TABLE, WORK]);
      put(s, rows, best.c, zs, best.f);
    }
    return { cells, fronts, report };
  }

  const clone = L => ({ cells: L.cells.map(x => ({ ...x })), fronts: { ...L.fronts }, keepChairs: L.keepChairs });
  const hash = L => L.cells.map(x => x.r + ':' + x.c + ':' + x.code + ':' + x.zone + ':' + (x.board ? x.tilt + '/' + x.z + '/' + (x.yaw ?? '') : '')).sort().join('|');
  // 同一攤的桌面格是否上下左右連成一塊（角對角不算相連）
  const tablesLinked = tb => {
    if (tb.length <= 1) return true;
    const s = new Set(tb.map(x => kk(x.r, x.c))), seen = new Set([kk(tb[0].r, tb[0].c)]), q = [tb[0]];
    while (q.length) { const x = q.pop(); for (const [a, b] of DIRS) { const k = kk(x.r + a, x.c + b); if (s.has(k) && !seen.has(k)) { seen.add(k); q.push({ r: x.r + a, c: x.c + b }); } } }
    return seen.size === s.size;
  };
  const tablesOf = (L, code) => L.cells.filter(x => x.code === code && isTableZone(x.zone));
  const seatsOf = (L, code) => L.cells.filter(x => x.code === code && x.zone === SEAT);

  // 連通：每一格桌面都要有「站得到的鄰格」走得到入口（鄰格是空走道且接得到入口；熟食店也可站自己的座位格）。回傳站不到的桌面格。
  function connected(L, ERA) {
    const W = world(ERA), occ = new Map(L.cells.map(x => [kk(x.r, x.c), x])); // 每塊板子都佔一格（頭上過得去的板子下面的格子也是它的格，模擬器照物理處理）
    const walk = (r, c) => { if (occ.has(kk(r, c))) return false; const k = W.kind(r, c); return k === 'aisle' || k === 'stall' || k === 'entry' || W.common(r, c); }; // 原本的攤位格不在配置裡＝已回到走道
    const seen = new Set(), q = [];
    for (const [r, c] of W.entries) { seen.add(kk(r, c)); q.push([r, c]); }
    while (q.length) { const [r, c] = q.pop(); for (const [a, b] of DIRS) { const k = kk(r + a, c + b); if (!seen.has(k) && walk(r + a, c + b)) { seen.add(k); q.push([r + a, c + b]); } } }
    const bad = [];
    for (const t of L.cells) {
      if (!isTableZone(t.zone)) continue;
      const ok = DIRS.some(([a, b]) => { const n = occ.get(kk(t.r + a, t.c + b)); return n ? (n.code === t.code && n.zone === SEAT && DIRS.some(([a2, b2]) => seen.has(kk(n.r + a2, n.c + b2)))) : seen.has(kk(t.r + a, t.c + b)); });
      if (!ok) bad.push(t.code + '@' + t.r + ',' + t.c);
    }
    return { ok: !bad.length, bad };
  }

  // 合法動作（還沒檢查連通，由呼叫端 apply 後用 connected 篩）：前後左右放桌面；熟食類座位長在桌子的走道側
  function moves(L, ERA) {
    const W = world(ERA), occ = new Set(L.cells.map(x => kk(x.r, x.c))), out = [], openCell = (r, c) => { const k = W.kind(r, c); return k === 'aisle' || k === 'stall'; };
    for (const code of [...new Set(L.cells.map(x => x.code))]) {
      const mine = L.cells.filter(x => x.code === code), food = mine[0].cat === FOOD, [fr, fc] = vec(L.fronts[code] || 'S'), seen = new Set();
      for (const x of mine) { if (!isTableZone(x.zone)) continue; for (const [a, b] of DIRS) {
        const r = x.r + a, c = x.c + b, k = kk(r, c);
        if (seen.has(k) || occ.has(k) || !openCell(r, c) || W.nearEntry(r, c)) continue;
        seen.add(k);
        if (food) { const sr = r + fr, sc = c + fc; if (occ.has(kk(sr, sc)) || !openCell(sr, sc) || W.nearEntry(sr, sc)) continue; out.push({ type: 'add', code, r, c, seat: [sr, sc] }); }
        else out.push({ type: 'add', code, r, c });
      } }
      const tb = tablesOf(L, code);
      if (tb.length > 1) for (const t of tb) {
        if (!tablesLinked(tb.filter(y => y !== t))) continue;
        const sx = food ? mine.find(x => x.zone === SEAT && x.r === t.r + fr && x.c === t.c + fc) : null;
        out.push({ type: 'remove', code, r: t.r, c: t.c, seat: sx ? [sx.r, sx.c] : null });
      }
    }
    return out;
  }
  // ---- 板子不預設形式（2026-11-18，--relax=1；使用者拍板：不定義板子可以怎麼擺，免得限制可能性）----
  // 一塊板子只有連續參數：位置、傾角 tilt（0＝水平 … 90＝垂直）、離地高度 z。沒有「水平／垂直／斜／頂上」這種預設形式。
  // 限制：每塊板子至少一面真實碰到同攤的其他板子（含原本的桌面格；用板子的實際幾何判斷，見 boardsTouch，不再只看隔壁格）；不限離攤位多遠（2026-11-19 使用者：只保留極限版，刪掉「周圍 2 格」的基本版）。拆掉後剩下的板子仍要相連。
  // 動作：place（放一塊）、tune（調整一塊的傾角、朝向、接的高度）、remove（拆一塊）；每次是隨機抽（randomFree），不先列舉「合法動作」。
  // 板子的類別只看傾角，而且不互斥（2026-11-19 使用者）：桌面 ≤15°、可走板 15～30°、斜板 30～60°、垂直牆 ≥60°，交界的傾角同時是兩種（15°＝桌面＋可走、30°＝可走＋斜板、60°＝斜板＋垂直牆）。
  // 高度不是參數：板子的低邊接在「它碰到的板子」的低邊或高邊（沒碰地面的就是 0），任何類別都能往上接（使用者：不限制怎麼接）。可走板一塊塊往上接，低邊 ≥ OVER_Z（＝模擬器 BOARD_HEAD_Z_M）就是高架，人從下面穿過。
  // 模擬器怎麼看這些板子：見 99_website/agents/cell.js 的 Board Rules——只讀傾角、高度、朝向，全部照物理算（走得上去／頭上過得去／跨得過去／側身／視線／搆得到），沒有類別、沒有傾角門檻；headless 的 --layout 照單全收，不略過任何板子。下面的 roleOf 只是畫面取的名字，不影響行為；畫面真正的顏色看 reactions（跟 cell.js 同一套算法）。
  const TILTS = [0, 90], YAWS = [0, 90, 180, 270] /* 2026-11-20 老師：先只留 90 度貼格面。傾角只有平放 0／直立 90；朝向＝格子的四個方向（前後左右），模擬器讀 board_yaw（對走道寬度只有 0/90 兩種效果，180/270 取絕對值） */, OVER_Z = 2.0;
  const roleOf = (tilt, z) => ({ over: z >= OVER_Z, table: tilt <= 15, ramp: tilt >= 15 && tilt <= 30, slant: tilt >= 30 && tilt <= 60, wall: tilt >= 60 }); // 旗標不互斥
  // reactions：人遇到每塊板子的物理反應，算法跟 99_website/agents/cell.js 的 boardDerive 逐項相同（畫面上色用；一致性測試見 work/test_react.js）。P＝CONFIG.params。
  function reactions(cells, P) {
    const Lc = P.CELL_SIZE_M, D = Math.PI / 180, out = new Map(), bs = cells.filter(x => x.board).map(x => { const th = x.tilt * D, ph = (x.yaw == null ? 90 : x.yaw) * D, a = Lc * Math.cos(th) + P.BOARD_THICK_M * Math.sin(th), b = P.BOARD_WIDTH_RATIO * Lc, lo = x.z, hi = x.z + Lc * Math.sin(th);
      return { x, lo, hi, top: hi + P.BOARD_THICK_M * Math.cos(th), across: a * Math.abs(Math.cos(ph)) + b * Math.abs(Math.sin(ph)), reach: x.tilt <= P.BOARD_WALK_SLOPE_DEG && lo <= P.BOARD_STEP_UP_M }; });
    const at = new Map(bs.map(o => [kk(o.x.r, o.x.c), o]));
    for (let ch = true; ch;) { ch = false; for (const o of bs) { if (o.reach || o.x.tilt > P.BOARD_WALK_SLOPE_DEG) continue;
      for (let a = -1; a <= 1 && !o.reach; a++) for (let b = -1; b <= 1 && !o.reach; b++) { const n = (a || b) && at.get(kk(o.x.r + a, o.x.c + b)); if (n && n.reach && [n.lo, n.hi].some(u => [o.lo, o.hi].some(v => Math.abs(u - v) <= P.BOARD_STEP_UP_M))) { o.reach = true; ch = true; } } } }
    for (const o of bs) { const walk = o.reach, under = o.x.z >= P.BOARD_HEAD_Z_M, step = o.top <= P.BOARD_STEP_UP_M, blocks = !(walk || under || step), squeeze = Lc - o.across >= P.BODY_SQUEEZE_W_M;
      out.set(kk(o.x.r, o.x.c), { walk, under, step, blocks, squeeze, visit: blocks && o.x.tilt === 0 && o.x.z <= P.BOARD_REACH_Z_M /* 2026-11-20：只有平放才算被使用 */ }); }
    return out;
  }
  const boardParams = x => x.board ? { tilt: x.tilt, z: x.z } : isTableZone(x.zone) ? { tilt: 0, z: 0.8 } : null; // 原本的桌面格＝水平、桌高
  // ---- 板子要「真的碰到」另一塊板子（2026-11-19 使用者：板子六面至少一面真實被另一塊板子碰觸，不是只在隔壁格） ----
  // 一塊板子＝一個長 1（沿傾斜方向）、寬 0.9（沿 c）、厚 0.1 的薄盒，低邊離地 z、傾角 tilt、繞格中心轉 yaw（跟畫面 drawPlate 同一套幾何）。
  // 兩塊板子的最短距離 ≤ TOUCH_EPS 算碰到（0.11＝格子兩邊各留的 0.05 邊距＋一點容差：同高度相鄰格的板子算接上）。判斷用 OBB 分離軸（15 軸）。
  const TOUCH_EPS = 0.11, dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  function plateBox(x) { // x: 有 r、c、tilt、z、yaw 的板子（原本的桌面格＝水平、桌高、yaw 0）
    const p = boardParams(x), tl = p.tilt * Math.PI / 180, yw = (x.yaw || 0) * Math.PI / 180, cy = Math.cos(yw), sy = Math.sin(yw), rot = v => [v[0] * cy + v[1] * sy, -v[0] * sy + v[1] * cy, v[2]];
    return { c: [x.r + .5, x.c + .5, p.z + Math.sin(tl) / 2], ax: [rot([Math.cos(tl), 0, Math.sin(tl)]), rot([0, 1, 0]), rot([-Math.sin(tl), 0, Math.cos(tl)])], h: [0.5, 0.45, 0.05] };
  }
  function touches(a, b) {
    const d = [b.c[0] - a.c[0], b.c[1] - a.c[1], b.c[2] - a.c[2]], axes = [...a.ax, ...b.ax];
    for (const p of a.ax) for (const q of b.ax) axes.push(cross3(p, q));
    for (const v of axes) { const n = Math.hypot(v[0], v[1], v[2]); if (n < 1e-6) continue; const u = [v[0] / n, v[1] / n, v[2] / n];
      let ra = 0, rb = 0; for (let i = 0; i < 3; i++) { ra += a.h[i] * Math.abs(dot3(u, a.ax[i])); rb += b.h[i] * Math.abs(dot3(u, b.ax[i])); }
      if (Math.abs(dot3(u, d)) > ra + rb + TOUCH_EPS) return false; }
    return true;
  }
  const boardsTouch = list => { // list：同攤的板子（含原本的桌面格）。每一塊「新加的板子」至少碰到另一塊
    const ps = list.map(x => ({ x, b: plateBox(x) })); return ps.filter(p => p.x.board).every(p => ps.some(q => q !== p && touches(p.b, q.b)));
  };
  // ---- 政策（強化學習，2026-11-19 使用者：傾角、朝向、高度都走同一個原則——達到獎勵才去做；一開始都貼地）----
  // 每個攤位一份政策 pol：對「傾角、朝向、動作種類」各一組偏好值，抽的機率＝softmax(偏好值)。高度沒有自己的機率：板子一律貼地放（z=0），要離地是一個動作「改高度」，跟放／調／拆並列、平均起步，由攤販自己試、靠獎勵決定。
  // 獎勵來了就更新（learn）：這一輪這攤的停留比自己上次高＝1，沒高＝0；用 REINFORCE（獎勵減基準線）把「這次抽到的選項」往獎勵方向推。
  // 動作：place 放一塊（貼地）、tune 換傾角與朝向（高度不變）、remove 拆一塊、lift 把現有一塊改高度（改成貼地，或接在別塊板子的低邊／高邊）、up 往上接（放一塊新板子，低邊接在旁邊板子的低邊／高邊——階梯、走道就是這樣一塊塊往上蓋出來的）；tune／remove／lift 要有板子才抽得到，up 要旁邊有板子。
  // ponytail: 板子位置在候選格裡均勻抽（位置空間太大、還沒有可學的訊號）；改高度時接哪個高度也是均勻抽；被「要碰到別塊」濾掉的抽樣會讓實際機率略偏離政策，REINFORCE 當近似。
  const KINDS = ['place', 'tune', 'remove', 'lift', 'up'], KIND_NAMES = ['放', '調', '拆', '改高度', '往上接'], POL_KEYS = ['tilt', 'yaw', 'kind'];
  const newPolicy = () => ({ tilt: TILTS.map(() => 0), yaw: YAWS.map(() => 0), kind: KINDS.map(() => 0), base: 0.5, n: 0 }); // 全部平均起步，沒有人為挑的機率
  const softmax = p => { const m = Math.max(...p), e = p.map(v => Math.exp(v - m)), s = e.reduce((a, b) => a + b, 0); return e.map(v => v / s); };
  const draw = (p, R, ok) => { const q = softmax(p).map((v, i) => !ok || ok[i] ? v : 0), s = q.reduce((a, b) => a + b, 0); let u = R() * s, i = 0; for (; i < q.length - 1 && u >= q[i]; i++) u -= q[i]; return i; };
  const policyProbs = pol => Object.fromEntries(POL_KEYS.map(k => [k, softmax(pol[k]).map(v => +v.toFixed(4))])); // 給畫面看「學到什麼」
  function learn(pol, moves, reward, lr = 0.3) { // reward 0／1；moves：這一輪這攤提的動作（每個動作帶 ch＝抽到的選項）
    const adv = reward - pol.base; pol.base += 0.1 * (reward - pol.base); pol.n++;
    for (const m of moves) if (m.ch) for (const k of POL_KEYS) { if (m.ch[k] == null) continue; const q = softmax(pol[k]); pol[k] = pol[k].map((v, a) => Math.max(-4, Math.min(4, v + lr * adv * ((a === m.ch[k] ? 1 : 0) - q[a])))); }
  }
  // 跨攤位也一樣要碰到（2026-11-19 使用者）：板子要碰的「另一塊板子」可以是別攤的（含別攤原本的桌面格），一樣用 touches 的真實幾何判斷；任何攤改動（放／調／拆／改高度）都不能讓任何攤的板子失去接觸。
  const isPlate = x => x.board || isTableZone(x.zone);
  const orphanCodes = cells => { // 全市場：有哪些攤有「沒碰到任何板子」的板子（合併各攤改法後檢查用）
    const ps = cells.filter(isPlate).map(x => ({ x, b: plateBox(x) })), bad = new Set();
    for (const p of ps) if (p.x.board && !ps.some(q => q !== p && touches(p.b, q.b))) bad.add(p.x.code);
    return bad;
  };
  // pool（極限實驗「沿用前面攤位找到的好形狀」）：[{ tilt, z, yaw }]，抽傾角與朝向時有一半機率從裡面抽，省掉重複試錯。
  const zsFor = (list, cur) => [0, ...new Set(list.flatMap(y => { const p = boardParams(y); return p ? [p.z, p.z + Math.sin(p.tilt * Math.PI / 180)] : []; }).map(v => +v.toFixed(2)))].filter((v, k, a) => a.indexOf(v) === k && Math.abs(v - (cur || 0)) > 0.01 && (cur != null || v > 0)); // 這塊板子的低邊可以改成的高度：貼地或接在別塊板子上（不含目前高度）
  function randomFree(L, ERA, code, R, pool, pol) {
    const P = pol || newPolicy(); // 沒給政策（測試、校準）就用起點政策
    const W = world(ERA), occ = new Set(L.cells.map(x => kk(x.r, x.c))), Bd = ERA.bounds, openCell = (r, c) => { const k = W.kind(r, c); return k === 'aisle' || k === 'stall'; };
    const mine = L.cells.filter(x => x.code === code), food = mine[0].cat === FOOD, [fr, fc] = vec(L.fronts[code] || 'S'), nTable = tablesOf(L, code).length, pick = a => a[Math.floor(R() * a.length)];
    const seatAt = (r, c) => { const sr = r + fr, sc = c + fc; return occ.has(kk(sr, sc)) || !openCell(sr, sc) || W.nearEntry(sr, sc) ? null : [sr, sc]; };
    const anchors = mine.filter(x => x.board || isTableZone(x.zone)); // 板子（含原本的桌面格）
    const mods = mine.filter(x => !(x.zone === EQUIP || (x.zone === WORK && !x.board) || x.zone === MIXED) && boardParams(x)), boards = mods.filter(x => x.board);
    const others = L.cells.filter(x => x.code !== code && isPlate(x)), oB = others.map(o => ({ x: o, b: plateBox(o) })); // 別攤的板子（含原桌面格）也是可以碰的對象
    const okWith = (ownList, oldX) => { // ownList：這攤動完之後的板子；每塊新板子要碰到（本攤或別攤的）另一塊，而且原本碰著 oldX 的別攤板子動完後仍要碰到別塊
      const ps = ownList.map(x => ({ x, b: plateBox(x) })), all = [...ps, ...oB];
      if (!ps.filter(p => p.x.board).every(p => all.some(q => q !== p && touches(p.b, q.b)))) return false;
      if (oldX) { const ob = plateBox(oldX); for (const o of oB) if (o.x.board && touches(o.b, ob) && !all.some(q => q !== o && touches(o.b, q.b))) return false; }
      return true;
    };
    const sample = () => { const pp = pool && pool.length && R() < 0.5 ? pick(pool) : null, ti = pp ? TILTS.indexOf(pp.tilt) : draw(P.tilt, R), yi = pp ? YAWS.indexOf(pp.yaw) : draw(P.yaw, R); return { tilt: TILTS[ti], yaw: YAWS[yi], ch: { tilt: ti, yaw: yi } }; };
    const kind = draw(P.kind, R, [true, mods.length > 0, mods.length > 0, boards.length > 0, anchors.length > 0]);
    if (kind > 0 && kind < 4) {
      const x = pick(kind === 3 ? boards : mods), isTbl = isTableZone(x.zone), sp = food ? mine.find(y => y.zone === SEAT && y.r === x.r + fr && y.c === x.c + fc) : null;
      if (kind === 2) return (isTbl && nTable <= 1) || !okWith(anchors.filter(y => y !== x), x) ? null : { type: 'remove', code, r: x.r, c: x.c, free: true, seat: isTbl && sp ? [sp.r, sp.c] : null, ch: { kind } }; // 拆掉後剩下的板子仍要相連
      if (kind === 3) { const zs = zsFor([...anchors.filter(y => y !== x), ...others.filter(o => Math.abs(o.r - x.r) <= 2 && Math.abs(o.c - x.c) <= 2)], x.z); if (!zs.length) return null; const z = pick(zs); if (!okWith(anchors.map(y => y === x ? { ...y, z } : y), x)) return null; return { type: 'tune', code, r: x.r, c: x.c, tilt: x.tilt, z, yaw: x.yaw || 0, seat: null, ch: { kind } }; } // 改高度：傾角朝向不動
      const { tilt, yaw, ch } = sample(), z = boardParams(x).z, ro = roleOf(tilt, z); if (isTbl && !ro.table && nTable <= 1) return null; // 至少留一張桌面
      if (!okWith(anchors.map(y => y === x ? { ...y, board: true, tilt, z, yaw } : y), x)) return null; // 調整後，每塊板子仍要碰到另一塊
      let seat = null; if (food) { if (ro.table && !isTbl) { seat = seatAt(x.r, x.c); if (!seat) return null; } else if (!ro.table && isTbl && sp) seat = [sp.r, sp.c]; }
      return { type: 'tune', code, r: x.r, c: x.c, tilt, z, yaw, seat, ch: { ...ch, kind } };
    }
    const cand = []; // 候選位置：離現有板子一格內的空格（含斜角；板子轉 yaw 後會伸進斜角），真正有沒有碰到由 boardsTouch 判斷；沒有板子可接時才不限
    for (let r = Bd.minRow; r <= Bd.maxRow; r++) for (let c = Bd.minCol; c <= Bd.maxCol; c++) if (!occ.has(kk(r, c)) && openCell(r, c) && !W.nearEntry(r, c) && (!anchors.length || anchors.some(y => Math.abs(y.r - r) <= 1 && Math.abs(y.c - c) <= 1))) cand.push([r, c]); // 只在自己的板子旁邊找位置（碰到別攤的板子照樣算接觸，但不會被別攤的板子吸過去，免得全擠在同一處）
    for (let k = 0; k < 150 && cand.length; k++) {
      const [r, c] = pick(cand), { tilt, yaw, ch } = sample(); let z = 0, seat = null; // 新板子預設貼地；up 才接在旁邊板子的邊上
      if (kind === 4) { const hs = zsFor([...anchors, ...others].filter(y => Math.abs(y.r - r) <= 1 && Math.abs(y.c - c) <= 1)); if (!hs.length) continue; z = pick(hs); }
      const ro = roleOf(tilt, z);
      if (anchors.length && !okWith([...anchors, { r, c, board: true, tilt, z, yaw }])) continue;
      if (ro.table && food) { seat = seatAt(r, c); if (!seat) continue; }
      return { type: 'place', code, r, c, tilt, z, yaw, seat, ch: { ...ch, kind } };
    }
    return null;
  }
  function apply(L, m) {
    const N = clone(L), mine = L.cells.find(x => x.code === m.code), tz = L.cells.some(x => x.code === m.code && x.zone === MIXED) ? MIXED : TABLE;
    const mk = (r, c, zone, extra) => ({ r, c, code: m.code, cat: mine.cat, zone, ...extra });
    const board = (r, c, tilt, z, yaw) => { const ro = roleOf(tilt, z); return mk(r, c, ro.table ? tz : WORK, { board: true, tilt, z, yaw, over: ro.over }); }; // over＝高架（低邊 ≥ OVER_Z，不擋路、headless 略過）；可走板留在格子裡，由模擬器的 Board Passage Rule 放行
    if (m.type === 'place') { N.cells.push(board(m.r, m.c, m.tilt, m.z, m.yaw)); if (m.seat) N.cells.push(mk(m.seat[0], m.seat[1], SEAT)); }
    else if (m.type === 'tune') {
      const i = N.cells.findIndex(y => y.r === m.r && y.c === m.c); N.cells[i] = board(m.r, m.c, m.tilt, m.z, m.yaw);
      if (m.seat) { if (roleOf(m.tilt, m.z).table) N.cells.push(mk(m.seat[0], m.seat[1], SEAT)); else N.cells = N.cells.filter(y => !(y.r === m.seat[0] && y.c === m.seat[1] && y.zone === SEAT)); }
    }
    else if (m.type === 'add') { N.cells.push({ r: m.r, c: m.c, code: m.code, cat: mine.cat, zone: tz }); if (m.seat) N.cells.push({ r: m.seat[0], c: m.seat[1], code: m.code, cat: mine.cat, zone: SEAT }); }
    else N.cells = N.cells.filter(x => !((x.r === m.r && x.c === m.c) || (m.seat && x.r === m.seat[0] && x.c === m.seat[1])));
    return N;
  }
  const describe = m => m.ms && m.ms.length > 1 ? m.ms.map(describe).join('＋') : m.type === 'place' ? `${m.code} 放板子（${m.r},${m.c}）傾角${m.tilt}°、高${+m.z.toFixed(2)}、朝向${m.yaw}°` : m.type === 'tune' ? `${m.code} 調整板子（${m.r},${m.c}）傾角${m.tilt}°、高${+m.z.toFixed(2)}、朝向${m.yaw}°` : m.type === 'remove' && m.free ? `${m.code} 拆一塊（${m.r},${m.c}）` : `${m.code} ${m.type === 'add' ? '加一格桌面' : '減一格桌面'}（${m.r},${m.c}）`;
  return { reactions, plateBox, touches, boardsTouch, orphanCodes, tablesLinked, minimal, original, moves, randomFree, apply, connected, hash, clone, tablesOf, seatsOf, describe, world, kk, TABLE, MIXED, WORK, SEAT, EQUIP, FOOD, TILTS, YAWS, OVER_Z, roleOf, newPolicy, learn, policyProbs, KIND_NAMES, ROLES: ['table', 'ramp', 'slant', 'wall'] };
});
