/* ============================================================
   VERO LIMONE — checkout (front-end demonstrativo)
   Depende de data.js (catálogo, cores, carrinho, ilustrações)
   ============================================================ */
'use strict';

/* ↓↓↓ troque pelo número real da loja (formato: 55 + DDD + número) */
const WHATS_NUMBER = '5511999999999';

const PAY_LABEL = { pix: 'Pix', card: 'Cartão de crédito', boleto: 'Boleto bancário' };
const el = id => document.getElementById(id);
const productById = id => PRODUCTS.find(p => p.id === id);
const onlyDigits = s => String(s || '').replace(/\D/g, '');

const ck = {
  cart: loadCart(),
  step: 1,
  coupon: null,
  ship: 'standard',
  pay: 'pix',
  lastOrder: null
};

/* ---------------- data helpers ---------------- */
function businessDaysFromNow(n) {
  const d = new Date();
  let c = 0;
  while (c < n) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) c++;
  }
  return d;
}
const fmtDay = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
const etaRange = (a, b) => `${fmtDay(businessDaysFromNow(a))} – ${fmtDay(businessDaysFromNow(b))}`;

function totals() {
  const sub = cartTotal(ck.cart);
  const couponDisc = ck.coupon ? sub * COUPONS[ck.coupon] : 0;
  const base = sub - couponDisc;
  const ship = ck.ship === 'express' ? EXPRESS_SHIP : (sub >= FREE_SHIP ? 0 : STANDARD_SHIP);
  const pix = ck.pay === 'pix' ? base * 0.05 : 0;
  const total = Math.max(0, base + ship - pix);
  return { sub, couponDisc, base, ship, pix, total };
}

/* ---------------- render: sacola ---------------- */
function renderItems() {
  const box = el('ckItems');
  const count = cartCount(ck.cart);
  el('ckCount').textContent = `(${count} ${count === 1 ? 'item' : 'itens'})`;

  if (!ck.cart.length) {
    box.innerHTML = `<div class="ck-empty">
      <p>Sua sacola está vazia. Que tal começar pelos essenciais?</p>
      <a class="btn btn-dark" href="index.html#colecao">Explorar coleção</a>
    </div>`;
    return;
  }

  box.innerHTML = ck.cart.map(item => {
    const p = productById(item.id);
    if (!p) return '';
    return `<div class="ck-item" data-key="${item.key}">
      <div class="ck-thumb">${productThumb(p, item.color)}</div>
      <div class="ck-item-info">
        <h4>${p.name}</h4>
        <p>${COLORS[item.color].name} · Tam. ${item.size}</p>
        <div class="qty">
          <button data-minus aria-label="Diminuir">−</button>
          <span>${item.qty}</span>
          <button data-plus aria-label="Aumentar">+</button>
        </div>
      </div>
      <div class="ck-item-side">
        <strong>${brl(item.price * item.qty)}</strong>
        <button class="cart-remove" data-remove>Remover</button>
      </div>
    </div>`;
  }).join('');

  $$('.ck-item', box).forEach(row => {
    const key = row.dataset.key;
    const item = ck.cart.find(i => i.key === key);
    $('[data-minus]', row).addEventListener('click', () => {
      item.qty = Math.max(1, item.qty - 1);
      saveCart(ck.cart); renderAll();
    });
    $('[data-plus]', row).addEventListener('click', () => {
      item.qty = Math.min(9, item.qty + 1);
      saveCart(ck.cart); renderAll();
    });
    $('[data-remove]', row).addEventListener('click', () => {
      ck.cart = ck.cart.filter(i => i.key !== key);
      saveCart(ck.cart); renderAll();
      toast('Item removido da sacola');
    });
  });
}

/* ---------------- render: resumo ---------------- */
function summaryItems() {
  if (ck.step === 4 && ck.lastOrder) return ck.lastOrder.items;
  return ck.cart.map(i => {
    const p = productById(i.id);
    return p ? {
      name: p.name, colorName: COLORS[i.color].name, hex: COLORS[i.color].hex,
      type: p.type, photo: (p.photos && p.photos[0]) || null,
      size: i.size, qty: i.qty, price: i.price
    } : null;
  }).filter(Boolean);
}

function renderSummary() {
  const order = ck.step === 4 && ck.lastOrder ? ck.lastOrder : null;
  const t = order
    ? { sub: order.sub, couponDisc: order.couponDisc, ship: order.ship, pix: order.pix, total: order.total }
    : totals();
  const coupon = order ? order.coupon : ck.coupon;
  const items = summaryItems();

  el('ckSumItems').innerHTML = items.length
    ? items.map(item => `
        <div class="ck-sum-item">
          <div class="ck-sum-thumb">${item.photo ? `<img src="${item.photo}" alt="">` : garmentSVG(item.type, item.hex)}</div>
          <span>${item.name}<em>${item.colorName} · ${item.size} × ${item.qty}</em></span>
          <strong>${brl(item.price * item.qty)}</strong>
        </div>`).join('')
    : `<p class="ck-sum-empty">Nenhum item ainda.</p>`;

  const rows = [
    ['Subtotal', brl(t.sub)],
    coupon ? [`Cupom ${coupon}`, `− ${brl(t.couponDisc)}`] : null,
    ['Frete', t.ship ? brl(t.ship) : 'Grátis'],
    t.pix ? ['Desconto Pix (5%)', `− ${brl(t.pix)}`] : null,
    ['Total', brl(t.total), 'ck-total-row']
  ].filter(Boolean);

  el('ckSumTotals').innerHTML = rows.map(([label, value, cls]) =>
    `<div class="ck-sum-row ${cls || ''}"><dt>${label}</dt><dd>${value}</dd></div>`
  ).join('');

  /* botão principal conforme etapa */
  const btn = el('ckMainBtn');
  btn.hidden = ck.step === 4;
  btn.disabled = !ck.cart.length;
  btn.firstChild.textContent = ck.step === 1 ? 'Continuar para entrega '
    : ck.step === 2 ? 'Continuar para pagamento '
    : 'Finalizar pedido ';

  /* whatsapp */
  const msg = whatsMessage(ck.lastOrder || draftOrder());
  const url = `https://wa.me/${WHATS_NUMBER}?text=${encodeURIComponent(msg)}`;
  el('ckWhats').href = url;
  el('ckWhatsFinal').href = url;
}

function draftOrder() {
  const t = totals();
  const customer = readCustomer();
  return {
    id: ck.lastOrder ? ck.lastOrder.id : 'novo pedido',
    items: ck.cart.map(i => {
      const p = productById(i.id);
      return {
        name: p ? p.name : i.id,
        colorName: COLORS[i.color].name,
        hex: COLORS[i.color].hex,
        type: p ? p.type : 'tee',
        photo: (p && p.photos && p.photos[0]) || null,
        size: i.size, qty: i.qty, price: i.price
      };
    }),
    sub: t.sub, coupon: ck.coupon, couponDisc: t.couponDisc,
    ship: t.ship, pix: t.pix, total: t.total,
    pay: ck.pay, customer
  };
}

function whatsMessage(o) {
  const L = [];
  L.push(`*Pedido ${o.id} — VERO LIMONE*`);
  L.push('');
  o.items.forEach(i => L.push(`• ${i.name} · ${i.colorName} · ${i.size} — ${i.qty}x ${brl(i.price * i.qty)}`));
  L.push('');
  L.push(`Subtotal: ${brl(o.sub)}`);
  if (o.couponDisc) L.push(`Cupom ${o.coupon}: − ${brl(o.couponDisc)}`);
  L.push(`Frete: ${o.ship ? brl(o.ship) : 'Grátis'}`);
  if (o.pix) L.push(`Desconto Pix (5%): − ${brl(o.pix)}`);
  L.push(`*Total: ${brl(o.total)}*`);
  L.push('');
  L.push(`Pagamento: ${PAY_LABEL[o.pay]}`);
  if (o.customer.name) {
    L.push(`Cliente: ${o.customer.name}`);
    if (o.customer.address) {
      L.push(`Entrega: ${o.customer.address}, ${o.customer.number}${o.customer.comp ? ' — ' + o.customer.comp : ''} — ${o.customer.district}, ${o.customer.city}/${o.customer.uf} · CEP ${o.customer.cep}`);
    }
  }
  return L.join('\n');
}

/* ---------------- cupom ---------------- */
el('ckCouponBtn').addEventListener('click', () => {
  if (ck.coupon) {
    ck.coupon = null;
    el('ckCoupon').value = '';
    el('ckCoupon').disabled = false;
    el('ckCouponBtn').textContent = 'Aplicar';
    el('ckCouponMsg').innerHTML = 'Cupom removido.';
    el('ckCouponMsg').className = 'ck-coupon-msg';
    renderAll();
    return;
  }
  const code = el('ckCoupon').value.trim().toUpperCase();
  if (COUPONS[code]) {
    ck.coupon = code;
    el('ckCoupon').value = code;
    el('ckCoupon').disabled = true;
    el('ckCouponBtn').textContent = 'Remover';
    el('ckCouponMsg').innerHTML = `Cupom <strong>${code}</strong> aplicado: −10% no subtotal.`;
    el('ckCouponMsg').className = 'ck-coupon-msg ok';
    toast('Cupom aplicado');
  } else {
    el('ckCouponMsg').textContent = 'Cupom inválido. Confira o código e tente de novo.';
    el('ckCouponMsg').className = 'ck-coupon-msg bad';
  }
  renderAll();
});

/* ---------------- máscaras ---------------- */
function maskPhone(v) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
function maskCep(v) {
  const d = onlyDigits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}
function maskCard(v) {
  return onlyDigits(v).slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
}
function maskExp(v) {
  const d = onlyDigits(v).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

[['ckPhone', maskPhone], ['ckCep', maskCep], ['ckCardNum', maskCard], ['ckCardExp', maskExp],
 ['ckCardCvv', v => onlyDigits(v).slice(0, 4)]].forEach(([id, fn]) => {
  el(id).addEventListener('input', e => { e.target.value = fn(e.target.value); clearError(e.target); });
});

/* ---------------- validação ---------------- */
function luhn(num) {
  let sum = 0, alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = +num[i];
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

const RULES = {
  ckName:    v => v.trim().length >= 3 || 'Informe seu nome completo.',
  ckEmail:   v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'E-mail inválido.',
  ckPhone:   v => onlyDigits(v).length >= 10 || 'Telefone incompleto.',
  ckCep:     v => onlyDigits(v).length === 8 || 'CEP deve ter 8 dígitos.',
  ckAddress: v => v.trim().length >= 3 || 'Informe o endereço.',
  ckNumber:  v => v.trim().length >= 1 || 'Informe o número.',
  ckDistrict:v => v.trim().length >= 2 || 'Informe o bairro.',
  ckCity:    v => v.trim().length >= 2 || 'Informe a cidade.',
  ckUf:      v => /^[A-Za-zÀ-ú]{2}$/.test(v.trim()) || 'UF inválida.',
  ckCardNum: v => (onlyDigits(v).length === 16 && luhn(onlyDigits(v))) || 'Número de cartão inválido.',
  ckCardName:v => v.trim().length >= 3 || 'Informe o nome impresso.',
  ckCardExp: v => {
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(v.trim())) return 'Use o formato MM/AA.';
    const [m, y] = v.split('/').map(Number);
    const now = new Date();
    const exp = new Date(2000 + y, m, 0);
    return exp >= new Date(now.getFullYear(), now.getMonth(), 1) || 'Cartão vencido.';
  },
  ckCardCvv: v => /^\d{3,4}$/.test(v) || 'CVV inválido.'
};

function setError(input, msg) {
  const field = input.closest('.ck-field');
  const small = field ? $('.ck-error', field) : null;
  input.classList.add('is-invalid');
  if (small) small.textContent = msg;
}
function clearError(input) {
  const field = input.closest('.ck-field');
  const small = field ? $('.ck-error', field) : null;
  input.classList.remove('is-invalid');
  if (small) small.textContent = '';
}
function validate(ids) {
  let ok = true;
  ids.forEach(id => {
    const input = el(id);
    const rule = RULES[id];
    if (!input || !rule) return;
    const res = rule(input.value || '');
    if (res !== true) { setError(input, res); ok = false; }
    else clearError(input);
  });
  return ok;
}

const DELIVERY_FIELDS = ['ckName', 'ckEmail', 'ckPhone', 'ckCep', 'ckAddress', 'ckNumber', 'ckDistrict', 'ckCity', 'ckUf'];
const CARD_FIELDS = ['ckCardNum', 'ckCardName', 'ckCardExp', 'ckCardCvv'];

/* ---------------- passos ---------------- */
function goStep(n) {
  ck.step = n;
  $$('.ck-step').forEach(s => {
    const active = s.id === 'step' + n;
    s.hidden = !active;
    s.classList.toggle('is-active', active);
  });
  $$('#ckSteps li').forEach(li => {
    const s = +li.dataset.step;
    li.classList.toggle('is-active', s === n);
    li.classList.toggle('is-done', s < n);
  });
  renderSummary();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const activeStep = document.querySelector('.ck-step.is-active');
  if (activeStep && window.vlAnimateStep) window.vlAnimateStep(activeStep);
}

function nextFrom1() {
  if (!ck.cart.length) { toast('Sua sacola está vazia'); return; }
  goStep(2);
}
function nextFrom2() {
  if (!validate(DELIVERY_FIELDS)) { toast('Confira os campos destacados'); return; }
  goStep(3);
}
function confirmOrder() {
  if (ck.pay === 'card' && !validate(CARD_FIELDS)) { toast('Confira os dados do cartão'); return; }
  if (!ck.cart.length) { toast('Sua sacola está vazia'); return; }

  const t = totals();
  const customer = readCustomer();
  const id = 'VL-' + new Date().getFullYear() + '-' + String(Math.floor(1000 + Math.random() * 9000));

  ck.lastOrder = {
    id,
    items: ck.cart.map(i => {
      const p = productById(i.id);
      return {
        name: p ? p.name : i.id,
        colorName: COLORS[i.color].name,
        hex: COLORS[i.color].hex,
        type: p ? p.type : 'tee',
        photo: (p && p.photos && p.photos[0]) || null,
        size: i.size, qty: i.qty, price: i.price
      };
    }),
    sub: t.sub, coupon: ck.coupon, couponDisc: t.couponDisc,
    ship: t.ship, pix: t.pix, total: t.total,
    pay: ck.pay, customer
  };

  saveCart([]);
  ck.cart = [];

  el('ckOrderId').textContent = id;
  el('ckSuccessSum').innerHTML = `
    <div class="ck-sum-row"><dt>Itens</dt><dd>${ck.lastOrder.items.reduce((s, i) => s + i.qty, 0)}</dd></div>
    <div class="ck-sum-row"><dt>Pagamento</dt><dd>${PAY_LABEL[ck.pay]}</dd></div>
    <div class="ck-sum-row"><dt>Entrega</dt><dd>${customer.city ? customer.city + '/' + customer.uf : '—'}</dd></div>
    <div class="ck-sum-row ck-total-row"><dt>Total</dt><dd>${brl(t.total)}</dd></div>`;

  renderSummary();
  goStep(4);
}

function readCustomer() {
  return {
    name: el('ckName').value.trim(),
    email: el('ckEmail').value.trim(),
    phone: el('ckPhone').value.trim(),
    cep: el('ckCep').value.trim(),
    address: el('ckAddress').value.trim(),
    number: el('ckNumber').value.trim(),
    comp: el('ckComp').value.trim(),
    district: el('ckDistrict').value.trim(),
    city: el('ckCity').value.trim(),
    uf: el('ckUf').value.trim().toUpperCase()
  };
}

/* navegação */
const on = (id, fn) => { const x = el(id); if (x) x.addEventListener('click', fn); };
on('toStep3', nextFrom2);
on('backTo1', () => goStep(1));
on('backTo1b', () => goStep(1));
on('backTo2', () => goStep(2));
on('backTo2b', () => goStep(2));
on('ckConfirm', confirmOrder);
el('ckMainBtn').addEventListener('click', () => {
  if (ck.step === 1) nextFrom1();
  else if (ck.step === 2) nextFrom2();
  else if (ck.step === 3) confirmOrder();
});
$$('#ckSteps li').forEach(li => li.addEventListener('click', () => {
  const s = +li.dataset.step;
  if (s < ck.step) goStep(s);
}));

/* ---------------- frete ---------------- */
$$('#ckShipOpts .ck-ship-opt').forEach(opt => opt.addEventListener('click', () => {
  $$('#ckShipOpts .ck-ship-opt').forEach(o => o.classList.toggle('is-active', o === opt));
  $('input', opt).checked = true;
  ck.ship = $('input', opt).value;
  renderAll();
}));

function renderShipping() {
  const sub = cartTotal(ck.cart);
  const free = sub >= FREE_SHIP;
  el('ckShipEta').textContent = etaRange(5, 8);
  el('ckExprEta').textContent = etaRange(2, 3);
  el('ckShipPrice').innerHTML = free
    ? '<span class="ck-free">Grátis</span>'
    : brl(STANDARD_SHIP);
}

/* ---------------- pagamento ---------------- */
$$('#ckPayOpts .ck-pay-opt').forEach(opt => opt.addEventListener('click', () => {
  $$('#ckPayOpts .ck-pay-opt').forEach(o => o.classList.toggle('is-active', o === opt));
  $('input', opt).checked = true;
  ck.pay = $('input', opt).value;
  $$('#ckPayOpts .ck-pay-panel').forEach(p => { p.hidden = p.dataset.panel !== ck.pay; });
  renderAll();
}));

function renderInstallments() {
  const t = totals();
  const cardTotal = t.base + t.ship;
  const sel = el('ckInstallments');
  const current = sel.value;
  sel.innerHTML = Array.from({ length: 6 }, (_, i) => {
    const n = i + 1;
    return `<option value="${n}">${n}x de ${brl(cardTotal / n)} sem juros</option>`;
  }).join('');
  if (current) sel.value = current;
}

/* ---------------- QR demonstrativo ---------------- */
function renderQR() {
  const n = 23;
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const inFinder = (x, y) => (x < 7 && y < 7) || (x > n - 8 && y < 7) || (x < 7 && y > n - 8);
  let rects = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (inFinder(x, y)) continue;
      if (rand() > 0.58) rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
  }
  const finder = (fx, fy) =>
    `<rect x="${fx}" y="${fy}" width="7" height="7"/>` +
    `<rect x="${fx + 1}" y="${fy + 1}" width="5" height="5" fill="#fff"/>` +
    `<rect x="${fx + 2}" y="${fy + 2}" width="3" height="3"/>`;
  el('ckQr').innerHTML = `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" aria-hidden="true">${rects}${finder(0, 0)}${finder(n - 7, 0)}${finder(0, n - 7)}</svg>`;
}

/* ---------------- toast ---------------- */
let toastTimer;
function toast(msg) {
  const t = el('toast');
  $('span', t).textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------------- init ---------------- */
function renderAll() {
  renderItems();
  renderSummary();
  renderShipping();
  renderInstallments();
}
renderQR();
renderAll();
