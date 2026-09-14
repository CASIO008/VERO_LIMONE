/* ============================================================
   VERO LIMONE — loja (home)
   Depende de data.js (marca, catálogo, ilustrações, carrinho)
   ============================================================ */
'use strict';

/* ---------------- estado ---------------- */
const state = {
  filter: 'camisetas',
  colorOf: {},
  cart: loadCart()
};
PRODUCTS.forEach(p => { state.colorOf[p.id] = p.colors[0]; });

const productById = id => PRODUCTS.find(p => p.id === id);
const sizesOf = p => (p.cat === 'acessorios' ? ['Único'] : SIZES);
const defaultSize = p => (p.cat === 'acessorios' ? 'Único' : 'M');

/* ---------------- grid de produtos ---------------- */
function badgeHTML(badge) {
  if (!badge) return '';
  const cls = badge === 'Best-seller' ? 'best' : (badge === 'Prata 925' ? 'silver' : '');
  return `<span class="card-badge ${cls}">${badge}</span>`;
}

function priceHTML(p) {
  return `${p.oldPrice ? `<s>${brl(p.oldPrice)}</s>` : ''}${brl(p.price)}`;
}

function cardHTML(p, i) {
  const ck  = state.colorOf[p.id];
  const hex = COLORS[ck].hex;
  const hasPhoto = p.photos && p.photos.length;

  const tile = p.tile ? COLORS[p.tile].hex : '#EAE6D6';
  const media = hasPhoto
    ? `<img class="card-photo" src="${p.photos[0]}" alt="${p.name}" loading="lazy" decoding="async">
       ${p.photos[1] ? `<img class="card-photo alt" src="${p.photos[1]}" alt="" loading="lazy" decoding="async">` : ''}`
    : `<div class="card-garment">${garmentSVG(p.type, CREAM_GARMENT)}</div>`;

  const mediaClass = hasPhoto
    ? 'has-photo'
    : `is-illustrated ${luma(tile) > 150 ? 'on-light' : 'on-dark'}`;
  const mediaStyle = hasPhoto ? '' : ` style="--tile:${tile}"`;

  const photosLabel = p.photos && p.photos.length > 1 ? ' · ' + p.photos.length + ' fotos' : '';
  const colorsRow = `<span class="color-label"><i style="background:${hex}"></i>${p.colorLabel || COLORS[ck].name}${photosLabel}</span>`;

  return `<article class="card" style="animation-delay:${i * 55}ms" data-id="${p.id}">
    <div class="card-media ${mediaClass}"${mediaStyle} data-open>
      ${badgeHTML(p.badge)}
      <span class="card-index">${String(i + 1).padStart(2, '0')}</span>
      ${media}
      <div class="card-quick">
        <button class="quick-view" data-open>Espiar</button>
        <button class="quick-add" data-add aria-label="Adicionar ${p.name} ao carrinho">+</button>
      </div>
    </div>
    <div class="card-info">
      ${colorsRow}
      <h3>${p.name}</h3>
      <p class="card-meta">${p.meta}</p>
      <p class="card-price">${priceHTML(p)}<span class="pix-hint">5% off no Pix</span></p>
    </div>
  </article>`;
}

function renderGrid() {
  const list = state.filter === 'all' ? PRODUCTS : PRODUCTS.filter(p => p.cat === state.filter);
  const grid = $('#grid');
  grid.innerHTML = list.map((p, i) => cardHTML(p, i)).join('');

  $$('.card', grid).forEach(card => {
    const id = card.dataset.id;
    const p  = productById(id);

    $('.card-media', card).addEventListener('click', () => openModal(id));

    $('[data-add]', card).addEventListener('click', e => {
      e.stopPropagation();
      addToCart(id, state.colorOf[id], defaultSize(p), 1);
    });
  });
}

$$('#filters .chip').forEach(chip => chip.addEventListener('click', () => {
  $$('#filters .chip').forEach(c => c.classList.toggle('is-active', c === chip));
  state.filter = chip.dataset.filter;
  renderGrid();
}));

/* ---------------- hero ---------------- */
const HERO = { id: 'hoodie-puff', colors: ['limone', 'coral', 'laranja', 'preto'], idx: 0, timer: null };

function renderHero(colorKey) {
  const p = productById(HERO.id);
  const hex = COLORS[colorKey].hex;
  $('#stageBlob').style.setProperty('--c', hex);
  $('#stageGarment').innerHTML = (p.photos && p.photos.length)
    ? `<img class="stage-photo" src="${p.photos[0]}" alt="${p.name}" decoding="async">`
    : garmentSVG(p.type, CREAM_GARMENT);
  $('#stagePrice').textContent = brl(p.price);
}

(function heroInit() {
  const stage = $('#heroStage');
  const product = $('#stageProduct');
  if (!stage) return;
  const next = () => {
    HERO.idx = (HERO.idx + 1) % HERO.colors.length;
    renderHero(HERO.colors[HERO.idx]);
  };
  HERO.timer = setInterval(next, 3600);
  stage.addEventListener('mouseenter', () => { clearInterval(HERO.timer); HERO.timer = null; });
  stage.addEventListener('mouseleave', () => { if (!HERO.timer) HERO.timer = setInterval(next, 3600); });
  product.addEventListener('click', () => openModal(HERO.id));
  product.style.cursor = 'pointer';
  renderHero(HERO.colors[0]);
})();

/* ---------------- quick view ---------------- */
const modalState = { id: null, color: null, size: 'M', qty: 1, photo: 0 };

function openModal(id) {
  const p = productById(id);
  modalState.id = id;
  modalState.color = state.colorOf[id];
  modalState.size = defaultSize(p);
  modalState.qty = 1;
  modalState.photo = 0;
  renderModal();
  $('#modal').classList.add('open');
  $('#modal').setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');
}
function closeModal() {
  $('#modal').classList.remove('open');
  $('#modal').setAttribute('aria-hidden', 'true');
  if (!$('#cart').classList.contains('open')) document.body.classList.remove('no-scroll');
}
function renderModal() {
  const p = productById(modalState.id);
  if (!p) return;
  const hex = COLORS[modalState.color].hex;
  const hasPhoto = p.photos && p.photos.length;

  $('#modalCat').textContent   = CAT_LABEL[p.cat];
  $('#modalName').textContent  = p.name;
  $('#modalPrice').innerHTML   = priceHTML(p);
  $('#modalDesc').textContent  = p.desc;
  $('#modalMedia').classList.toggle('has-photo', hasPhoto);
  $('#modalMedia').classList.toggle('fit-cover', p.fit === 'cover');

  if (hasPhoto) {
    const photo = p.photos[modalState.photo] || p.photos[0];
    $('#modalMedia').classList.remove('is-illustrated');
    $('#modalGarment').classList.remove('is-illustrated');
    $('#modalBlob').hidden = true;
    $('#modalGarment').innerHTML = `
      <img class="modal-photo" src="${photo}" alt="${p.name}" decoding="async">
      ${p.photos.length > 1 ? `<div class="modal-thumbs">${p.photos.map((src, k) =>
        `<button class="modal-thumb ${k === modalState.photo ? 'is-active' : ''}" data-photo="${k}" aria-label="Foto ${k + 1}"><img src="${src}" alt=""></button>`).join('')}</div>` : ''}`;
    $('#modalGarment').classList.add('has-photo');
    $('#modalColorName').textContent = p.colorLabel || COLORS[modalState.color].name;
    $('#modalSwatches').innerHTML = `<span class="color-label"><i style="background:${hex}"></i></span>`;
    $$('#modalGarment .modal-thumb').forEach(b => b.addEventListener('click', () => {
      modalState.photo = +b.dataset.photo;
      renderModal();
    }));
  } else {
    const tile = p.tile ? COLORS[p.tile].hex : '#EAE6D6';
    $('#modalBlob').hidden = true;
    $('#modalGarment').classList.remove('has-photo');
    $('#modalMedia').classList.add('is-illustrated');
    $('#modalMedia').style.setProperty('--tile', tile);
    $('#modalGarment').classList.add('is-illustrated');
    $('#modalGarment').innerHTML = garmentSVG(p.type, CREAM_GARMENT);
    $('#modalColorName').textContent = p.colorLabel || COLORS[modalState.color].name;
    $('#modalSwatches').innerHTML = `<span class="color-label"><i style="background:${hex}"></i></span>`;
  }

  const sizes = sizesOf(p);
  $('#modalSizes').innerHTML = sizes.map(s =>
    `<button class="size ${s === modalState.size ? 'is-active' : ''}" data-size="${s}">${s}</button>`
  ).join('');
  $('#qtyVal').textContent = modalState.qty;
  $('#modalMeta').innerHTML = (p.specs || [])
    .concat(['Frete grátis acima de R$ 199', 'Troca ou arrependimento em até 7 dias'])
    .map(t => `<li>${t}</li>`).join('');

  $$('#modalSizes .size').forEach(b => b.addEventListener('click', () => {
    modalState.size = b.dataset.size;
    renderModal();
  }));
}

$('#modalClose').addEventListener('click', closeModal);
$('#modal').addEventListener('click', e => { if (e.target === $('#modal')) closeModal(); });
$('#qtyMinus').addEventListener('click', () => { modalState.qty = Math.max(1, modalState.qty - 1); $('#qtyVal').textContent = modalState.qty; });
$('#qtyPlus').addEventListener('click',  () => { modalState.qty = Math.min(9, modalState.qty + 1); $('#qtyVal').textContent = modalState.qty; });
$('#modalAdd').addEventListener('click', () => {
  addToCart(modalState.id, modalState.color, modalState.size, modalState.qty);
  closeModal();
  openCart();
});

/* ---------------- carrinho ---------------- */
function addToCart(id, colorKey, size, qty) {
  const p = productById(id);
  if (!p) return;
  const key = `${id}|${colorKey}|${size}`;
  const found = state.cart.find(i => i.key === key);
  if (found) found.qty += qty;
  else state.cart.push({ key, id, color: colorKey, size, qty, price: p.price });
  saveCart(state.cart);
  renderCart();
  bumpBadge();
  toast(`${p.name} · ${COLORS[colorKey].name} (${size}) adicionado`);
}

function renderCart() {
  const body = $('#cartBody');
  const count = cartCount(state.cart);
  const badge = $('#cartCount');
  badge.textContent = count;
  badge.classList.toggle('zero', count === 0);
  $('#cartHeadCount').textContent = `(${count})`;

  if (!state.cart.length) {
    body.innerHTML = `<div class="cart-empty">
      <span class="mark-holder">${markSVG()}</span>
      <p>Seu carrinho está vazio.<br/>Que tal começar pelos essenciais?</p>
      <button class="btn btn-dark" id="emptyShop">Explorar coleção</button>
    </div>`;
    $('#emptyShop').addEventListener('click', () => {
      closeCart();
      $('#colecao').scrollIntoView({ behavior: 'smooth' });
    });
  } else {
    body.innerHTML = state.cart.map(item => {
      const p = productById(item.id);
      if (!p) return '';
      return `<div class="cart-item" data-key="${item.key}">
        <div class="cart-thumb">${productThumb(p, item.color)}</div>
        <div class="cart-item-info">
          <h4>${p.name}</h4>
          <p>${COLORS[item.color].name} · Tam. ${item.size}</p>
          <p class="cart-item-price">${brl(item.price * item.qty)}</p>
        </div>
        <div class="cart-item-side">
          <button class="cart-remove" data-remove>Remover</button>
          <div class="qty">
            <button data-minus aria-label="Diminuir">−</button>
            <span>${item.qty}</span>
            <button data-plus aria-label="Aumentar">+</button>
          </div>
        </div>
      </div>`;
    }).join('');

    $$('.cart-item', body).forEach(row => {
      const key = row.dataset.key;
      const item = state.cart.find(i => i.key === key);
      $('[data-minus]', row).addEventListener('click', () => {
        item.qty = Math.max(1, item.qty - 1);
        saveCart(state.cart); renderCart();
      });
      $('[data-plus]', row).addEventListener('click', () => {
        item.qty = Math.min(9, item.qty + 1);
        saveCart(state.cart); renderCart();
      });
      $('[data-remove]', row).addEventListener('click', () => {
        state.cart = state.cart.filter(i => i.key !== key);
        saveCart(state.cart); renderCart(); bumpBadge();
      });
    });
  }

  const total = cartTotal(state.cart);
  $('#cartTotal').textContent = brl(total);

  const missing = FREE_SHIP - total;
  const fill = Math.min(100, (total / FREE_SHIP) * 100);
  $('#shipFill').style.width = fill + '%';
  $('#shipMsg').innerHTML = total <= 0
    ? `Frete grátis em compras acima de ${brl(FREE_SHIP)}.`
    : (missing > 0
      ? `Faltam <strong>${brl(missing)}</strong> para o frete grátis.`
      : `Você ganhou <strong>frete grátis</strong>.`);
}

function bumpBadge() {
  const el = $('#cartCount');
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function openCart() {
  $('#cart').classList.add('open');
  $('#cart').setAttribute('aria-hidden', 'false');
  $('#scrim').classList.add('show');
  document.body.classList.add('no-scroll');
}
function closeCart() {
  $('#cart').classList.remove('open');
  $('#cart').setAttribute('aria-hidden', 'true');
  $('#scrim').classList.remove('show');
  if (!$('#modal').classList.contains('open')) document.body.classList.remove('no-scroll');
}

$('#cartBtn').addEventListener('click', openCart);
$('#cartClose').addEventListener('click', closeCart);
$('#scrim').addEventListener('click', closeCart);
$('#checkoutBtn').addEventListener('click', () => {
  if (!state.cart.length) { toast('Seu carrinho está vazio'); return; }
  window.location.href = 'checkout.html';
});

/* ---------------- toast ---------------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  $('span', t).textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------------- lookbook ---------------- */
const LOOKS = [
  { img: 'images/look-street-2.jpg',        title: 'Look 01', sub: 'Oversized total' },
  { img: 'images/camiseta-washed-1.jpg',    title: 'Look 02', sub: 'Washed & layered' },
  { img: 'images/look-street-1.jpg',        title: 'Look 03', sub: 'Cinza & baggy' },
  { img: 'images/calca-cargo-corduroy.jpg', title: 'Look 04', sub: 'Cargo chumbo' },
  { img: 'images/calca-jeans-baggy.jpg',    title: 'Look 05', sub: 'Denim baggy' },
  { img: 'images/pulseira-kit-1.webp',      title: 'Look 06', sub: 'Prata 925 no pulso' }
];

function renderLookbook() {
  $('#lbTrack').innerHTML = LOOKS.map(l => `
    <div class="lb-item">
      <img src="${l.img}" alt="${l.sub}" loading="lazy" decoding="async">
      <div class="lb-cap">${l.title}<span>${l.sub}</span></div>
    </div>`).join('');
}
function lbScroll(dir) {
  const track = $('#lbTrack');
  const item = $('.lb-item', track);
  const step = item ? item.getBoundingClientRect().width + 20 : 320;
  track.scrollBy({ left: dir * step, behavior: 'smooth' });
}
$('#lbPrev').addEventListener('click', () => lbScroll(-1));
$('#lbNext').addEventListener('click', () => lbScroll(1));

(function lbDrag() {
  const track = $('#lbTrack');
  if (!track) return;
  let down = false, startX = 0, startScroll = 0, moved = false, pid = null;

  track.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    down = true; moved = false;
    startX = e.clientX; startScroll = track.scrollLeft;
    pid = e.pointerId;
    track.classList.add('dragging');
    try { track.setPointerCapture(pid); } catch (err) {}
  });

  track.addEventListener('pointermove', e => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (!moved && Math.abs(dx) < 4) return;
    moved = true;
    track.scrollLeft = startScroll - dx;
    e.preventDefault();
  });

  const end = () => {
    if (!down) return;
    down = false;
    track.classList.remove('dragging');
    if (pid !== null) { try { track.releasePointerCapture(pid); } catch (err) {} pid = null; }
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
  track.addEventListener('lostpointercapture', end);

  /* impede clique/arraste nativo depois de arrastar */
  track.addEventListener('dragstart', e => e.preventDefault());
  track.addEventListener('click', e => {
    if (moved) { e.preventDefault(); e.stopPropagation(); }
  }, true);
})();

/* ---------------- instagram ---------------- */
const IG = [
  { img: 'images/look-street-1.jpg',        cap: 'Oversized & baggy',  pos: 'center 18%' },
  { img: 'images/camiseta-washed-2.jpg',    cap: 'Washed print',       pos: 'center 28%' },
  { img: 'images/pulseira-kit-1.webp',      cap: 'Prata no pulso',     pos: 'center 50%' },
  { img: 'images/calca-cargo-corduroy.jpg', cap: 'Cargo chumbo',       pos: 'center 30%' },
  { img: 'images/jaqueta-sherpa.jpg',       cap: 'Sherpa Vero',        pos: 'center 40%' },
  { img: 'images/anel-wings-2.webp',        cap: 'Wings 925',          pos: 'center 45%' },
  { img: 'images/shorts-cargo.jpg',         cap: 'Shorts cargo',       pos: 'center 45%' },
  { img: 'images/look-street-2.jpg',        cap: 'Look completo',      pos: 'center 12%' }
];

const IG_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"/></svg>`;

function renderInstagram() {
  const grid = $('#igGrid');
  if (!grid) return;
  grid.innerHTML = IG.map(p => `
    <button class="ig-item" type="button" style="--pos:${p.pos}" aria-label="Foto do Instagram: ${p.cap}">
      <img src="${p.img}" alt="${p.cap}" loading="lazy" decoding="async">
      <span class="ig-overlay">${IG_ICON}<em>@verolimone</em></span>
    </button>`).join('');
  $$('.ig-item', grid).forEach(b =>
    b.addEventListener('click', () => toast('Nosso Instagram está chegando — em breve!')));
  const btn = $('#igBtn');
  if (btn) btn.addEventListener('click', () => toast('Nosso Instagram está chegando — em breve!'));
}

/* ---------------- header / progress ---------------- */
const header = $('#header');
let lastY = window.scrollY;

window.addEventListener('scroll', () => {
  const y = window.scrollY;
  header.classList.toggle('scrolled', y > 24);
  if (y > lastY && y > 380 && !$('#mobileMenu').classList.contains('open')) {
    header.classList.add('hidden');
  } else {
    header.classList.remove('hidden');
  }
  lastY = y;

  const h = document.documentElement.scrollHeight - window.innerHeight;
  $('#progressBar').style.width = (h > 0 ? Math.min(100, (y / h) * 100) : 0) + '%';
}, { passive: true });

/* ---------------- menu mobile ---------------- */
const burger = $('#burger');
const mobileMenu = $('#mobileMenu');
function toggleMenu(force) {
  const open = force !== undefined ? force : !mobileMenu.classList.contains('open');
  mobileMenu.classList.toggle('open', open);
  burger.classList.toggle('open', open);
  burger.setAttribute('aria-expanded', String(open));
  mobileMenu.setAttribute('aria-hidden', String(!open));
  document.body.classList.toggle('no-scroll', open);
}
burger.addEventListener('click', () => toggleMenu());
$$('[data-mm]').forEach(a => a.addEventListener('click', () => toggleMenu(false)));

/* ---------------- esc ---------------- */
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if ($('#modal').classList.contains('open')) closeModal();
  else if ($('#cart').classList.contains('open')) closeCart();
  else if (mobileMenu.classList.contains('open')) toggleMenu(false);
});

/* ---------------- reveal + split ---------------- */
const io = new IntersectionObserver(entries => {
  entries.forEach(en => {
    if (en.isIntersecting) {
      en.target.classList.add('in');
      io.unobserve(en.target);
    }
  });
}, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });

$$('.reveal').forEach(el => io.observe(el));

$$('[data-split]').forEach(el => {
  const words = el.textContent.trim().split(/\s+/);
  el.classList.add('split');
  el.innerHTML = words.map((w, i) =>
    `<span class="word"><span style="transition-delay:${i * 70}ms">${w}</span></span>`
  ).join(' ');
  io.observe(el);
});

/* stagger em grupos */
$$('.features-grid, .reviews-grid, .about-list').forEach(group => {
  $$('.reveal', group).forEach((el, i) => { el.style.transitionDelay = (i * 90) + 'ms'; });
});

/* ---------------- contadores ---------------- */
const counterIO = new IntersectionObserver(entries => {
  entries.forEach(en => {
    if (!en.isIntersecting) return;
    const el = en.target;
    counterIO.unobserve(el);
    const target = parseFloat(el.dataset.count);
    const dec = parseInt(el.dataset.decimals || 0, 10);
    const suffix = el.dataset.suffix || '';
    const dur = 1500;
    const t0 = performance.now();
    (function tick(t) {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = (target * e).toFixed(dec).replace('.', ',') + suffix;
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  });
}, { threshold: 0.4 });
$$('[data-count]').forEach(el => counterIO.observe(el));

/* ---------------- hero parallax ---------------- */
(function heroParallax() {
  const hero = $('.hero');
  const stage = $('#heroStage');
  const mark = $('#stageMark');
  const product = $('#stageProduct');
  const tags = $$('.float-tag', stage);
  if (!hero || !stage || !matchMedia('(pointer: fine)').matches) return;

  hero.addEventListener('mousemove', e => {
    const r = stage.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    mark.style.transform = `translate(${x * 16}px, ${y * 12}px)`;
    product.style.transform = `translate(${x * -24}px, ${y * -16}px)`;
    tags.forEach((tag, i) => {
      const f = (i + 1) * 10;
      tag.style.transform = `translate(${x * f}px, ${y * f}px)`;
    });
  });
  hero.addEventListener('mouseleave', () => {
    mark.style.transform = '';
    product.style.transform = '';
    tags.forEach(tag => { tag.style.transform = ''; });
  });
})();

/* ---------------- newsletter ---------------- */
$('#newsForm').addEventListener('submit', e => {
  e.preventDefault();
  const input = $('#newsEmail');
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.value.trim());
  if (!ok) {
    input.focus();
    $('#newsNote').textContent = 'Digite um e-mail válido para receber o cupom.';
    $('#newsNote').style.color = '#B3341A';
    return;
  }
  input.value = '';
  $('#newsNote').textContent = 'Pronto! Seu cupom de 10% chegará por e-mail.';
  $('#newsNote').style.color = 'rgba(25,24,19,.7)';
  toast('Bem-vindo à lista Limone!');
});

/* ---------------- loader ---------------- */
(function loader() {
  const MIN = 950;
  const t0 = performance.now();
  let done = false;
  function finish() {
    if (done) return;
    done = true;
    const wait = Math.max(0, MIN - (performance.now() - t0));
    setTimeout(() => {
      $('#loader').classList.add('done');
      document.body.classList.remove('is-loading');
    }, wait);
  }
  if (document.readyState === 'complete') finish();
  else window.addEventListener('load', finish);
  setTimeout(finish, 3500);
})();

/* ---------------- init ---------------- */
renderGrid();
renderCart();
renderLookbook();
renderInstagram();
