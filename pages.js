/* ============================================================
   DAVVERO LIMONE — páginas internas
   departamento (masculino/feminino), look e contato.
   Depende de data.js (catálogo, looks, carrinho, marca).
   ============================================================ */
'use strict';

(function () {
  const PAGE = document.body.dataset.page || '';

  /* ---------------- carrinho + aviso (compartilhado) ---------------- */
  const cart = { items: loadCart() };

  function bumpCart() {
    const el = $('#pageCartCount');
    if (!el) return;
    const n = cartCount(cart.items);
    el.textContent = n;
    el.classList.toggle('zero', n === 0);
  }

  function addItem(p, size, qty = 1, usedPref = false) {
    if (!p) return;
    const colorKey = (p.colors && p.colors[0]) || 'preto';
    const key = `${p.id}|${colorKey}|${size}`;
    const found = cart.items.find(i => i.key === key);
    if (found) found.qty += qty;
    else cart.items.push({ key, id: p.id, color: colorKey, size, qty, price: p.price });
    saveCart(cart.items);
    if (usedPref) rememberSize(p.cat, size);
    bumpCart();
    toast(`${p.name} · Tam. ${size} adicionado ao carrinho`);
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    if (!t) return;
    t.querySelector('span').textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  const productById = id => PRODUCTS.find(p => p.id === id);
  const CAT_ORDER = ['camisetas', 'moletons', 'jaquetas', 'calcas', 'shorts', 'underwear', 'acessorios'];

  /* ---------------- menu mobile (mesmo padrão da home) ---------------- */
  function initMenu() {
    const burger = $('#burger');
    const menu = $('#mobileMenu');
    if (!burger || !menu) return;
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
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.classList.contains('open')) toggle(false); });
  }

  /* ---------------- revelações (mesmo padrão da home) ---------------- */
  (function reveals() {
    const els = $$('.reveal');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('in')); return; }
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .12 });
    els.forEach(el => io.observe(el));
  })();

  /* ============================================================
     1. DEPARTAMENTO — masculino / feminino
     ============================================================ */
  function initDepartamento() {
    const GENDER = document.body.dataset.gender === 'mulher' ? 'mulher' : 'homem';
    const state = { filter: 'all', sort: 'relevancia' };

    const serves = (p, g) => p.publico === g || p.publico === 'ambos';
    const base = () => PRODUCTS.filter(p => serves(p, GENDER));
    const isNew = p => p.badge === 'Novo';

    function listFor() {
      let list;
      if (state.filter === 'all') list = base();
      else if (state.filter === 'novo') list = base().filter(isNew);
      else list = base().filter(p => p.cat === state.filter);

      const arr = list.slice();
      if (state.sort === 'menor') arr.sort((a, b) => a.price - b.price);
      else if (state.sort === 'maior') arr.sort((a, b) => b.price - a.price);
      else if (state.sort === 'novidades') arr.sort((a, b) => (isNew(b) ? 1 : 0) - (isNew(a) ? 1 : 0));
      return arr;
    }

    function renderFilters() {
      const chip = (id, label, n) =>
        `<button class="chip${state.filter === id ? ' is-active' : ''}" type="button" data-filter="${id}"${n === 0 ? ' hidden' : ''}>${label}</button>`;
      $('#dpFilters').innerHTML =
        chip('all', 'Todos', 1) + chip('novo', 'Novidades', 1) +
        CAT_ORDER.map(c => chip(c, CAT_LABEL[c], base().filter(p => p.cat === c).length)).join('');
      $$('#dpFilters .chip').forEach(b => b.addEventListener('click', () => {
        state.filter = b.dataset.filter;
        renderFilters();
        renderGrid();
      }));
    }

    function renderGrid() {
      const list = listFor();
      const grid = $('#dpGrid');
      grid.innerHTML = list.length
        ? list.map((p, i) => productCardHTML(p, i, (p.colors && p.colors[0]) || 'preto')).join('')
        : `<p class="dp-empty">Nada por aqui neste filtro — tente outra categoria.</p>`;
      $('#dpCount').textContent = `${list.length} ${list.length === 1 ? 'peça' : 'peças'}`;

      $$('.card', grid).forEach(card => {
        const id = card.dataset.id;
        const p = productById(id);
        if (!p) return;
        $('.card-media', card).addEventListener('click', e => {
          if (e.target.closest('a') || e.target.closest('[data-add]')) return;
          location.href = 'produto.html?id=' + encodeURIComponent(id);
        });
        $('[data-add]', card).addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          addItem(p, preferredSize(p), 1, true);
        });
      });
    }

    const sortSel = $('#dpSort');
    if (sortSel) sortSel.addEventListener('change', () => { state.sort = sortSel.value; renderGrid(); });

    bumpCart();
    renderFilters();
    renderGrid();
  }

  /* ============================================================
     2. LOOK — todas as peças do look
     ============================================================ */
  function initLook() {
    const id = new URLSearchParams(location.search).get('id');
    const look = lookById(id);
    if (!look) { location.replace('index.html#lookbook'); return; }

    const pieces = look.pieces.map(productById).filter(Boolean);
    const total = pieces.reduce((s, p) => s + p.price, 0);

    document.title = `${look.title} · ${look.sub} — DAVVERO LIMONE`;
    $('#lkImg').src = look.img;
    $('#lkImg').alt = `${look.title} — ${look.sub}`;
    $('#lkTitle').textContent = `${look.title} · ${look.sub}`;
    $('#lkDesc').textContent = look.desc;
    $('#lkNote').textContent = look.note;
    $('#lkCount').textContent = `${pieces.length} ${pieces.length === 1 ? 'peça' : 'peças'}`;
    $('#lkTotal').textContent = brl(total);

    const groups = CAT_ORDER
      .map(cat => ({ cat, items: pieces.filter(p => p.cat === cat) }))
      .filter(g => g.items.length);

    $('#lkPieces').innerHTML = groups.map(g => `
      <section class="lk-group">
        <h2>${CAT_LABEL[g.cat]}</h2>
        ${g.items.map(p => {
          const photo = p.photos && p.photos[0];
          return `<div class="lk-piece">
            <span class="lk-thumb">${photo ? `<img src="${photo}" alt="${p.name}" loading="lazy" decoding="async">` : ''}</span>
            <span>
              <a class="lk-piece-name" href="produto.html?id=${encodeURIComponent(p.id)}">${p.name}</a>
              <span class="lk-piece-meta">${p.colorLabel ? p.colorLabel + ' · ' : ''}${p.meta}</span>
            </span>
            <span class="lk-piece-side">
              <strong class="lk-piece-price">${brl(p.price)}</strong>
              <button class="btn btn-ghost sm" type="button" data-add-piece="${p.id}">Adicionar</button>
            </span>
          </div>`;
        }).join('')}
      </section>`).join('');

    $$('#lkPieces [data-add-piece]').forEach(btn => btn.addEventListener('click', () => {
      const p = productById(btn.dataset.addPiece);
      addItem(p, preferredSize(p), 1, true);
    }));

    const addAll = $('#lkAddAll');
    if (addAll) addAll.addEventListener('click', () => {
      pieces.forEach(p => addItem(p, preferredSize(p), 1, true));
      toast(`${pieces.length} peças do ${look.title} foram para o carrinho`);
    });

    $('#lkOthers').innerHTML = LOOKS.filter(l => l.id !== look.id).map(l => `
      <a class="lk-other" href="look.html?id=${l.id}">
        <img src="${l.img}" alt="${l.title} — ${l.sub}" loading="lazy" decoding="async">
        <span class="lk-other-cap">${l.title}<em>${l.sub}</em></span>
      </a>`).join('');

    bumpCart();
  }

  /* ============================================================
     3. CONTATO — formulário de atendimento
     ============================================================ */
  function initContato() {
    const form = $('#ctForm');
    if (!form) return;

    const fields = {
      name: $('#ctName'),
      email: $('#ctEmail'),
      message: $('#ctMessage'),
    };

    const mark = (el, ok) => el.closest('.ct-field').classList.toggle('is-invalid', !ok);
    const validEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

    [fields.name, fields.email, fields.message].forEach(el =>
      el.addEventListener('input', () => el.closest('.ct-field').classList.remove('is-invalid')));

    form.addEventListener('submit', e => {
      e.preventDefault();
      const okName = fields.name.value.trim().length >= 3;
      const okEmail = validEmail(fields.email.value);
      const okMsg = fields.message.value.trim().length >= 10;
      mark(fields.name, okName);
      mark(fields.email, okEmail);
      mark(fields.message, okMsg);
      if (!okName || !okEmail || !okMsg) {
        toast('Confira os campos destacados para enviar');
        return;
      }
      const btn = form.querySelector('[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
      setTimeout(() => {
        toast('Mensagem recebida! Respondemos em até 1 dia útil.');
        form.reset();
        if (btn) { btn.disabled = false; btn.textContent = 'Enviar mensagem'; }
      }, 700);
    });

    bumpCart();
  }

  /* ---------------- inicialização ---------------- */
  initMenu();
  if (PAGE === 'departamento') initDepartamento();
  else if (PAGE === 'look') initLook();
  else if (PAGE === 'contato') initContato();
  else bumpCart();
})();
