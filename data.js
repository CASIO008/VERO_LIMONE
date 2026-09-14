/* ============================================================
   VERO LIMONE — street basics
   Núcleo compartilhado: marca oficial, utilidades, catálogo,
   ilustrações SVG e carrinho.
   ============================================================ */
'use strict';

const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

/* ---------------- utils ---------------- */
function shade(hex, p) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = v => Math.round(Math.min(255, Math.max(0, v)));
  const r = clamp(((n >> 16) & 255) + 255 * p);
  const g = clamp(((n >> 8) & 255) + 255 * p);
  const b = clamp((n & 255) + 255 * p);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}
function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function luma(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}
const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/* ---------------- marca oficial (símbolo) ----------------
   Paths exatos do arquivo enviado. viewBox recortado no
   bounding box do símbolo (canvas 1080, centro 540,540).  */
function markSVG(o = {}) {
  const blob    = o.blob    || '#E1EC2A';
  const chevron = o.chevron || '#FD4700';
  const dash    = o.dash    || '#FF6701';
  const curve   = o.curve   || '#FF784F';
  const W = 51.5;
  return `<svg viewBox="196 162 688 756" fill="none" aria-hidden="true">
    <path class="mk-draw" pathLength="1" d="m308.82 871.09l-44.49-22.89 6.35-76.28c0 0-26.7-116.96-29.24-134.76-2.54-17.8-11.44-179.26-11.44-179.26l89-161.46c0 0 133.49-81.37 142.39-76.28 8.89 5.08 144.93 6.35 144.93 6.35l146.21-30.51 27.96 22.88c0 0-34.32 64.84 1.28 116.97 35.59 52.12 62.29 108.06 63.56 118.24 1.27 10.17 5.09 221.21 5.09 221.21l-62.3 110.61-171.63 97.89-277.15-36.87z" stroke="${blob}" stroke-width="${W}" stroke-linejoin="bevel"/>
    <path d="m378.03 728.45l170.99-171.58-171.58-174.56" stroke="${chevron}" stroke-width="${W}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m442.39 558.04l-69.87 0.23" stroke="${dash}" stroke-width="${W}" stroke-linecap="round"/>
    <path d="m587.08 722.21v-93.87" stroke="${blob}" stroke-width="${W}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m577.69 346.74c0 0 0 191.94 190.86 190.86" stroke="${curve}" stroke-width="${W}" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}
function attachMarks() {
  $$('[data-mark]').forEach(el => {
    el.innerHTML = markSVG({
      blob:    el.dataset.blob,
      chevron: el.dataset.chevron,
      dash:    el.dataset.dash,
      curve:   el.dataset.curve
    });
    if (el.dataset.size) el.style.width = el.dataset.size + 'px';
  });
}

/* ---------------- marca oficial (lockup tipográfico) ----------------
   Lockup em HTML/CSS: VERO grande, LIMONE deslocado ao lado e
   "street basics" abaixo. Usa a fonte Futura Renner do projeto,
   então o texto flui sozinho e fica legível em qualquer tamanho.  */
function brandLockupHTML() {
  return `<span class="lk-row">
      <span class="lk-vero">VERO</span>
      <span class="lk-limone">LIMONE</span>
    </span>
    <span class="lk-sub">street basics</span>`;
}
function attachLockups() {
  $$('[data-lockup]').forEach(el => {
    el.innerHTML = brandLockupHTML();
  });
}

/* ---------------- paleta ---------------- */
const COLORS = {
  limone:     { name: 'Lima',        hex: '#E1EC2A' },
  laranja:    { name: 'Laranja',     hex: '#FD4700' },
  coral:      { name: 'Coral',       hex: '#FF784F' },
  preto:      { name: 'Preto',       hex: '#23211C' },
  cru:        { name: 'Cru',         hex: '#EFE9DA' },
  cinza:      { name: 'Cinza',       hex: '#8A8880' },
  jeans:      { name: 'Azul jeans',  hex: '#4C6B8F' },
  jeansClaro: { name: 'Jeans claro', hex: '#B9C7D4' },
  prata:      { name: 'Prata 925',   hex: '#C6C9CE' }
};
const CREAM_GARMENT = '#F7F3E8';

const SIZES = ['PP', 'P', 'M', 'G', 'GG'];
const CAT_LABEL = {
  camisetas: 'Camisetas', moletons: 'Moletons', jaquetas: 'Jaquetas',
  calcas: 'Calças', shorts: 'Shorts', underwear: 'Underwear', acessorios: 'Acessórios'
};
const FREE_SHIP = 199;
const STANDARD_SHIP = 19.90;
const EXPRESS_SHIP = 34.90;
const COUPONS = { LIMONE10: 0.10 };

/* ------------------ catálogo ------------------ */
const PRODUCTS = [
  /* ---- camisetas ---- */
  { id: 'camiseta-box', name: 'Camiseta Box Graffiti', cat: 'camisetas', type: 'tee', price: 119, badge: 'Novo',
    meta: 'Estampa grafite · Algodão pesado', colorLabel: 'Preto estonado', colors: ['preto'],
    photos: ['images/camiseta-box-graffiti.jpg'],
    desc: 'Camiseta boxy em algodão pesado com estampa grafite nas costas e assinatura no peito. Lavagem estonada, feita para marcar presença.',
    specs: ['Algodão pesado 240g', 'Estampa em silk de alta cobertura', 'Corte boxy unissex'] },

  { id: 'camiseta-washed', name: 'Camiseta Washed Oversized', cat: 'camisetas', type: 'tee', price: 129, badge: 'Best-seller',
    meta: 'Fio pesado · Lavagem estonada', colorLabel: 'Preto lavado', colors: ['preto'],
    photos: ['images/camiseta-washed-1.jpg', 'images/camiseta-washed-2.jpg'],
    desc: 'Oversized de ombro caído com lavagem estonada e grafismos refletivos. Cai bem em quem gosta de volume sem exagero.',
    specs: ['Fio pesado com lavagem', 'Grafismo refletivo', 'Ombro caído oversized'] },

  { id: 'camiseta-heavy', name: 'Camiseta Heavy', cat: 'camisetas', type: 'tee', price: 139, badge: '',
    meta: 'Alta gramatura · Recortes', colorLabel: 'Preto', colors: ['preto'],
    photos: ['images/camiseta-heavy.jpg'],
    desc: 'Nossa camiseta de maior gramatura, com recortes de painéis e gola canelada dupla. Estrutura que não deforma.',
    specs: ['Gramatura máxima', 'Painéis costurados', 'Gola canelada dupla'] },

  { id: 'manga-longa-sport', name: 'Manga Longa Sport', cat: 'camisetas', type: 'longsleeve', price: 149, badge: 'Novo',
    meta: 'Elastano · Treino e academia', colorLabel: 'Preto', colors: ['preto'],
    photos: ['images/manga-longa-sport-1.jpg', 'images/manga-longa-sport-2.webp'],
    desc: 'Manga longa de treino com elastano: justa na medida, respirável e de toque seco. Vai do treino ao rolê sem perder a forma.',
    specs: ['Tecido com elastano', 'Toque seco · respirável', 'Costura flatlock anti-atrito'] },

  /* ---- moletons ---- */
  { id: 'hoodie-puff', name: 'Hoodie Puff Print', cat: 'moletons', type: 'hoodie', price: 269, oldPrice: 319, badge: 'Best-seller',
    meta: 'Estampa puff 3D · Capuz duplo', colorLabel: 'Preto', colors: ['preto'],
    photos: ['images/hoodie-puff.jpg'],
    desc: 'Hoodie pesado com estampa puff 3D de alto relevo, capuz forrado e barra canelada. O moletom que vira o look sozinho.',
    specs: ['Moletom pesado 480g', 'Estampa puff em relevo', 'Capuz forrado · mangas amplas'] },

  /* ---- jaquetas ---- */
  { id: 'jaqueta-sherpa', name: 'Jaqueta Sherpa Vero', cat: 'jaquetas', type: 'jacket', price: 379, badge: 'Novo',
    meta: 'Sherpa macio · Gola esportiva', colorLabel: 'Verde & cru', colors: ['limone'],
    photos: ['images/jaqueta-sherpa.jpg'],
    desc: 'Jaqueta sherpa com gola esportiva, painéis em verde e cru e estampas bordadas. Aquece de verdade e não passa despercebida.',
    specs: ['Sherpa peluciado', 'Gola e punhos canelados', 'Estampas bordadas'] },

  { id: 'jaqueta-fleece', name: 'Jaqueta Fleece Star', cat: 'jaquetas', type: 'jacket', price: 349, badge: '',
    meta: 'Fleece peluciado · Zíper metálico', colorLabel: 'Preto & cru', colors: ['preto'],
    photos: ['images/jaqueta-fleece.webp'],
    desc: 'Fleece de corte reto com painéis geométricos e zíper metálico. Leve, quente e perfeita para meia-estação.',
    specs: ['Fleece peluciado', 'Zíper metálico YKK', 'Bolsos embutidos'] },

  /* ---- calças ---- */
  { id: 'calca-baggy', name: 'Calça Jeans Baggy', cat: 'calcas', type: 'jeans', price: 319, badge: 'Novo',
    meta: 'Denim pesado · Estampa no bolso', colorLabel: 'Azul escuro', colors: ['jeans'],
    photos: ['images/calca-jeans-baggy.jpg'],
    desc: 'Baggy em denim pesado com bolsos cargo laterais e estampa assinada no bolso traseiro. Caimento amplo do quadril à barra.',
    specs: ['Denim pesado baggy', 'Bolsos cargo laterais', 'Cinco bolsos + pespontos'] },

  { id: 'calca-wide', name: 'Calça Wide Leg', cat: 'calcas', type: 'jeans', price: 299, badge: '',
    meta: 'Denim rígido · Corte amplo', colorLabel: 'Preto estonado', colors: ['preto'],
    photos: ['images/calca-wide-leg.jpg'],
    desc: 'Wide leg de denim rígido com costura central marcada e barra ampla. Estrutura que cai reta e afina a silhueta.',
    specs: ['Denim rígido', 'Costura central', 'Barra ampla'] },

  { id: 'calca-balloon', name: 'Calça Balloon', cat: 'calcas', type: 'jeans', price: 289, badge: '',
    meta: 'Pregas · Barra elástica', colorLabel: 'Preto', colors: ['preto'],
    photos: ['images/calca-balloon.jpg'],
    desc: 'Calça balloon com pregas profundas e barra elástica que arredonda o caimento. Conforto de moletom com pegada técnica.',
    specs: ['Pregas frontais', 'Barra elástica', 'Cós com botão e elástico'] },

  { id: 'calca-moletom', name: 'Calça Moletom', cat: 'calcas', type: 'jeans', price: 219, badge: '',
    meta: 'Moletom peluciado · Cordão', colorLabel: 'Cinza mescla', colors: ['cinza'],
    photos: ['images/calca-moletom.jpg'],
    desc: 'Calça de moletom peluciado com cordão, bolso faca e barra canelada. A peça de descanso que também veste bem na rua.',
    specs: ['Moletom peluciado', 'Cós com cordão de algodão', 'Barra canelada'] },

  { id: 'calca-cargo', name: 'Calça Cargo', cat: 'calcas', type: 'jeans', price: 279, badge: '',
    meta: 'Corduroy · Bolsos utilitários', colorLabel: 'Chumbo', colors: ['cinza'],
    photos: ['images/calca-cargo-corduroy.jpg'],
    desc: 'Cargo em corduroy com bolsos utilitários e ajuste de cordão na barra. Textura e volume na medida.',
    specs: ['Corduroy resistente', 'Bolsos utilitários', 'Ajuste na barra'] },

  /* ---- shorts ---- */
  { id: 'shorts-cargo', name: 'Shorts Cargo', cat: 'shorts', type: 'shorts', price: 159, badge: 'Novo',
    meta: 'Sarja · Bolsos com cordão', colorLabel: 'Bege & militar', colors: ['cru'],
    photos: ['images/shorts-cargo.jpg'],
    desc: 'Shorts cargo em sarja com bolsos amplos, cordões de ajuste e cós elástico. Do calor da rua ao fim de semana.',
    specs: ['Sarja de algodão', 'Bolsos cargo com cordão', 'Cós elástico com cordão'] },

  /* ---- underwear ---- */
  { id: 'cueca-boxer', name: 'Cueca Boxer Algodão', cat: 'underwear', type: 'boxer', price: 59, badge: '',
    meta: 'Sem costura · Kit 3 por R$ 159', colorLabel: 'Chumbo', colors: ['cinza'],
    photos: ['images/cueca-boxer.jpg'],
    desc: 'Cueca boxer sem costura, em malha de algodão com sustentação e cós que não aperta. Disponível em kit com 3.',
    specs: ['Malha sem costura', 'Algodão respirável', 'Cós confortável · Unissex'] },

  /* ---- acessórios ---- */
  { id: 'colar-cuban', name: 'Colar Cuban Chain', cat: 'acessorios', type: 'necklace', price: 249, badge: 'Prata 925',
    meta: 'Prata 925 · Corrente cubana', colorLabel: 'Prata 925', colors: ['prata'],
    photos: ['images/colar-cuban.jpg'],
    desc: 'Corrente cubana em prata 925 com fecho reforçado. Livre de chumbo e zinco — hipoalergênica, feita para usar todos os dias.',
    specs: ['Prata 925 genuína', 'Livre de chumbo e zinco', 'Fecho reforçado'] },

  { id: 'pulseira-cuban', name: 'Pulseira Cuban', cat: 'acessorios', type: 'bracelet', price: 199, badge: 'Prata 925',
    meta: 'Prata 925 · Pingente pássaro', colorLabel: 'Prata 925', colors: ['prata'],
    photos: ['images/pulseira-cuban.webp'],
    desc: 'Pulseira de elos cubanos em prata 925 com pingente de pássaro. Sem chumbo e sem zinco na liga — segura para pele sensível.',
    specs: ['Prata 925 genuína', 'Livre de chumbo e zinco', 'Fecho ajustável'] },

  { id: 'pulseira-kit', name: 'Pulseira Kit 3', cat: 'acessorios', type: 'bracelet', price: 299, badge: 'Prata 925',
    meta: 'Kit 3 peças · Combinar', colorLabel: 'Prata 925', colors: ['prata'],
    photos: ['images/pulseira-kit-1.webp', 'images/pulseira-kit-2.jpg'], fit: 'cover',
    desc: 'Trio de pulseiras em prata 925: cubana, corda torcida e cuff liso. Use juntas para o efeito empilhado.',
    specs: ['3 peças em prata 925', 'Livre de chumbo e zinco', 'Ajuste deslizante'] },

  { id: 'anel-star', name: 'Anel Star 925', cat: 'acessorios', type: 'ring', price: 169, badge: 'Prata 925',
    meta: 'Prata 925 · Relevo de estrelas', colorLabel: 'Prata 925', colors: ['prata'],
    photos: ['images/anel-star.jpg'],
    desc: 'Anel aberto em prata 925 com relevo de estrelas e acabamento oxidado nos detalhes. Ajustável, sem chumbo e sem zinco.',
    specs: ['Prata 925 genuína', 'Livre de chumbo e zinco', 'Tam. ajustável'] },

  { id: 'anel-wings', name: 'Anel Wings', cat: 'acessorios', type: 'ring', price: 189, badge: 'Prata 925',
    meta: 'Prata 925 · Asas esculpidas', colorLabel: 'Prata 925', colors: ['prata'],
    photos: ['images/anel-wings-1.webp', 'images/anel-wings-2.webp'],
    desc: 'Anel de asas esculpidas em prata 925, com acabamento trabalhado à mão. Livre de chumbo e zinco.',
    specs: ['Prata 925 genuína', 'Livre de chumbo e zinco', 'Tam. ajustável'] },

  { id: 'touca-lima', name: 'Touca Lima', cat: 'acessorios', type: 'beanie', price: 89, badge: '',
    meta: 'Tricô canelado · Dobra dupla', colorLabel: 'Preto', colors: ['preto'],
    photos: ['images/touca-1.jpg', 'images/touca-2.jpg'],
    desc: 'Touca de tricô canelado com dobra dupla e etiqueta aplicada. Aquece de verdade e fecha qualquer look.',
    specs: ['Tricô canelado', 'Dobra dupla', 'Unissex'] },

  { id: 'relogio-digital', name: 'Relógio Digital', cat: 'acessorios', type: 'watch', price: 199, badge: 'Novo',
    meta: 'Mostrador digital · 30m', colorLabel: 'Preto & verde', colors: ['preto'],
    photos: ['images/relogio-digital-1.jpg', 'images/relogio-digital-2.jpg'],
    desc: 'Relógio digital de pulso com caixa leve, luz, alarme e cronômetro. Resiste a respingos — do rolê à academia.',
    specs: ['Mostrador digital com luz', 'Alarme e cronômetro', 'Resistente a respingos'] },

  { id: 'relogio-field', name: 'Relógio Field Solar', cat: 'acessorios', type: 'watch', price: 349, badge: '',
    meta: 'Solar · Pulseira nato', colorLabel: 'Verde militar', colors: ['cinza'],
    photos: ['images/relogio-field-1.jpg', 'images/relogio-field-2.jpg'],
    desc: 'Relógio de campo com carga solar, caixa fosca e pulseira nato de algodão. Estilo militar e energia infinita.',
    specs: ['Movimento solar', 'Pulseira nato de algodão', 'Resistente a respingos'] },

  { id: 'bone-washed', name: 'Boné Washed', cat: 'acessorios', type: 'beanie', price: 129, badge: '',
    meta: 'Sarja estonada · Ajuste traseiro', colorLabel: 'Cinza estonado', colors: ['cinza'],
    photos: ['images/bone-1.jpg', 'images/bone-2.jpg'],
    desc: 'Boné de sarja lavada com aba curva, respiros bordados e ajuste traseiro. A lavagem estonada dá o tom usado certo.',
    specs: ['Sarja de algodão estonada', 'Aba curva estruturada', 'Ajuste traseiro regulável'] }
];

/* ------------------ ilustrações ------------------
   viewBox 0 0 220 260 · flat-lay frontal.
   Recebem: u=gradiente, line=sombra, dark, light, hi,
   mark=cor de contraste p/ estampa, stitch=pesponto.  */
const GARMENTS = {

  /* --- camiseta boxy --- */
  tee: ({ u, line, mark }) => `
    <g fill="${u}" stroke="${line}" stroke-opacity=".2" stroke-width="1.6">
      <path d="M64 64 C78 76 92 82 110 82 C128 82 142 76 156 64 L188 84 C195 90 197 99 194 107 L164 117 C162 151 164 184 164 209 Q164 218 155 218 L65 218 Q56 218 56 209 C56 184 58 151 56 117 L26 107 C23 99 25 90 32 84 Z"/>
    </g>
    <g fill="none" stroke="${line}" stroke-opacity=".3" stroke-width="2" stroke-linecap="round">
      <path d="M90 72 C102 82 118 82 130 72" stroke-width="4" stroke-opacity=".4"/>
      <path d="M58 210 C92 215 128 215 162 210"/>
      <path d="M36 92 C42 98 46 103 48 108 M184 92 C178 98 174 103 172 108"/>
    </g>
    <path d="M97 124 l13 12 l-13 12" fill="none" stroke="${mark}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>`,

  /* --- manga longa / sweater --- */
  longsleeve: ({ u, line, dark, mark }) => `
    <g fill="${u}" stroke="${line}" stroke-opacity=".2" stroke-width="1.6">
      <path d="M66 62 C80 74 94 80 110 80 C126 80 140 74 154 62 C168 70 180 84 184 102 C188 122 190 152 189 172 Q189 180 181 180 L172 180 Q164 180 164 172 C162 152 160 134 156 118 C158 152 160 186 160 212 Q160 220 151 220 L69 220 Q60 220 60 212 C60 186 62 152 64 118 C60 134 58 152 56 172 Q56 180 48 180 L39 180 Q31 180 31 172 C30 152 32 122 36 102 C40 84 52 70 66 62 Z"/>
      <path d="M164 154 Q176 160 189 154 L189 172 Q189 180 181 180 L172 180 Q164 180 164 172 Z" fill="${dark}" fill-opacity=".35" stroke="none"/>
      <path d="M56 154 Q44 160 31 154 L31 172 Q31 180 39 180 L48 180 Q56 180 56 172 Z" fill="${dark}" fill-opacity=".35" stroke="none"/>
    </g>
    <g fill="none" stroke="${line}" stroke-opacity=".3" stroke-width="2" stroke-linecap="round">
      <path d="M92 70 C102 78 118 78 128 70" stroke-width="4" stroke-opacity=".4"/>
      <path d="M62 212 C92 217 128 217 158 212"/>
      <path d="M168 158 L168 176 M174 158 L174 176 M180 158 L180 176 M40 158 L40 176 M46 158 L46 176 M52 158 L52 176" stroke-opacity=".2"/>
    </g>
    <path d="M97 122 l13 12 l-13 12" fill="none" stroke="${mark}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>`,

  /* --- hoodie --- */
  hoodie: ({ u, line, dark, mark }) => `
    <path d="M82 66 C84 34 136 34 138 66 C122 56 98 56 82 66 Z" fill="${dark}" stroke="none"/>
    <g fill="${u}" stroke="${line}" stroke-opacity=".2" stroke-width="1.6">
      <path d="M66 62 C80 74 94 80 110 80 C126 80 140 74 154 62 C168 70 180 84 184 102 C188 122 190 152 189 172 Q189 180 181 180 L172 180 Q164 180 164 172 C162 152 160 134 156 118 C158 152 160 186 160 212 Q160 220 151 220 L69 220 Q60 220 60 212 C60 186 62 152 64 118 C60 134 58 152 56 172 Q56 180 48 180 L39 180 Q31 180 31 172 C30 152 32 122 36 102 C40 84 52 70 66 62 Z"/>
      <path d="M164 154 Q176 160 189 154 L189 172 Q189 180 181 180 L172 180 Q164 180 164 172 Z" fill="${dark}" fill-opacity=".4" stroke="none"/>
      <path d="M56 154 Q44 160 31 154 L31 172 Q31 180 39 180 L48 180 Q56 180 56 172 Z" fill="${dark}" fill-opacity=".4" stroke="none"/>
      <path d="M61 198 C92 204 128 204 159 198 L160 212 Q160 220 151 220 L69 220 Q60 220 60 212 Z" fill="${dark}" fill-opacity=".4" stroke="none"/>
    </g>
    <g fill="none" stroke="${line}" stroke-opacity=".35" stroke-width="2" stroke-linecap="round">
      <path d="M88 64 C102 74 118 74 132 64" stroke-width="3.5" stroke-opacity=".45"/>
      <path d="M72 164 L148 164 L144 200 Q143 206 137 206 L83 206 Q77 206 76 200 Z" stroke-opacity=".3" fill="rgba(0,0,0,.05)"/>
      <path d="M72 164 C92 169 128 169 148 164" stroke-opacity=".45"/>
      <path d="M103 84 C101 100 101 112 103 122 M117 84 C119 100 119 112 117 122" stroke-width="3" stroke-opacity=".45"/>
    </g>
    <circle cx="103" cy="125" r="2.5" fill="${line}" opacity=".55"/>
    <circle cx="117" cy="125" r="2.5" fill="${line}" opacity=".55"/>
    <path d="M97 118 l13 12 l-13 12" fill="none" stroke="${mark}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>`,

  /* --- jaqueta bomber --- */
  jacket: ({ u, line, dark }) => `
    <g fill="${u}" stroke="${line}" stroke-opacity=".2" stroke-width="1.6">
      <path d="M66 62 C80 74 94 80 110 80 C126 80 140 74 154 62 C168 70 180 84 184 102 C188 122 190 152 189 172 Q189 180 181 180 L172 180 Q164 180 164 172 C162 152 160 134 156 118 C158 152 160 186 160 212 Q160 220 151 220 L69 220 Q60 220 60 212 C60 186 62 152 64 118 C60 134 58 152 56 172 Q56 180 48 180 L39 180 Q31 180 31 172 C30 152 32 122 36 102 C40 84 52 70 66 62 Z"/>
      <path d="M164 150 Q176 157 189 150 L189 172 Q189 180 181 180 L172 180 Q164 180 164 172 Z" fill="${dark}" fill-opacity=".5" stroke="none"/>
      <path d="M56 150 Q44 157 31 150 L31 172 Q31 180 39 180 L48 180 Q56 180 56 172 Z" fill="${dark}" fill-opacity=".5" stroke="none"/>
      <path d="M61 196 C92 202 128 202 159 196 L160 212 Q160 220 151 220 L69 220 Q60 220 60 212 Z" fill="${dark}" fill-opacity=".5" stroke="none"/>
    </g>
    <path d="M88 66 C102 78 118 78 132 66" fill="none" stroke="${dark}" stroke-width="9" stroke-opacity=".5" stroke-linecap="round"/>
    <path d="M110 82 L110 206" stroke="${line}" stroke-opacity=".45" stroke-width="3"/>
    <path d="M110 84 L110 204" stroke="rgba(255,255,255,.5)" stroke-width="5" stroke-dasharray="1 7" stroke-linecap="round"/>
    <rect x="105" y="88" width="10" height="14" rx="5" fill="${dark}" fill-opacity=".7"/>
    <g fill="none" stroke="${line}" stroke-opacity=".4" stroke-width="4" stroke-linecap="round">
      <path d="M72 154 L94 170 M148 154 L126 170"/>
    </g>
    <g fill="none" stroke="${line}" stroke-opacity=".25" stroke-width="2" stroke-linecap="round">
      <path d="M168 154 L168 176 M175 154 L175 176 M182 154 L182 176 M38 154 L38 176 M45 154 L45 176 M52 154 L52 176"/>
    </g>`,

  /* --- calça jeans --- */
  jeans: ({ u, line, dark, stitch }) => `
    <g fill="${u}" stroke="${line}" stroke-opacity=".2" stroke-width="1.6">
      <path d="M66 40 L154 40 C157 40 159 42 159 46 C161 88 163 132 165 172 C166 196 166 220 165 240 C164.5 245 161 247 156 247 L128 247 C123 247 120.5 245 120 240 C117 202 114 172 110 150 C106 172 103 202 100 240 C99.5 245 97 247 92 247 L64 247 C59 247 55.5 245 55 240 C54 220 54 196 55 172 C57 132 59 88 61 46 C61 42 63 40 66 40 Z"/>
      <path d="M66 40 L154 40 C157 40 159 42 159 46 L160 62 C126 66 94 66 60 62 L61 46 C61 42 63 40 66 40 Z" fill="${dark}" fill-opacity=".45" stroke="none"/>
    </g>
    <g fill="none" stroke="${stitch}" stroke-width="2" stroke-linecap="round">
      <path d="M60 56 C94 60 126 60 160 56" stroke-opacity=".85"/>
      <path d="M110 62 C110 76 107 86 101 92"/>
      <path d="M58 72 C56 110 55 170 56 234" stroke-opacity=".6"/>
      <path d="M162 72 C164 110 165 170 164 234" stroke-opacity=".6"/>
      <path d="M56 238 C74 242 146 242 164 238" stroke-opacity=".8"/>
      <path d="M70 50 C74 64 84 72 96 74" stroke-opacity=".8"/>
      <path d="M150 50 C146 64 136 72 124 74" stroke-opacity=".8"/>
      <path d="M102 148 C106 152 114 152 118 148" stroke-opacity=".7"/>
    </g>
    <g fill="${stitch}">
      <circle cx="70" cy="52" r="2"/><circle cx="150" cy="52" r="2"/>
      <circle cx="97" cy="75" r="2"/><circle cx="123" cy="75" r="2"/>
    </g>
    <g stroke="${line}" stroke-opacity=".3" stroke-width="3" stroke-linecap="round">
      <path d="M64 40 L64 50 M110 40 L110 50 M156 40 L156 50"/>
    </g>`,

  /* --- shorts jeans --- */
  jeanShorts: ({ u, line, dark, stitch }) => `
    <g fill="${u}" stroke="${line}" stroke-opacity=".2" stroke-width="1.6">
      <path d="M64 54 L156 54 C160 54 162 57 162 61 C164 88 165 112 166 136 C166.5 142 164 145 158 145 L128 145 C123 145 120.5 143 120 138 C117 122 114 112 110 104 C106 112 103 122 100 138 C99.5 143 97 145 92 145 L62 145 C56 145 53.5 142 54 136 C55 112 56 88 58 61 C58 57 60 54 64 54 Z"/>
      <path d="M64 54 L156 54 C160 54 162 57 162 61 L162.8 74 C126 78 94 78 57.2 74 L58 61 C58 57 60 54 64 54 Z" fill="${dark}" fill-opacity=".45" stroke="none"/>
    </g>
    <g fill="none" stroke="${stitch}" stroke-width="2" stroke-linecap="round">
      <path d="M60 68 C94 72 126 72 160 68" stroke-opacity=".85"/>
      <path d="M110 74 C110 86 108 94 103 100"/>
      <path d="M58 84 C56 110 55 130 56 140" stroke-opacity=".6"/>
      <path d="M162 84 C164 110 165 130 164 140" stroke-opacity=".6"/>
      <path d="M58 138 C86 142 134 142 162 138" stroke-opacity=".8"/>
      <path d="M70 64 C74 76 82 82 92 84" stroke-opacity=".8"/>
      <path d="M150 64 C146 76 138 82 128 84" stroke-opacity=".8"/>
      <path d="M62 145 L62 151 M74 146 L74 152 M86 147 L86 152 M134 147 L134 152 M146 146 L146 152 M158 145 L158 151" stroke-opacity=".55"/>
    </g>
    <g fill="${stitch}">
      <circle cx="70" cy="66" r="2"/><circle cx="150" cy="66" r="2"/>
    </g>`,

  /* --- shorts treino --- */
  shorts: ({ u, line, dark, mark }) => `
    <g fill="${u}" stroke="${line}" stroke-opacity=".2" stroke-width="1.6">
      <path d="M64 54 L156 54 C160 54 162 57 162 61 C164 88 165 112 166 136 C166.5 142 164 145 158 145 L128 145 C123 145 120.5 143 120 138 C117 122 114 112 110 104 C106 112 103 122 100 138 C99.5 143 97 145 92 145 L62 145 C56 145 53.5 142 54 136 C55 112 56 88 58 61 C58 57 60 54 64 54 Z"/>
      <path d="M64 54 L156 54 C160 54 162 57 162 61 L162.8 74 C126 78 94 78 57.2 74 L58 61 C58 57 60 54 64 54 Z" fill="${dark}" fill-opacity=".4" stroke="none"/>
    </g>
    <g fill="none" stroke="${line}" stroke-opacity=".25" stroke-width="2" stroke-linecap="round">
      <path d="M60 63 C94 67 126 67 160 63"/>
      <path d="M59 69 C94 73 126 73 161 69"/>
      <path d="M60 138 C88 142 132 142 160 138" stroke-opacity=".3"/>
    </g>
    <g fill="none" stroke="${line}" stroke-opacity=".45" stroke-width="3" stroke-linecap="round">
      <path d="M103 60 C99 68 97 74 98 80 M117 60 C121 68 123 74 122 80"/>
    </g>
    <circle cx="98" cy="83" r="2.5" fill="${line}" opacity=".5"/>
    <circle cx="122" cy="83" r="2.5" fill="${line}" opacity=".5"/>
    <path d="M70 116 l9 8 l-9 8" fill="none" stroke="${mark}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>`,

  /* --- cueca boxer --- */
  boxer: ({ u, line, dark, mark }) => `
    <g fill="${u}" stroke="${line}" stroke-opacity=".2" stroke-width="1.6">
      <path d="M64 66 L156 66 C160 66 163 69 163 73 L163 112 C163 138 152 166 128 182 C122 186 116 189 110 190 C104 189 98 186 92 182 C68 166 57 138 57 112 L57 73 C57 69 60 66 64 66 Z"/>
      <path d="M64 66 L156 66 C160 66 163 69 163 73 L163 88 L57 88 L57 73 C57 69 60 66 64 66 Z" fill="${dark}" fill-opacity=".45" stroke="none"/>
    </g>
    <g fill="none" stroke="${line}" stroke-opacity=".3" stroke-width="2" stroke-linecap="round">
      <path d="M92 88 C94 118 100 148 110 168 M128 88 C126 118 120 148 110 168"/>
      <path d="M70 82 C94 86 126 86 150 82" stroke-opacity=".2"/>
      <path d="M74 164 C86 176 98 185 110 188 C122 185 134 176 146 164" stroke-opacity=".35"/>
    </g>
    <path d="M101 74 l9 8 l-9 8" fill="none" stroke="${mark}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity=".8"/>`,

  /* --- touca --- */
  beanie: ({ u, line, dark, mark }) => `
    <g fill="${u}" stroke="${line}" stroke-opacity=".2" stroke-width="1.6">
      <path d="M64 132 C64 80 84 46 110 46 C136 46 156 80 156 132 Z"/>
      <path d="M56 130 L164 130 C168 130 170 133 170 137 L170 158 C170 162 168 165 164 165 L56 165 C52 165 50 162 50 158 L50 137 C50 133 52 130 56 130 Z" fill="${dark}" fill-opacity=".3"/>
    </g>
    <g fill="none" stroke="${line}" stroke-opacity=".22" stroke-width="2" stroke-linecap="round">
      <path d="M82 54 C76 78 74 104 75 130 M96 48 C92 74 91 104 92 130 M110 46 L110 130 M124 48 C128 74 129 104 128 130 M138 54 C144 78 146 104 145 130"/>
      <path d="M66 133 L66 162 M78 133 L78 162 M90 133 L90 162 M102 133 L102 162 M114 133 L114 162 M126 133 L126 162 M138 133 L138 162 M150 133 L150 162"/>
    </g>
    <path d="M89 141 l9 8 l-9 8" fill="none" stroke="${mark}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>`,

  /* --- relógio --- */
  watch: ({ u, line, dark, light }) => `
    <g fill="${u}" stroke="${line}" stroke-opacity=".25" stroke-width="1.6">
      <path d="M95 30 L125 30 C129 30 131 34 131 38 L128 96 L92 96 L89 38 C89 34 91 30 95 30 Z"/>
      <path d="M92 158 L128 158 L131 214 C131 218 129 222 125 222 L95 222 C91 222 89 218 89 214 Z"/>
      <rect x="92" y="86" width="36" height="16" rx="6"/>
      <rect x="92" y="150" width="36" height="16" rx="6"/>
      <circle cx="110" cy="126" r="38"/>
      <rect x="147" y="118" width="10" height="17" rx="4" fill="${dark}" fill-opacity=".6"/>
    </g>
    <circle cx="110" cy="126" r="28" fill="#F7F3E8" stroke="${line}" stroke-opacity=".35" stroke-width="2"/>
    <g stroke="${line}" stroke-opacity=".55" stroke-width="2.6" stroke-linecap="round">
      <path d="M110 104 L110 110 M132 126 L126 126 M110 148 L110 142 M88 126 L94 126"/>
    </g>
    <g stroke="#23211C" stroke-width="3.4" stroke-linecap="round">
      <path d="M110 126 L110 108 M110 126 L124 133"/>
    </g>
    <circle cx="110" cy="126" r="2.6" fill="#23211C"/>
    <path d="M110 34 L110 92 M110 162 L110 216" stroke="${line}" stroke-opacity=".2" stroke-width="2" stroke-dasharray="3 5"/>`,

  /* --- colar --- */
  necklace: ({ u, line, light }) => `
    <path d="M72 46 C76 106 90 150 110 162 C130 150 144 106 148 46" fill="none" stroke="${line}" stroke-opacity=".3" stroke-width="6"/>
    <path d="M72 46 C76 106 90 150 110 162 C130 150 144 106 148 46" fill="none" stroke="${u}" stroke-width="5.5" stroke-linecap="round" stroke-dasharray="1.5 6.5"/>
    <circle cx="72" cy="48" r="4.5" fill="none" stroke="${light}" stroke-width="2.5"/>
    <circle cx="148" cy="48" r="4.5" fill="none" stroke="${light}" stroke-width="2.5"/>
    <circle cx="110" cy="166" r="4.5" fill="none" stroke="${line}" stroke-opacity=".6" stroke-width="2.5"/>
    <path d="M110 170 C119 170 126 177 126 186 C126 195 119 202 110 202 C101 202 94 195 94 186 C94 177 101 170 110 170 Z" fill="${u}" stroke="${line}" stroke-opacity=".4" stroke-width="2"/>
    <path d="M103 181 l5.5 5 l-5.5 5" fill="none" stroke="#FD4700" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`,

  /* --- pulseira --- */
  bracelet: ({ u, line, dark, light }) => `
    <ellipse cx="110" cy="138" rx="54" ry="36" fill="none" stroke="${line}" stroke-opacity=".3" stroke-width="9"/>
    <ellipse cx="110" cy="138" rx="54" ry="36" fill="none" stroke="${u}" stroke-width="7" stroke-dasharray="2 7" stroke-linecap="round"/>
    <ellipse cx="110" cy="138" rx="54" ry="36" fill="none" stroke="${light}" stroke-opacity=".5" stroke-width="2" stroke-dasharray="14 120"/>
    <rect x="101" y="97" width="18" height="11" rx="5" fill="${dark}" fill-opacity=".75" stroke="${line}" stroke-opacity=".4" stroke-width="1.5"/>
    <circle cx="110" cy="174" r="3.5" fill="none" stroke="${line}" stroke-opacity=".6" stroke-width="2.5"/>
    <path d="M110 178 L110 188" stroke="${line}" stroke-opacity=".5" stroke-width="2.5"/>
    <path d="M104 190 l6 5 l-6 5" fill="none" stroke="#FD4700" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`,

  /* --- anel --- */
  ring: ({ u, line, light }) => `
    <circle cx="110" cy="140" r="40" fill="none" stroke="${line}" stroke-opacity=".25" stroke-width="20"/>
    <circle cx="110" cy="140" r="40" fill="none" stroke="${u}" stroke-width="17"/>
    <path d="M77 116 A40 40 0 0 1 143 116" fill="none" stroke="${light}" stroke-opacity=".8" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M103 132 l8 7 l-8 7" fill="none" stroke="#FD4700" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`
};

let gradId = 0;
function garmentSVG(type, color) {
  const id = 'g' + (++gradId);
  const u = `url(#${id})`;
  const light = shade(color, 0.16);
  const dark  = shade(color, -0.14);
  const line  = shade(color, -0.42);
  const mark  = luma(color) > 150 ? '#23211C' : '#F7F3E8';
  const stitch = luma(color) > 150 ? 'rgba(35,33,28,.6)' : 'rgba(240,230,207,.85)';
  const build = GARMENTS[type] || GARMENTS.tee;
  return `<svg viewBox="0 0 220 260" class="garment-svg" aria-hidden="true">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stop-color="${light}"/>
        <stop offset=".55" stop-color="${color}"/>
        <stop offset="1" stop-color="${dark}"/>
      </linearGradient>
    </defs>
    ${build({ u, line, dark, light, mark, stitch })}
  </svg>`;
}

/* ---------------- thumbnail (foto ou ilustração) ---------------- */
function productThumb(p, colorKey) {
  if (p.photos && p.photos.length) {
    return `<img src="${p.photos[0]}" alt="${p.name}" loading="lazy" decoding="async">`;
  }
  /* peças ilustradas usam a cor do tile no fundo claro das miniaturas */
  const key = p.tile || colorKey;
  const hex = COLORS[key] ? COLORS[key].hex : '#EFE9DA';
  return garmentSVG(p.type, hex);
}

/* ---------------- carrinho (compartilhado) ---------------- */
function loadCart() {
  try { return JSON.parse(localStorage.getItem('vl_cart') || '[]'); } catch (e) { return []; }
}
function saveCart(cart) {
  try { localStorage.setItem('vl_cart', JSON.stringify(cart)); } catch (e) {}
}
const cartCount = cart => cart.reduce((s, i) => s + i.qty, 0);
const cartTotal = cart => cart.reduce((s, i) => s + i.qty * i.price, 0);

attachMarks();
attachLockups();
