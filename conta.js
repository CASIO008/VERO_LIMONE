/* ============================================================
   DAVVERO LIMONE — página da conta
   Login, cadastro, dados, cartões (slots), endereços, pedidos
   e segurança. Conversa com VLAuth, que decide sozinho entre a
   API (server/server.js + SQLite) e o modo local do navegador.
   ============================================================ */
'use strict';

/* $ e $$ vêm do data.js (mesmo escopo global) — não redeclarar aqui */
const el = id => document.getElementById(id);
const digits = s => String(s ?? '').replace(/\D/g, '');

let toastTimer;
function toast(msg) {
  const t = el('toast');
  if (!t) return console.warn(msg);
  t.querySelector('span').textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}
window.toast = toast;

/* ----------------------------------------------------------- máscaras */
const maskPhone = v => {
  const d = digits(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};
const maskCep = v => { const d = digits(v).slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };
const maskCpf = v => digits(v).slice(0, 11)
  .replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
const maskUf = v => String(v || '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2);

function attachMask(id, fn) {
  const input = el(id);
  if (!input) return;
  input.addEventListener('input', () => { input.value = fn(input.value); });
}

/* ------------------------------------------------------------ erros */
function setErr(id, msg) {
  const input = el(id);
  if (!input) return;
  const box = input.closest('.ck-field');
  const small = box ? box.querySelector('.wl-error') : null;
  input.classList.toggle('is-invalid', !!msg);
  if (small) small.textContent = msg || '';
  if (box) box.classList.toggle('is-invalid', !!msg);
  return !msg;
}
function clearErrs(ids) { ids.forEach(id => setErr(id, '')); }
function msg(id, text, kind = 'ok') {
  const box = el(id);
  if (!box) return;
  box.textContent = text || '';
  box.className = 'acc-msg' + (text ? ' is-' + kind : '');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/* ============================================================ boot */
(async function boot() {
  attachMask('regPhone', maskPhone);
  attachMask('regCpf', maskCpf);
  attachMask('profPhone', maskPhone);
  attachMask('adCep', maskCep);
  attachMask('adPhone', maskPhone);
  attachMask('adState', maskUf);

  bindTabs();
  bindLogin();
  bindRegister();
  bindRecover();
  bindProfile();
  bindAddress();
  bindPassword();
  bindPanels();
  bindExport();

  const badge = el('accMode');
  if (badge) badge.textContent = 'verificando…';

  try {
    await VLAuth.init();
  } catch (e) {
    console.error(e);
    toast('Não foi possível carregar sua conta.');
  }

  if (VLAuth.mode === 'server') {
    if (badge) { badge.textContent = 'conta no servidor'; badge.classList.add('is-server'); }
    if (el('accFootNote')) el('accFootNote').textContent = 'Dados no banco SQLite (server/data/vero.db) — demonstração.';
  } else {
    if (badge) { badge.textContent = 'conta neste navegador'; badge.classList.add('is-local'); }
    if (el('accFootNote')) el('accFootNote').textContent = 'Seus dados ficam neste navegador. Número de cartão e CVV nunca são guardados.';
  }

  VLAuth.onChange(() => refresh());
  refresh();
})();

/* ============================================================ render */
function refresh() {
  const logged = VLAuth.logged;
  el('accGuest').hidden = logged;
  el('accPanel').hidden = !logged;
  if (!logged) return;

  const u = VLAuth.user;
  el('accFirstName').textContent = String(u.name || '').split(/\s+/)[0] || 'bem-vindo';
  el('accSince').textContent = u.since
    ? `Cliente desde ${new Date(u.since).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}`
    : '';

  el('profName').value = u.name || '';
  el('profPhone').value = u.phone ? maskPhone(u.phone) : '';
  el('profEmail').value = u.email || '';
  el('profCpf').value = u.cpfLast3 ? `•••.•••.•••-${u.cpfLast3.slice(-2)}` : 'não informado';
  el('profMarketing').checked = !!u.marketing;

  el('statCards').textContent = VLAuth.wallet.length;
  el('statAddr').textContent = VLAuth.addresses.length;
  el('statOrders').textContent = VLAuth.orders.length;

  renderQuickCards();
  renderAddresses();
  renderOrders();
  mountWallet();
}

function renderQuickCards() {
  const box = el('accQuickCards');
  if (!box) return;
  const cards = VLAuth.wallet.slice(0, 3).map(c => VLPAY.normalizeCard(c));
  if (!cards.length) {
    box.innerHTML = `<div class="acc-empty">
      <p>Você ainda não tem cartões salvos. Adicione um para agilizar o checkout.</p>
      <button class="btn btn-ghost sm" type="button" data-goto="cartoes">Adicionar cartão</button>
    </div>`;
  } else {
    box.innerHTML = `<p class="acc-quick-title">Seus cartões</p>
      <div class="acc-quick-rail">
        ${cards.map(c => `<div class="acc-quick-card">${VLPAY.cardArt({
          brand: c.brandId, bank: c.bankId, last4: c.last4, holder: c.holder,
          exp: `${String(c.expMonth).padStart(2, '0')}/${String(c.expYear).slice(-2)}`,
          kind: c.kind, compact: true,
        })}${c.isDefault ? '<span class="acc-quick-tag">Principal</span>' : ''}</div>`).join('')}
      </div>
      <button class="btn btn-ghost sm" type="button" data-goto="cartoes">Gerenciar cartões</button>`;
  }
  $$('[data-goto]', box).forEach(btn => btn.addEventListener('click', () => goPanel(btn.dataset.goto)));
}

/* ------------------------------------------------------------ wallet */
let walletMounted = false;
function mountWallet() {
  const host = el('accWallet');
  if (!host) return;
  if (!walletMounted) {
    VLWallet.mount(host, {
      allowManage: true, allowSave: true, showInstallments: false, allowKindSwitch: true,
      showPreview: false,
      onChange: () => { el('statCards').textContent = VLAuth.wallet.length; },
    });
    walletMounted = true;
  } else {
    VLWallet.refresh();
  }
}

/* --------------------------------------------------------- endereços */
function renderAddresses() {
  const box = el('accAddrList');
  if (!box) return;
  const list = VLAuth.addresses;
  if (!list.length) {
    box.innerHTML = '<p class="acc-empty-text">Nenhum endereço salvo ainda.</p>';
    return;
  }
  box.innerHTML = list.map(a => `
    <article class="acc-addr${a.isDefault ? ' is-default' : ''}">
      <div>
        <strong>${VLPAY.escapeHTML(a.label || 'Casa')}${a.isDefault ? ' <em>principal</em>' : ''}</strong>
        <p>${VLPAY.escapeHTML(a.street)}, ${VLPAY.escapeHTML(a.number)}${a.complement ? ' — ' + VLPAY.escapeHTML(a.complement) : ''}</p>
        <p>${VLPAY.escapeHTML(a.district)} · ${VLPAY.escapeHTML(a.city)}/${VLPAY.escapeHTML(a.state)} · CEP ${VLPAY.escapeHTML(a.cep)}</p>
        <p class="acc-addr-who">${VLPAY.escapeHTML(a.recipient)}${a.phone ? ' · ' + VLPAY.escapeHTML(maskPhone(a.phone)) : ''}</p>
      </div>
      <button class="btn btn-ghost sm danger" type="button" data-del-addr="${VLPAY.escapeHTML(String(a.id))}">Remover</button>
    </article>`).join('');
  $$('[data-del-addr]', box).forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Remover este endereço?')) return;
    try { await VLAuth.removeAddress(btn.dataset.delAddr); toast('Endereço removido.'); }
    catch (e) { toast(e.message); }
  }));
}

/* ----------------------------------------------------------- pedidos */
const ORDER_LABEL = {
  pending: 'Aguardando pagamento', paid: 'Pago', processing: 'Em preparo',
  shipped: 'Enviado', delivered: 'Entregue', canceled: 'Cancelado',
  refunded: 'Reembolsado', chargeback: 'Em análise',
};
function renderOrders() {
  const box = el('accOrders');
  if (!box) return;
  const list = VLAuth.orders;
  if (!list.length) {
    box.innerHTML = `<div class="acc-empty">
      <p>Você ainda não fez pedidos por aqui. Que tal começar pelos essenciais?</p>
      <a class="btn btn-ghost sm" href="index.html#colecao">Ver a coleção</a>
    </div>`;
    return;
  }
  box.innerHTML = list.map(o => {
    const items = (o.items || []).map(i => `<li>${i.qty}× ${VLPAY.escapeHTML(i.name)}${i.size ? ' · ' + VLPAY.escapeHTML(i.size) : ''}</li>`).join('');
    const total = typeof o.total === 'number' ? brl(o.total) : '—';
    const when = o.createdAt || o.created_at;
    return `<article class="acc-order">
      <header>
        <strong>${VLPAY.escapeHTML(o.id || o.public_id || '')}</strong>
        <span class="acc-pill is-${VLPAY.escapeHTML(o.status || 'pending')}">${ORDER_LABEL[o.status] || o.status || '—'}</span>
      </header>
      ${items ? `<ul>${items}</ul>` : ''}
      <footer>
        <span>${when ? new Date(when).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}</span>
        <strong>${total}</strong>
      </footer>
    </article>`;
  }).join('');
}

/* ============================================================ abas */
function bindTabs() {
  $$('[data-auth-tab]').forEach(tab => tab.addEventListener('click', () => {
    $$('[data-auth-tab]').forEach(t => {
      const on = t === tab;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    });
    el('formLogin').hidden = tab.dataset.authTab !== 'login';
    el('formRegister').hidden = tab.dataset.authTab !== 'register';
    msg('loginMsg', ''); msg('regMsg', '');
  }));
  $$('[data-eye]').forEach(btn => btn.addEventListener('click', () => {
    const input = el(btn.dataset.eye);
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.classList.toggle('is-on', show);
  }));
}

/* ============================================================ login */
function bindLogin() {
  const form = el('formLogin');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    clearErrs(['loginEmail', 'loginPass']);
    msg('loginMsg', '');
    const email = el('loginEmail').value.trim();
    const pass = el('loginPass').value;
    let ok = true;
    if (!EMAIL_RE.test(email)) ok = setErr('loginEmail', 'E-mail inválido.') && ok;
    if (!pass) ok = setErr('loginPass', 'Informe sua senha.') && ok;
    if (!ok) return;
    const btn = el('loginBtn');
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    try {
      await VLAuth.login({ email, password: pass, remember: el('loginRemember').checked });
      toast('Bem-vindo de volta!');
      form.reset();
    } catch (err) {
      msg('loginMsg', err.message, 'bad');
      if (err.code === 'credentials') setErr('loginPass', 'Confira e-mail e senha.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Entrar <span class="arr">→</span>';
    }
  });
}

/* ============================================================ cadastro */
function bindRegister() {
  const pass = el('regPass');
  if (pass) pass.addEventListener('input', () => {
    const s = VLAuth.passwordStrength(pass.value);
    const bar = el('passBar');
    if (bar) {
      bar.style.width = `${(s.score / 5) * 100}%`;
      bar.dataset.score = String(s.score);
    }
    const hint = el('passHint');
    if (hint) hint.textContent = pass.value
      ? (s.hints.length ? `${s.label} · ${s.hints.slice(0, 2).join(' · ')}` : `${s.label} — ótima senha!`)
      : 'Use 8+ caracteres, misturando letras, números e um símbolo.';
  });

  const form = el('formRegister');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    clearErrs(['regName', 'regEmail', 'regPhone', 'regPass', 'regCpf']);
    msg('regMsg', '');
    const name = el('regName').value.trim();
    const email = el('regEmail').value.trim();
    const phone = el('regPhone').value;
    const pw = el('regPass').value;
    const cpf = el('regCpf').value;
    let ok = true;
    if (name.split(/\s+/).length < 2) ok = setErr('regName', 'Informe nome e sobrenome.') && ok;
    if (!EMAIL_RE.test(email)) ok = setErr('regEmail', 'E-mail inválido.') && ok;
    if (digits(phone) && digits(phone).length < 10) ok = setErr('regPhone', 'Telefone incompleto.') && ok;
    const weak = VLAuth.passwordProblem(pw);
    if (weak) ok = setErr('regPass', weak) && ok;
    if (digits(cpf) && digits(cpf).length !== 11) ok = setErr('regCpf', 'CPF incompleto.') && ok;
    if (!ok) return;

    const btn = el('regBtn');
    btn.disabled = true;
    btn.textContent = 'Criando sua conta…';
    try {
      await VLAuth.register({ name, email, phone: digits(phone), password: pw, cpf: digits(cpf), marketing: el('regMarketing').checked, remember: true });
      toast('Conta criada. Bem-vindo à DAVVERO LIMONE!');
      form.reset();
      goPanel('resumo');
    } catch (err) {
      msg('regMsg', err.message, 'bad');
      if (err.code === 'email_taken') setErr('regEmail', 'Esse e-mail já tem conta — use a aba Entrar.');
      if (/senha/i.test(err.message)) setErr('regPass', err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Criar minha conta <span class="arr">→</span>';
    }
  });
}

/* ============================================================ recuperar acesso
   Sem servidor de e-mail nesta demonstração, o código de 6 dígitos aparece na
   tela (e no console do servidor). Em produção, ele iria só por e-mail.      */
let recoverEmail = '';

function showRecover(on) {
  el('accAuthCard').hidden = on;
  el('accRecover').hidden = !on;
  if (on) {
    msg('recMsg', '');
    el('formRecoverConfirm').hidden = true;
    el('recCodeBox').hidden = true;
    const mail = el('loginEmail').value.trim();
    if (mail) el('recEmail').value = mail;
    el('recEmail').focus();
  } else {
    el('formRecoverRequest').hidden = false;
    el('formRecoverConfirm').hidden = true;
    msg('recConfirmMsg', '');
  }
}

function bindRecover() {
  const go = el('goRecover');
  if (go) go.addEventListener('click', () => showRecover(true));
  const back = el('recBack');
  if (back) back.addEventListener('click', () => showRecover(false));

  if (location.hash === '#recuperar' && !VLAuth.logged) showRecover(true);

  const req = el('formRecoverRequest');
  if (req) req.addEventListener('submit', async e => {
    e.preventDefault();
    setErr('recEmail', '');
    msg('recMsg', '');
    const email = el('recEmail').value.trim();
    if (!EMAIL_RE.test(email)) { setErr('recEmail', 'E-mail inválido.'); return; }
    const btn = el('recSendBtn');
    btn.disabled = true;
    btn.textContent = 'Gerando…';
    try {
      const out = await VLAuth.requestPasswordReset(email);
      recoverEmail = email;
      req.hidden = true;
      el('formRecoverConfirm').hidden = false;
      if (out.devCode) {
        el('recCodeBox').hidden = false;
        el('recCode').textContent = out.devCode;
        msg('recMsg', '');
      } else {
        el('recCodeBox').hidden = true;
      }
      toast('Código gerado. Confira a tela.');
      el('recCodeIn').focus();
    } catch (err) {
      msg('recMsg', err.message, 'bad');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Enviar código';
    }
  });

  const pass = el('recNewPass');
  if (pass) pass.addEventListener('input', () => {
    const s = VLAuth.passwordStrength(pass.value);
    el('recBar').style.width = `${(s.score / 5) * 100}%`;
    el('recBar').dataset.score = String(s.score);
    el('recHint').textContent = pass.value ? `${s.label}${s.hints.length ? ' · ' + s.hints[0] : ''}` : '';
  });

  const conf = el('formRecoverConfirm');
  if (conf) conf.addEventListener('submit', async e => {
    e.preventDefault();
    setErr('recCode', '');
    msg('recConfirmMsg', '');
    const code = digits(el('recCodeIn').value);
    const next = pass.value;
    let ok = true;
    if (code.length !== 6) ok = setErr('recCode', 'O código tem 6 dígitos.') && ok;
    const weak = VLAuth.passwordProblem(next);
    if (weak) { msg('recConfirmMsg', weak, 'bad'); ok = false; }
    if (!ok) return;
    const btn = el('recConfirmBtn');
    btn.disabled = true;
    btn.textContent = 'Trocando…';
    try {
      await VLAuth.confirmPasswordReset({ email: recoverEmail, code, next });
      toast('Senha trocada! Entre com a nova senha.');
      conf.reset();
      el('recBar').style.width = '0%';
      el('recHint').textContent = '';
      showRecover(false);
      el('loginEmail').value = recoverEmail;
      el('loginPass').focus();
    } catch (err) {
      msg('recConfirmMsg', err.message, 'bad');
      if (/código/i.test(err.message)) setErr('recCode', err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Trocar senha';
    }
  });
}

/* ============================================================ perfil */
function bindProfile() {
  const form = el('formProfile');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    setErr('profName', '');
    msg('profMsg', '');
    const name = el('profName').value.trim();
    if (name.split(/\s+/).length < 2) { setErr('profName', 'Informe nome e sobrenome.'); return; }
    const btn = el('profBtn');
    btn.disabled = true;
    try {
      await VLAuth.updateProfile({ name, phone: digits(el('profPhone').value), marketing: el('profMarketing').checked });
      msg('profMsg', 'Dados atualizados.', 'ok');
      toast('Dados salvos.');
    } catch (err) {
      msg('profMsg', err.message, 'bad');
    } finally { btn.disabled = false; }
  });
}

/* ============================================================ endereço */
function bindAddress() {
  const form = el('formAddr');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    ['adRecipient', 'adCep', 'adStreet', 'adNumber', 'adDistrict', 'adCity', 'adState'].forEach(id => setErr(id, ''));
    msg('addrMsg', '');
    const data = {
      recipient: el('adRecipient').value.trim(),
      cep: digits(el('adCep').value),
      street: el('adStreet').value.trim(),
      number: el('adNumber').value.trim(),
      complement: el('adComplement').value.trim(),
      district: el('adDistrict').value.trim(),
      city: el('adCity').value.trim(),
      state: el('adState').value.trim().toUpperCase(),
      phone: digits(el('adPhone').value),
    };
    let ok = true;
    if (!data.recipient) ok = setErr('adRecipient', 'Informe quem recebe.') && ok;
    if (data.cep.length !== 8) ok = setErr('adCep', 'CEP deve ter 8 dígitos.') && ok;
    if (!data.street) ok = setErr('adStreet', 'Informe o endereço.') && ok;
    if (!data.number) ok = setErr('adNumber', 'Informe o número.') && ok;
    if (!data.district) ok = setErr('adDistrict', 'Informe o bairro.') && ok;
    if (!data.city) ok = setErr('adCity', 'Informe a cidade.') && ok;
    if (data.state.length !== 2) ok = setErr('adState', 'UF inválida.') && ok;
    if (!ok) return;
    const btn = el('addrBtn');
    btn.disabled = true;
    try {
      await VLAuth.saveAddress(data);
      form.reset();
      toast('Endereço salvo.');
      msg('addrMsg', 'Endereço salvo.', 'ok');
    } catch (err) { msg('addrMsg', err.message, 'bad'); }
    finally { btn.disabled = false; }
  });
}

/* ============================================================ senha */
function bindPassword() {
  const next = el('newPass');
  if (next) next.addEventListener('input', () => {
    const s = VLAuth.passwordStrength(next.value);
    el('newBar').style.width = `${(s.score / 5) * 100}%`;
    el('newBar').dataset.score = String(s.score);
    el('newHint').textContent = next.value ? `${s.label}${s.hints.length ? ' · ' + s.hints[0] : ''}` : '';
  });
  const form = el('formPass');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    setErr('curPass', ''); msg('passMsg', '');
    const btn = el('passBtn');
    btn.disabled = true;
    try {
      await VLAuth.changePassword({ current: el('curPass').value, next: next.value });
      form.reset();
      el('newBar').style.width = '0%';
      el('newHint').textContent = '';
      msg('passMsg', 'Senha alterada. Outros dispositivos foram desconectados.', 'ok');
      toast('Senha alterada.');
    } catch (err) {
      msg('passMsg', err.message, 'bad');
      if (/atual/i.test(err.message)) setErr('curPass', err.message);
    } finally { btn.disabled = false; }
  });
}

/* ============================================================ painéis */
function goPanel(name) {
  $$('[data-panel]').forEach(b => b.classList.toggle('is-active', b.dataset.panel === name));
  $$('[data-pane]').forEach(p => p.classList.toggle('is-active', p.dataset.pane === name));
  if (name === 'cartoes') VLWallet.refresh();
  if (name === 'pedidos') renderOrders();
  if (name === 'resumo') renderQuickCards();
}
function bindPanels() {
  $$('[data-panel]').forEach(btn => btn.addEventListener('click', () => goPanel(btn.dataset.panel)));
  const out = el('accLogout');
  if (out) out.addEventListener('click', async () => {
    await VLAuth.logout();
    walletMounted = false;
    el('accWallet').innerHTML = '';
    toast('Você saiu da conta.');
  });
}

/* =========================================== exportar / apagar dados */
function bindExport() {
  const exp = el('accExport');
  if (exp) exp.addEventListener('click', () => {
    const u = VLAuth.user;
    if (!u) return;
    const data = {
      exportadoEm: new Date().toISOString(),
      aviso: 'Cópia dos seus dados na DAVVERO LIMONE (demonstração). Tokens de cartão não abrem o cartão em lugar nenhum.',
      perfil: u,
      cartoes: VLAuth.wallet.map(c => ({ ...c, token: c.token ? c.token.slice(0, 10) + '…' : null })),
      enderecos: VLAuth.addresses,
      pedidos: VLAuth.orders,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'davverolimone-meus-dados.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Download iniciado.');
  });

  const del = el('accDelete');
  if (del) del.addEventListener('click', async () => {
    if (!confirm('Apagar sua conta e todos os dados salvos? Isso não pode ser desfeito.')) return;
    del.disabled = true;
    try {
      await VLAuth.deleteAccount();
      toast('Conta apagada.');
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      toast(e.message || 'Não foi possível apagar agora.');
      del.disabled = false;
    }
  });
}
