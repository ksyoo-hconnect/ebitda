const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

function load(html, editable) {
  const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(m => m[1]).find(s => s.includes('const D={'));
  assert.ok(script, 'Model script is present');
  const context = vm.createContext({});
  vm.runInContext(script.replace(/render\(\);\s*$/, '') +
    '\nglobalThis.model={D,K,PRESETS,calc,bandEbitda' +
    (editable ? ',FORMULA_DEFAULTS,FORMULA_META,formulaContext,parseFormula,effChurn,setFormulas:v=>formulas=v' : '') + '};', context);
  return context.model;
}

// The original, committed v4 is the numerical regression baseline.
const baseline = load(execFileSync('git', ['show', '03b20b5:vista_v4.html'], { cwd: root, encoding: 'utf8' }), false);
const model = load(fs.readFileSync(path.join(root, 'vista_v4.html'), 'utf8'), true);
let comparisons = 0;
for (const preset of Object.keys(baseline.PRESETS)) {
  for (let mask = 0; mask < 32; mask++) {
    const options = { ...baseline.PRESETS[preset].set };
    ['reservoir', 'corp', 'p1', 'p2', 'hcAttr'].forEach((key, i) => options[key] = !!(mask & (1 << i)));
    Object.assign(baseline.D, options);
    Object.assign(model.D, baseline.D);
    for (let y = 0; y < 5; y++) {
      const before = baseline.calc(y), ctx = model.formulaContext();
      const after = model.calc(y, model.D, model.FORMULA_DEFAULTS, ctx);
      assert.equal(ctx.errors.size, 0);
      for (const key of Object.keys(before)) {
        assert.ok(Math.abs(after[key] - before[key]) <= Math.max(1e-8, Math.abs(before[key]) * 1e-12), `${preset}/${mask}/Y${y + 1}/${key}`);
      }
      comparisons++;
    }
    const oldBand = baseline.bandEbitda(4), newBand = model.bandEbitda(4);
    for (const key of ['lo', 'hi']) assert.ok(Math.abs(oldBand[key] - newBand[key]) < 1e-7, `Band: ${preset}/${mask}/${key}`);
  }
}

const originals = { ...model.D };
Object.assign(model.D, { sz_screen: 0, sz_out: 0, bj_screen: 0, bj_out: 0, corp: false });
Object.assign(baseline.D, model.D);
for (let y = 0; y < 5; y++) assert.equal(model.calc(y).totEbitda, baseline.calc(y).totEbitda);
Object.assign(model.D, originals);

const defaults = model.FORMULA_DEFAULTS;
const normal = model.calc(4);
const custom = { ...defaults, subMed: 'medActive * feeMed * 0.5' };
assert.equal(model.calc(4, model.D, custom).subMed, normal.subMed * 0.5);
model.setFormulas(custom);
const inputSnapshot = JSON.stringify(model.D);
const band = model.bandEbitda(4);
assert.equal(JSON.stringify(model.D), inputSnapshot, 'Band calculation preserves inputs');
assert.ok(Number.isFinite(band.lo) && Number.isFinite(band.hi));
assert.notEqual(band.hi, (() => { model.setFormulas({ ...defaults }); return model.bandEbitda(4).hi; })());

for (const expression of ['', 'badVariable + 1', '1 / 0', 'pow(10, 10000)', 'globalThis', 'constructor()', 'medActive.constructor', 'alert(1)', '1;2', '<img>', 'pow(2)', 'min()', '2 ** 3']) {
  const ctx = model.formulaContext({ ...defaults, subMed: expression });
  const result = model.calc(4, model.D, defaults, ctx);
  assert.equal(result.subMed, normal.subMed, `Fallback: ${expression}`);
  assert.ok(ctx.errors.has('subMed'), `Error reported: ${expression}`);
  assert.equal(result.totEbitda, normal.totEbitda);
}
const valid = model.parseFormula('max(0, -x) + pow(2, 3) + 1e-2', new Set(['x']));
assert.equal(valid({ x: -2 }), 10.01);
const churnCtx = model.formulaContext({ ...defaults, churn: '2' });
assert.equal(model.effChurn(churnCtx), model.effChurn());
assert.ok(churnCtx.errors.has('churn'));
assert.equal(model.calc(4, model.D, defaults).totEbitda, normal.totEbitda, 'Defaults restore original results');
console.log(`${comparisons} preset/toggle/year comparisons passed; edit, fallback, bounds, and restoration checks passed.`);
