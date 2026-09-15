/* ============================================================
   DAVVERO LIMONE — loja (home)
   Depende de data.js (marca, catálogo, ilustrações, carrinho)
   ============================================================ */
'use strict';

/* ---------------- estado ---------------- */
const state = {
  filter: 'all',
  gender: 'homem',
  sort: 'relevancia',
  colorOf: {},
  cart: loadCart()
};
PRODUCTS.forEach(p => { state.colorOf[p.id] = p.colors[0]; });

const productById = id => PRODUCTS.find(p => p.id === id);

/* ---------------- vitrine por público ----------------
   Peças marcadas como 'ambos' aparecem nos dois departamentos,
   sem nunca exibir o rótulo "unissex" na interface.            */
const servesGender = (p, g) => p.publico === g || p.publico === 'ambos';
const inGender = g => PRODUCTS.filter(p => servesGender(p, g));
const isNew = p => p.badge === 'Novo';
const countFor = (g, cat) => inGender(g).filter(p => p.cat === cat).length;

function listFor() {
  const base = inGender(state.gender);
  let list;
  if (state.filter === 'all') list = base;
  else if (state.filter === 'novo') list = base.filter(isNew);
  else list = base.filter(p => p.cat === state.filter);

  const arr = list.slice();
  if (state.sort === 'menor') arr.sort((a, b) => a.price - b.price);
  else if (state.sort === 'maior') arr.sort((a, b) => b.price - a.price);
  else if (state.sort === 'novidades') arr.sort((a, b) => (isNew(b) ? 1 : 0) - (isNew(a) ? 1 : 0));
  return arr;
}

/* ---------------- grid de produtos ---------------- */
/* o card vive em data.js (productCardHTML) — a home só escolhe a cor */
const cardHTML = (p, i) => productCardHTML(p, i, state.colorOf[p.id]);

function renderGrid() {
  const list = listFor();
  const grid = $('#grid');
  grid.innerHTML = list.length
    ? list.map((p, i) => cardHTML(p, i)).join('')
    : `<p class="grid-empty">Nada por aqui neste departamento ainda — tente outra categoria.</p>`;

  $$('.card', grid).forEach(card => {
    const id = card.dataset.id;
    const p  = productById(id);

    $('.card-media', card).addEventListener('click', e => {
      if (e.target.closest('a') || e.target.closest('[data-add]')) return;
      location.href = 'produto.html?id=' + encodeURIComponent(id);
    });

    $('[data-add]', card).addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const size = preferredSize(p);
      addToCart(id, state.colorOf[id], size, 1, true);
    });
  });
}

/* ---------------- vitrine de categorias (cards) ---------------- */
function renderCats() {
  const wrap = $('#catGrid');
  if (!wrap) return;
  wrap.innerHTML = CATS.map(c => {
    const n = countFor(state.gender, c.id);
    return `<a class="cat-card" href="#colecao" data-cat="${c.id}">
      <span class="cat-media"><img src="${c.photo}" alt="" loading="lazy" decoding="async"></span>
      <span class="cat-body">
        <span class="cat-name">${c.label}</span>
        <span class="cat-count">${n} ${n === 1 ? 'peça' : 'peças'}</span>
        <span class="cat-tag">${c.tagline}</span>
      </span>
    </a>`;
  }).join('');
}

/* ---------------- controles da coleção ---------------- */
function syncCollection() {
  $$('#genderTabs .gender-tab').forEach(t => {
    const on = t.dataset.gender === state.gender;
    t.classList.toggle('is-active', on);
    t.setAttribute('aria-pressed', on ? 'true' : 'false');
  });

  const eyebrow = $('#collectionEyebrow');
  if (eyebrow) eyebrow.textContent = GENDER_LABEL[state.gender];

  $$('#filters .chip').forEach(c => {
    const f = c.dataset.filter;
    const n = f === 'all'  ? inGender(state.gender).length
            : f === 'novo' ? inGender(state.gender).filter(isNew).length
            : countFor(state.gender, f);
    c.hidden = n === 0;
    c.classList.toggle('is-active', f === state.filter);
  });

  const count = $('#collectionCount');
  if (count) {
    const n = listFor().length;
    count.textContent = `${n} ${n === 1 ? 'peça' : 'peças'}`;
  }

  $$('[data-gender-link]').forEach(a => {
    a.classList.toggle('is-active', a.dataset.genderLink === state.gender);
  });
}

function setGender(g) {
  if (g !== 'homem' && g !== 'mulher') return;
  state.gender = g;
  const exists = state.filter === 'all' || state.filter === 'novo' || countFor(g, state.filter) > 0;
  if (!exists) state.filter = 'all';
  renderGrid(); renderCats(); syncCollection();
}

function setFilter(f) {
  state.filter = f;
  renderGrid(); syncCollection();
}

$$('#filters .chip').forEach(chip => chip.addEventListener('click', () => setFilter(chip.dataset.filter)));
$$('#genderTabs .gender-tab').forEach(tab => tab.addEventListener('click', () => setGender(tab.dataset.gender)));

const sortSel = $('#sortSelect');
if (sortSel) sortSel.addEventListener('change', () => {
  state.sort = sortSel.value;
  renderGrid();
});

document.addEventListener('click', e => {
  const cat = e.target.closest('[data-cat]');
  if (cat) {
    e.preventDefault();
    setFilter(cat.dataset.cat);
    const sec = $('#colecao');
    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const g = e.target.closest('[data-gender-link]');
  if (g) setGender(g.dataset.genderLink);
  const c = e.target.closest('[data-cat-link]');
  if (c) setFilter(c.dataset.catLink);
  const n = e.target.closest('[data-new-link]');
  if (n) setFilter('novo');
});

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
  const old = $('#stageOldPrice');
  if (old) {
    old.textContent = p.oldPrice ? brl(p.oldPrice) : '';
    old.hidden = !p.oldPrice;
  }
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
  const visit = () => { location.href = 'produto.html?id=' + encodeURIComponent(HERO.id); };
  product.addEventListener('click', visit);
  product.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); visit(); } });
  product.setAttribute('role', 'link');
  product.setAttribute('tabindex', '0');
  product.style.cursor = 'pointer';
  renderHero(HERO.colors[0]);
})();

/* ---------------- carrinho ---------------- */
function addToCart(id, colorKey, size, qty, usedPref) {
  const p = productById(id);
  if (!p) return;
  const key = `${id}|${colorKey}|${size}`;
  const found = state.cart.find(i => i.key === key);
  if (found) found.qty += qty;
  else state.cart.push({ key, id, color: colorKey, size, qty, price: p.price });
  saveCart(state.cart);
  if (usedPref) rememberSize(p.cat, size);
  renderCart();
  bumpBadge();
  toast(`${p.name} · Tam. ${size}${usedPref ? ' (seu tamanho)' : ''} adicionado ao carrinho`);
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
  document.body.classList.remove('no-scroll');
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
/* os looks vivem em data.js (LOOKS) — cada card abre a página do look */
function renderLookbook() {
  const track = $('#lbTrack');
  if (!track) return;
  track.innerHTML = LOOKS.map(l => `
    <a class="lb-item" href="look.html?id=${l.id}" aria-label="${l.title}: ${l.sub}">
      <img src="${l.img}" alt="${l.sub}" loading="lazy" decoding="async">
      <div class="lb-cap">${l.title}<span>${l.sub}</span></div>
    </a>`).join('');
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
  { img: 'images/jaqueta-sherpa.jpg',       cap: 'Sherpa Davvero',     pos: 'center 40%' },
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
      <span class="ig-overlay">${IG_ICON}<em>@davverolimone</em></span>
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
  const billboard = $('.billboard');
  header.classList.toggle('over-media', !!billboard && y < billboard.offsetHeight - 96);
  if (y > lastY && y > 380 && !$('#mobileMenu').classList.contains('open')) {
    header.classList.add('hidden');
  } else {
    header.classList.remove('hidden');
  }
  lastY = y;

  const h = document.documentElement.scrollHeight - window.innerHeight;
  $('#progressBar').style.width = (h > 0 ? Math.min(100, (y / h) * 100) : 0) + '%';
}, { passive: true });
window.dispatchEvent(new Event('scroll'));

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
  if ($('#cart').classList.contains('open')) closeCart();
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
  const MIN = 1600;
  const t0 = performance.now();
  let done = false;

  /* limão em vídeo: roda no loader e substitui o símbolo quando pronto */
  const video = $('.loader-lemon');
  if (video) {
    const ready = () => $('#loader').classList.add('video-ready');
    if (video.readyState >= 2) ready();
    else video.addEventListener('loadeddata', ready, { once: true });
    const p = video.play();
    if (p && p.catch) p.catch(() => {});
  }

  function finish() {
    if (done) return;
    done = true;
    const wait = Math.max(0, MIN - (performance.now() - t0));
    setTimeout(() => {
      $('#loader').classList.add('done');
      document.body.classList.remove('is-loading');
      if (video) video.pause();
    }, wait);
  }
  if (document.readyState === 'complete') finish();
  else window.addEventListener('load', finish);
  setTimeout(finish, 3500);
})();

/* ---------------- busca ---------------- */
(function searchInit() {
  const box = $('#search');
  const input = $('#searchInput');
  const results = $('#searchResults');
  const sugg = $('#searchSugg');
  if (!box || !input) return;

  const openSearch = () => {
    box.classList.add('open');
    box.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    window.setTimeout(() => input.focus(), 120);
  };
  const closeSearch = () => {
    box.classList.remove('open');
    box.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
  };

  const cats = ['camisetas', 'moletons', 'jaquetas', 'calcas', 'shorts', 'acessorios'];
  sugg.innerHTML = `<span class="search-sugg-label">Populares</span>` +
    cats.map(c => `<button class="search-chip" type="button" data-q="${CAT_LABEL[c]}">${CAT_LABEL[c]}</button>`).join('');

  function render() {
    const term = input.value.trim();
    const q = norm(term);
    if (!q) { results.innerHTML = ''; return; }
    const list = PRODUCTS.filter(p =>
      norm(p.name + ' ' + p.meta + ' ' + (p.colorLabel || '') + ' ' + CAT_LABEL[p.cat]).includes(q)
    ).slice(0, 8);

    results.innerHTML = list.length
      ? list.map(p => {
          const photo = p.photos && p.photos[0];
          return `<a class="search-item" href="produto.html?id=${encodeURIComponent(p.id)}">
            <span class="search-thumb">${photo ? `<img src="${photo}" alt="" decoding="async">` : ''}</span>
            <span class="search-info">
              <span class="search-cat">${CAT_LABEL[p.cat]}</span>
              <span class="search-name">${p.name}</span>
            </span>
            <span class="search-price">${brl(p.price)}</span>
          </a>`;
        }).join('')
      : `<p class="search-empty">Nada encontrado para “${term}”.</p>`;
  }

  input.addEventListener('input', render);
  sugg.addEventListener('click', e => {
    const b = e.target.closest('[data-q]');
    if (!b) return;
    input.value = b.dataset.q;
    render();
    input.focus();
  });
  $('#searchBtn').addEventListener('click', openSearch);
  $('#searchClose').addEventListener('click', closeSearch);
  box.addEventListener('click', e => { if (e.target === box) closeSearch(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSearch(); });
})();

/* ---------------- init ---------------- */
renderGrid();
renderCats();
syncCollection();
renderCart();
renderLookbook();
renderInstagram();
