#!/usr/bin/env node
/* ============================================================================
   DAVVERO LIMONE — manifesto dos assets locais
   ----------------------------------------------------------------------------
   Varre images/banks, images/brands e images/pay e escreve assets.js, para o
   pay-core.js saber (sem tentar a rede) quais logos existem como arquivo e
   quais devem cair no desenho inline.

   Uso:  node tools/build-assets.mjs
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scan = (dir, ext) => {
  const p = path.join(ROOT, dir);
  if (!fs.existsSync(p)) return [];
  return fs.readdirSync(p)
    .filter(f => f.endsWith('.' + ext))
    .map(f => f.slice(0, -(ext.length + 1)))
    .sort();
};

const banks = scan('images/banks', 'svg');
const brands = scan('images/brands', 'svg');
const pay = scan('images/pay', 'svg');

const out = `/* Gerado por tools/build-assets.mjs — não edite à mão.
   Lista os logos de bancos do repositório Tgentil/Bancos-em-SVG
   (baixados por tools/banks-from-github.mjs) e os demais arquivos de
   images/brands e images/pay. Quem não estiver aqui usa o desenho
   inline do próprio pay-core.js. */
window.VLASSETS = {
  geradoEm: ${JSON.stringify(new Date().toISOString())},
  banks: ${JSON.stringify(banks)},
  brands: ${JSON.stringify(brands)},
  pay: ${JSON.stringify(pay)},
};
`;

const dest = path.join(ROOT, 'assets.js');
fs.writeFileSync(dest, out);
console.log(`assets.js: ${banks.length} bancos, ${brands.length} bandeiras, ${pay.length} meios de pagamento`);
console.log(`  bancos: ${banks.join(', ')}`);
console.log(`  bandeiras: ${brands.join(', ')}`);
console.log(`  pagamento: ${pay.join(', ')}`);
