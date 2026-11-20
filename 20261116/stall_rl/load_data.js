// Node 端讀 99_website 的 ERA_DATA／GRID_DATA（它們是 const，用 vm 取出）
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.resolve(__dirname, '..', '..', '99_website');
module.exports = function () {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(SITE, 'era_data.js'), 'utf8') + ';this.ERA=ERA_DATA;', ctx);
  vm.runInContext(fs.readFileSync(path.join(SITE, 'grid_data.js'), 'utf8') + ';this.GRID=GRID_DATA;', ctx);
  return { ERA: ctx.ERA, GRID: ctx.GRID };
};
