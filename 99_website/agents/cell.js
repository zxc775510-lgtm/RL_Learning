// Cell（市場網格空間本身）— 規則來源：agent_setting.md「Space Class」
// Space Class 存成陣列：World.cellSpace，跟 World.cellType 一樣是 ROWS×COLS 的 2D 陣列，每一格自己的 Attribute。
// 已實作的 Attribute：aisleFacing（臨走道／入口的邊數比例）、occupiedBy／reachableShops／chairPlaced（含 passCost，椅子見下方）、passable、crowdLevel（每格人數，上限 CROWD_CAP）、slowedSec、visibility。orientation 尚未實作，見文件 Known Implementation Gaps。
// 只描述這格自己的狀態；行人與店鋪怎麼反應不寫在這裡——放在各 agent 的 Rule（例如 Vendor (New) 的 Site Fertility Weighting，website/agents/vendorNew.js）。店鋪彙總（shop.aisleFacing／shop.visibility）也在 vendorNew.js。
const Cell = {
  // 建立 World.cellSpace：只有攤位格（stallslot）算 aisleFacing，其餘格型（牆/設施/入口/走道）用不到，存 null。
  buildCellSpace() {
    const space = [];
    for (let r = 0; r < World.ROWS; r++) {
      const row = [];
      for (let c = 0; c < World.COLS; c++) {
        const t = World.cellType[r][c];
        // 走道格：occupiedBy＝QGIS 標定「有資格擺椅的店鋪 code」（ERA_DATA，固定不變、不改寫）；椅子是否擺出見下方 chairCount。
        // 攤位格：zone 是桌面／設備 → noEnter（行人不進）；zone 是用餐區 → 自己這家店的椅子（occupiedBy＝[自己的 code]，用餐區一律有椅子）。
        if (t === 'stallslot') {
          const zone = (ERA_DATA.cells[r + ',' + c] || {})['zone_' + this.SIM_ERA];
          const e = ERA_DATA.cells[r + ',' + c] || {}; // 板子的三個量（Board Attribute）：沒有 board_tilt 的格＝沒有板子，板子規則不介入；沒有 yaw 時當 90°（橫擋，最保守）
          row.push(Object.assign({ aisleFacing: this.aisleFacingOf(r, c), noEnter: this.NO_ENTER_ZONES.includes(zone),
            occupiedBy: zone === '用餐區' ? [World.stallAtRC[r + ',' + c].code] : [] },
            e.board_tilt != null ? { boardTilt: e.board_tilt, boardHeight: e.board_z, boardYaw: e.board_yaw ?? 90 } : null));
        } else if (t === 'aisle') row.push({ occupiedBy: (ERA_DATA.cells[r + ',' + c] || {}).occupiedBy || [] });
        else row.push(World.isCommonArea(r, c) ? { occupiedBy: [] } : null); // 共融區（可通行的設施格）：像走道格但沒有椅子
      }
      space.push(row);
    }
    this.boardDerive(space);
    return space;
  },

  // ===== 板子（Board Attribute／Board Rules，agent_setting.md）：只讀三個量 boardTilt θ（度）、boardHeight z（m，低邊離地）、boardYaw φ（度，相對走道方向），其餘全由物理推得：沒有類別、沒有傾角門檻、沒有特例 =====
  // 板子本體：長 CELL_SIZE_M、寬 BOARD_WIDTH_RATIO×CELL_SIZE_M、厚 BOARD_THICK_M，低邊離地 z、沿列方向傾斜 θ、繞格中心轉 φ。人對它的每一種反應都是「板子的尺寸」對「人的尺寸」（頭頂、眼高、肩寬、跨步、坡度、手搆得到的高度）的比較。
  boardDims(cs) { // 低邊／高邊離地高度、最高處、橫過走道方向在格內佔的寬度（走道沿 c 方向，φ＝0 順著走道）
    const P = CONFIG.params, L = P.CELL_SIZE_M, th = cs.boardTilt * Math.PI / 180, ph = cs.boardYaw * Math.PI / 180, a = L * Math.cos(th) + P.BOARD_THICK_M * Math.sin(th), b = P.BOARD_WIDTH_RATIO * L;
    return { lo: cs.boardHeight, hi: cs.boardHeight + L * Math.sin(th), top: cs.boardHeight + L * Math.sin(th) + P.BOARD_THICK_M * Math.cos(th), across: a * Math.abs(Math.cos(ph)) + b * Math.abs(Math.sin(ph)) };
  },
  boardBlocks(cs) { return !!cs.blocks; }, // 擋路：走不上去、頭上過不去、也跨不過去（開局由 boardDerive 算好）
  boardSqueeze(cs) { return !!cs.squeeze; }, // 格子扣掉板子橫過走道佔的寬度，剩下 ≥ 肩寬 → 可側身
  boardPassable(cs) { return !cs.blocks || !!cs.squeeze; },
  boardSeeP(cs) { return cs.seeP == null ? 1 : cs.seeP; }, // 視線穿過這塊板的機率（Board Sight Rule）
  boardVisitable(r, c) { const row = World.cellSpace[r], cs = row && row[c]; return !!cs && cs.boardTilt != null && !!cs.blocks && cs.boardTilt === 0 && cs.boardHeight <= CONFIG.params.BOARD_REACH_Z_M; }, // 平放、擋住人、而且手搆得到：站在旁邊就能逛（Board Visit Rule；2026-11-20 直立板不算被使用）
  boardClarity(cs, a, b) { // 站在「板子往 (a,b) 格的反方向」看這塊板：板面法線與視線夾角的餘弦（越正對越看得清楚；(0,0)＝正上方）
    const P = CONFIG.params, th = cs.boardTilt * Math.PI / 180, ph = cs.boardYaw * Math.PI / 180, L = P.CELL_SIZE_M;
    const nr = -Math.sin(th) * Math.cos(ph), nc = Math.sin(th) * Math.sin(ph), nz = Math.cos(th), vr = a * L, vc = b * L, vz = cs.boardHeight + L * Math.sin(th) / 2 - P.BOARD_EYE_Z_M;
    return Math.abs(nr * vr + nc * vc + nz * vz) / (Math.hypot(vr, vc, vz) || 1);
  },
  probBoards: false, // 場上有穿過機率介於 0～1 的板子 → 視線結果要依顧客（Customer.isVisible 的 who）
  // 開局算一次的衍生值：窄通道人數上限 cap、側身格 cap、貼近成本 nearCost（整數：走場用 Dial 分桶）。板子位置固定，換配置要重建。
  boardDerive(space) {
    const P = CONFIG.params, K = P.BOARD_NEAR_COST_K, L = P.CELL_SIZE_M; this.probBoards = false;
    const bs = []; for (let r = 0; r < space.length; r++) for (let c = 0; c < space[r].length; c++) { const cs = space[r][c]; if (cs && cs.boardTilt != null) { cs.dim = this.boardDims(cs); bs.push([r, c, cs]); } }
    // 走得上去：板面坡度 ≤ BOARD_WALK_SLOPE_DEG，而且低邊接得上地面（離地 ≤ BOARD_STEP_UP_M），或接在八鄰格內另一塊走得上去的板子的端點（高度差 ≤ BOARD_STEP_UP_M）——一塊塊往上接就是樓梯／走道
    for (const [, , cs] of bs) cs.reach = cs.boardTilt <= P.BOARD_WALK_SLOPE_DEG && cs.dim.lo <= P.BOARD_STEP_UP_M;
    for (let ch = true; ch;) { ch = false; for (const [r, c, cs] of bs) { if (cs.reach || cs.boardTilt > P.BOARD_WALK_SLOPE_DEG) continue;
      for (let a = -1; a <= 1 && !cs.reach; a++) for (let b = -1; b <= 1 && !cs.reach; b++) { const o = space[r + a] && space[r + a][c + b]; if (!(a || b) || !o || o.boardTilt == null || !o.reach) continue;
        if ([o.dim.lo, o.dim.hi].some(x => [cs.dim.lo, cs.dim.hi].some(y => Math.abs(x - y) <= P.BOARD_STEP_UP_M))) { cs.reach = true; ch = true; } } } }
    for (const [, , cs] of bs) { const d = cs.dim, vz = P.BOARD_EYE_Z_M - P.BOARD_SIGHT_TARGET_Z_M;
      cs.blocks = !(cs.reach || cs.boardHeight >= P.BOARD_HEAD_Z_M || d.top <= P.BOARD_STEP_UP_M); // 走上去、從頭上穿過、跨過去，都不擋
      cs.squeeze = L - d.across >= P.BODY_SQUEEZE_W_M;
      cs.seeP = 1 - Math.max(0, Math.min(d.top, P.BOARD_EYE_Z_M) - Math.max(d.lo, P.BOARD_SIGHT_TARGET_Z_M)) / vz * Math.min(1, d.across / L); } // 視線帶（眼高到店面商品高度）被板子擋住的比例 × 橫過視線的寬度比例
    const blk = (r, c) => { const cs = space[r] && space[r][c]; return !!cs && cs.boardTilt != null && cs.blocks; };
    for (let r = 0; r < space.length; r++) for (let c = 0; c < space[r].length; c++) {
      const cs = space[r][c]; if (!cs) continue;
      if (cs.boardTilt != null) { const p = this.boardSeeP(cs); if (p > 0 && p < 1) this.probBoards = true; if (cs.blocks && cs.squeeze) cs.cap = 1; continue; }
      if (P.CELL_SIZE_M < P.BODY_PAIR_W_M && ((blk(r, c - 1) && blk(r, c + 1)) || (blk(r - 1, c) && blk(r + 1, c)))) cs.cap = 1; // 兩側都被擋路板夾住：寬度小於兩人並排
      let n = 0;
      for (const [a, b] of World.DIRS4) if (blk(r + a, c + b)) { const o = space[r + a][c + b]; n = Math.max(n, Math.round(K * (o.boardTilt / 90) * Math.abs(Math.sin(o.boardYaw * Math.PI / 180)))); }
      if (n) cs.nearCost = n;
    }
  },
  overheadOf(shop) { if (shop._over === undefined) shop._over = shop.cells.some(x => { const cs = World.cellSpace[x.row][x.col]; return cs && cs.boardTilt != null && cs.boardHeight >= CONFIG.params.BOARD_HEAD_Z_M; }); return shop._over; }, // 有高過人的板：像招牌，偵測範圍多延伸
  capAt(r, c) { const row = World.cellSpace[r], cs = row && row[c]; return cs && cs.cap ? Math.min(cs.cap, CONFIG.params.CROWD_CAP) : CONFIG.params.CROWD_CAP; },
  nearAt(r, c) { const row = World.cellSpace[r], cs = row && row[c]; return (cs && cs.nearCost) || 0; },
  boardBrowseCut(p, shop) { // 站的格旁邊、這家店可到訪的板子裡「板面最正對視線」的那塊：越正對越看得清楚，瀏覽縮短越少
    const P = CONFIG.params; let best = null;
    for (const [a, b] of [[0, 0], ...World.DIRS4]) { const s = World.stallAtRC[(p.row + a) + ',' + (p.col + b)]; if (s && s.shop === shop && this.boardVisitable(p.row + a, p.col + b)) { const q = this.boardClarity(World.cellSpace[p.row + a][p.col + b], a, b); best = best == null ? q : Math.max(best, q); } }
    return best == null ? 0 : P.BOARD_BROWSE_CUT * (1 - best);
  },

  // Attribute：passable —— 這格本身能不能走（Passable Attribute）：格型可走（World.WALKABLE_TYPES，加共融區設施格 World.commonArea），且不是 noEnter（桌面／設備）。
  // 模擬用 2026 年的 zone；桌面與設備格客人不進去（站在外面的走道／用餐區格服務）。攤位格要不要放行看興趣目標，那是 Customer.passableFor 的事。
  SIM_ERA: '2026',
  NO_ENTER_ZONES: ['桌面空間', '工作桌面混合', '工作設備區'],
  passable(r, c) { const cs = World.cellSpace[r][c]; if (cs && cs.boardTilt != null) return World.passable(r, c) && this.boardPassable(cs); return World.passable(r, c) && !(cs && cs.noEnter); }, // 有板子的格：Board Passage Rule 取代 zone 的 noEnter

  // Visit Rule：這格能「到訪」的店鋪＝站的位置、上下左右相鄰的「桌面格」（zone 在 TABLE_ZONES）所屬店鋪（站在桌子前面；設備區旁、攤位側面與後面不算；沒有桌面格的店退回任何相鄰攤位格），加上擺椅時段內椅子延伸出來的店面（occupiedBy）。
  // 擺椅的店（擺椅時段內、營業、有椅子格）只在自己的椅子格到訪（人要坐在椅子上），不再算站在店面前；其餘店鋪維持站在店面前。
  seatTotal(shop) { return shop.chairCells; }, // 座位數＝標定椅子格
  seated(shop) { return this.chairsOut() && this.isOpenNow(shop) && this.seatTotal(shop) > 0; },
  chairCellsOf(shop) { return shop._chairList || (shop._chairList = World.chairCells.filter(a => World.cellSpace[a.row][a.col].occupiedBy.includes(shop.code))); },
  zoneAt(r, c) { return (ERA_DATA.cells[r + ',' + c] || {})['zone_' + this.SIM_ERA]; },
  isTable(r, c) { const row = World.cellSpace[r], cs = row && row[c]; if (cs && cs.boardTilt != null) return this.boardVisitable(r, c); return CONFIG.params.TABLE_ZONES.includes(this.zoneAt(r, c)); }, // 有板子的格：Board Visit Rule（擋路且傾角小於立起）取代 zone
  // 桌前格：這家店桌面格上下左右相鄰、人站得住（Cell.passable，且不是攤位裡面的工作空間）的格；沒有桌面格的店＝空（退回舊規則）。靜態，算一次。
  frontCells(shop) {
    if (shop._front) return shop._front;
    const m = new Map();
    for (const s of shop.cells) if (this.isTable(s.row, s.col)) for (const [a, b] of World.DIRS4) {
      const r = s.row + a, c = s.col + b;
      if (this.passable(r, c) && this.zoneAt(r, c) !== '工作空間') m.set(r * World.COLS + c, { row: r, col: c });
    }
    return (shop._front = [...m.values()]);
  },
  visitCells(shop) { const f = this.frontCells(shop); return this.seated(shop) ? this.chairCellsOf(shop) : f.length ? f : shop.cells; }, // 走向這家店的終點格（BFS 目標）：擺椅＝椅子格；否則＝桌前格
  reachableShops(r, c) {
    const out = [];
    for (const [dr, dc] of [[0, 0], ...World.DIRS4]) {
      const s = World.stallAtRC[(r + dr) + ',' + (c + dc)];
      if (!s || out.includes(s.shop) || this.seated(s.shop)) continue;
      if (this.frontCells(s.shop).length && !((dr || dc) && this.isTable(r + dr, c + dc) && this.zoneAt(r, c) !== '工作空間')) continue; // 有桌面格的店：要站在桌面格旁邊
      out.push(s.shop);
    }
    const cs = World.cellSpace[r][c];
    if (cs && cs.occupiedBy && this.chairsOut())
      for (const code of cs.occupiedBy) { const sh = World.shopByCode[code]; if (sh && !out.includes(sh)) out.push(sh); }
    return out;
  },

  // 店鋪現在佔的格子＝自己的格子＋擺椅時段內、營業中時延伸出來的椅子格（用餐區）；2D 紅框用。
  extentCells(shop) {
    const cells = shop.cells.map(s => [s.row, s.col]);
    if (!this.chairsOut() || !this.isOpenNow(shop)) return cells;
    for (const a of World.chairCells) {
      if (World.stallAtRC[a.row + ',' + a.col] && World.stallAtRC[a.row + ',' + a.col].shop === shop) continue; // 自己的格子已在清單內
      if (World.cellSpace[a.row][a.col].occupiedBy.includes(shop.code)) cells.push([a.row, a.col]);
    }
    return cells;
  },

  // ===== 椅子（Chair Rule／Chair Placed Attribute，agent_setting.md）：椅子狀態、座位數都是當下算出來，不存 =====
  daySec: 0, // 當天第幾秒（呼叫端 index.html 的 syncCellClock() 設定，見 Chair Rule「daySec 由呼叫端傳入」）
  weekday: 6, // 今天星期幾（0＝週日…6＝週六；呼叫端 syncCellClock() 由模擬日期推算），Open Hours 的公休用
  hourNow() { return this.daySec / 3600; },

  chairsOut() { return this.hourNow() >= CONFIG.params.CHAIR_START_HOUR && this.hourNow() < CONFIG.params.CHAIR_END_HOUR; },
  isOpen(shop) { return !!shop && (shop.state === 'new' || shop.state === 'old'); }, // 「營業」＝new 或 old
  // Open Hours（agent_setting.md「Open Hours」）：營業（isOpen）、今天不是該類型的公休日、且現在落在營業時段 [開, 關) 內；SHOP_HOURS 沒列的類型（倉庫）永遠不營業。
  // 行人的通行、選店、到訪、來客數與椅子都看這個；生存判定仍只看 isOpen。SHOP_HOURS 列：[開, 關, [公休星期]]。
  isOpenNow(shop) { return this.isOpenAt(shop, this.hourNow()); },
  isOpenAt(shop, h) { // h＝一天裡的第幾小時（0~24）
    if (!this.isOpen(shop)) return false;
    const w = CONFIG.params.SHOP_HOURS[this.categoryOf(shop)], close = CONFIG.params.SHOP_CLOSE_OVERRIDE[shop.code] || (w && w[1]); // 個別店鋪收店時間優先於類型預設
    return !!w && h >= w[0] && h < close && !w[2].includes(this.weekday);
  },
  // 店鋪類型＝QGIS category（ERA_DATA 的 category_<SIM_ERA>，同店鋪各格相同），讀第一格、存在 shop.category。
  categoryOf(shop) {
    if (shop.category === undefined) shop.category = (ERA_DATA.cells[shop.cells[0].row + ',' + shop.cells[0].col] || {})['category_' + this.SIM_ERA] || null;
    return shop.category;
  },

  // 這格現在有幾張椅子：擺椅時段內，occupiedBy 裡有營業的店各一張。
  chairCount(r, c) {
    const cs = World.cellSpace[r][c];
    if (!cs || !cs.occupiedBy || !this.chairsOut()) return 0;
    return cs.occupiedBy.filter(code => this.isOpenNow(World.shopByCode[code])).length;
  },
  hasChair(r, c) { return this.chairCount(r, c) > 0; }, // 即 chairPlaced＝擺了椅子，否則完全開放

  // 座位數＝這家店現在擺出的椅子數（一格一張）；時段外或沒營業為 0。chairCells 在 computeStallGroups 數一次。
  seatsOf(shop) { return this.chairsOut() && this.isOpenNow(shop) ? this.seatTotal(shop) : 0; },

  // 這家店現在還有空位（擺椅時段內、營業、沒坐滿）：Chair Seating Rule（坐下）與顧客想吃飯時的目標條件（有空位才算目標）共用。不看用餐時間。
  hasSeat(shop) { return shop.seatsTaken < this.seatsOf(shop); },

  // 停留（slowedSec：走進這格多停；Chair Seating：坐下停 SIT_SEC）。
  // 行人記 p.pause（還要停幾步＝幾秒）、p.sitShop（坐下的店鋪，停完還座位）。Customer.move() 呼叫。
  tickPause(p) { // 停留中 → true（這一步不移動）；停完那一刻還座位
    if (!(p.pause > 0)) return false;
    if (--p.pause === 0) this.release(p);
    return true;
  },
  release(p) { if (p.sitShop) { p.sitShop.seatsTaken--; p.sitShop = null; } }, // 停完或離場都要還座位
  // Blocked Reroute Rule：走向目標時，前面最好的那格被滿格（CROWD_CAP 人）擋住、原地等了 BLOCK_WAIT_SEC 秒 → 把擋路的滿格當牆 BLOCK_AVOID_SEC 秒，重新找路（往回走繞別條路）。預設關。
  noteBlocked(p, field) {
    const P = CONFIG.params, here = Customer.fieldGet(field, p.row, p.col);
    if (here === Infinity) return;
    p.blk = (p.blk || 0) + 1; if (p.blk < P.BLOCK_WAIT_SEC) return;
    p.blk = 0; const ac = p.avoidCells || (p.avoidCells = new Map());
    for (const [a, b] of World.DIRS4) { const r = p.row + a, c = p.col + b; if (this.full(r, c) && Customer.fieldGet(field, r, c) < here) ac.set(r * World.COLS + c, this.simSec + P.BLOCK_AVOID_SEC); }
  },
  // Browse Rule：到訪前先在店面前停 BROWSE_SEC 秒（看商品；擺椅的店走到椅子就坐，不用等）；第一次走到店面前 → 設 pause、回傳 true（這一步不到訪）；停完下一步再來 → 回傳 false，照 Visit Rule 到訪。
  browse(p, shop) {
    if (!RuleSwitch.on('Customer.browseRule') || this.seated(shop) || p.browsed === shop.code) { p.browsed = null; return false; } // 擺椅的店（要坐下）不用等，直接坐
    p.browsed = shop.code; p.pause = Math.max(1, Math.round(CONFIG.params.BROWSE_SEC * (1 - this.boardBrowseCut(p, shop)))); return true; // 板子傾角縮短瀏覽（Board Visit Rule）
  },
  trySit(p, shop) { // Chair Seating Rule：到訪當下有空位 → 坐下；滿座照常算到訪、不坐
    if (!RuleSwitch.on('Customer.chairSeating') || !this.hasSeat(shop)) return;
    // 一格椅子一個人：坐在這家店離自己最近的空椅子格（座位帳由場上坐著的人推得，不另存，重設時不用清）
    const taken = new Set();
    for (const q of Customer.pedestrians) if (q.sitShop) taken.add(q.row * World.COLS + q.col);
    const free = this.chairCellsOf(shop).filter(a => !taken.has(a.row * World.COLS + a.col) && ((a.row === p.row && a.col === p.col) || !this.full(a.row, a.col))); // 傳送過去的椅子格也不能超過每格上限
    if (!free.length) return;
    free.sort((a, b) => Math.abs(a.row - p.row) + Math.abs(a.col - p.col) - Math.abs(b.row - p.row) - Math.abs(b.col - p.col));
    const r0 = p.row, c0 = p.col; p.row = free[0].row; p.col = free[0].col; this.moved(p, r0, c0); // 傳送到椅子後更新格子人數
    shop.seatsTaken++; p.sitShop = shop; p.pause = CONFIG.params.SIT_SEC;
  },

  // Attribute：passCost —— 走進這格的成本，由 chairPlaced 推得（Pass Cost Attribute）：擺椅＝PASS_COST_CHAIR，其餘＝PASS_COST_OPEN。
  // 不可通行格不算成本（passableFor 擋）；bfsFieldFromTargets 用它做加權最短路徑。
  // 擁擠也是成本：這格已有人（走進去會變成 2 人以上、要緩速）＋(PASS_COST_CHAIR−PASS_COST_OPEN)；已滿（CROWD_CAP 人、進不去）加倍；繞出去的路就是對擁擠的吸力。
  crowdExtra(r, c) {
    if (!RuleSwitch.on('Customer.passCostPath')) return 0;
    const n = this.occAt(r, c), P = CONFIG.params, d = P.PASS_COST_CHAIR - P.PASS_COST_OPEN;
    return n >= this.capAt(r, c) ? 2 * d : n >= 1 ? d : 0;
  },
  passCost(r, c) { if (!RuleSwitch.on('Customer.passCostPath')) return CONFIG.params.PASS_COST_OPEN; return (this.hasChair(r, c) ? CONFIG.params.PASS_COST_CHAIR : CONFIG.params.PASS_COST_OPEN) + this.crowdExtra(r, c) + this.nearAt(r, c); }, // nearAt：貼近擋路板（Board Near Cost Rule）

  // Attribute：crowdLevel —— 這格現在有幾個人（顧客，坐著的也算），上限 CROWD_CAP（3）：0～1 人正常、2 人緩速（slowedSec 多停）、滿 CROWD_CAP 人進不去（full）。
  // 每個 microStep 開頭（refreshCrowdLevel）從場上行人重算一次，之後每個人移動／生成／離場都即時更新（moved／arrive／vacate），所以同一步內不會有第 4 個人擠進去。
  occ: new Map(), at: new Map(), // occ：格子 → 人數；at：格子 → 站在那格的行人（診斷記錄擁擠的中心用，見 diagnostic.js）
  refreshCrowdLevel() {
    const m = (this.occ = new Map()), at = (this.at = new Map());
    for (const p of Customer.pedestrians) {
      const k = p.row * World.COLS + p.col; m.set(k, (m.get(k) || 0) + 1); if (at.has(k)) at.get(k).push(p); else at.set(k, [p]);
    }
  },
  occAt(r, c) { return this.occ.get(r * World.COLS + c) || 0; },
  full(r, c) { return this.occAt(r, c) >= this.capAt(r, c); }, // 滿了：不能再進去（Passability Rule）
  arrive(p) { const k = p.row * World.COLS + p.col; this.occ.set(k, (this.occ.get(k) || 0) + 1); (this.at.get(k) || this.at.set(k, []).get(k)).push(p); }, // 生成
  vacate(p, r = p.row, c = p.col) { const k = r * World.COLS + c; this.occ.set(k, Math.max(0, (this.occ.get(k) || 0) - 1)); const l = this.at.get(k), i = l ? l.indexOf(p) : -1; if (i >= 0) l.splice(i, 1); }, // 離場（或離開舊格）
  moved(p, r0, c0) { if (r0 !== p.row || c0 !== p.col) { this.vacate(p, r0, c0); this.arrive(p); } }, // 從 (r0,c0) 換到 p 現在的格

  // Attribute：slowedSec —— 行人走進這格要多停幾秒：這格（含自己）有 2 人以上 → CROWD_SLOW_SEC。椅子造成的放慢在 approachSlowSec（Chair Approach Rule），不在這裡。
  slowedSec(r, c) {
    const row = World.cellSpace[r], cs = row && row[c], sq = cs && cs.boardTilt != null && this.boardBlocks(cs) ? CONFIG.params.BOARD_SQUEEZE_SLOW_SEC : 0; // 側身通過擋路板多停
    return Math.max(sq, RuleSwitch.on('Customer.crowdSlow') && this.occAt(r, c) >= 2 ? CONFIG.params.CROWD_SLOW_SEC : 0);
  },

  // Attribute：visibility —— 有多少走道格看得到這格（阻擋判定同 Customer.computeVisible），除以全圖攤位格最大值（0~1），存在 cellSpace 攤位格。
  // 位置固定，開局算一次（computeStallGroups）；ponytail: 掃全部走道格×攤位格，地圖或視距放大後要改成射線外擴。
  buildVisibility() {
    const R = Customer.visionRadius, counts = World.stalls.map(s => {
      let n = 0;
      for (const a of World.aisleCells) {
        if (Math.abs(a.row - s.row) > R || Math.abs(a.col - s.col) > R) continue;
        if (Customer.computeVisible(a.row, a.col, s.row, s.col)) n++;
      }
      return n;
    });
    const max = Math.max(1, ...counts);
    World.stalls.forEach((s, i) => { World.cellSpace[s.row][s.col].visibility = counts[i] / max; });
  },
  // Attribute：chairNearby —— 這格周圍 CHAIR_NEAR_RADIUS 格內（含自己）有椅子格的店鋪 code。幾何固定，第一次查時算並快取；
  // 這些店現在真的有擺椅（擺椅時段、營業）在查詢時才濾，見 approachSlowSec。CHAIR_NEAR_RADIUS 是假設值（無數據）。
  nearCache: new Map(),
  chairNearbyShops(r, c) {
    const k = r * World.COLS + c;
    let l = this.nearCache.get(k);
    if (!l) {
      const R = CONFIG.params.CHAIR_NEAR_RADIUS, set = new Set();
      for (const a of World.chairCells) {
        if (Math.abs(a.row - r) > R || Math.abs(a.col - c) > R) continue;
        World.cellSpace[a.row][a.col].occupiedBy.forEach(code => set.add(code));
      }
      l = [...set]; this.nearCache.set(k, l);
    }
    return l;
  },
  // Chair Approach Rule（Human）：走進「近椅子」的格子，若現在擺椅的店不是自己的目標店（ownCode）→ 多停 CHAIR_APPROACH_SLOW_SEC 秒。
  // 目標店自己的椅子是目的地，不放慢。CHAIR_APPROACH_SLOW_SEC 是假設值（無數據）。
  approachSlowSec(r, c, ownCode) {
    if (!this.chairsOut() || !RuleSwitch.on('Customer.chairApproach')) return 0;
    return this.chairNearbyShops(r, c).some(code => code !== ownCode && this.isOpenNow(World.shopByCode[code])) ? CONFIG.params.CHAIR_APPROACH_SLOW_SEC : 0;
  },
  // Pass Cost Rule 用：這格對「要去 ownCode 這家店」的人多出的椅子成本——別家現在擺了椅子 → PASS_COST_CHAIR − PASS_COST_OPEN；
  // 目標店自己的椅子不算。跟 BFS 同一把尺（passCost）。
  chairExtra(r, c, ownCode) {
    const P = CONFIG.params, cs = World.cellSpace[r][c];
    const chair = RuleSwitch.on('Customer.passCostPath') && this.chairsOut() && cs && cs.occupiedBy && cs.occupiedBy.some(code => code !== ownCode && this.isOpenNow(World.shopByCode[code]));
    return (chair ? P.PASS_COST_CHAIR - P.PASS_COST_OPEN : 0) + this.crowdExtra(r, c); // 加擁擠成本，見 crowdExtra
  },

  // Pass Cost Rule：走場值平手的候選格裡，優先選 passCost 最低的（有椅子的格子成本高，自然被避開）。
  preferLowCost(cands) {
    const m = Math.min(...cands.map(([r, c]) => this.passCost(r, c)));
    return cands.filter(([r, c]) => this.passCost(r, c) === m);
  },

  // 站在已不可通行的格子上（店打烊後還在店裡，四周都是牆）→ 移到最近的可通行格，免得被困死；坐著的人不動。
  ejectIfTrapped(p) {
    if (p.sitShop || Customer.passableFor(p.row, p.col)) return;
    const seen = new Set([this.zk(p.row, p.col)]); let layer = [[p.row, p.col]];
    for (let d = 0; d < 8 && layer.length; d++) {
      const nxt = [];
      for (const [r, c] of layer) for (const [a, b] of World.DIRS4) {
        const y = r + a, x = c + b, k = this.zk(y, x);
        if (y < 0 || x < 0 || y >= World.ROWS || x >= World.COLS || seen.has(k)) continue;
        seen.add(k); if (Customer.passableFor(y, x)) { const r0 = p.row, c0 = p.col; p.row = y; p.col = x; this.moved(p, r0, c0); return; }
        nxt.push([y, x]);
      }
      layer = nxt;
    }
  },

  // ===== 緩衝（Usage 只剩一般／緩衝）=====
  // 緩衝由營業狀態推得（isBuffer，不存）：所屬店鋪現在沒營業（時段外、公休日、Vendor (Idle)），且不是倉庫、不是鐵門封閉攤位格。只用在畫面疊色。
  simSec: 0,
  zk(r, c) { return r * World.COLS + c; },
  structureOf(shop) { if (shop.structure === undefined) shop.structure = (ERA_DATA.cells[shop.cells[0].row + ',' + shop.cells[0].col] || {})['structure_' + this.SIM_ERA] || null; return shop.structure; },
  isBuffer(r, c) {
    const s = World.stallAtRC[r + ',' + c]; if (!s) return false;
    const sh = s.shop, cat = this.categoryOf(sh);
    return !this.isOpenNow(sh) && !!cat && cat !== '倉庫' && this.structureOf(sh) !== '鐵門封閉';
  },

  // 被拒絕（Chair Seating Rule）：熟食店滿座。每位行人對每家店只算一次，只記診斷，不改行為（改去別家或離場照原規則）。
  rejectFull(p, shop) {
    if (Diag.paused || !this.chairsOut()) return;
    const rej = p.rej || (p.rej = new Set()); if (rej.has(shop.code)) return; rej.add(shop.code);
    Diag.reject(p, shop);
  },

  // Attribute：aisleFacing —— 這一格 4 個方向裡，臨走道／入口的邊數比例（0~1）。
  // 是格子位置固定的物理量，只跟這一格在地圖上的位置有關，不隨哪個攤販進駐而改變。
  aisleFacingOf(r, c) {
    let aisleEdges = 0;
    for (const [dr, dc] of World.DIRS4) {
      const nr = r + dr, nc = c + dc;
      const t = (nr >= 0 && nr < World.ROWS && nc >= 0 && nc < World.COLS) ? World.cellType[nr][nc] : 'wall';
      if (t === 'aisle' || t === 'entry') aisleEdges++;
    }
    return aisleEdges / 4;
  }
};
