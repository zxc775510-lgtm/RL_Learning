// headless --fast：只在 Node 的 vm 裡把模擬器最耗時的三個函式換成「結果完全相同、但算得快」的版本；99_website 的程式碼與瀏覽器版不動。
// 剖析（2026-11-16，一小時尖峰）：Customer.passableFor 31%、Customer.bfsField 28%、Customer.fogDist 8%（每位顧客每一步都跑一次全市場 BFS）。
// 1) passableFor：同一分鐘內（營業狀態不變）每格結果不變 → 記在 Uint8Array。
// 2) bfsField：同一個演算法（Dial 分桶、同樣的展開順序與停止條件），距離改存 Int32Array（用「世代」避免每次清空），桶內放整數格號、不再配置 [r,c] 小陣列；最後輸出同樣的 Map。
// 3) Customer.moveCustomer：wander 走場（fogDist）只有「沒有目標店的鄰格」才會用到 → 延後到真的 .get 時才算；沒有沒看過的格時仍是 null（同原本）。算的時機仍在 moveStep 裡、行人還沒動，所以結果相同。
// 驗證：同種子，原版與 --fast 的每家店到訪次數必須逐項相同（見 20261116/stall_rl/work/fast_check.txt）。
(function () {
  const R = Customer, T = Customer;

  let memo = null, memoStamp = -1;
  R.passableFor = T.passableFor = function (r, c) {
    const ROWS = World.ROWS, COLS = World.COLS;
    if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return false;
    const st = tick * 1e7 + Math.floor(Cell.simSec / 60);
    if (!memo) memo = new Uint8Array(ROWS * COLS); else if (memoStamp !== st) memo.fill(0);
    memoStamp = st;
    const i = r * COLS + c, v = memo[i];
    if (v) return v === 1;
    let ok = Cell.passable(r, c);
    if (ok) { const s = World.stallAtRC[r + ',' + c]; ok = !s || Cell.isOpenNow(s.shop); }
    memo[i] = ok ? 1 : 2;
    return ok;
  };

  const sc = { dist: null, gen: null, G: 0 };
  R.bfsField = function (targets, stopAt, noChair, avoid, noStall = false) {
    const COLS = World.COLS, N = World.ROWS * COLS, openCost = CONFIG.params.PASS_COST_OPEN, DIRS = World.DIRS4, cellType = World.cellType;
    if (!sc.dist) { sc.dist = new Int32Array(N); sc.gen = new Uint32Array(N); }
    this.passableFor(-1, -1); // 先讓 memo 戳記更新（同一個 BFS 內時間不變）
    const pm = memo, dist = sc.dist, gen = sc.gen, G = ++sc.G, visited = [], buckets = [[]];
    for (const s of targets) { const k = s.row * COLS + s.col; if (gen[k] !== G) { gen[k] = G; dist[k] = 0; visited.push(k); buckets[0].push(k); } }
    const sk = stopAt ? stopAt.row * COLS + stopAt.col : -1, av = stopAt && stopAt.avoidCells, simSec = Cell.simSec;
    for (let d = 0; d < buckets.length; d++) {
      const b = buckets[d]; let found = false;
      if (b) for (let i = 0; i < b.length; i++) {
        const k = b[i]; if (dist[k] !== d) continue; // 已被更便宜的路徑更新過
        const r = (k / COLS) | 0, c = k - r * COLS, nd = d + (noChair ? openCost : Cell.passCost(r, c));
        for (let j = 0; j < 4; j++) {
          const nr = r + DIRS[j][0], nc = c + DIRS[j][1];
          if (nr < 0 || nc < 0 || nr >= World.ROWS || nc >= COLS) continue;
          const pv = pm[nr * COLS + nc]; if (pv === 2 || (pv === 0 && !this.passableFor(nr, nc))) continue;
          if (noStall && cellType[nr][nc] === 'stallslot') continue;
          const nk = nr * COLS + nc;
          if (avoid && avoid.walked.has(nk) && !(nr === avoid.row && nc === avoid.col)) continue;
          if (av && (av.get(nk) || 0) > simSec) continue; // Blocked Reroute：被擋住的那幾格暫時當牆
          if (gen[nk] === G) { if (dist[nk] <= nd) continue; } else { gen[nk] = G; visited.push(nk); }
          dist[nk] = nd;
          (buckets[nd] || (buckets[nd] = [])).push(nk);
        }
        if (k === sk) found = true;
      }
      if (found) break;
    }
    const out = new Map(); for (let i = 0; i < visited.length; i++) out.set(visited[i], dist[visited[i]]);
    return out;
  };

  const fogDist0 = T.fogDist.bind(T); // 提早停（只算到 p 為止）試過：輸出會跟原版不同（承接成本 >2 時鄰格值還沒定案），已放棄
  T.moveCustomer = function (p) {
    let wander = null;
    if (RuleSwitch.on('Customer.wanderRule')) {
      let unseen = false; for (const k of R.fogCells()) if (!p.fog.has(k)) { unseen = true; break; }
      if (unseen) { let m; wander = { get: k => (m || (m = fogDist0(p))).get(k) }; }
    }
    return R.moveStep(p, { straight: true, fog: true, shops: true, wander, walked: true, cost: true });
  };
})();
