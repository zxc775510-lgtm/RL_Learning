// 由 99_config/build_config.js 產生，不要手改；改 99_config/**/*.json 後重跑腳本。
const CONFIG = {
 "params": {
  "WALK_NEAR": 1,
  "TIME_BANDS": [
   [
    0,
    24,
    1
   ]
  ],
  "WALK_SPEED_MPS": 1,
  "CELL_SIZE_M": 1,
  "HEAT_NORM_STEPS": 360,
  "CHAIR_APPROACH_SLOW_SEC": 1,
  "TABLE_ZONES": [
   "桌面空間",
   "工作桌面混合"
  ],
  "BROWSE_SEC": 30,
  "BLOCK_WAIT_SEC": 3,
  "BLOCK_AVOID_SEC": 30,
  "SIT_SEC": 3600,
  "FOG_TH_MIN": 0.05,
  "FOG_TH_MAX": 1,
  "ARRAY_PROB": {},
  "SHOP_TYPE_WEIGHT": {
   "肉類": 1,
   "魚類": 1,
   "雜貨類": 1,
   "熟食類": 1,
   "無人商店": 1,
   "閱讀": 1,
   "衣服類": 1
  },
  "WEIGHT_CELLS": 10,
  "CUSTOMER_MACRO_SAMPLE_N": 64,
  "VISION_RADIUS_CELLS": 100,
  "CONE_DEG": 60,
  "NEAR_SEE_CELLS": 2,
  "FRONT_EXT_CELLS": 2,
  "BOARD_HEAD_Z_M": 2,
  "BOARD_STEP_UP_M": 0.18,
  "BOARD_WALK_SLOPE_DEG": 35,
  "BOARD_WIDTH_RATIO": 0.9,
  "BOARD_THICK_M": 0.1,
  "BODY_SQUEEZE_W_M": 0.55,
  "BODY_PAIR_W_M": 1.1,
  "BOARD_SQUEEZE_SLOW_SEC": 1,
  "BOARD_NEAR_COST_K": 2,
  "BOARD_EYE_Z_M": 1.64,
  "BOARD_SIGHT_TARGET_Z_M": 1,
  "BOARD_HEAD_EXT_ROWS": 1,
  "BOARD_SEE_GROUPS": 8,
  "BOARD_REACH_Z_M": 1.8,
  "BOARD_BROWSE_CUT": 0.5,
  "SHOP_HOURS": {
   "肉類": [
    8,
    14,
    [
     1
    ]
   ],
   "魚類": [
    8,
    14,
    [
     1
    ]
   ],
   "雜貨類": [
    8,
    14,
    [
     1
    ]
   ],
   "熟食類": [
    16,
    20,
    [
     1
    ]
   ],
   "無人商店": [
    0,
    24,
    []
   ],
   "閱讀": [
    0,
    24,
    []
   ],
   "衣服類": [
    11,
    20,
    [
     1
    ]
   ]
  },
  "SHOP_CLOSE_OVERRIDE": {
   "N": 21,
   "W": 21,
   "A": 21,
   "B": 21,
   "M": 22,
   "K": 22,
   "T": 22
  },
  "CHAIR_START_HOUR": 16,
  "CHAIR_END_HOUR": 22,
  "REOPEN_PROB": 0.09,
  "HEAT_WINDOW": 2,
  "HEAT_HOT_THRESHOLD": 2,
  "COLD_STREAK_THRESHOLD": 3,
  "BASE_IDLE": 0.09,
  "HOT_IDLE": 0.04,
  "COLD_IDLE": 0.25,
  "MOVE_MIN_TICK": 1,
  "MOVE_MAX_TICK": 4,
  "FERTILITY_BASE_WEIGHT": 1,
  "AISLE_FACING_SCALE": 3,
  "VIS_FERTILITY_MID": 1,
  "VIS_FERTILITY_HIGH": 2,
  "PASS_COST_OPEN": 1,
  "PASS_COST_CHAIR": 2,
  "CHAIR_NEAR_RADIUS": 2,
  "CROWD_CAP": 3,
  "CROWD_SLOW_SEC": 1,
  "VIS_LOW": 0.2,
  "VIS_HIGH": 0.4,
  "GREEN_CHAIN_MIN_STALLS": 2,
  "TREE_LINK_CELLS": 6,
  "TREE_DOT_THRESHOLD": 0,
  "TREE_IDLE_MERGE": 0.35,
  "TREE_RED_BLOCK_CELLS": 2.5,
  "TREE_BLUE_CLUSTER_CELLS": 2.5,
  "TREE_BLUE_TO_GREEN_CELLS": 2
 },
 "classes": {
  "Customer": {
   "id": "Customer",
   "label": "顧客：在市場走動找攤位的人；探索多寡（離開閾值 fogThreshold、array 長度）決定逛多久",
   "attributes": {
    "interestTarget": {
     "desc": "顧客想逛的攤位：現在營業中（Vendor.openHours）的店鋪，類型還在 array 裡、這趟沒到訪過（以店鋪 code 計）；熟食類的還要有空位",
     "status": "implemented"
    },
    "walked": {
     "desc": "這趟走過的格子（程式存在 p.walked）：踩過的格子，加上旁邊 WALK_NEAR 格內（晚 2 步才標，不擋住眼前與正前方）；每趟重設",
     "status": "implemented",
     "impl": "agents/customer.js#trackWalk"
    },
    "array": {
     "desc": "這趟還沒逛的店鋪類型（不重複），生成時決定（程式存在 p.array）：從生成當下營業的店鋪類型中隨機抽 1 到全部項（Customer.arrayRandom 預設開；關閉時為全部營業類型）；到訪一家就劃掉該類型",
     "status": "implemented",
     "impl": "agents/customer.js#makeArray | agents/customer.js#spawnExpected"
    },
    "fog": {
     "desc": "戰爭迷霧（程式存在 p.fog）：這趟看到的走道／入口／共融區格（站的格＋視野內看得到的格，看到就算，不分遠近）；每趟重設。迷霧比例＝看到的格數 ÷ 從入口走得到的走道＋入口＋共融區格數（約 446 格）",
     "status": "implemented",
     "impl": "agents/customer.js#fogSee | agents/customer.js#fogCells | agents/customer.js#fogRatio"
    },
    "fogThreshold": {
     "desc": "這位顧客的離開閾值＝探索多寡（程式存在 p.fogTh）：生成時在 FOG_TH_MIN～FOG_TH_MAX 間均勻隨機；迷霧比例達到它就離開，越高留得越久",
     "status": "implemented",
     "impl": "agents/customer.js#fogInit"
    }
   },
   "rules": {
    "walkedAvoid": {
     "desc": "不走走過的路：離場的最短路（BFS）先排除 walked 的格子（自己站的格除外），排除後走不到才退回原本的最短路；找店的走法另有「走過」一項（moveStep）",
     "params": {
      "WALK_NEAR": {
       "value": 1,
       "unit": "cell",
       "note": "走過的格子旁邊幾格內也算走過（8 鄰），讓 2 格寬走道的回程不走相鄰一排；可調"
      }
     },
     "reads": [
      "Customer.walked"
     ],
     "phase": "移動",
     "impl": "agents/customer.js#trackWalk | agents/customer.js#bfsFieldFromTargets | agents/customer.js#leaveStep",
     "status": "implemented",
     "toggle": true,
     "toggleGroup": "移動"
    },
    "passableFor": {
     "desc": "決定哪些格子能走：Cell.passable 為假（牆、設施、noEnter 攤位格、其餘格型）不可通行；通過後，攤位格還要所屬店鋪現在營業中（興趣目標），否則視同牆；滿了（Cell.crowdLevel ≥ CROWD_CAP）的格子不能再進入（選下一步時跳過、路徑成本加倍；選不到就原地等；走向目標時不往比現在這格更遠的格走，前面進不去就原地等、不被擠到市場外）；站在已不可通行的格子上（店打烊後還在店裡）→ 移到最近的可通行格（Cell.ejectIfTrapped），免得被困死",
     "reads": [
      "Cell.passable",
      "Customer.interestTarget",
      "Vendor.openHours",
      "Cell.crowdLevel",
      "Customer.boardPassage"
     ],
     "phase": "移動",
     "impl": "agents/customer.js#passableFor",
     "status": "implemented"
    },
    "spawnExpected": {
     "desc": "顧客從入口格均勻隨機生成；數量照時間波段倍率（0 休市、<1 離峰、1 基準、>1 尖峰）；基準來客量（現在營業店數、事件倍率、trafficMult）是全域人口設定；沒有同時在場人數上限，見 simulator_setting.md，規則不讀",
     "params": {
      "TIME_BANDS": {
       "value": [
        [
         0,
         24,
         1
        ]
       ],
       "unit": "[起, 終) 小時、倍率",
       "note": "預設全天 1：一天內人流的高低由現在營業的店數決定，這條只放營業窗口內的額外形狀；設計假設非實測，自訂值，可覆寫"
      }
     },
     "reads": [
      "Vendor.openHours"
     ],
     "phase": "進入",
     "impl": "agents/customer.js#spawnExpected | index.html#timeBandMult",
     "status": "implemented"
    },
    "movementSpeed": {
     "desc": "每步走 1 格＝1 秒（1 m ÷ 1 m/s）；走進格子後停 Cell.slowedSec 秒；椅子不擋路；時間系統見 simulator_setting.md",
     "params": {
      "WALK_SPEED_MPS": {
       "value": 1,
       "unit": "m/s",
       "note": "Gehl 設計步速"
      },
      "CELL_SIZE_M": {
       "value": 1,
       "unit": "m",
       "note": "研究範圍網格 1 格 = 1 m"
      },
      "HEAT_NORM_STEPS": {
       "value": 360,
       "unit": "步",
       "note": "宏觀取樣的軌跡熱度換回舊量級用的基準步數（舊離場步數）；離場改成迷霧後行人實際步數不同，Vendor 人氣門檻要重新校準；自訂值，可覆寫"
      }
     },
     "reads": [
      "Cell.slowedSec"
     ],
     "phase": "移動",
     "impl": "agents/cell.js#slowedSec | agents/cell.js#tickPause | agents/customer.js#move",
     "status": "implemented"
    },
    "chairApproach": {
     "desc": "接近椅子時放慢：走進「近椅子」的格子（Cell.chairNearby，含椅子格本身），若擺椅的店不是自己的目標店，多停 CHAIR_APPROACH_SLOW_SEC 秒；目標店自己的椅子是目的地，不放慢",
     "params": {
      "CHAIR_APPROACH_SLOW_SEC": {
       "value": 1,
       "unit": "sec",
       "note": "【假設值，無數據支持】接近椅子的行人是否放慢、放慢多久，沒有觀測資料"
      }
     },
     "reads": [
      "Cell.chairNearby",
      "Customer.interestTarget"
     ],
     "phase": "移動",
     "impl": "agents/cell.js#approachSlowSec | agents/customer.js#step",
     "status": "implemented",
     "toggle": true,
     "toggleGroup": "移動"
    },
    "exitStep": {
     "desc": "逛完不閒晃：站在攤位格且沒有下個目標 → 多來源 BFS（起點＝全走道格）走最近走道出去",
     "phase": "離開",
     "impl": "agents/customer.js#exitStep | agents/customer.js#bfsFieldToAisle",
     "status": "implemented"
    },
    "visitRule": {
     "desc": "站在桌子前面就算到訪（擺椅的店要站在自己的椅子格）：所在格 Cell.reachableShops（上下左右相鄰有該店桌面格，TABLE_ZONES）內、是興趣目標（現在營業、類型在 array 裡、這趟沒到訪；熟食類要有空位）的店鋪 → 到訪（visited 加入、array 劃掉該類型），隨即走 chairSeating；一步最多一家；沒有桌面格的店退回任何相鄰攤位格",
     "reads": [
      "Cell.reachableShops",
      "shop.state",
      "Customer.interestTarget",
      "Customer.boardVisit"
     ],
     "writes": [
      "Customer.array"
     ],
     "phase": "停留",
     "impl": "agents/customer.js#step",
     "status": "implemented",
     "params": {
      "TABLE_ZONES": {
       "value": [
        "桌面空間",
        "工作桌面混合"
       ],
       "unit": "zone 名稱清單",
       "note": "【使用者定】算「桌子」的攤位格 zone（ERA_DATA zone_2026）；站在這些格上下左右相鄰的格才算到訪；工作設備區、工作空間、用餐區不算"
      }
     }
    },
    "browseRule": {
     "desc": "到訪店鋪前先在店面前停 BROWSE_SEC 秒（看商品）：第一次走到店面前（擺椅的店＝自己的椅子格）→ 這一步不到訪、原地停；停完下一步才照 Visit Rule 到訪；擺椅的店（要坐下，Cell.seated）不經過這一步，走到椅子直接坐；離場的人沒有這一步",
     "params": {
      "BROWSE_SEC": {
       "value": 30,
       "unit": "秒",
       "note": "【使用者定】30 秒：到訪前站在桌前看商品的時間；坐下停留是另一回事（Chair Seating Rule，SIT_SEC）"
      }
     },
     "toggle": true,
     "reads": [
      "Cell.reachableShops",
      "Customer.interestTarget"
     ],
     "phase": "停留",
     "impl": "agents/cell.js#browse",
     "status": "implemented",
     "toggleGroup": "移動"
    },
    "passCostPath": {
     "desc": "選路取成本小的（成本含擁擠：已有人的格子較貴、滿格更貴，繞出去的路就是對擁擠的吸力）：moveStep 的目標項與路徑成本都用 Cell.passCost 加總的走場；有椅子的格子成本高，自然被避開",
     "reads": [
      "Cell.chairPlaced",
      "Customer.bfsFieldFromTargets",
      "Customer.boardNearCost"
     ],
     "phase": "移動",
     "impl": "agents/cell.js#passCost | agents/cell.js#crowdExtra | agents/cell.js#preferLowCost | agents/customer.js#bfsFieldFromTargets | agents/customer.js#moveStep | agents/customer.js#bestStepByDist | agents/customer.js#bestStepByField",
     "status": "implemented",
     "toggle": true,
     "toggleGroup": "移動"
    },
    "blockedReroute": {
     "desc": "走向目標（離場）時，前面最好的那一格被滿格（Cell.crowdLevel ≥ CROWD_CAP）擋住、原地等了 BLOCK_WAIT_SEC 秒 → 把擋路的滿格當牆 BLOCK_AVOID_SEC 秒、重新找路；與路徑成本（Customer.passCostPath，事先把擁擠算進成本）不同：這條是「碰到擋住才改道」；目前沒有程式呼叫（離場尚未接）",
     "params": {
      "BLOCK_WAIT_SEC": {
       "value": 3,
       "unit": "秒",
       "note": "【假設值，無數據】被擋住多久才改道"
      },
      "BLOCK_AVOID_SEC": {
       "value": 30,
       "unit": "秒",
       "note": "【假設值，無數據】擋路的格子當牆多久（之後恢復，人可能已散開）"
      }
     },
     "toggle": true,
     "reads": [
      "Cell.crowdLevel",
      "Customer.moveStep"
     ],
     "phase": "移動",
     "impl": "agents/cell.js#noteBlocked",
     "status": "planned",
     "toggleGroup": "移動"
    },
    "chairSeating": {
     "desc": "到訪熟食店就坐下：到訪當下，該店有擺椅且 seatsTaken < 座位數 → 坐在這家店離自己最近的空椅子格（一格一人），停 SIT_SEC 秒（seatsTaken +1，停完 −1）；否則不坐；array 都含熟食類，所以到訪熟食店就會坐；滿座＝被拒絕（只記診斷，行為照原本：改去別家或離場）",
     "params": {
      "SIT_SEC": {
       "value": 3600,
       "unit": "sec",
       "note": "60 分鐘；自訂值，可覆寫"
      }
     },
     "reads": [
      "Cell.occupiedBy",
      "Vendor.seatsTaken"
     ],
     "writes": [
      "Vendor.seatsTaken"
     ],
     "phase": "停留",
     "impl": "agents/cell.js#trySit | agents/cell.js#hasSeat | agents/cell.js#release | agents/customer.js#move",
     "status": "implemented",
     "toggle": true,
     "toggleGroup": "移動"
    },
    "fogLeave": {
     "desc": "迷霧離開：迷霧比例（看到的走道格比例，Customer.fog）≥ 自己的閾值（Customer.fogThreshold）就離開；與 arrayLeave 先到的離開",
     "toggle": true,
     "params": {
      "FOG_TH_MIN": {
       "value": 0.05,
       "unit": "比例（0~1）",
       "note": "【假設值，無數據】離開閾值下限；閾值每位行人在 FOG_TH_MIN～FOG_TH_MAX 間均勻隨機；沒有實測，結果應以不同範圍並列比較"
      },
      "FOG_TH_MAX": {
       "value": 1,
       "unit": "比例（0~1）",
       "note": "【假設值，無數據】離開閾值上限；1＝看完全部走道格才走"
      }
     },
     "reads": [
      "Customer.fog",
      "Customer.fogThreshold"
     ],
     "phase": "離開",
     "impl": "agents/customer.js#wantsLeave | agents/customer.js#fogSee | agents/customer.js#fogCells | agents/customer.js#fogInit",
     "status": "implemented",
     "toggleGroup": "離開"
    },
    "arrayLeave": {
     "desc": "array 離開：array 走完（每個店鋪類型都到訪過一家）就離開；與 fogLeave 先到的離開。兩條都被關掉時退回只認 array",
     "toggle": true,
     "reads": [
      "Customer.array"
     ],
     "phase": "離開",
     "impl": "agents/customer.js#wantsLeave",
     "status": "implemented",
     "toggleGroup": "離開"
    },
    "arrayRandom": {
     "desc": "array 隨機（選項，預設開）：開啟時 array 從生成當下營業的類型中隨機抽 1 到全部項（不重複）；關閉時為全部營業類型。ARRAY_PROB 指定了機率的類型（例如肉類 0.3）改成「每人以這個機率把它放進 array」，其餘類型照均勻隨機抽（指定類型進了 array 時抽 0 到全部項，沒進時至少抽 1 項）；抽哪些類型依店種權重（SHOP_TYPE_WEIGHT）加權",
     "toggle": true,
     "writes": [
      "Customer.array"
     ],
     "phase": "進入",
     "impl": "agents/customer.js#makeArray",
     "status": "implemented",
     "toggleGroup": "進入",
     "requires": [
      "Customer.arrayLeave"
     ],
     "params": {
      "ARRAY_PROB": {
       "value": {},
       "unit": "類型 → 機率（0~1）",
       "note": "預設空（所有類型均勻隨機抽）；指定後該類型被營業時，每位顧客以這個機率把它放進 array；用來設定「對某類店有興趣的人占多少」；實驗用，可覆寫"
      }
     }
    },
    "crowdSlow": {
     "desc": "擁擠拖慢：走進有 2 人以上（含自己）的格子多停 CROWD_SLOW_SEC 秒；滿格進不去（見 Customer.passableFor）",
     "toggle": true,
     "reads": [
      "Cell.crowdLevel"
     ],
     "phase": "停留",
     "impl": "agents/cell.js#slowedSec",
     "status": "implemented",
     "toggleGroup": "移動"
    },
    "moveStep": {
     "desc": "走一步：四個可通行鄰格各算分數，走最高的。找店時：分數＝（店面得分＋沒看過的格數）－（走過＋路徑成本），單位都是步（1 格＝1 步）；店面得分＝目標店的權重×WEIGHT_CELLS（目標店＝權重減到店成本最高的那家，沒有＝0），路徑成本＝走到目標的成本（目標店；沒有就是最近沒看過的格；都沒有只有走進這格）。離場只有目標項（－走到最近入口的路徑成本）；各項是一個力（吸力或斥力），診斷逐項記錄",
     "params": {
      "SHOP_TYPE_WEIGHT": {
       "value": {
        "肉類": 1,
        "魚類": 1,
        "雜貨類": 1,
        "熟食類": 1,
        "無人商店": 1,
        "閱讀": 1,
        "衣服類": 1
       },
       "unit": "權重（整數，1 ＝ WEIGHT_CELLS 步）",
       "note": "【假設值，無數據】每種店的店面權重：想去這種店有多想（店面得分、被抽進 array 的相對機率）；店面得分＝權重×WEIGHT_CELLS；預設全部 1（所有店一樣），想讓某類店更吸引人就調成 2、3、4；可覆寫"
      },
      "WEIGHT_CELLS": {
       "value": 10,
       "unit": "步／權重",
       "note": "店面權重 1 值幾步（＝幾格）。量測（2026-11-03，一天 06～22 時、種子 1）：店與迷霧衝突時，迷霧比店的方向多看到的格數，一半 ≤3、75% ≤9、90% ≤20、95% ≤34；取 10 使權重 1 到 4 約對應店贏過迷霧 7 成到 9.6 成（粗估）；可覆寫"
      }
     },
     "reads": [
      "Customer.fog",
      "Customer.walked",
      "Customer.array",
      "Customer.shopDetect",
      "Customer.coneVision",
      "Customer.passCostPath",
      "Cell.chairPlaced"
     ],
     "writes": [
      "Customer.destShop"
     ],
     "phase": "移動",
     "impl": "agents/customer.js#moveStep | agents/customer.js#bestStepByField | agents/customer.js#moveCustomer | agents/customer.js#shopField | agents/customer.js#fogDist",
     "status": "implemented"
    },
    "move": {
     "desc": "走路：該離開（doneRule）就走向最近入口（只有目標項）；站在攤位格就 exitStep；否則用 Customer.moveStep 的各項分數（店面得分、沒看過的格數、走過、路徑成本）走最高的鄰格",
     "ref": "99_spec/isovist_algorithm.md#touristStep",
     "params": {
      "CUSTOMER_MACRO_SAMPLE_N": {
       "value": 64,
       "unit": "位",
       "note": "宏觀取樣人數；興趣類型有 7 種，取樣太少會漏掉某些類型"
      }
     },
     "reads": [
      "Customer.interestTarget",
      "Customer.array",
      "Customer.fog",
      "Customer.moveStep",
      "Customer.doneRule"
     ],
     "phase": "移動",
     "impl": "agents/customer.js#move",
     "status": "implemented"
    },
    "doneRule": {
     "desc": "該離開了就離開：array 走完或看到的走道格比例達閾值（Customer.fogLeave、Customer.arrayLeave，先到的離開）→ 走向最近入口離場；array 只剩熟食類、營業的熟食店都沒空位 → 也離場（座位坐滿離場）；array 剩下的類型現在都沒有營業的店（打烊）也離場，不在原地來回走",
     "reads": [
      "Customer.array",
      "Customer.fog",
      "Customer.fogThreshold",
      "Vendor.openHours",
      "Vendor.seatsTaken"
     ],
     "phase": "離開",
     "impl": "agents/customer.js#done | agents/customer.js#leaveStep",
     "status": "implemented"
    },
    "isVisible": {
     "desc": "可見性判定：牆、設施（共融區除外，它是可走的開放空間）、建物、攤位格（終點除外）擋視線；半徑上限 100 格；同一套也用在迷霧、店面前緣",
     "params": {
      "VISION_RADIUS_CELLS": {
       "value": 100,
       "unit": "cell",
       "note": "100 m ÷ 1 m/格（CELL_SIZE_M）"
      }
     },
     "phase": "移動",
     "impl": "agents/customer.js#isVisible",
     "status": "implemented"
    },
    "wanderRule": {
     "desc": "遠距迷霧的開關：沒有目標店時，路徑成本的目標＝走得到的最近一格「還沒看到」的迷霧格；關掉＝沒有這個目標，路徑成本只剩走進這格",
     "reads": [
      "Customer.fog"
     ],
     "phase": "移動",
     "impl": "agents/customer.js#fogDist",
     "status": "implemented",
     "toggle": true,
     "toggleGroup": "尋找",
     "requires": [
      "Customer.fogLeave"
     ]
    },
    "makeArray": {
     "desc": "生成時決定這位顧客的 array（Customer.array）＝從生成當下現在營業中的店鋪類型（不重複）隨機抽 1 到全部項（Customer.arrayRandom 預設開；關閉時為全部）；現在沒有任何店營業時不進場",
     "reads": [
      "Vendor.openHours",
      "Customer.arrayRandom"
     ],
     "writes": [
      "Customer.array"
     ],
     "phase": "進入",
     "impl": "agents/customer.js#makeArray",
     "status": "implemented"
    },
    "coneVision": {
     "desc": "視野錐形：迷霧只記朝向（最後一次移動方向）±CONE_DEG/2 以內的格子；身邊 NEAR_SEE_CELLS 格內（方形）不受錐形限制，仍受視線阻擋；關掉＝全向。找店不用錐形（見 shopDetect）",
     "toggle": true,
     "params": {
      "CONE_DEG": {
       "value": 60,
       "unit": "度",
       "note": "找目標的視野錐形角度，朝向＝最後一次移動方向；原為 360°；使用者指定 60°"
      },
      "NEAR_SEE_CELLS": {
       "value": 2,
       "unit": "cell",
       "note": "【假設值，無數據】身邊幾格內不受錐形限制直接看到（方形，前後左右各幾格）；使用者指定 2"
      }
     },
     "phase": "移動",
     "impl": "agents/customer.js#inCone",
     "status": "implemented",
     "toggleGroup": "尋找"
    },
    "shopDetect": {
     "desc": "店鋪偵測範圍：身邊方形（前後左右各 NEAR_SEE_CELLS 格）＋面向方向再往前拓增 FRONT_EXT_CELLS 列；範圍內的店鋪格，只要它前方的走道格視線通就算看到，整家店偵測到；關掉＝不拓增（只剩身邊方形）",
     "toggle": true,
     "toggleGroup": "尋找",
     "params": {
      "FRONT_EXT_CELLS": {
       "value": 2,
       "unit": "cell",
       "note": "【假設值，無數據】面向時往前多看幾列；使用者指定 2（依影片觀察：人能分辨店面的只有眼前那幾家）"
      }
     },
     "reads": [
      "Customer.isVisible",
      "Cell.chairPlaced"
     ],
     "phase": "移動",
     "impl": "agents/customer.js#inDetectBox | agents/customer.js#seesShopFront",
     "status": "implemented"
    },
    "bfsFieldFromTargets": {
     "desc": "多來源 BFS 場（含 stopAt 早停）；avoidWalked 時先排除 Customer.walked 的格子，走不到才退回不排除（Customer.walkedAvoid）",
     "reads": [
      "Customer.walked"
     ],
     "phase": "移動",
     "impl": "agents/customer.js#bfsFieldFromTargets",
     "status": "implemented"
    },
    "boardPassage": {
     "desc": "板子擋不擋路：板子的尺寸對人的尺寸——走得上去（板面坡度 ≤ BOARD_WALK_SLOPE_DEG 且低邊接得上地面或另一塊走得上去的板）、頭上過得去（離地 ≥ BOARD_HEAD_Z_M）、跨得過去（最高處 ≤ BOARD_STEP_UP_M）都不擋，否則擋；擋路板剩寬 ≥ BODY_SQUEEZE_W_M 可側身（多停、同格 1 人）；走道兩側都被擋路板夾住的格人數上限降為 1；沒有類別、沒有傾角門檻",
     "params": {
      "BOARD_HEAD_Z_M": {
       "value": 2,
       "unit": "m",
       "note": "板子下緣高於它人從下方穿過；ADA 淨高 2030 mm、男性身高第 95 百分位約 1.88 m"
      },
      "BOARD_STEP_UP_M": {
       "value": 0.18,
       "unit": "m",
       "note": "【假設值】人一步能跨上或跨過的最大高度；樓梯級常見高度約 0.18 m（ADA 無階梯高度上限 0.178 m）；使用者 2026-11-19 同意"
      },
      "BOARD_WALK_SLOPE_DEG": {
       "value": 35,
       "unit": "度",
       "note": "【假設值】人能走上去的最大板面坡度；樓梯常見坡度約 30～35°（ADA 坡道只有 4.8°）；使用者 2026-11-19 同意"
      },
      "BOARD_WIDTH_RATIO": {
       "value": 0.9,
       "unit": "比例",
       "note": "板子寬度 ÷ CELL_SIZE_M（板長就是一格）；搜尋端畫面與接觸判斷用同一組尺寸"
      },
      "BOARD_THICK_M": {
       "value": 0.1,
       "unit": "m",
       "note": "板子厚度；搜尋端畫面與接觸判斷用同一組尺寸"
      },
      "BODY_SQUEEZE_W_M": {
       "value": 0.55,
       "unit": "m",
       "note": "側身通過需要的最小寬度＝肩寬第 95 百分位約 0.515 m＋厚外套餘量 0.04 m（CityU 人體計測表）"
      },
      "BODY_PAIR_W_M": {
       "value": 1.1,
       "unit": "m",
       "note": "兩人並排需要的寬度＝2×BODY_SQUEEZE_W_M；通道只剩 1 m 時同格上限降為 1"
      },
      "BOARD_SQUEEZE_SLOW_SEC": {
       "value": 1,
       "unit": "sec",
       "note": "【假設值，無數據】側身通過立起板時進入多停幾秒"
      }
     },
     "reads": [
      "Cell.boardTilt",
      "Cell.boardHeight",
      "Cell.boardYaw",
      "Cell.passable",
      "Cell.crowdLevel"
     ],
     "phase": "移動",
     "status": "implemented",
     "impl": "agents/cell.js#passable | agents/cell.js#boardDims | agents/cell.js#boardBlocks | agents/cell.js#boardSqueeze | agents/cell.js#boardDerive | agents/cell.js#full | agents/cell.js#slowedSec"
    },
    "boardNearCost": {
     "desc": "走進緊貼擋路板的走道格多付成本 BOARD_NEAR_COST_K × (θ/90°) × sin φ：平放的板幾乎不加，立起且橫擋走道的最高；取整數（走場用整數成本）",
     "params": {
      "BOARD_NEAR_COST_K": {
       "value": 2,
       "unit": "步",
       "note": "【假設值，無數據】立起且橫擋（θ＝90°、φ＝90°）時多付的成本；可調"
      }
     },
     "reads": [
      "Cell.boardTilt",
      "Cell.boardYaw",
      "Cell.chairPlaced"
     ],
     "phase": "移動",
     "status": "implemented",
     "impl": "agents/cell.js#boardDerive | agents/cell.js#passCost"
    },
    "boardSight": {
     "desc": "板子擋不擋視線：穿過機率＝1－（視線帶〔店面商品高度 BOARD_SIGHT_TARGET_Z_M 到眼高 BOARD_EYE_Z_M〕被板子擋住的比例）×（板子橫過視線的寬度比例）；高於眼高、低於商品高度、薄薄一片橫在視線上都自然不擋；被擋的店偵測不到；z ≥ BOARD_HEAD_Z_M 的板讓店面偵測範圍往前多延伸",
     "params": {
      "BOARD_EYE_Z_M": {
       "value": 1.64,
       "unit": "m",
       "note": "視線帶的上緣：板子高於它視線不被擋；香港男性眼高第 95 百分位 1640 mm（CityU 人體計測表）"
      },
      "BOARD_SIGHT_TARGET_Z_M": {
       "value": 1,
       "unit": "m",
       "note": "【假設值，無數據】要被看到的店面商品高度（視線帶的下緣）；桌高 0.8 m 加商品"
      },
      "BOARD_HEAD_EXT_ROWS": {
       "value": 1,
       "unit": "列",
       "note": "【假設值，無數據】高處板子（像招牌）讓店面偵測範圍往前多延伸的列數"
      },
      "BOARD_SEE_GROUPS": {
       "value": 8,
       "unit": "組",
       "note": "【實作用，非行為假設】顧客依編號分成幾組，同組顧客看同一塊板的結果相同；組數越多越接近每位顧客各自不同，但視野快取越大、越慢"
      }
     },
     "reads": [
      "Cell.boardTilt",
      "Cell.boardHeight",
      "Cell.boardYaw",
      "Customer.shopDetect"
     ],
     "phase": "移動",
     "status": "implemented",
     "impl": "agents/cell.js#boardSeeP | agents/customer.js#computeVisible | agents/customer.js#isVisible | agents/customer.js#shopsSeen"
    },
    "boardVisit": {
     "desc": "站在相鄰走道格、面對平放（傾角 0）、擋住人而且手搆得到（離地 ≤ BOARD_REACH_Z_M）的板子才算到訪（直立板只擋路，不算被使用）；板面越正對視線（法線與視線夾角餘弦）越看得清楚，瀏覽時間縮短越少；沒有傾角門檻",
     "params": {
      "BOARD_REACH_Z_M": {
       "value": 1.8,
       "unit": "m",
       "note": "【假設值】站著伸手搆得到的高度；板子低邊高於它就搆不到、不能逛"
      },
      "BOARD_BROWSE_CUT": {
       "value": 0.5,
       "unit": "比例",
       "note": "【假設值，無數據】板面完全看不清（側面對著視線）時，瀏覽時間最多縮短的比例；板面越正對縮短越少"
      }
     },
     "reads": [
      "Cell.boardTilt",
      "Cell.boardHeight",
      "Cell.boardYaw",
      "Cell.reachableShops"
     ],
     "phase": "停留",
     "status": "implemented",
     "impl": "agents/cell.js#isTable | agents/cell.js#boardVisitable | agents/cell.js#boardClarity | agents/cell.js#boardBrowseCut | agents/cell.js#browse"
    }
   }
  },
  "Vendor": {
   "id": "Vendor",
   "label": "攤販（New／Old／Idle 的共同基礎）",
   "note": "三者都不連續走路，狀態變化只有離散判定（固定不動／搬遷）。共用屬性：openHours（營業時段）、seatsTaken、店鋪位置特徵（aisleFacing、visibility，取所屬格子平均）；共用 method 只有 chairRule（椅子是否擺出，看時間與店鋪營業狀態）；Vendor (Idle) 依 generation 直接呼叫 Vendor (New) 的 relocationJudgement()。生存判定以店鋪（同 code 分組）為單位，不是個別 grid 格。",
   "attributes": {
    "aisleFacing": {
     "desc": "店鋪臨走道比例＝所屬格子 Cell.aisleFacing 的平均值（shop.aisleFacing），設定時算一次、不隨模擬改變",
     "reads": [
      "Cell.aisleFacing"
     ],
     "impl": "agents/vendorNew.js#shopAisleFacing",
     "status": "implemented"
    },
    "visibility": {
     "desc": "店鋪可見度＝所屬格子 Cell.visibility 的平均值（shop.visibility），設定時算一次、不隨模擬改變",
     "reads": [
      "Cell.visibility"
     ],
     "impl": "agents/vendorNew.js#shopVisibility",
     "status": "implemented"
    },
    "openHours": {
     "desc": "一家店一天內的營業時段，依店鋪 category 查 SHOP_HOURS：營業中（Open Now）＝店鋪狀態 new／old、今天不是該類型的公休日、且時刻落在 [開, 關) 內；時段外或公休日行人不通行、不選、不到訪，也不計入來客數，椅子也不擺；生存判定仍只看狀態；個別店鋪可用 SHOP_CLOSE_OVERRIDE 覆蓋類型的關店時間（部分熟食攤晚收）",
     "params": {
      "SHOP_HOURS": {
       "value": {
        "肉類": [
         8,
         14,
         [
          1
         ]
        ],
        "魚類": [
         8,
         14,
         [
          1
         ]
        ],
        "雜貨類": [
         8,
         14,
         [
          1
         ]
        ],
        "熟食類": [
         16,
         20,
         [
          1
         ]
        ],
        "無人商店": [
         0,
         24,
         []
        ],
        "閱讀": [
         0,
         24,
         []
        ],
        "衣服類": [
         11,
         20,
         [
          1
         ]
        ]
       },
       "unit": "category → [開, 關) 小時、[公休星期]（0＝週日…6＝週六；1＝週一）",
       "note": "沒列的類型（倉庫）不營業；衣服類無資料，暫用 11–20、週一休；老攤時間為推估；熟食「部分加休週二、三」資料不足不做；來源 20261007/deliverable_vendor_hours.md；自訂值，可覆寫；肉、魚、雜貨（老攤）改 08–14：論文明載市場「從早上八點營業到下午兩點」（曾 2020 第一章田野描述），Bella 也寫 08:00–14:00；原 06–13／07–17 是推估（雜貨 07–17 取自青年農園 AY-2，不是老攤）"
      },
      "SHOP_CLOSE_OVERRIDE": {
       "value": {
        "N": 21,
        "W": 21,
        "A": 21,
        "B": 21,
        "M": 22,
        "K": 22,
        "T": 22
       },
       "unit": "shop code → 關店小時（取代類型的關）",
       "note": "【假設值，不是調查資料】鹽埕實況：部分熟食攤晚收，隨機分配 4 家 21 點、3 家 22 點，其餘照類型 20 點；哪幾家真的晚收要實地確認後改這裡"
      }
     },
     "reads": [
      "shop.state",
      "daySec",
      "weekday"
     ],
     "source": "2026-10-07 營業時間表（deliverable_vendor_hours.md）",
     "status": "implemented",
     "impl": "agents/cell.js#isOpenNow"
    },
    "seatsTaken": {
     "variants": [
      {
       "adjective": "有空位",
       "when": "seatsTaken < 座位數",
       "effect": [
        "Customer.moveStep（店面得分） 熟食店有空位才認這家店",
        "Customer.chairSeating 讓人坐下"
       ]
      },
      {
       "adjective": "坐滿",
       "when": "seatsTaken ≥ 座位數",
       "effect": [
        "熟食類的人不再把這家店當目標，改去別家或離場",
        "走到門口的人照常算到訪、不坐"
       ]
      }
     ],
     "source": "2026-10-05 課堂筆記（椅子坐滿用餐時間人會去別家）",
     "status": "implemented",
     "impl": "agents/cell.js#seatsOf | agents/cell.js#trySit",
     "desc": "這家店目前已坐下的人數，起始 0（Customer.chairSeating 增減）；座位數＝擺椅時段內 occupiedBy 含該店 code 的格數（算出、不另存）；跟著位置 code 走"
    }
   },
   "rules": {
    "chairRule": {
     "desc": "決定一家店現在有沒有擺椅：時刻在 [CHAIR_START_HOUR, CHAIR_END_HOUR) 且店鋪現在營業中（Vendor.openHours）→ occupiedBy 裡這家店有一張椅子；否則沒有；不寫入狀態，由時間＋營業狀態＋occupiedBy 當下算出",
     "params": {
      "CHAIR_START_HOUR": {
       "value": 16,
       "unit": "hour",
       "note": "擺椅起點 16:00（對齊熟食店開門），全域一組"
      },
      "CHAIR_END_HOUR": {
       "value": 22,
       "unit": "hour",
       "note": "擺椅終點 22:00（不含）＝熟食攤最晚收店時間；各店實際擺椅仍受自己的營業時段限制（Vendor.openHours 含 SHOP_CLOSE_OVERRIDE），全域一組只是外框"
      }
     },
     "reads": [
      "ERA_DATA.cells[r,c].occupiedBy",
      "daySec",
      "Vendor.openHours"
     ],
     "source": "2026-10-02 課堂筆記（佔據一定跟空間有關，一條一條加反應規則）",
     "status": "implemented",
     "impl": "agents/cell.js#chairsOut | agents/cell.js#isOpenNow | agents/cell.js#chairCount"
    }
   }
  },
  "VendorIdle": {
   "id": "VendorIdle",
   "extends": "Vendor",
   "label": "已關門的攤販（不分新舊），世代屬性繼承自關門前",
   "attributes": {
    "generation": {
     "desc": "關門前的世代（老／新），決定 stepTick() 走哪個分支",
     "variants": [
      {
       "adjective": "曾是老字號",
       "when": "generation == old",
       "effect": [
        "走 VendorOld 的 fixed 規則，完全靜止（目前不會被觸發）"
       ]
      },
      {
       "adjective": "曾是新創",
       "when": "generation == new",
       "effect": [
        "先擲 REOPEN_PROB 重開",
        "沒重開走 VendorNew.relocationJudgement"
       ]
      }
     ],
     "reads": [
      "VendorOld.fixed"
     ],
     "status": "implemented"
    }
   },
   "rules": {
    "reopen": {
     "desc": "已關門的新創店有機會重開：世代＝新 → 每輪擲 REOPEN_PROB 變回 Vendor (New)（狀態歸零）；沒重開才搬遷",
     "params": {
      "REOPEN_PROB": {
       "value": 0.09,
       "unit": "prob/tick",
       "note": "沿用 BASE_IDLE 數字，自訂、可覆寫"
      }
     },
     "dispatchedBy": "generation",
     "reads": [
      "VendorNew.initStall"
     ],
     "impl": "agents/vendorIdle.js#stepTick",
     "status": "implemented"
    }
   }
  },
  "VendorNew": {
   "id": "VendorNew",
   "extends": "Vendor",
   "label": "正常營業中的新創攤位，自己不走路，但會被隨機重新安置",
   "note": "人氣／冷清度記在店鋪（同 code 分組，這次租期），不是攤販身分本身；搬家即歸零重算。",
   "attributes": {
    "popularity": {
     "desc": "人氣＝visitHist 近 HEAT_WINDOW 輪到訪次數之和；記在店鋪（同 code 分組），搬家歸零",
     "params": {
      "HEAT_WINDOW": {
       "value": 2,
       "unit": "tick"
      },
      "HEAT_HOT_THRESHOLD": {
       "value": 2,
       "unit": "人氣",
       "note": "人氣旺門檻"
      }
     },
     "variants": [
      {
       "adjective": "搶手",
       "when": "popularity >= HEAT_HOT_THRESHOLD",
       "effect": [
        "VendorNew.idleJudgement：關門機率降為 HOT_IDLE",
        "VendorNew.relocationJudgement：暫停倒數、留在原地"
       ]
      }
     ],
     "status": "implemented",
     "impl": "agents/vendorNew.js#heatOf | agents/vendorNew.js#updateHeatHistory"
    },
    "coldStreak": {
     "desc": "冷清度＝zeroStreak，連續無到訪的輪數",
     "params": {
      "COLD_STREAK_THRESHOLD": {
       "value": 3,
       "unit": "tick",
       "note": "文件沒留原始數字，自訂、可覆寫"
      }
     },
     "status": "implemented",
     "variants": [
      {
       "adjective": "冷清",
       "when": "coldStreak >= COLD_STREAK_THRESHOLD",
       "effect": [
        "VendorNew.idleJudgement：關門機率升為 COLD_IDLE"
       ]
      }
     ],
     "impl": "agents/vendorNew.js#updateHeatHistory"
    }
   },
   "rules": {
    "idleJudgement": {
     "desc": "關門判定：popularity ≥ HEAT_HOT_THRESHOLD → HOT_IDLE；coldStreak ≥ COLD_STREAK_THRESHOLD → COLD_IDLE；其餘 BASE_IDLE；擲骰命中 → 變 Vendor (Idle)",
     "params": {
      "BASE_IDLE": {
       "value": 0.09,
       "unit": "prob/tick"
      },
      "HOT_IDLE": {
       "value": 0.04,
       "unit": "prob/tick"
      },
      "COLD_IDLE": {
       "value": 0.25,
       "unit": "prob/tick"
      }
     },
     "reads": [
      "VendorNew.popularity",
      "VendorNew.coldStreak"
     ],
     "impl": "agents/vendorNew.js#idleJudgement",
     "status": "implemented"
    },
    "relocationJudgement": {
     "desc": "人氣低的店倒數到零就搬家：popularity ≥ HEAT_HOT_THRESHOLD 暫停倒數；否則 moveTimer−1，≤0 時有空店鋪就依 siteFertility 加權挑一間搬過去，沒有就重設倒數；Vendor (Idle) 世代＝新時也呼叫",
     "params": {
      "MOVE_MIN_TICK": {
       "value": 1,
       "unit": "tick"
      },
      "MOVE_MAX_TICK": {
       "value": 4,
       "unit": "tick",
       "note": "倒數重設值隨機 MOVE_MIN~MOVE_MAX"
      }
     },
     "impl": "agents/vendorNew.js#relocationJudgement",
     "status": "implemented",
     "reads": [
      "VendorNew.popularity"
     ]
    },
    "siteFertility": {
     "desc": "空店鋪的搬遷權重＝行為痕跡（格子 customerTrailHeat 總和）＋ aisleFacing×AISLE_FACING_SCALE ＋ 可見度加成（隱蔽 0／一般 MID／顯眼 HIGH，固定值）＋底線權重",
     "params": {
      "FERTILITY_BASE_WEIGHT": {
       "value": 1,
       "unit": "weight",
       "note": "底線權重"
      },
      "AISLE_FACING_SCALE": {
       "value": 3,
       "unit": "weight/aisleFacing",
       "note": "aisleFacing(0~1)換算倍率，自訂、可覆寫"
      },
      "VIS_FERTILITY_MID": {
       "value": 1,
       "unit": "weight",
       "note": "可見度一般；自訂值，可覆寫"
      },
      "VIS_FERTILITY_HIGH": {
       "value": 2,
       "unit": "weight",
       "note": "可見度顯眼；隱蔽為 0；自訂值，可覆寫"
      }
     },
     "reads": [
      "Vendor.aisleFacing",
      "Vendor.visibility"
     ],
     "impl": "agents/vendorNew.js#visFertility | agents/vendorNew.js#shopFertility | agents/vendorNew.js#pickFertileBlank",
     "status": "implemented"
    },
    "stepTick": {
     "desc": "逐輪：更新人氣／冷清度 → idleJudgement → relocationJudgement；倉庫類不參與（不營業、沒有客人，不做生存判定）",
     "impl": "agents/vendorNew.js#stepTick",
     "status": "implemented"
    },
    "initStall": {
     "desc": "moveTimer／visitHist／zeroStreak 歸零",
     "writes": [
      "VendorNew.popularity",
      "VendorNew.coldStreak"
     ],
     "impl": "agents/vendorNew.js#initStall",
     "status": "implemented"
    }
   }
  },
  "VendorOld": {
   "id": "VendorOld",
   "extends": "Vendor",
   "label": "正常營業中的老攤商，位置永久固定",
   "attributes": {},
   "rules": {
    "fixed": {
     "desc": "永不關門、永不搬遷；Vendor (Idle) 世代＝老時等同這條（目前不會觸發）",
     "impl": "agents/vendorOld.js#stepTick（空實作）",
     "status": "implemented"
    }
   }
  },
  "Cell": {
   "id": "Cell",
   "label": "市場網格本身；World.cellSpace 與 cellType 同尺寸，每個攤位格各存一份屬性物件，其餘格型存 null",
   "attributes": {
    "aisleFacing": {
     "desc": "這格 4 個方向裡臨走道／入口格的邊數比例（0~1）；位置固定",
     "formula": "aisleEdges / 4",
     "variants": [
      {
       "adjective": "緊臨走道",
       "when": "aisleFacing 高",
       "effect": [
        "siteFertility：先天權重高，沒用過也容易被選中"
       ]
      },
      {
       "adjective": "被店鋪夾住",
       "when": "aisleFacing 低",
       "effect": [
        "siteFertility：先天權重低，得靠行為痕跡累積"
       ]
      }
     ],
     "fixity": "固定",
     "impl": "agents/cell.js#buildCellSpace | agents/cell.js#aisleFacingOf",
     "status": "implemented"
    },
    "passable": {
     "desc": "這格本身能不能走（與誰在走無關）：牆、設施（共融區除外）、其餘非市場格型不可通行；走道、入口、共融區（category_2026＝共融區的設施格）可通行；攤位格 noEnter 為真（zone 是桌面空間、工作桌面混合、工作設備區；位置固定）不可通行，其餘（工作空間、用餐區）可站人；走道上的椅子不影響",
     "variants": [
      {
       "adjective": "可通行",
       "when": "格型可走，且 noEnter 為假",
       "effect": [
        "Customer.passableFor：走道、入口、共融區直接放行；攤位格再看興趣目標"
       ]
      },
      {
       "adjective": "不可通行",
       "when": "格型不可走，或 noEnter 為真",
       "effect": [
        "Customer.passableFor：一律不可通行",
        "Customer.visitRule：客人改站在外面的走道格或用餐區格到訪"
       ]
      }
     ],
     "fixity": "固定",
     "impl": "agents/cell.js#buildCellSpace | agents/cell.js#passable",
     "status": "implemented"
    },
    "chairPlaced": {
     "desc": "這格現在有沒有被椅子佔用，並推出走進這格的成本 passCost（另加擁擠成本：擁擠 +(PASS_COST_CHAIR−PASS_COST_OPEN)、塞住 +2 倍，避開擁擠）；走道格依 occupiedBy 裡有沒有店現在擺椅（Vendor.chairRule）推得：有＝擺了椅子，否則完全開放；不可通行格不算成本",
     "candidates": [
      "完全開放",
      "擺了椅子"
     ],
     "params": {
      "PASS_COST_OPEN": {
       "value": 1,
       "unit": "cost",
       "note": "完全開放走道格；自訂值，可覆寫"
      },
      "PASS_COST_CHAIR": {
       "value": 2,
       "unit": "cost",
       "note": "擺了椅子的走道格；自訂值，可覆寫"
      }
     },
     "variants": [
      {
       "adjective": "完全開放",
       "when": "occupiedBy 裡沒有店現在擺椅；passCost＝PASS_COST_OPEN",
       "effect": [
        "Customer.passCostPath：照單位成本算，行人不會特地繞開"
       ]
      },
      {
       "adjective": "擺了椅子",
       "when": "occupiedBy 裡至少有一家店現在擺椅；passCost＝PASS_COST_CHAIR",
       "effect": [
        "Customer.passCostPath：繞路不吃虧時改走別條（路徑成本含椅子）",
        "Customer.chairApproach：椅子格本身也算「近椅子」，別家的椅子才放慢"
       ]
      }
     ],
     "source": "2026-10-02 課堂筆記（以可變動性為單一軸線往下細分），目前只實作椅子；半開放、流動攤車尚未定義，封閉由 passable 的 noEnter 表達",
     "fixity": "不固定",
     "status": "implemented",
     "impl": "agents/cell.js#hasChair | agents/cell.js#passCost",
     "reads": [
      "Vendor.chairRule",
      "Cell.occupiedBy"
     ]
    },
    "chairNearby": {
     "desc": "這格周圍 CHAIR_NEAR_RADIUS 格內（含自己）、現在擺了椅子的店鋪；擺椅時段內、店營業才算；位置固定的幾何關係，哪些店有椅子隨時段與營業狀態變",
     "params": {
      "CHAIR_NEAR_RADIUS": {
       "value": 2,
       "unit": "cell",
       "note": "【假設值，無數據支持】離椅子多近算「近椅子」，之後有行人減速的觀測再校正"
      }
     },
     "variants": [
      {
       "adjective": "近椅子",
       "when": "周圍 CHAIR_NEAR_RADIUS 格內有別家店現在擺了椅子",
       "effect": [
        "Customer.chairApproach：走進去多停（目標店自己的椅子不算）"
       ]
      },
      {
       "adjective": "不近椅子",
       "when": "周圍沒有擺了椅子的店",
       "effect": [
        "Customer.chairApproach：不介入"
       ]
      }
     ],
     "reads": [
      "Cell.occupiedBy",
      "Vendor.chairRule"
     ],
     "fixity": "不固定",
     "impl": "agents/cell.js#chairNearbyShops",
     "status": "implemented"
    },
    "occupiedBy": {
     "desc": "走道格上有資格擺椅的店鋪 code 清單（QGIS 標定，固定不變）；店鋪自己的用餐區格＝自己的 code",
     "source": "使用者 2026-10-04 在 QGIS aisle.occupied_by 標定 33 格，經 adapter_era_data.py 輸出到 ERA_DATA",
     "fixity": "固定",
     "impl": "agents/cell.js#buildCellSpace",
     "status": "implemented"
    },
    "reachableShops": {
     "desc": "站在這格能到訪的店鋪：所在格與上下左右相鄰攤位格所屬店鋪（擺椅的店除外，見 visitCells），加上擺椅時段內 occupiedBy 含的店鋪；算出、不另存。visitCells(shop)＝擺椅的店（擺椅時段內、營業、有椅子格）的椅子格，其餘店鋪的攤位格，是走向店鋪的終點",
     "reads": [
      "Cell.occupiedBy"
     ],
     "fixity": "不固定",
     "impl": "agents/cell.js#reachableShops | agents/cell.js#visitCells",
     "status": "implemented"
    },
    "crowdLevel": {
     "desc": "這格現在有幾個人（顧客，坐著的也算），上限 CROWD_CAP；0～1 人正常、2 人緩速、滿 CROWD_CAP 人進不去；每步開頭重算，移動／生成／離場即時更新，不累積",
     "params": {
      "CROWD_CAP": {
       "value": 3,
       "unit": "人",
       "note": "一格最多站幾人；2 人緩速、滿這個數字就不能再進入；使用者定案（2026-10-22）"
      }
     },
     "variants": [
      {
       "adjective": "正常",
       "when": "crowdLevel ≤ 1",
       "effect": [
        "Cell.slowedSec：不多停"
       ]
      },
      {
       "adjective": "緩速",
       "when": "crowdLevel = 2",
       "effect": [
        "Cell.slowedSec：行人走進去多停",
        "Cell.passCost：成本加 PASS_COST_CHAIR－PASS_COST_OPEN"
       ]
      },
      {
       "adjective": "滿",
       "when": "crowdLevel ≥ CROWD_CAP",
       "effect": [
        "Customer.passableFor：不能再進入",
        "Cell.passCost：成本加倍"
       ]
      }
     ],
     "fixity": "不固定",
     "impl": "agents/cell.js#refreshCrowdLevel | agents/cell.js#occAt | agents/cell.js#full | agents/cell.js#arrive | agents/cell.js#vacate | agents/cell.js#moved",
     "status": "implemented"
    },
    "slowedSec": {
     "desc": "行人走進這格要多停幾秒，由 crowdLevel 推得：這格（含自己）有 2 人以上＝CROWD_SLOW_SEC，否則 0；椅子造成的放慢不在這裡，見 Customer.chairApproach；Customer.movementSpeed 讀它",
     "params": {
      "CROWD_SLOW_SEC": {
       "value": 1,
       "unit": "sec",
       "note": "2 人以上的格子；自訂值，可覆寫"
      }
     },
     "reads": [
      "Cell.chairPlaced",
      "Cell.crowdLevel"
     ],
     "fixity": "不固定",
     "impl": "agents/cell.js#slowedSec",
     "status": "implemented"
    },
    "visibility": {
     "desc": "0～1：看得到這格的走道格數 ÷ 全圖最大值；阻擋判定同 Customer.isVisible；位置固定",
     "params": {
      "VIS_LOW": {
       "value": 0.2,
       "unit": "0~1",
       "note": "低於 → 隱蔽；自訂值，可覆寫"
      },
      "VIS_HIGH": {
       "value": 0.4,
       "unit": "0~1",
       "note": "高於 → 顯眼；自訂值，可覆寫"
      }
     },
     "variants": [
      {
       "adjective": "藏在深處",
       "when": "visibility < VIS_LOW",
       "effect": [
        "siteFertility：可見度項最低"
       ]
      },
      {
       "adjective": "普通",
       "when": "VIS_LOW ≤ visibility ≤ VIS_HIGH",
       "effect": [
        "siteFertility：可見度項中等"
       ]
      },
      {
       "adjective": "顯眼",
       "when": "visibility > VIS_HIGH",
       "effect": [
        "siteFertility：可見度項最高"
       ]
      }
     ],
     "fixity": "固定",
     "impl": "agents/cell.js#buildVisibility",
     "status": "implemented"
    },
    "usage": {
     "desc": "機能：這格現在被用來做什麼（一般／緩衝）；只有攤位格會離開一般。緩衝＝所屬店鋪現在沒營業（Open Hours 時段外、公休日、Vendor (Idle)）且不是倉庫、不是鐵門封閉攤位格；只用在畫面疊色，不影響通行與規則",
     "candidates": [
      "一般",
      "緩衝"
     ],
     "variants": [
      {
       "adjective": "一般",
       "when": "營業中的店鋪格、倉庫、鐵門封閉攤位格、走道與其他格型",
       "effect": [
        "不介入"
       ]
      },
      {
       "adjective": "緩衝",
       "when": "所屬店鋪現在沒營業，且不是倉庫、不是鐵門封閉攤位格",
       "effect": [
        "Cell.passable：仍視同牆"
       ]
      }
     ],
     "reads": [
      "Vendor.openHours"
     ],
     "fixity": "不固定",
     "status": "implemented",
     "impl": "agents/cell.js#isBuffer"
    },
    "orientation": {
     "desc": "方向性（待補）",
     "source": "2026-10-02 課堂筆記",
     "fixity": "固定",
     "status": "planned"
    },
    "boardTilt": {
     "desc": "這格上板子的傾角 θ：板面與地面的夾角，0＝水平桌板、90＝垂直板；由 Vendor 放板子時寫入，沒有板子的格為空",
     "unit": "度",
     "fixity": "不固定",
     "status": "implemented",
     "impl": "agents/cell.js#buildCellSpace"
    },
    "boardHeight": {
     "desc": "這格上板子的離地高度 z：板子下緣離地多高；桌面約 0.75 m，高過人頭的是頂上的板",
     "unit": "m",
     "fixity": "不固定",
     "status": "implemented",
     "impl": "agents/cell.js#buildCellSpace"
    },
    "boardYaw": {
     "desc": "這格上板子的平面導向 φ：板子長邊與旁邊走道方向的夾角，0＝順著走道、90＝橫擋走道；沒有 φ 時當 90°（橫擋，最保守）",
     "unit": "度",
     "fixity": "不固定",
     "status": "implemented",
     "impl": "agents/cell.js#buildCellSpace"
    }
   },
   "rules": {
    "note": "Cell 的規則只描述格子本身的狀態推導（passable、passCost、slowedSec 等）；行人與店鋪怎麼反應留在各自 agent 的 Rule（例如 VendorNew.siteFertility）；R4 例外：機能 usage 由下面三條 Rule 改寫（斥力觸發）"
   }
  },
  "IdleSpaceTree": {
   "id": "IdleSpaceTree",
   "label": "診斷後台「空間圖」的閒置空間 × 斥力樹狀圖：只把某一小時的閒置空間與三種基本斥力畫成樹狀，不改任何 agent 行為（原型 20261031/斥力樹狀圖.html，後台頁 99_diag_dashboard/space_tree.html）",
   "attributes": {},
   "rules": {
    "greenChain": {
     "desc": "通行（綠）小點串成一串；串上連得到的不同閒置攤位 ≥ 2 個就成立，不限頭尾；沒成立的整串不畫線、小點變淡",
     "variants": [
      {
       "adjective": "成立",
       "when": "整串上連得到的不同閒置攤位 ≥ GREEN_CHAIN_MIN_STALLS",
       "effect": [
        "畫串聯線；連到閒置攤位的那顆小點放大並畫線到該攤位；這些閒置攤位算被這條通道連起來",
        "藍色向日葵旁有成立的綠色通道就只連綠，不連閒置攤位"
       ]
      },
      {
       "adjective": "不成立",
       "when": "連得到的不同閒置攤位不足",
       "effect": [
        "整串小點變淡、不畫線"
       ]
      }
     ],
     "params": {
      "GREEN_CHAIN_MIN_STALLS": {
       "value": 2,
       "unit": "個",
       "note": "串聯成立所需、各自連到的不同閒置攤位數；不限頭尾"
      },
      "TREE_LINK_CELLS": {
       "value": 6,
       "unit": "格",
       "note": "小點離沒營業攤位 ≤ 此格數才算連到（後台拉桿「斥力連到閒置空間」預設）"
      }
     },
     "impl": "99_diag_dashboard/space_tree.html#draw",
     "status": "reference",
     "source": "使用者 2026-11-03 指定放寬成立條件（原：頭尾各連到不同攤位）"
    },
    "energyDots": {
     "desc": "每格每類斥力一個能量點：走道、入口、共融區格（攤位格不算）的該類斥力值（各力先除以自己的最大值、加總、再除以該類最大值）大於門檻就放點；一格多類同心疊放",
     "params": {
      "TREE_DOT_THRESHOLD": {
       "value": 0,
       "unit": "最大值的比例",
       "note": "出圖預設；論文的過載判定另用 8%（診斷後台斥力門檻）"
      }
     },
     "impl": "99_diag_dashboard/space_tree.html#draw",
     "status": "reference",
     "source": "20261031/斥力樹狀圖.html、tree_panel.js drawTree()"
    },
    "idleSpace": {
     "desc": "該小時不在營業時段內的攤位格鋪成遮罩、模糊後相連的一塊算一個閒置空間；中心＝這塊內攤位格中心的平均，圓面積＝格數",
     "params": {
      "TREE_IDLE_MERGE": {
       "value": 0.35,
       "unit": "遮罩模糊後的下限",
       "note": "每格 12 px、方塊模糊兩次（半徑 4 px）後 ≥ 此值算在內"
      }
     },
     "impl": "99_diag_dashboard/space_tree.html#draw",
     "status": "reference",
     "source": "20261031/斥力樹狀圖.html"
    },
    "redCluster": {
     "desc": "擁擠（紅）：地圖切成區塊、同區塊紅點成一叢；叢中心最小生成樹串聯（距離上限＝每叢到最近另一叢的最大距離，進位 0.5 格）；叢連到 TREE_LINK_CELLS 內最近的閒置攤位，同一串每個攤位只連一次",
     "params": {
      "TREE_RED_BLOCK_CELLS": {
       "value": 2.5,
       "unit": "格",
       "note": "紅點成叢的區塊邊長（後台拉桿「擁擠每隔幾格一叢」預設）"
      }
     },
     "impl": "99_diag_dashboard/space_tree.html#draw",
     "status": "reference",
     "source": "20261031/斥力樹狀圖.html"
    },
    "blueCluster": {
     "desc": "停留（藍）：藍點鏈式相連成叢、排成向日葵；叢內離成立的綠色通道點夠近就只連綠，否則連最近的閒置攤位；連得到才成立，不成立整叢變淡",
     "params": {
      "TREE_BLUE_CLUSTER_CELLS": {
       "value": 2.5,
       "unit": "格",
       "note": "藍點鏈式成叢距離"
      },
      "TREE_BLUE_TO_GREEN_CELLS": {
       "value": 2,
       "unit": "格",
       "note": "藍叢離成立綠色通道 ≤ 此距離就只連綠"
      }
     },
     "impl": "99_diag_dashboard/space_tree.html#draw",
     "status": "reference",
     "source": "20261031/斥力樹狀圖.html"
    }
   }
  }
 }
};
