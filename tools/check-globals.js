/* ============================================================================
   DAVVERO LIMONE — checagem de colisões no escopo global
   ----------------------------------------------------------------------------
   Em scripts clássicos (sem módulos), `const`/`let`/`function` de nível
   superior dividem o MESMO escopo. Declarar o mesmo nome em dois arquivos
   derruba o segundo com "Identifier 'x' has already been declared" — foi
   assim que a página de conta ficou sem JavaScript.

   Uso:  node tools/check-globals.js
   ========================================================================== */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function topLevelNames(src) {
  const names = [];
  let depth = 0;
  for (const raw of src.split(/\r?\n/)) {
    const code = raw.replace(/\/\/.*$/, '');
    if (depth === 0) {
      const m = code.match(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/);
      if (m) names.push(m[1]);
    }
    depth += (code.match(/[{([]/g) || []).length - (code.match(/[})\]]/g) || []).length;
    if (depth < 0) depth = 0;
  }
  return names;
}

const PAGES = {
  'index.html': ['data.js', 'auth.js', 'script.js'],
  'produto.html': ['data.js', 'auth.js', 'produto.js'],
  'checkout.html': ['data.js', 'assets.js', 'pay-core.js', 'auth.js', 'wallet.js', 'checkout.js'],
  'conta.html': ['data.js', 'assets.js', 'pay-core.js', 'auth.js', 'wallet.js', 'conta.js'],
  'homem.html': ['data.js', 'pages.js'],
  'mulher.html': ['data.js', 'pages.js'],
  'sobre.html': ['data.js', 'pages.js'],
  'contato.html': ['data.js', 'pages.js'],
  'look.html': ['data.js', 'pages.js'],
};

let problems = 0;
for (const [page, scripts] of Object.entries(PAGES)) {
  const seen = new Map();
  const clashes = [];
  for (const file of scripts) {
    for (const name of topLevelNames(read(file))) {
      if (seen.has(name)) clashes.push(`${name} (${seen.get(name)} × ${file})`);
      else seen.set(name, file);
    }
  }
  const ok = clashes.length === 0;
  if (!ok) problems++;
  console.log(`${ok ? 'PASS ' : 'FALHA'}  ${page} — ${seen.size} nomes globais${ok ? '' : ' — COLISÕES: ' + clashes.join(', ')}`);
}

for (const g of ['VLPAY', 'VLAuth', 'VLWallet', 'VLASSETS']) {
  const hits = [...new Set(Object.values(PAGES).flat().filter(f => read(f).includes(`window.${g} =`)))];
  const ok = hits.length <= 1;
  if (!ok) problems++;
  console.log(`${ok ? 'PASS ' : 'FALHA'}  window.${g} definido em ${hits.join(', ') || '(nenhum)'}`);
}

for (const [page, scripts] of Object.entries(PAGES)) {
  const html = read(page);
  const order = scripts.map(s => html.indexOf(`<script src="${s}"></script>`));
  const ok = order.every(v => v > -1) && order.every((v, i) => i === 0 || v > order[i - 1]);
  if (!ok) problems++;
  console.log(`${ok ? 'PASS ' : 'FALHA'}  ordem dos scripts em ${page}`);
}

console.log(`\n${problems === 0 ? 'SEM COLISÕES' : problems + ' PROBLEMA(S)'}`);
process.exitCode = problems ? 1 : 0;
