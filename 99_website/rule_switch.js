// 規則開關（Rule Switch）— 規格：agent_setting.md「Rule Switch」。
// 99_config 裡標 toggle:true 的規則可以在控制面板關掉：關掉＝程式在該規則的入口直接跳過（RuleSwitch.on(id) 為假）。
// id 一律是 "Class.ruleName"（同 JSON 的 reads／writes 寫法）。預設全開，toggleDefault:false 的選項預設關。
// 不可關的規則（通行、生成、移動速度、到訪判定）沒有 toggle，關了模擬跑不起來。
const RuleSwitch = {
  list: [],           // [{ id, desc, def }]，由 CONFIG 產生
  off: new Set(),
  built: false,
  build() {
    if (this.built) return;
    this.built = true;
    for (const c of Object.values(CONFIG.classes))
      for (const [name, r] of Object.entries(c.rules || {}))
        if (r && r.toggle) { const id = c.id + '.' + name, def = r.toggleDefault !== false; this.list.push({ id, desc: r.desc, def, group: r.toggleGroup || '其他', requires: r.requires || [] }); if (!def) this.off.add(id); }
  },
  on(id) { if (!this.built) this.build(); return !this.off.has(id); },
  // 開一條：它需要的規則（requires，遞移）一起開；關一條：需要它的規則（遞移）一起關。
  set(id, v) {
    if (!this.built) this.build();
    const q = [id], seen = new Set();
    while (q.length) {
      const x = q.pop(); if (seen.has(x)) continue; seen.add(x);
      if (v) { this.off.delete(x); for (const y of (this.list.find(r => r.id === x) || { requires: [] }).requires) q.push(y); }
      else { this.off.add(x); for (const r of this.list) if (r.requires.includes(x)) q.push(r.id); }
    }
    this.clearCache();
  },
  // 只開這一條（連同它需要的規則），其餘全關：用來單獨看一條規則。
  only(id) { this.setAll(false); this.set(id, true); },
  // 視野錐形、路徑成本會影響快取：開關一變就清掉
  clearCache() { if (typeof Customer !== 'undefined') { Customer.coneSeen.clear(); Customer.bfsCache.clear(); Customer.bfsCacheTick = -1; } if (typeof Diag !== 'undefined') Diag.seeCache.clear(); },
  setAll(v) { // true＝回到預設（全開，ARRAY 隨機除外）；false＝全部關
    this.off.clear(); for (const r of this.list) if (!v || !r.def) this.off.add(r.id); this.clearCache();
  },
  reset() { this.setAll(true); },
};
