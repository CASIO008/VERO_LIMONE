#!/usr/bin/env node
/* ============================================================================
   DAVVERO LIMONE — exportador de assets do Figma
   ----------------------------------------------------------------------------
   Baixa os logos oficiais (bancos, bandeiras e meios de pagamento) das
   community files que servem de referência para a loja, e salva como SVG
   dentro de images/.

   Uso:
     FIGMA_TOKEN=figd_xxx node tools/figma-export.mjs              # exporta tudo
     FIGMA_TOKEN=figd_xxx node tools/figma-export.mjs --force      # reexporta
     FIGMA_TOKEN=figd_xxx node tools/figma-export.mjs --only banks
     FIGMA_TOKEN=figd_xxx node tools/figma-export.mjs --list <key> <nodeId> [--depth 3]

   O token nunca é gravado: leia de FIGMA_TOKEN (ou VL_FIGMA_TOKEN) e, se
   preferir, ponha num arquivo .env.local fora do controle de versão.
   A API REST do Figma limita requisições — o script dá pausa entre chamadas,
   tenta de novo em caso de 429 e reaproveita o que já foi baixado.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.figma.com/v1';
const PAUSE = Number(process.env.FIGMA_PAUSE || 1600);      // ms entre chamadas

/* ------------------------------------------------------------------ tokens */
function token() {
  const t = process.env.FIGMA_TOKEN || process.env.VL_FIGMA_TOKEN || readEnvFile();
  if (!t) {
    console.error('\n  Falta o token do Figma.\n');
    console.error('  FIGMA_TOKEN=figd_xxx node tools/figma-export.mjs\n');
    process.exit(1);
  }
  return t.trim();
}
function readEnvFile() {
  for (const f of ['.env.local', '.env']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    const line = fs.readFileSync(p, 'utf8').split(/\r?\n/).find(l => /^FIGMA_TOKEN\s*=/.test(l));
    if (line) return line.split('=').slice(1).join('=').replace(/["']/g, '');
  }
  return null;
}
const TOKEN = token();
const api = (url) => fetch(url, { headers: { 'X-Figma-Token': TOKEN } });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(url, { tries = 5 } = {}) {
  for (let i = 1; i <= tries; i++) {
    const res = await api(url);
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after') || 0);
      /* o Figma às vezes devolve Retry-After de dias quando estoura a cota
         mensal do token: não faz sentido segurar o processo esperando. */
      if (retry > 600) {
        throw new Error(
          `cota do Figma esgotada — a API pede para esperar ${Math.round(retry / 3600)}h.\n` +
          '    O que já foi baixado está salvo: siga com os arquivos locais e\n' +
          '    reexporte mais tarde com um token novo (figma.com → Settings → Security).'
        );
      }
      const wait = retry ? retry * 1000 : 6000 * i;
      console.log(`    · limite do Figma atingido, aguardando ${Math.round(wait / 1000)}s…`);
      await sleep(wait);
      continue;
    }
    if (res.status === 403 || res.status === 401) throw new Error(`token recusado (${res.status}). Gere um novo em figma.com → Settings → Security → Personal access tokens.`);
    if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
    return res.json();
  }
  throw new Error('limite do Figma persistente — tente mais tarde');
}

/* ---------------------------------------------------------------- catálogo */
/* Cada item: [arquivo-destino, nodeId]. Os IDs vêm das community files.     */
const FILES = {
  banks: 'VsNHqohTGryioLOQIn8wuN',   // Brazilian Banks Logos
  hotmart: 'sa1R6gkO1cWLP2ziZlDLBc', // Hotmart · Métodos de pagamento
  cards: 'G6X5qPDyLwY5wXwQ8prIH6',   // UI Credit Cards
};

const PROJECTS = {
  /* Bancos — variante "Type=Icon, Background=True" (tile colorido oficial) */
  banks: {
    key: FILES.banks, dir: 'images/banks', ext: 'svg',
    label: 'Bancos brasileiros',
    items: {
      nubank: '42:175', itau: '42:76', bradesco: '42:79', santander: '42:82',
      btg: '42:87', safra: '42:97', inter: '42:178', original: '42:185',
      c6: '42:181', pagbank: '42:193', mercadopago: '42:212', next: '42:230',
      iti: '42:241', neon: '42:189', will: '42:208', picpay: '42:217',
      stone: '42:221', nomad: '42:225', efi: '42:238',
      bb: '40:7', caixa: '40:10', bndes: '40:15',
      sicoob: '43:3', sicredi: '43:6', unicred: '43:10', credisis: '43:15',
      lar: '43:18', cresol: '43:22', viacredi: '43:27', sisprime: '43:32',
      crediseara: '308:182', uniprime: '791:22065',
      banrisul: '43:180', bnb: '43:184', brb: '43:191', basa: '43:187',
      banestes: '43:195', banese: '43:199', banpara: '43:203',
      bdmg: '65:1466', brde: '65:1470',
    },
  },

  /* Bandeiras de cartão (do arquivo Hotmart, que é o padrão do checkout) */
  brands: {
    key: FILES.hotmart, dir: 'images/brands', ext: 'svg',
    label: 'Bandeiras de cartão',
    items: { visa: '0:68', mastercard: '0:48', amex: '0:60' },
  },

  /* Meios de pagamento (badges 70x48 do arquivo Hotmart) */
  pay: {
    key: FILES.hotmart, dir: 'images/pay', ext: 'svg',
    label: 'Meios de pagamento',
    items: {
      pix: '0:5', hotmart: '0:76', applepay: '0:12', googlepay: '0:22',
      paypal: '0:39', mastercard: '0:48', amex: '0:60', visa: '0:68',
      boleto: '1:324',
    },
  },

  /* Referências visuais (PNG) para conferência de layout */
  refcards: {
    key: FILES.cards, dir: 'images/ref', ext: 'png', scale: 2,
    label: 'Referência · UI Credit Cards',
    items: { 'ui-cards-stack': '1:4', 'ui-card-thumb': '13:35' },
  },
  refpay: {
    key: FILES.hotmart, dir: 'images/ref', ext: 'png', scale: 3,
    label: 'Referência · métodos Hotmart',
    items: { 'hotmart-strip-a': '1:735', 'hotmart-strip-b': '1:736' },
  },
};

/* ------------------------------------------------------------------ listar */
async function listNode(key, nodeId, depth = 3) {
  const data = await getJSON(`${API}/files/${key}/nodes?ids=${encodeURIComponent(nodeId)}&depth=${depth}`);
  const node = data.nodes[nodeId]?.document;
  if (!node) return console.log('  (nó vazio ou inacessível)');
  const walk = (n, d) => {
    if (!n || d > depth) return;
    const box = n.absoluteBoundingBox;
    const size = box ? `${Math.round(box.width)}x${Math.round(box.height)}` : '';
    const txt = n.characters ? ` "${String(n.characters).replace(/\n/g, ' ')}"` : '';
    console.log(`${'  '.repeat(d)}- [${n.id}] ${n.name || '(sem nome)'} · ${n.type} ${size}${txt}`);
    (n.children || []).forEach(c => walk(c, d + 1));
  };
  console.log(`\n${node.name || '(raiz)'} [${node.id}]`);
  (node.children || []).forEach(c => walk(c, 1));
}

/* ---------------------------------------------------------------- exportar */
async function exportProject(name, cfg, { force = false } = {}) {
  const outDir = path.join(ROOT, cfg.dir);
  fs.mkdirSync(outDir, { recursive: true });

  const entries = Object.entries(cfg.items);
  const pending = entries.filter(([file]) => force || !fs.existsSync(path.join(outDir, `${file}.${cfg.ext}`)));
  console.log(`\n▸ ${cfg.label} — ${entries.length} itens, ${pending.length} para baixar`);
  if (!pending.length) return { done: 0, skipped: entries.length };

  /* o endpoint de imagens aceita vários ids por chamada; 12 por vez é seguro */
  const chunks = [];
  for (let i = 0; i < pending.length; i += 12) chunks.push(pending.slice(i, i + 12));

  let done = 0;
  for (const chunk of chunks) {
    const ids = chunk.map(([, id]) => id).join(',');
    const q = new URLSearchParams({ ids, format: cfg.ext });
    if (cfg.ext === 'png') q.set('scale', String(cfg.scale || 2));
    const data = await getJSON(`${API}/images/${cfg.key}?${q}`);
    if (data.err) { console.log(`    ! ${data.err}`); }
    for (const [file, id] of chunk) {
      const url = data.images?.[id];
      if (!url) { console.log(`    ! ${file} (${id}) sem imagem`); continue; }
      const res = await api(url);
      if (!res.ok) { console.log(`    ! ${file}: falha ao baixar (${res.status})`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(path.join(outDir, `${file}.${cfg.ext}`), buf);
      console.log(`    ✓ ${cfg.dir}/${file}.${cfg.ext} (${(buf.length / 1024).toFixed(1)} KB)`);
      done++;
    }
    await sleep(PAUSE);
  }
  return { done, skipped: entries.length - pending.length };
}

/* -------------------------------------------------------------- manifesto */
function writeManifest(results) {
  const manifest = {
    geradoEm: new Date().toISOString(),
    fonte: 'Figma · community files (uso ilustrativo; marcas dos respectivos titulares)',
    arquivos: Object.fromEntries(Object.entries(PROJECTS).map(([k, v]) => [k, { arquivo: FILES[k.startsWith('bank') ? 'banks' : k.startsWith('ref') ? (k === 'refpay' ? 'hotmart' : 'cards') : k === 'pay' ? 'hotmart' : k === 'brands' ? 'hotmart' : 'cards'], pasta: v.dir, itens: Object.keys(v.items) }])),
    resultado: results,
  };
  const p = path.join(ROOT, 'images', 'figma-manifest.json');
  fs.writeFileSync(p, JSON.stringify(manifest, null, 2));
  console.log(`\n  manifesto: ${path.relative(ROOT, p)}`);
}

/* --------------------------------------------------------------------- CLI */
const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const value = (f, d) => { const i = argv.indexOf(f); return i > -1 ? argv[i + 1] : d; };

(async () => {
  try {
    if (flag('--list')) {
      const key = argv[argv.indexOf('--list') + 1];
      const node = argv[argv.indexOf('--list') + 2];
      if (!key || !node) { console.error('uso: --list <fileKey> <nodeId> [--depth N]'); process.exit(1); }
      await listNode(key, node, Number(value('--depth', 3)));
      return;
    }

    console.log('\n  DAVVERO LIMONE · exportação de assets do Figma');
    console.log('  ───────────────────────────────────────────');
    const only = value('--only', null);
    const force = flag('--force');
    const results = {};
    for (const [name, cfg] of Object.entries(PROJECTS)) {
      if (only && only !== name) continue;
      results[name] = await exportProject(name, cfg, { force });
      await sleep(PAUSE);
    }
    writeManifest(results);
    const total = Object.values(results).reduce((s, r) => s + r.done, 0);
    console.log(`\n  ${total} arquivo(s) baixado(s). Pronto.\n`);
  } catch (err) {
    console.error(`\n  erro: ${err.message}\n`);
    process.exit(1);
  }
})();
