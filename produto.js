/* ============================================================
   DAVVERO LIMONE — página de produto (PDP)
   Depende de data.js (catálogo, preço, carrinho, marca, $/$$)
   ============================================================ */
'use strict';

/* ---------------- estado ---------------- */
const pd = {
  product: null,
  color: null,
  size: 'M',
  qty: 1,
  photo: 0,
  cart: loadCart()
};

/* ---------------- toast ---------------- */
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.querySelector('span').textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ---------------- carrinho ---------------- */
function bumpBadge() {
  const el = $('#pdCartCount');
  if (!el) return;
  el.textContent = cartCount(pd.cart);
  el.classList.toggle('zero', cartCount(pd.cart) === 0);
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}
function addToCart(id, colorKey, size, qty) {
  const p = productById(id);
  if (!p) return;
  const key = `${id}__${colorKey}__${size}`;
  const found = pd.cart.find(i => i.key === key);
  if (found) found.qty = Math.min(9, found.qty + qty);
  else pd.cart.push({ key, id, color: colorKey, size, qty, price: p.price });
  saveCart(pd.cart);
  bumpBadge();
  toast('Produto adicionado ao carrinho');
}
const productById = id => PRODUCTS.find(p => p.id === id);
const sizesOf = p => (p.cat === 'acessorios' ? ['Único'] : SIZES);
const defaultSize = p => (p.cat === 'acessorios' ? 'Único' : 'M');

/* ---------------- galeria ----------------
   Foto lateral (campanha/look) ao lado da foto do produto, no
   espírito da PDP da Asteric. Produtos com 2ª foto usam a própria
   foto; os demais ganham um visual de campanha por categoria.     */
const SIDE_LOOK = {
  camisetas:  'images/look-street-1.jpg',
  moletons:   'images/look-street-1.jpg',
  jaquetas:   'images/look-street-2.jpg',
  calcas:     'images/look-street-1.jpg',
  shorts:     'images/look-street-2.jpg',
  underwear:  'images/cueca-boxer.jpg',
  acessorios: 'images/hero-person.png'
};

function renderMedia() {
  const p = pd.product;
  const stage = $('#pdStage');
  const thumbs = $('#pdThumbs');
  const side = $('#pdPaneSide');
  const photos = p.photos || [];

  /* lado esquerdo: 2ª foto do produto ou visual de campanha */
  const sideSrc = photos[1] || SIDE_LOOK[p.cat] || photos[0] || '';
  side.innerHTML = sideSrc
    ? `<img class="pd-side-photo" src="${sideSrc}" alt="${p.name} — visual DAVVERO LIMONE" loading="lazy" decoding="async">`
    : `<span class="pd-side-mark" data-mark></span>`;

  /* lado direito: a foto escolhida na miniatura */
  if (!photos.length) {
    stage.style.removeProperty('--pd-bg');
    stage.innerHTML = `<div class="pd-illustrated">${garmentSVG(p.type, CREAM_GARMENT)}</div>`;
    thumbs.innerHTML = '';
    return;
  }

  const src = photos[pd.photo] || photos[0];
  /* fundo = a mesma foto ampliada e desfocada, então a peça inteira (contain)
     encaixa sem emenda visível nas laterais */
  stage.style.setProperty('--pd-bg', `url("${src}")`);
  stage.innerHTML = `
    <span class="pd-backdrop" aria-hidden="true"></span>
    <img class="pd-photo${p.fit === 'cover' ? ' fit-cover' : ''}" src="${src}" alt="${p.name}" decoding="async">`;
  thumbs.innerHTML = photos.map((ph, i) =>
    `<button class="pd-thumb${i === pd.photo ? ' is-active' : ''}" type="button" data-photo="${i}" aria-label="Ver foto ${i + 1}">
      <img src="${ph}" alt="" loading="lazy" decoding="async">
    </button>`).join('');
  $$('.pd-thumb', thumbs).forEach(b => b.addEventListener('click', () => {
    pd.photo = +b.dataset.photo;
    renderMedia();
  }));
}

/* ---------------- informação ---------------- */
function renderInfo() {
  const p = pd.product;
  const off = offPct(p);

  document.title = `${p.name} — DAVVERO LIMONE`;

  $('#pdName').textContent = p.name;

  const old = $('#pdOld');
  if (p.oldPrice) { old.hidden = false; old.textContent = brl(p.oldPrice); }
  else old.hidden = true;

  $('#pdPrice').textContent = brl(p.price);

  const offEl = $('#pdOff');
  if (off) { offEl.hidden = false; offEl.textContent = `-${off}%`; }
  else offEl.hidden = true;

  $('#pdInstall').innerHTML = `Ou ${installmentLabel(p.price)} <em>sem juros</em>`;
  $('#pdPix').innerHTML = `${brl(pixPrice(p.price))} <em>no Pix (5% off)</em>`;

  /* cor: botões com nome, como na referência */
  const colors = (p.colors && p.colors.length) ? p.colors : [pd.color];
  if (!colors.includes(pd.color)) pd.color = colors[0];
  $('#pdColorName').textContent = p.colorLabel || (COLORS[pd.color] && COLORS[pd.color].name) || '—';
  $('#pdSwatch').innerHTML = colors.map(k => {
    const c = COLORS[k] || { name: k, hex: '#ccc' };
    return `<button class="color-chip${k === pd.color ? ' is-active' : ''}" type="button" data-color="${k}">
        <i style="background:${c.hex}"></i><span>${c.name}</span>
      </button>`;
  }).join('');
  $$('#pdSwatch .color-chip').forEach(b => b.addEventListener('click', () => {
    pd.color = b.dataset.color;
    renderInfo();
  }));

  const sizes = sizesOf(p);
  if (!sizes.includes(pd.size)) pd.size = defaultSize(p);
  $('#pdSizeName').textContent = pd.size;
  $('#pdSizes').innerHTML = sizes.map(s =>
    `<button class="size${s === pd.size ? ' is-active' : ''}" type="button" data-size="${s}">${s}</button>`).join('');
  $$('#pdSizes .size').forEach(b => b.addEventListener('click', () => {
    pd.size = b.dataset.size;
    rememberSize(p.cat, pd.size);
    renderInfo();
  }));


  $('#pdDesc').textContent = p.desc;
  $('#pdSpecs').innerHTML = (p.specs || []).map(s => `<li>${s}</li>`).join('');
  $('#pdQtyVal').textContent = pd.qty;

  /* tabela de medidas */
  const table = $('#pdSizeTable');
  if (p.cat === 'acessorios') {
    table.innerHTML = `<p class="pd-sizehint">Peça de tamanho único, com ajuste. Não é necessário escolher tamanho.</p>`;
  } else {
    table.innerHTML = `<table>
      <thead><tr><th>Tamanho</th><th>Largura</th><th>Comprimento</th></tr></thead>
      <tbody>${SIZE_TABLE.map(r =>
        `<tr${r.t === pd.size ? ' class="is-active"' : ''}><td>${r.t}</td><td>${r.l} cm</td><td>${r.c} cm</td></tr>`).join('')}
      </tbody></table>`;
  }
}

const SIZE_TABLE = [
  { t: 'PP', l: 52, c: 68 },
  { t: 'P',  l: 54, c: 70 },
  { t: 'M',  l: 56, c: 72 },
  { t: 'G',  l: 58, c: 74 },
  { t: 'GG', l: 60, c: 76 }
];

/* ---------------- complete o look ---------------- */
const COMPLEMENT = {
  camisetas:  ['calcas', 'moletons', 'acessorios'],
  moletons:   ['calcas', 'camisetas', 'acessorios'],
  jaquetas:   ['calcas', 'camisetas', 'acessorios'],
  calcas:     ['camisetas', 'moletons', 'acessorios'],
  shorts:     ['camisetas', 'acessorios', 'calcas'],
  underwear:  ['camisetas', 'calcas', 'acessorios'],
  acessorios: ['camisetas', 'moletons', 'calcas']
};

function relatedFor(p) {
  const gender = p.publico === 'mulher' ? 'mulher' : 'homem';
  const pool = PRODUCTS.filter(x => x.id !== p.id && (x.publico === gender || x.publico === 'ambos'));
  const picks = [];
  (COMPLEMENT[p.cat] || []).forEach(cat => {
    pool.filter(x => x.cat === cat && !picks.includes(x)).slice(0, 2).forEach(x => picks.push(x));
  });
  pool.forEach(x => { if (picks.length < 4 && !picks.includes(x)) picks.push(x); });
  return picks.slice(0, 4);
}

function relatedCard(p) {
  const photo = p.photos && p.photos[0];
  return `<a class="pd-card" href="produto.html?id=${encodeURIComponent(p.id)}">
    <span class="pd-card-media">${photo ? `<img src="${photo}" alt="${p.name}" loading="lazy" decoding="async">` : ''}</span>
    <span class="pd-card-info">
      <span class="pd-card-cat">${CAT_LABEL[p.cat]}</span>
      <span class="pd-card-name">${p.name}</span>
      <span class="pd-card-price">${brl(p.price)}</span>
      <span class="pd-card-install">${installmentLabel(p.price)}</span>
    </span>
  </a>`;
}

/* ---------------- init ---------------- */
(function init() {
  const id = new URLSearchParams(location.search).get('id');
  const p = id ? productById(id) : null;

  if (!p) {
    location.replace('index.html#colecao');
    return;
  }
  pd.product = p;
  pd.color = (p.colors && p.colors[0]) || 'preto';
  pd.size = preferredSize(p);

  renderMedia();
  renderInfo();
  bumpBadge();

  $('#pdRelated').innerHTML = relatedFor(p).map(relatedCard).join('');

  /* ações */
  $('#pdAdd').addEventListener('click', () => {
    rememberSize(p.cat, pd.size);
    addToCart(p.id, pd.color, pd.size, pd.qty);
  });
  $('#pdQtyMinus').addEventListener('click', () => {
    pd.qty = Math.max(1, pd.qty - 1);
    $('#pdQtyVal').textContent = pd.qty;
  });
  $('#pdQtyPlus').addEventListener('click', () => {
    pd.qty = Math.min(9, pd.qty + 1);
    $('#pdQtyVal').textContent = pd.qty;
  });

  /* tabela de medidas */
  const sizeModal = $('#sizeModal');
  const openSize = () => {
    sizeModal.classList.add('open');
    sizeModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
  };
  const closeSize = () => {
    sizeModal.classList.remove('open');
    sizeModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
  };
  $('#pdSizeBtn').addEventListener('click', openSize);
  $('#sizeClose').addEventListener('click', closeSize);
  sizeModal.addEventListener('click', e => { if (e.target === sizeModal) closeSize(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSize(); });

  /* entrada suave */
  document.body.classList.add('pd-ready');
})();
