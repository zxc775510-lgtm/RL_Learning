// headless --fast2（接在 --fast 之後）：再把三處最耗時的重複計算做成快取，輸出必須跟 --fast 逐項相同；99_website 的程式碼與瀏覽器版不動。
// 剖析（2026-11-18，起點配置、一小時含暖機）：bfsField 23%、fogDist 13%、inDetectBox 10%、passCost 10%、inCone 6%、detectShops／shopsSeen 約 9%。
// 1) shopsSeen：偵測範圍內「店面前方視線通」的店，只跟（位置、朝向、有沒有擺椅、依顧客分組的板子穿透）有關，同一次模擬內地圖不變 → 每個組合只算一次。
// 2) passCost：靜態部分（擺椅？＋貼近成本）同一分鐘內每格不變 → 記起來；擁擠的部分（crowdExtra）仍每次現算，加總順序與原本相同（浮點結果一樣）。
// 3) fogDist：把「所有迷霧格」的目標清單（地圖固定）只建一次，每次只濾掉這位顧客已看過的，順序、內容跟原本相同；之後照舊跑 bfsField。
// 不做：把距離場在顧客之間共用——距離場的成本含擁擠、這位顧客走過的格、被擋住的格，每位顧客都不同，共用會改變結果。
// 驗證：同種子，--fast 與 --fast2 的 SHOPS 與 CROWD 輸出必須逐項相同（見 20261118/fast2_check.txt）。
(function () {
  const C = Customer;

  // 1) shopsSeen 記憶
  const seen0 = C.shopsSeen.bind(C), seenMemo = new Map();
  C.shopsSeen = function (q) {
    const G = Cell.probBoards ? CONFIG.params.BOARD_SEE_GROUPS : 1, key = ((((q.row * World.COLS + q.col) * 3 + (q.faceDr + 1)) * 3 + (q.faceDc + 1)) * 2 + (Cell.chairsOut() ? 1 : 0)) * G + (Cell.probBoards ? q.id % G : 0);
    let s = seenMemo.get(key);
    if (!s) { s = seen0(q); seenMemo.set(key, s); }
    return s;
  };

  // 2) passCost 的靜態部分
  let base = null, near = null, stamp = -1;
  const passCost0 = Cell.passCost.bind(Cell);
  Cell.passCost = function (r, c) {
    if (!RuleSwitch.on('Customer.passCostPath')) return CONFIG.params.PASS_COST_OPEN;
    const N = World.ROWS * World.COLS, st = tick * 1e7 + Math.floor(Cell.simSec / 60);
    if (!base) { base = new Float64Array(N); near = new Float64Array(N); }
    if (stamp !== st) { base.fill(NaN); stamp = st; }
    const i = r * World.COLS + c; let b = base[i];
    if (b !== b) { b = base[i] = this.hasChair(r, c) ? CONFIG.params.PASS_COST_CHAIR : CONFIG.params.PASS_COST_OPEN; near[i] = this.nearAt(r, c); }
    return b + this.crowdExtra(r, c) + near[i]; // 順序同原本：(椅子或空地) ＋ 擁擠 ＋ 貼近
  };

  // 3) fogDist 的目標清單
  let fogSet = null, fogTargets = null;
  C.fogDist = function (p) {
    const fs = this.fogCells();
    if (fs !== fogSet) { fogSet = fs; fogTargets = []; for (const k of fs) fogTargets.push({ k, row: Math.floor(k / World.COLS), col: k % World.COLS }); }
    const targets = []; for (const t of fogTargets) if (!p.fog.has(t.k)) targets.push(t);
    return targets.length ? this.bfsField(targets, null, false, null, true) : null;
  };
  // --fast 的 moveCustomer 裡綁的是舊 fogDist，這裡重寫成用新的（其餘同 fast_patch.js）
  C.moveCustomer = function (p) {
    let wander = null;
    if (RuleSwitch.on('Customer.wanderRule')) {
      let unseen = false; for (const k of C.fogCells()) if (!p.fog.has(k)) { unseen = true; break; }
      if (unseen) { let m; wander = { get: k => (m || (m = C.fogDist(p))).get(k) }; }
    }
    return C.moveStep(p, { straight: true, fog: true, shops: true, wander, walked: true, cost: true });
  };
})();
