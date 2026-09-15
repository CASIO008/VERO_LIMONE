#!/usr/bin/env node
/* ============================================================================
   DAVVERO LIMONE — logos de bancos (Tgentil/Bancos-em-SVG)
   ----------------------------------------------------------------------------
   Baixa os SVGs oficiais do repositório
   https://github.com/Tgentil/Bancos-em-SVG (2500x2500, fundo transparente)
   para images/banks/<id>.svg, com o mesmo id usado pelo VLPAY (pay-core.js).

   Onde não existe arquivo (next, iti, will, nomad, digio, bndes…) o
   pay-core.js continua desenhando o selo inline — nada quebra.
   O inter fica de fora de propósito: o SVG do repositório traz só o
   monograma "in", então o selo inline (tile laranja com "inter") fica
   mais fiel à marca.

   Uso:  node tools/banks-from-github.mjs
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'images', 'banks');
const REPO = 'https://raw.githubusercontent.com/Tgentil/Bancos-em-SVG/main';

/* id do VLPAY → caminho no repositório (variante quadrada, sem fundo) */
const BANKS = {
  nubank:      'Nu Pagamentos S.A/nubank-logo-2021.svg',
  itau:        'Itaú Unibanco S.A/itau.svg',
  bradesco:    'Bradesco S.A/bradesco.svg',
  santander:   'Banco Santander Brasil S.A/banco-santander-logo.svg',
  btg:         'Banco BTG Pacutal/btg-pactual.svg',
  safra:       'Banco Safra S.A/logo-safra.svg',
  original:    'Banco Original S.A/banco-original-logo-verde.svg',
  c6:          'Banco C6 S.A/c6 bank.svg',
  pagbank:     'PagSeguro Internet S.A/logo-pagbank.svg',
  mercadopago: 'Mercado Pago/mercado-pago.svg',
  neon:        'Neon/header-logo-neon.svg',
  picpay:      'PicPay/Logo-PicPay.svg',
  stone:       'Stone Pagamentos S.A/stone.svg',
  efi:         'Efí - Gerencianet/logo-efi-bank-laranja.svg',
  bb:          'Banco do Brasil S.A/banco-do-brasil-sem-fundo.svg',
  caixa:       'Caixa Econômica Federal/caixa-economica-federal-X.svg',
  banrisul:    'Banrisul/banrisul-logo-2023.svg',
  sicoob:      'Sicoob/sicoob-vector-logo.svg',
  sicredi:     'Sicredi/logo-svg2.svg',
  unicred:     'Unicred/unicred-centralizada.svg',
  cresol:      'Cresol/Icone-original.svg',
  credisis:    'Credisis/credisis.svg',
  bmg:         'Banco BMG/banco-bmg-logo.svg',
  daycoval:    'Banco Daycoval/logo-Daycoval.svg',
  pan:         'Banco Pan/bancoPan.svg',
  pine:        'Banco Pine/banco-pine.svg',
  sofisa:      'Banco Sofisa/logo-sofisa.svg',
  xp:          'XP Investimentos/xp-investimentos-logo.svg',
  bv:          'Banco Votorantim/banco-bv-logo.svg',
  banestes:    'Banco do Estado do Espirito Santo/banestes.svg',
  banpara:     'Banco do Estado do Para/banpara-logo-sem-fundo.svg',
  banese:      'Banco do Estado do Sergipe/logo banese.svg',
  brb:         'BRB - Banco de Brasilia/brb-logo.svg',
  bnb:         'Banco do Nordeste do Brasil S.A/Logo_BNB.svg',
};

const rawURL = p => `${REPO}/${p.split('/').map(encodeURIComponent).join('/')}`;

function svgViewBox(svg) {
  const m = svg.match(/viewBox="([^"]+)"/i);
  if (m) return m[1].trim().split(/\s+/).map(Number);
  const w = svg.match(/\bwidth="([\d.]+)/i);
  const h = svg.match(/\bheight="([\d.]+)/i);
  return w && h ? [0, 0, +w[1], +h[1]] : null;
}

let ok = 0, fail = 0;
fs.mkdirSync(OUT, { recursive: true });

for (const [id, repoPath] of Object.entries(BANKS)) {
  const url = rawURL(repoPath);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'vero-limone-build' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const svg = await res.text();
    if (!/<svg[\s>]/i.test(svg.slice(0, 600))) throw new Error('não parece SVG');
    fs.writeFileSync(path.join(OUT, id + '.svg'), svg);
    const vb = svgViewBox(svg);
    const ratio = vb ? (vb[2] / vb[3]).toFixed(2) : '?';
    console.log(`  ok   ${id.padEnd(12)} ${String(svg.length).padStart(6)} bytes  ·  proporção ${ratio}`);
    ok++;
  } catch (err) {
    console.log(`  ERRO ${id.padEnd(12)} ${err.message}`);
    fail++;
  }
}

console.log(`\nbanks-from-github: ${ok} logos salvos em images/banks, ${fail} falhas`);
console.log('próximo passo: node tools/build-assets.mjs');
if (fail) process.exitCode = 1;
