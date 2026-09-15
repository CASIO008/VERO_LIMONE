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

/* ---------------- galeria (carrossel infinito) ----------------
   Uma foto por vez. A lista junta as fotos do produto à foto de
   campanha da categoria (a antiga foto lateral) e o loop infinito
   vem de clones do primeiro/último slide, com setas, miniaturas,
   swipe e teclado.                                                 */
const SIDE_LOOK = {
  camisetas:  'images/look-street-1.jpg',
  moletons:   'images/look-street-1.jpg',
  jaquetas:   'images/look-street-2.jpg',
  calcas:     'images/look-street-1.jpg',
  shorts:     'images/look-street-2.jpg',
  underwear:  'images/cueca-boxer.jpg',
  acessorios: 'images/hero-person.png'
};

let pdPos = 1;      /* posição no track (1 = primeiro slide real) */
let pdCount = 0;    /* total de slides reais */
let pdBusy = false; /* trava durante a transição */

function gallerySlides(p) {
  const list = (p.photos || []).slice();
  const side = SIDE_LOOK[p.cat];
  if (side && !list.includes(side)) list.push(side);
  return list;
}

function slideHTML(src, p, clone) {
  return `<div class="pd-slide${p.fit === 'cover' ? ' fit-cover' : ''}${clone ? ' is-clone' : ''}"${clone ? ' aria-hidden="true"' : ''}>
      <span class="pd-backdrop" style="--pd-bg:url('${src}')"></span>
      <img class="pd-photo" src="${src}" alt="${clone ? '' : p.name}" decoding="async" draggable="false">
    </div>`;
}

function setTrackPos(pos, animate) {
  const track = $('#pdTrack');
  if (!track) return;
  track.style.transition = animate ? '' : 'none';
  track.style.transform = `translate3d(${-pos * 100}%, 0, 0)`;
  if (!animate) void track.offsetWidth; /* aplica o salto sem animar */
}

function syncGallery() {
  if (!pdCount) return;
  const real = ((pdPos - 1) % pdCount + pdCount) % pdCount;
  const counter = $('#pdCounter');
  if (counter) counter.textContent = `${real + 1} / ${pdCount}`;
  $$('.pd-thumb').forEach((b, i) => b.classList.toggle('is-active', i === real));
}

function goSlide(step) {
  if (pdCount < 2 || pdBusy) return;
  pdBusy = true;
  pdPos += step;
  setTrackPos(pdPos, true);
}

function jumpTo(real) {
  if (pdCount < 2 || pdBusy) return;
  if (pdPos === real + 1) return; /* já está nesta foto */
  pdPos = real + 1;
  pdBusy = true;
  setTrackPos(pdPos, true);
}

function onTrackEnd() {
  if (pdPos === 0) { pdPos = pdCount; setTrackPos(pdPos, false); }
  else if (pdPos === pdCount + 1) { pdPos = 1; setTrackPos(pdPos, false); }
  pdBusy = false;
  syncGallery();
}

function renderMedia() {
  const p = pd.product;
  const track = $('#pdTrack');
  const thumbs = $('#pdThumbs');
  const photos = gallerySlides(p);
  pdCount = photos.length;
  pdPos = 1;
  pdBusy = false;

  if (!photos.length) {
    track.innerHTML = `<div class="pd-slide is-illustrated"><div class="pd-illustrated">${garmentSVG(p.type, CREAM_GARMENT)}</div></div>`;
    thumbs.innerHTML = '';
    $$('.pd-arrow').forEach(b => { b.hidden = true; });
    const counter = $('#pdCounter');
    if (counter) counter.textContent = '1 / 1';
    setTrackPos(0, false);
    return;
  }

  /* clones nas pontas = rolagem infinita nos dois sentidos */
  track.innerHTML =
    slideHTML(photos[photos.length - 1], p, true) +
    photos.map(ph => slideHTML(ph, p, false)).join('') +
    slideHTML(photos[0], p, true);

  thumbs.innerHTML = photos.map((ph, i) =>
    `<button class="pd-thumb${i === 0 ? ' is-active' : ''}" type="button" data-slide="${i}" aria-label="Ver foto ${i + 1}">
      <img src="${ph}" alt="" loading="lazy" decoding="async">
    </button>`).join('');

  $$('.pd-thumb', thumbs).forEach(b =>
    b.addEventListener('click', () => jumpTo(+b.dataset.slide)));

  $$('.pd-arrow').forEach(b => { b.hidden = pdCount < 2; });
  setTrackPos(1, false);
  syncGallery();
}

/* controles do carrossel: setas, teclado, swipe */
function initCarousel() {
  const carousel = $('#pdCarousel');
  const track = $('#pdTrack');
  if (!carousel || !track) return;

  track.addEventListener('transitionend', e => {
    if (e.propertyName === 'transform') onTrackEnd();
  });

  $('#pdPrev').addEventListener('click', () => goSlide(-1));
  $('#pdNext').addEventListener('click', () => goSlide(1));

  carousel.tabIndex = 0;
  carousel.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); goSlide(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); goSlide(1); }
  });

  let down = false, startX = 0, dx = 0, pid = null;
  track.addEventListener('pointerdown', e => {
    if (pdCount < 2 || pdBusy) return;
    down = true; startX = e.clientX; dx = 0; pid = e.pointerId;
    track.classList.add('dragging');
    try { track.setPointerCapture(pid); } catch (err) {}
  });
  track.addEventListener('pointermove', e => {
    if (!down) return;
    dx = e.clientX - startX;
    if (Math.abs(dx) < 3) return;
    e.preventDefault();
    track.style.transition = 'none';
    track.style.transform = `translate3d(calc(${-pdPos * 100}% + ${dx}px), 0, 0)`;
  });
  const endDrag = () => {
    if (!down) return;
    down = false;
    track.classList.remove('dragging');
    if (pid !== null) { try { track.releasePointerCapture(pid); } catch (err) {} pid = null; }
    if (Math.abs(dx) > 46) {
      pdBusy = true;
      pdPos += dx < 0 ? 1 : -1;
      dx = 0;
      setTrackPos(pdPos, true);
    } else {
      dx = 0;
      setTrackPos(pdPos, true);
    }
  };
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);
  track.addEventListener('lostpointercapture', endDrag);
  track.addEventListener('dragstart', e => e.preventDefault());
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
  initCarousel();
  renderInfo();
  bumpBadge();

  /* menu mobile (mesmo padrão das outras páginas) */
  const burger = $('#burger');
  const menu = $('#mobileMenu');
  if (burger && menu) {
    const toggle = force => {
      const open = force !== undefined ? force : !menu.classList.contains('open');
      menu.classList.toggle('open', open);
      burger.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-hidden', String(!open));
      document.body.classList.toggle('no-scroll', open);
    };
    burger.addEventListener('click', () => toggle());
    $$('a', menu).forEach(a => a.addEventListener('click', () => toggle(false)));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && menu.classList.contains('open')) toggle(false);
    });
  }

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

  /* barra fixa de compra (celular): aparece quando o botão principal
     sai da tela, para a ação de compra ficar sempre à mão             */
  const buybar = $('#pdBuybar');
  if (buybar) {
    $('#pdBuybarPrice').textContent = brl(p.price);
    $('#pdBuybarPix').textContent = `${brl(pixPrice(p.price))} no Pix`;
    const addMain = $('#pdAdd');
    if (addMain) {
      /* mostra a barra quando o botão principal passa acima da tela */
      const updateBuybar = () => {
        const show = addMain.getBoundingClientRect().bottom < 0;
        buybar.classList.toggle('show', show);
        buybar.setAttribute('aria-hidden', String(!show));
      };
      window.addEventListener('scroll', updateBuybar, { passive: true });
      window.addEventListener('resize', updateBuybar);
      updateBuybar();
    }
    $('#pdBuybarAdd').addEventListener('click', () => {
      rememberSize(p.cat, pd.size);
      addToCart(p.id, pd.color, pd.size, pd.qty);
    });
  }

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
