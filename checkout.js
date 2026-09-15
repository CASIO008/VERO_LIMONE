/* ============================================================
   DAVVERO LIMONE — checkout (demonstrativo)
   ------------------------------------------------------------
   · Identificação: entra na conta (VLAuth) e puxa cartões e
     endereços salvos — ou segue como visitante.
   · Pagamento: lista no padrão Hotmart (crédito, débito, Pix,
     boleto, PicPay, Mercado Pago, PayPal, Google/Apple/Samsung Pay)
     com a carteira de cartões em slots (VLWallet).
   · Nenhum dado de cartão é gravado: número completo e CVV ficam
     só na memória do formulário.
   ============================================================ */
'use strict';

/* ↓↓↓ troque pelo número real da loja (formato: 55 + DDD + número) */
const WHATS_NUMBER = '5511999999999';

const el = id => document.getElementById(id);
const productById = id => PRODUCTS.find(p => p.id === id);
const onlyDigits = s => String(s || '').replace(/\D/g, '');

const ck = {
  cart: loadCart(),
  step: 1,
  coupon: null,
  ship: 'standard',
  pay: 'pix',
  wallet: null,          // seleção vinda do VLWallet
  busy: false,
  lastOrder: null,
};

const methodOf = id => (window.VLPAY ? VLPAY.methodById(id) : null) || { id, label: id, group: 'other', icon: '', note: () => '', discount: () => 0 };
const payLabel = id => methodOf(id).label;
const payDiscount = id => { const m = methodOf(id || ck.pay); return m && m.discount ? m.discount() : 0; };
const isCardKind = id => id === 'credit_card' || id === 'debit_card';

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
  const rate = payDiscount();
  const disc = +(base * rate).toFixed(2);
  const total = Math.max(0, +(base + ship - disc).toFixed(2));
  return { sub, couponDisc, base, ship, pix: disc, rate, total };
}

/* ============================================================
   ETAPA 1 · SACOLA
   ============================================================ */
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

/* ============================================================
   ETAPA 2 · IDENTIFICAÇÃO + ENTREGA
   ============================================================ */
function renderAccount() {
  const logged = window.VLAuth && VLAuth.logged;
  el('ckAccLogged').hidden = !logged;
  el('ckAccGuest').hidden = !!logged;

  if (logged) {
    const u = VLAuth.user;
    el('ckAccName').textContent = u.name;
    el('ckAccEmail').textContent = u.email;
    el('ckAvatar').textContent = (String(u.name).trim()[0] || 'V').toUpperCase();
    const badge = el('ckAccBadge');
    const n = VLAuth.wallet.length;
    badge.textContent = n ? `${n} cartão${n > 1 ? 'ões' : ''} salvo${n > 1 ? 's' : ''}` : 'sem cartão salvo';
    badge.classList.toggle('is-empty', !n);
    prefillFromAccount();
  } else {
    accTab('login');
    el('ckAccMsg').textContent = '';
    el('ckRegMsg').textContent = '';
  }
  renderWho();
}

/* quem está comprando — aparece no topo da etapa de entrega */
function renderWho() {
  const box = el('ckWho');
  if (!box) return;
  if (window.VLAuth && VLAuth.logged) {
    const u = VLAuth.user;
    box.innerHTML = `<span class="ck-who-avatar" aria-hidden="true">${(String(u.name).trim()[0] || 'V').toUpperCase()}</span>
      <span class="ck-who-text">Comprando como <strong>${u.name}</strong> <em>${u.email}</em></span>
      <button class="ck-link" type="button" id="ckWhoOut">sair</button>`;
    const out = el('ckWhoOut');
    if (out) out.addEventListener('click', async () => {
      await VLAuth.logout();
      renderAccount();
      renderPay();
      toast('Você saiu da conta.');
    });
  } else {
    box.innerHTML = `<span class="ck-who-text">Comprando como <strong>visitante</strong> <em>os dados ficam só neste pedido</em></span>
      <button class="ck-link" type="button" id="ckWhoLogin">entrar na conta</button>`;
    const back = el('ckWhoLogin');
    if (back) back.addEventListener('click', () => goStep(2));
  }
}

/* alterna as abas de entrar / criar conta na identificação */
function accTab(which) {
  const isLogin = which !== 'register';
  const t1 = el('ckAccTabLogin'), t2 = el('ckAccTabRegister');
  if (!t1 || !t2) return;
  t1.classList.toggle('is-active', isLogin);
  t2.classList.toggle('is-active', !isLogin);
  t1.setAttribute('aria-selected', String(isLogin));
  t2.setAttribute('aria-selected', String(!isLogin));
  el('ckAccForm').hidden = !isLogin;
  el('ckAccRegForm').hidden = isLogin;
  const focus = isLogin ? el('ckAccEmailIn') : el('ckRegName');
  if (focus) focus.focus();
}

function prefillFromAccount() {
  const u = VLAuth.user;
  if (!u) return;
  const set = (id, v) => { const input = el(id); if (input && !input.value && v) input.value = v; };
  set('ckName', u.name);
  set('ckEmail', u.email);
  set('ckPhone', u.phone ? maskPhone(u.phone) : '');
  const addr = VLAuth.addresses.find(a => a.isDefault) || VLAuth.addresses[0];
  if (addr) {
    set('ckCep', maskCep(addr.cep));
    set('ckAddress', addr.street);
    set('ckNumber', addr.number);
    set('ckComp', addr.complement);
    set('ckDistrict', addr.district);
    set('ckCity', addr.city);
    set('ckUf', addr.state);
  }
  draftSave();
}

function bindAccount() {
  const t1 = el('ckAccTabLogin'), t2 = el('ckAccTabRegister');
  if (t1) t1.addEventListener('click', () => accTab('login'));
  if (t2) t2.addEventListener('click', () => accTab('register'));

  $$('[data-eye]').forEach(btn => btn.addEventListener('click', () => {
    const input = el(btn.dataset.eye);
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.classList.toggle('is-on', show);
  }));

  /* entrar */
  const form = el('ckAccForm');
  if (form) form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = el('ckAccEmailIn').value.trim();
    const pass = el('ckAccPassIn').value;
    const note = el('ckAccMsg');
    note.textContent = '';
    note.className = 'ck-account-msg';
    if (!email || !pass) {
      note.textContent = 'Informe e-mail e senha.';
      note.classList.add('is-bad');
      return;
    }
    const btn = el('ckAccLoginBtn');
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    try {
      await VLAuth.login({ email, password: pass, remember: el('ckAccRemember').checked });
      toast(`Bem-vindo de volta, ${String(VLAuth.user.name).split(' ')[0]}!`);
      form.reset();
      renderAccount();
      renderPay();
      renderAll();
    } catch (err) {
      note.textContent = err.message;
      note.classList.add('is-bad');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  });

  /* criar conta sem sair do checkout */
  const regPass = el('ckRegPass');
  if (regPass) regPass.addEventListener('input', () => {
    const s = VLAuth.passwordStrength(regPass.value);
    const bar = el('ckRegBar');
    if (bar) { bar.style.width = `${(s.score / 5) * 100}%`; bar.dataset.score = String(s.score); }
    const hint = el('ckRegHint');
    if (hint) hint.textContent = regPass.value
      ? (s.hints.length ? `${s.label} · ${s.hints.slice(0, 2).join(' · ')}` : `${s.label} — ótima senha!`)
      : 'Use 8+ caracteres com letras, números e um símbolo.';
  });

  const regForm = el('ckAccRegForm');
  if (regForm) regForm.addEventListener('submit', async e => {
    e.preventDefault();
    const setErr = (id, msg) => {
      const small = el(id);
      if (small) small.textContent = msg || '';
      const input = small && small.closest('.ck-field') ? small.closest('.ck-field').querySelector('input') : null;
      if (input) input.classList.toggle('is-invalid', !!msg);
      return !msg;
    };
    setErr('ckRegNameErr', ''); setErr('ckRegEmailErr', '');
    const note = el('ckRegMsg');
    note.textContent = ''; note.className = 'ck-account-msg';
    const name = el('ckRegName').value.trim();
    const email = el('ckRegEmail').value.trim();
    const phone = onlyDigits(el('ckRegPhone').value);
    const pw = el('ckRegPass').value;
    let ok = true;
    if (name.split(/\s+/).length < 2) ok = setErr('ckRegNameErr', 'Informe nome e sobrenome.') && ok;
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) ok = setErr('ckRegEmailErr', 'E-mail inválido.') && ok;
    const weak = VLAuth.passwordProblem(pw);
    if (weak) { note.textContent = weak; note.classList.add('is-bad'); ok = false; }
    if (!ok) return;

    const btn = el('ckRegBtn');
    btn.disabled = true;
    btn.textContent = 'Criando…';
    try {
      await VLAuth.register({
        name, email, phone, password: pw, marketing: el('ckRegMarketing').checked, remember: true,
      });
      toast(`Conta criada. Bem-vindo, ${name.split(' ')[0]}!`);
      regForm.reset();
      if (el('ckRegBar')) el('ckRegBar').style.width = '0%';
      renderAccount();
      renderPay();
      renderAll();
    } catch (err) {
      note.textContent = err.message;
      note.classList.add('is-bad');
      if (err.code === 'email_taken') setErr('ckRegEmailErr', 'Esse e-mail já tem conta — use "Já tenho conta".');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Criar conta e continuar';
    }
  });

  /* seguir sem conta */
  const skip = el('ckAccSkip');
  if (skip) skip.addEventListener('click', () => {
    renderWho();
    goStep(3);
  });

  /* sair da conta */
  const out = el('ckAccOut');
  if (out) out.addEventListener('click', async () => {
    await VLAuth.logout();
    renderAccount();
    renderPay();
    toast('Você saiu da conta. Pode continuar como visitante.');
  });
}

/* ============================================================
   LEMBRAR DADOS (rascunho do checkout)
   ------------------------------------------------------------
   Guarda no máximo nome, e-mail, telefone e endereço — nunca
   número de cartão, CVV ou qualquer dado de pagamento.
   ============================================================ */
const DRAFT_KEY = 'vl_ck_draft';
const REMEMBER_KEY = 'vl_ck_remember';
const DRAFT_FIELDS = ['ckName', 'ckEmail', 'ckPhone', 'ckCep', 'ckAddress', 'ckNumber', 'ckComp', 'ckDistrict', 'ckCity', 'ckUf'];

function rememberOn() { try { return localStorage.getItem(REMEMBER_KEY) !== '0'; } catch { return true; } }
function setRemember(on) { try { localStorage.setItem(REMEMBER_KEY, on ? '1' : '0'); } catch {} }

function draftRead() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; } }
function draftClear() { try { localStorage.removeItem(DRAFT_KEY); } catch {} }

function draftSave() {
  if (!rememberOn()) return;
  try {
    const fields = {};
    DRAFT_FIELDS.forEach(id => {
      const input = el(id);
      const v = input && input.value ? input.value.trim() : '';
      if (v) fields[id] = v;
    });
    if (!Object.keys(fields).length) return;
    /* o meio de pagamento NÃO entra no rascunho: voltar direto em "cartão"
       sem ter cartão nenhum só criaria um beco sem saída no checkout */
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      at: new Date().toISOString(), fields, ship: ck.ship, coupon: ck.coupon,
    }));
  } catch {}
}

function draftRestore() {
  const d = draftRead();
  if (!d) return;
  let used = false;
  DRAFT_FIELDS.forEach(id => {
    const input = el(id);
    if (input && !input.value && d.fields && d.fields[id]) { input.value = d.fields[id]; used = true; }
  });
  if (d.ship === 'express') {
    const opt = $$('#ckShipOpts .ck-ship-opt').find(o => $('input', o).value === 'express');
    if (opt) {
      $$('#ckShipOpts .ck-ship-opt').forEach(o => o.classList.toggle('is-active', o === opt));
      $('input', opt).checked = true;
      ck.ship = 'express';
      used = true;
    }
  }
  if (d.coupon && COUPONS[d.coupon] && !ck.coupon) {
    ck.coupon = d.coupon;
    el('ckCoupon').value = d.coupon;
    el('ckCoupon').disabled = true;
    el('ckCouponBtn').textContent = 'Remover';
    el('ckCouponMsg').innerHTML = `Cupom <strong>${d.coupon}</strong> aplicado: −10% no subtotal.`;
    el('ckCouponMsg').className = 'ck-coupon-msg ok';
    used = true;
  }
  if (used) toast('Recuperamos seus dados da última visita.');
}

function bindDraft() {
  const box = el('ckRememberData');
  if (box) {
    box.checked = rememberOn();
    box.addEventListener('change', () => {
      setRemember(box.checked);
      if (!box.checked) { draftClear(); toast('Dados salvos apagados.'); }
      else { draftSave(); toast('Vamos lembrar seus dados neste navegador.'); }
    });
  }
  const forget = el('ckForgetData');
  if (forget) forget.addEventListener('click', () => {
    draftClear();
    $('#ckCoupon').value = '';
    DRAFT_FIELDS.forEach(id => { const input = el(id); if (input) input.value = ''; });
    toast('Dados do checkout apagados.');
    renderAll();
  });
  let timer = null;
  const touch = () => { clearTimeout(timer); timer = setTimeout(draftSave, 700); };
  DRAFT_FIELDS.forEach(id => {
    const input = el(id);
    if (input) input.addEventListener('input', touch);
  });
  window.addEventListener('beforeunload', draftSave);
}

/* ============================================================
   ETAPA 3 · PAGAMENTO
   ============================================================ */
function payOptionHTML(m) {
  const active = ck.pay === m.id;
  const tag = m.tag ? `<span class="ck-tag">${m.tag}</span>` : '';
  const note = typeof m.note === 'function' ? m.note(INSTALLMENTS) : '';
  const pct = m.discount ? Math.round(m.discount() * 100) : 0;
  const left = m.badge || `<span class="ck-pay-ico" aria-hidden="true">${m.icon || ''}</span>`;
  return `<button type="button" class="ck-pay-opt${active ? ' is-active' : ''}" data-method="${m.id}"
            role="radio" aria-checked="${active}">
      ${left}
      <span class="ck-pay-info">
        <strong>${m.label}${tag}</strong>
        <em>${note}</em>
      </span>
      <span class="ck-pay-end">
        ${pct ? `<span class="ck-pay-off">−${pct}%</span>` : ''}
        <span class="ck-pay-check" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>
        </span>
      </span>
    </button>`;
}

function renderPay() {
  const root = el('ckPayRoot');
  if (!root) return;
  const methods = window.VLPAY ? VLPAY.METHODS : [{ id: 'pix', label: 'Pix', note: () => '', icon: '' }];
  root.innerHTML = `<div class="ck-pay-list" role="radiogroup" aria-label="Forma de pagamento">
      ${methods.map(payOptionHTML).join('')}
    </div>
    <div class="ck-pay-panel" id="ckPayPanel"></div>
    ${window.VLPAY ? `<div class="ck-pay-brands"><span>Bandeiras aceitas</span>${VLPAY.brandStrip()}</div>` : ''}`;
  $$('.ck-pay-opt', root).forEach(btn => btn.addEventListener('click', () => {
    if (ck.pay === btn.dataset.method) return;
    ck.pay = btn.dataset.method;
    ck.wallet = null;
    $$('.ck-pay-opt', root).forEach(b => {
      const on = b === btn;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', String(on));
    });
    renderPayPanel();
    renderAll();
  }));
  renderPayPanel();
}

function renderPayPanel() {
  const host = el('ckPayPanel');
  if (!host) return;
  const t = totals();
  const cardTotal = t.base + t.ship;
  const isCard = isCardKind(ck.pay);

  if (isCard) {
    host.innerHTML = `<div class="ck-pay-block">
        <div class="ck-pay-block-head">
          <strong>${ck.pay === 'credit_card' ? 'Cartões de crédito' : 'Cartões de débito'}</strong>
          <em>escolha um slot ou adicione outro</em>
        </div>
        <div id="ckWalletHost"></div>
      </div>`;
    if (window.VLWallet) {
      VLWallet.mount(el('ckWalletHost'), {
        kind: ck.pay,
        lockedKind: true,
        allowManage: true,
        allowSave: true,
        showInstallments: ck.pay === 'credit_card',
        total: cardTotal,
        onChange: st => { ck.wallet = st; renderSummary(); },
        onToast: toast,
      });
      ck.wallet = VLWallet.selection();
    }
    return;
  }

  if (ck.pay === 'pix') {
    host.innerHTML = `<div class="ck-pay-block">
        <div class="ck-pix">
          <div class="ck-qr" id="ckQr" aria-hidden="true"></div>
          <div>
            <p><strong>Escaneie o QR Code no app do seu banco.</strong><br/>O desconto de ${Math.round(t.rate * 100)}% já está aplicado no resumo. Este QR é demonstrativo.</p>
            <div class="ck-pix-code">
              <code id="ckPixCode"></code>
              <button class="btn btn-ghost sm" type="button" id="ckPixCopy">Copiar código</button>
            </div>
          </div>
        </div>
      </div>`;
    renderQR();
    const code = pixPayload(t.total);
    el('ckPixCode').textContent = code;
    el('ckPixCopy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code);
        toast('Código Pix copiado');
      } catch {
        toast('Selecione o código e copie');
      }
    });
    return;
  }

  if (ck.pay === 'boleto') {
    host.innerHTML = `<div class="ck-pay-block">
        <p class="ck-boleto">Geramos o boleto após a confirmação e enviamos para o seu e-mail. A liberação do pedido acontece em até 2 dias úteis após o pagamento.</p>
        <div class="ck-pay-lines">
          <span>Linha digitável (demonstrativa)</span>
          <code>34191.79001 01043.510047 91020.150008 5 91230000019990</code>
        </div>
      </div>`;
    return;
  }

  const m = methodOf(ck.pay);
  host.innerHTML = `<div class="ck-pay-block">
      <div class="ck-wallet-pay">
        <span class="ck-wallet-pay-ico">${m.icon}</span>
        <div>
          <strong>Pagar com ${m.label}</strong>
          <p>Você será levado para o app ${m.label} para confirmar o pagamento. Ao voltar, o pedido é atualizado automaticamente.</p>
        </div>
      </div>
      <p class="ck-pay-fine">Ambiente demonstrativo: nada é cobrado de verdade.</p>
    </div>`;
}

function pixPayload(total) {
  const amount = Number(total || 0).toFixed(2);
  const key = 'contato@davverolimone.com.br';
  return `00020126580014BR.GOV.BCB.PIX0136${key}5204000053039865406${amount}5802BR5914DAVVERO LIMONE6009SAO PAULO62070503***6304VL1M`;
}

/* ============================================================
   RESUMO / CONFIRMAÇÃO
   ============================================================ */
function summaryItems() {
  if (ck.step === 5 && ck.lastOrder) return ck.lastOrder.items;
  return ck.cart.map(i => {
    const p = productById(i.id);
    return p ? {
      name: p.name, colorName: COLORS[i.color].name, hex: COLORS[i.color].hex,
      type: p.type, photo: (p.photos && p.photos[0]) || null,
      size: i.size, qty: i.qty, price: i.price
    } : null;
  }).filter(Boolean);
}

function paymentLine(order) {
  const kind = order ? order.pay : ck.pay;
  const label = payLabel(kind);
  const card = order ? order.card : (ck.wallet && ck.wallet.card);
  const inst = order ? order.installments : (ck.wallet && ck.wallet.installments) || 1;
  if (!isCardKind(kind)) return label;
  const cardTxt = card ? `${card.brandName || card.brand || 'Cartão'}${card.bankName || card.bank ? ' ' + (card.bankName || card.bank) : ''} •••• ${card.last4}` : 'Cartão';
  if (kind === 'credit_card' && inst > 1) {
    const t = order ? { total: order.total } : totals();
    return `${cardTxt} · ${inst}x de ${brl(t.total / inst)} sem juros`;
  }
  return `${cardTxt} · à vista`;
}

function renderSummary() {
  const order = ck.step === 5 && ck.lastOrder ? ck.lastOrder : null;
  const t = order
    ? { sub: order.sub, couponDisc: order.couponDisc, ship: order.ship, pix: order.pix, rate: order.rate || 0, total: order.total }
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
    t.pix ? [`Desconto ${payLabel(order ? order.pay : ck.pay)} (${Math.round((t.rate || 0) * 100)}%)`, `− ${brl(t.pix)}`] : null,
    ['Total', brl(t.total), 'ck-total-row']
  ].filter(Boolean);

  el('ckSumTotals').innerHTML = rows.map(([label, value, cls]) =>
    `<div class="ck-sum-row ${cls || ''}"><dt>${label}</dt><dd>${value}</dd></div>`
  ).join('');

  /* forma de pagamento escolhida */
  const payInfo = el('ckSumPay');
  if (payInfo) payInfo.innerHTML = `<span>Pagamento</span><strong>${paymentLine(order)}</strong>`;

  const btn = el('ckMainBtn');
  btn.hidden = ck.step === 5;
  btn.disabled = !ck.cart.length || ck.busy;
  btn.firstChild.textContent = ck.step === 1 ? 'Continuar para identificação '
    : ck.step === 2 ? 'Continuar para entrega '
    : ck.step === 3 ? 'Continuar para pagamento '
    : ck.busy ? 'Finalizando… ' : 'Finalizar pedido ';

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
    ship: t.ship, pix: t.pix, rate: t.rate, total: t.total,
    pay: ck.pay, installments: (ck.wallet && ck.wallet.installments) || 1,
    card: ck.wallet && ck.wallet.card, customer
  };
}

function whatsMessage(o) {
  const L = [];
  L.push(`*Pedido ${o.id} — DAVVERO LIMONE*`);
  L.push('');
  o.items.forEach(i => L.push(`• ${i.name} · ${i.colorName} · ${i.size} — ${i.qty}x ${brl(i.price * i.qty)}`));
  L.push('');
  L.push(`Subtotal: ${brl(o.sub)}`);
  if (o.couponDisc) L.push(`Cupom ${o.coupon}: − ${brl(o.couponDisc)}`);
  L.push(`Frete: ${o.ship ? brl(o.ship) : 'Grátis'}`);
  if (o.pix) L.push(`Desconto ${payLabel(o.pay)}: − ${brl(o.pix)}`);
  L.push(`*Total: ${brl(o.total)}*`);
  L.push('');
  L.push(`Pagamento: ${paymentLine(o)}`);
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

[['ckPhone', maskPhone], ['ckCep', maskCep]].forEach(([id, fn]) => {
  const input = el(id);
  if (input) input.addEventListener('input', e => { e.target.value = fn(e.target.value); clearError(e.target); });
});

/* ---------------- validação ---------------- */
const RULES = {
  ckName:    v => v.trim().length >= 3 || 'Informe seu nome completo.',
  ckEmail:   v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'E-mail inválido.',
  ckPhone:   v => onlyDigits(v).length >= 10 || 'Telefone incompleto.',
  ckCep:     v => onlyDigits(v).length === 8 || 'CEP deve ter 8 dígitos.',
  ckAddress: v => v.trim().length >= 3 || 'Informe o endereço.',
  ckNumber:  v => v.trim().length >= 1 || 'Informe o número.',
  ckDistrict:v => v.trim().length >= 2 || 'Informe o bairro.',
  ckCity:    v => v.trim().length >= 2 || 'Informe a cidade.',
  ckUf:      v => /^[A-Za-zÀ-ú]{2}$/.test(v.trim()) || 'UF inválida.'
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
/* etapa 2 (identificação): não há o que validar — a conta é opcional */
function nextFrom2() {
  draftSave();
  renderWho();
  goStep(3);
}
/* etapa 3 (entrega): valida os dados e vai para o pagamento */
function nextFrom3() {
  if (!validate(DELIVERY_FIELDS)) { toast('Confira os campos destacados'); return; }
  draftSave();
  goStep(4);
  renderPayPanel();
}

async function confirmOrder() {
  if (ck.busy) return;
  if (!ck.cart.length) { toast('Sua sacola está vazia'); return; }
  if (!validate(DELIVERY_FIELDS)) { goStep(3); toast('Confira os dados de entrega'); return; }

  if (isCardKind(ck.pay)) {
    const sel = ck.wallet || (window.VLWallet ? VLWallet.selection() : null);
    const card = sel && sel.card;
    if (!card) { toast('Escolha ou adicione um cartão'); return; }
    if (!card.guest && !sel.methodId) { toast('Escolha um cartão da lista'); return; }
  }

  ck.busy = true;
  renderSummary();
  const t = totals();
  const customer = readCustomer();
  const card = ck.wallet && ck.wallet.card;
  const installments = (ck.wallet && ck.wallet.installments) || 1;
  const shipEta = ck.ship === 'express' ? { from: etaRange(2, 3) } : { from: etaRange(5, 8) };

  const payload = {
    items: ck.cart.map(i => {
      const p = productById(i.id);
      return { id: i.id, name: p ? p.name : i.id, color: COLORS[i.color].name, size: i.size, qty: i.qty, price: i.price };
    }),
    coupon: ck.coupon,
    shipping: t.ship,
    shipService: ck.ship,
    shipEtaFrom: shipEta.from,
    subtotal: +t.sub.toFixed(2),
    discount: +(t.couponDisc + t.pix).toFixed(2),
    total: t.total,
    customer: { name: customer.name, email: customer.email, phone: customer.phone },
    address: {
      cep: customer.cep, street: customer.address, number: customer.number,
      complement: customer.comp, district: customer.district, city: customer.city, state: customer.uf,
    },
    payment: {
      kind: ck.pay,
      methodId: ck.wallet && ck.wallet.methodId ? ck.wallet.methodId : null,
      installments,
      snapshot: card ? {
        brand: card.brandId || card.brand, bank: card.bankId || card.bank,
        last4: card.last4, holder: card.holder || null, token: card.token || null, guest: !!card.guest,
      } : {},
    },
  };

  let order = null;
  try {
    if (window.VLAuth) order = await VLAuth.createOrder(payload);
  } catch (err) {
    /* sem servidor e sem sessão o pedido ainda pode ser finalizado localmente */
    console.warn('pedido sem conta:', err.message);
  }

  const id = (order && order.id) || ('VL-' + new Date().getFullYear() + '-' + String(Math.floor(1000 + Math.random() * 9000)));

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
    ship: t.ship, pix: t.pix, rate: t.rate, total: t.total,
    pay: ck.pay, installments, card, customer
  };

  saveCart([]);
  ck.cart = [];
  ck.busy = false;

  el('ckOrderId').textContent = id;
  el('ckSuccessSum').innerHTML = `
    <div class="ck-sum-row"><dt>Itens</dt><dd>${ck.lastOrder.items.reduce((s, i) => s + i.qty, 0)}</dd></div>
    <div class="ck-sum-row"><dt>Pagamento</dt><dd>${paymentLine(ck.lastOrder)}</dd></div>
    <div class="ck-sum-row"><dt>Entrega</dt><dd>${customer.city ? customer.city + '/' + customer.uf : '—'}</dd></div>
    <div class="ck-sum-row ck-total-row"><dt>Total</dt><dd>${brl(t.total)}</dd></div>`;

  renderAll();          // limpa a sacola da tela também
  goStep(5);
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

/* navegação — 5 etapas */
const on = (id, fn) => { const x = el(id); if (x) x.addEventListener('click', fn); };
on('toStep3', nextFrom2);            // identificação → entrega
on('toStep4', nextFrom3);            // entrega → pagamento
on('backTo1', () => goStep(1));      // identificação → sacola
on('backTo1b', () => goStep(1));     // identificação → sacola (botão inferior)
on('backTo2', () => goStep(2));      // entrega → identificação
on('backTo2b', () => goStep(2));     // entrega → identificação (botão inferior)
on('backTo3', () => goStep(3));      // pagamento → entrega
on('backTo3b', () => goStep(3));     // pagamento → entrega (botão inferior)
on('ckConfirm', confirmOrder);
el('ckMainBtn').addEventListener('click', () => {
  if (ck.step === 1) nextFrom1();
  else if (ck.step === 2) nextFrom2();
  else if (ck.step === 3) nextFrom3();
  else if (ck.step === 4) confirmOrder();
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

/* ---------------- QR demonstrativo ---------------- */
function renderQR() {
  const box = el('ckQr');
  if (!box) return;
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
  box.innerHTML = `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" aria-hidden="true">${rects}${finder(0, 0)}${finder(n - 7, 0)}${finder(0, n - 7)}</svg>`;
}

/* ---------------- toast ---------------- */
let toastTimer;
function toast(text) {
  const t = el('toast');
  $('span', t).textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
window.toast = toast;

/* ---------------- init ---------------- */
function renderAll() {
  renderItems();
  renderSummary();
  renderShipping();
}

(async function init() {
  if (window.VLAuth) {
    try { await VLAuth.init(); } catch (e) { console.warn(e); }
    VLAuth.onChange(() => { renderAccount(); renderSummary(); });
  }
  bindAccount();
  bindDraft();
  draftRestore();
  renderAccount();
  renderPay();
  renderAll();
})();
