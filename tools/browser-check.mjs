#!/usr/bin/env node
/* ============================================================================
   DAVVERO LIMONE — verificação no navegador de verdade (sem servidor)
   ----------------------------------------------------------------------------
   Sobe o Chrome em modo headless com CDP (protocolo DevTools), abre as páginas
   por file:// e executa o roteiro de ponta a ponta no modo local: cadastro com
   PBKDF2 real, cartões, carteira em slots, as 5 etapas do checkout, pedido e
   redefinição de senha. Zero dependências — usa o WebSocket nativo do Node.

   Uso:
     node tools/browser-check.mjs                 # tudo
     node tools/browser-check.mjs --only conta    # uma parte
     node tools/browser-check.mjs --shots .tmp    # salva prints em .tmp/
   ========================================================================== */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(p => { try { return fs.existsSync(p); } catch { return false; } });

const argv = process.argv.slice(2);
const only = (() => { const i = argv.indexOf('--only'); return i > -1 ? argv[i + 1] : null; })();
const shotDir = (() => { const i = argv.indexOf('--shots'); return i > -1 ? path.resolve(ROOT, argv[i + 1]) : null; })();
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });

/* --------------------------------------------------------------- relatório */
let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail = '') {
  if (ok) pass++; else fail++;
  results.push(`${ok ? 'PASS ' : 'FALHA'}  ${name}${detail ? '  →  ' + detail : ''}`);
  console.log(`${ok ? '  ok  ' : ' FALHA'} ${name}${detail ? '  →  ' + detail : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ------------------------------------------------------------------ chrome */
let chrome, ws, msgId = 0;
const pending = new Map();
const pageErrors = [];
const fileUrl = rel => 'file:///' + path.join(ROOT, rel).replace(/\\/g, '/');

async function startChrome() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-chrome-'));
  const port = 9333 + Math.floor(Math.random() * 400);
  chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--mute-audio',
    '--allow-file-access-from-files',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    'about:blank',
  ], { stdio: 'ignore' });

  let info = null;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) { info = await res.json(); break; }
    } catch {}
    await sleep(250);
  }
  if (!info) throw new Error('Chrome não abriu a porta de depuração');
  return port;
}

async function connect(port) {
  let target = null;
  for (let i = 0; i < 40; i++) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = list.find(t => t.type === 'page');
    if (target) break;
    await sleep(200);
  }
  if (!target) throw new Error('nenhuma aba disponível');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      pageErrors.push(d.exception?.description || d.text || 'erro desconhecido');
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      pageErrors.push(msg.params.args.map(a => a.value || a.description).join(' '));
    }
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
}

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function goto(url, { wait = 350 } = {}) {
  const loaded = new Promise(res => {
    const onMsg = ev => {
      const m = JSON.parse(ev.data);
      if (m.method === 'Page.loadEventFired') { ws.removeEventListener('message', onMsg); res(); }
    };
    ws.addEventListener('message', onMsg);
    setTimeout(res, 12000);                       // rede de segurança
  });
  await send('Page.navigate', { url });
  await loaded;
  await sleep(wait);
}

/* O CDP avalia uma EXPRESSÃO. Para aceitar também trechos com `return`,
   envolvemos o código num corpo de função assíncrona — exceto quando o
   trecho já é uma IIFE/expressão pronta (começa com parêntese). */
function wrap(code) {
  const t = String(code).trim();
  if (t.startsWith('(')) return t;
  return `(async () => {\n${code}\n})()`;
}

async function evaluate(expression, { awaitPromise = true } = {}) {
  const out = await send('Runtime.evaluate', { expression: wrap(expression), awaitPromise, returnByValue: true });
  if (out.exceptionDetails) {
    throw new Error(out.exceptionDetails.exception?.description || out.exceptionDetails.text);
  }
  return out.result.value;
}

/* espera ativa: muito mais confiável que dormir um tempo fixo */
async function waitFor(expression, { timeout = 9000, label = '' } = {}) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeout) {
    try {
      const v = await evaluate(expression);
      if (v) return true;
      last = v;
    } catch (e) { last = e.message; }
    await sleep(120);
  }
  throw new Error(`tempo esgotado esperando ${label || expression} (último: ${last})`);
}

/* depois de navegar: espera o load e a página terminar de se montar */
async function openPage(rel, { ready = null, wait = 250 } = {}) {
  await goto(fileUrl(rel));
  if (pageErrors.length) {
    console.log('   ! erros na página: ' + pageErrors.slice(-3).map(e => String(e).split('\n')[0]).join(' | '));
  }
  if (ready) await waitFor(ready, { label: rel });
  await sleep(wait);
}

async function shot(name, { width = 1280, height = 900 } = {}) {
  if (!shotDir) return;
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await sleep(180);
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const file = path.join(shotDir, name + '.png');
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  console.log(`       print: ${path.relative(ROOT, file)}`);
}

const clearStorage = () => evaluate(`(() => { localStorage.clear(); sessionStorage.clear(); return true; })()`);
const settle = (ms = 400) => sleep(ms);

/* ============================================================ ROTEIROS */
const SCENARIOS = {};

/* ---------------- conta: cadastro, cartões, senha, reset ---------------- */
SCENARIOS.conta = async () => {
  await openPage('conta.html', { ready: 'return window.VLAuth && VLAuth.ready' });
  await clearStorage();
  await openPage('conta.html', { ready: 'return window.VLAuth && VLAuth.ready' });

  check('modo local detectado (sem servidor)', await evaluate(`return VLAuth.mode`) === 'local');
  check('página mostra o painel de convidado', await evaluate(`return document.getElementById('accGuest').hidden === false`));

  /* cadastro */
  await evaluate(`
    document.getElementById('regName').value = 'Ana Souza';
    document.getElementById('regEmail').value = 'ana@teste.com';
    document.getElementById('regPhone').value = '(11) 98765-4321';
    document.getElementById('regPass').value = 'Limone2026';
    document.getElementById('regMarketing').checked = true;
    document.getElementById('formRegister').dispatchEvent(new Event('submit', { cancelable: true }));
    return true;
  `);
  await sleep(1400);                              // PBKDF2 210k em tempo real
  check('cadastro loga o usuário', await evaluate(`return !!(VLAuth.user && VLAuth.user.email === 'ana@teste.com')`),
    await evaluate(`return (VLAuth.user && VLAuth.user.email) || 'sem usuário'`));
  check('senha não é guardada em claro', await evaluate(`
    const db = JSON.parse(localStorage.getItem('vl_db'));
    const raw = localStorage.getItem('vl_db');
    return !raw.includes('Limone2026') && /PBKDF2-SHA256/.test(db.users[0].cred.algo);
  `), await evaluate(`return JSON.parse(localStorage.getItem('vl_db')).users[0].cred.algo + ' · ' + JSON.parse(localStorage.getItem('vl_db')).users[0].cred.iterations + ' iter'`));
  check('painel da conta aparece', await evaluate(`return !document.getElementById('accPanel').hidden`));
  await shot('conta-logada');

  /* cartões: dois válidos + um duplicado */
  const card = async (number, kind, cvv) => evaluate(`
    (async () => {
      try {
        const out = await VLAuth.saveCard({ kind: '${kind}', number: '${number}', holder: 'ANA SOUZA', exp: '12/30', cvv: '${cvv}' });
        return { ok: true, dup: !!(out && out.duplicated), n: VLAuth.wallet.length };
      } catch (e) { return { ok: false, erro: e.message }; }
    })()
  `);
  const c1 = await card('5162306000000004', 'credit_card', '123');
  check('salva cartão de crédito (Mastercard/Nubank)', c1.ok && c1.n === 1, JSON.stringify(c1));
  const c2 = await card('4022055000000000', 'debit_card', '321');
  check('salva cartão de débito (Visa/Sicredi)', c2.ok && c2.n === 2, JSON.stringify(c2));
  const c3 = await card('5162306000000004', 'credit_card', '123');
  check('cartão repetido é deduplicado', c3.dup === true, JSON.stringify(c3));

  check('só guarda o necessário do cartão', await evaluate(`
    const raw = localStorage.getItem('vl_db');
    const c = JSON.parse(raw).cards[0];
    const proibido = raw.includes('5162306000000004') || raw.includes('cvv');
    return !proibido && /^\\d{4}$/.test(c.last4) && c.bin6.length === 6 && !!c.token && !c.number;
  `), await evaluate(`const c = JSON.parse(localStorage.getItem('vl_db')).cards[0]; return 'bin6 ' + c.bin6 + ' · last4 ' + c.last4 + ' · token ' + c.token.slice(0,10) + '…'`));
  check('cartão inválido (Luhn) é recusado', await evaluate(`
    (async () => { try { await VLAuth.saveCard({ kind:'credit_card', number:'5162306000000006', holder:'ANA SOUZA', exp:'12/30', cvv:'123' }); return false; } catch(e) { return /inválido/i.test(e.message); } })()
  `));
  check('validade vencida é recusada', await evaluate(`
    (async () => { try { await VLAuth.saveCard({ kind:'credit_card', number:'5162306000000004', holder:'ANA SOUZA', exp:'01/20', cvv:'123' }); return false; } catch(e) { return true; } })()
  `));

  /* carteira em slots */
  await evaluate(`goPanel('cartoes'); return true`);
  await settle(500);
  const wCredit = await evaluate(`return { slots: document.querySelectorAll('#accWallet [data-slot]').length, tabs: document.querySelectorAll('#accWallet .wl-tab').length, ativo: (document.querySelector('#accWallet .wl-tab.is-active') || {}).textContent.trim() }`);
  check('carteira separa crédito e débito em abas', wCredit.tabs === 2, JSON.stringify(wCredit));
  check('cartão de crédito aparece em slot', wCredit.slots === 1 && /Crédito/.test(wCredit.ativo), wCredit.slots + ' slot(s) em ' + wCredit.ativo);
  const wDebit = await evaluate(`
    (() => {
      document.querySelector('#accWallet .wl-tab[data-kind="debit_card"]').click();
      return { slots: document.querySelectorAll('#accWallet [data-slot]').length, ativo: (document.querySelector('#accWallet .wl-tab.is-active') || {}).textContent.trim() };
    })()
  `);
  check('cartão de débito aparece na aba débito', wDebit.slots === 1 && /Débito/.test(wDebit.ativo), JSON.stringify(wDebit));
  check('um slot marcado como principal', await evaluate(`return document.querySelectorAll('#accWallet .wl-slot-cap').length >= 1`));
  await shot('conta-cartoes-slots');

  /* trocar padrão + remover */
  const def = await evaluate(`
    (async () => {
      const id = VLAuth.wallet.find(c => c.kind === 'credit_card' && !c.isDefault) ? null : VLAuth.wallet[0].id;
      await VLAuth.setDefaultCard(VLAuth.wallet.find(c => c.kind === 'debit_card').id);
      return VLAuth.wallet.filter(c => c.kind === 'debit_card' && c.isDefault).length;
    })()
  `);
  check('troca de cartão principal funciona', def === 1, 'padrões de débito: ' + def);

  /* endereço */
  const addr = await evaluate(`
    (async () => { try { await VLAuth.saveAddress({ recipient:'Ana Souza', cep:'01310100', street:'Av. Paulista', number:'1000', complement:'Apto 52', district:'Bela Vista', city:'São Paulo', state:'SP', phone:'11987654321' }); return VLAuth.addresses.length; } catch(e) { return 'erro: ' + e.message; } })()
  `);
  check('salva endereço', addr === 1, String(addr));

  /* troca de senha */
  const changed = await evaluate(`
    (async () => { try { await VLAuth.changePassword({ current:'Limone2026', next:'OutraSenha9' }); return 'ok'; } catch(e) { return 'erro: ' + e.message; } })()
  `);
  check('troca de senha', changed === 'ok', changed);

  /* redefinição com código na tela */
  const reset = await evaluate(`
    (async () => {
      const pedido = await VLAuth.requestPasswordReset('ana@teste.com');
      const errado = await VLAuth.confirmPasswordReset({ email:'ana@teste.com', code:'000000', next:'Resetada2026' }).then(() => 'aceitou', e => 'recusou');
      const certo = await VLAuth.confirmPasswordReset({ email:'ana@teste.com', code: pedido.devCode, next:'Resetada2026' }).then(() => 'ok', e => 'erro: ' + e.message);
      return { code: pedido.devCode, errado, certo };
    })()
  `);
  check('reset gera código de 6 dígitos', /^\d{6}$/.test(reset.code), reset.code);
  check('código errado é recusado', reset.errado === 'recusou', reset.errado);
  check('código certo troca a senha', reset.certo === 'ok', reset.certo);
  check('login com a senha nova', await evaluate(`
    (async () => { try { await VLAuth.login({ email:'ana@teste.com', password:'Resetada2026' }); return VLAuth.logged; } catch(e) { return 'erro: ' + e.message; } })()
  `) === true);
  check('reset derruba as sessões antigas', await evaluate(`
    const db = JSON.parse(localStorage.getItem('vl_db'));
    return db.sessions.filter(s => s.userId === db.users[0].id).length <= 1;
  `));
  await shot('conta-resumo');

  /* logout e login de novo */
  check('logout limpa a sessão', await evaluate(`(async () => { await VLAuth.logout(); return !VLAuth.logged; })()`) === true);
  check('senha antiga não entra mais', await evaluate(`
    (async () => { try { await VLAuth.login({ email:'ana@teste.com', password:'OutraSenha9' }); return 'entrou'; } catch(e) { return 'recusou'; } })()
  `) === 'recusou');
  await evaluate(`return (async () => { await VLAuth.login({ email:'ana@teste.com', password:'Resetada2026' }); return true; })()`);
};

/* ---------------- checkout: 5 etapas com o modo local ---------------- */
SCENARIOS.checkout = async () => {
  await goto(fileUrl('checkout.html'));
  await clearStorage();
  await evaluate(`
    localStorage.setItem('vl_cart', JSON.stringify([{ key:'k1', id:'hoodie-puff', color:'preto', size:'M', qty:1, price:269 }]));
    return true;
  `);
  await goto(fileUrl('checkout.html'));
  await settle(700);

  check('sacola carregada do storage', await evaluate(`return document.querySelectorAll('.ck-item').length`) === 1);
  check('cinco etapas na trilha', await evaluate(`return document.querySelectorAll('#ckSteps li').length`) === 5,
    await evaluate(`return Array.from(document.querySelectorAll('#ckSteps li')).map(l => l.textContent.trim()).join(' / ')`));

  /* etapa 2: criar conta direto no checkout */
  await evaluate(`goStep(2); return true`);
  await settle(300);
  check('etapa 2 é a identificação', await evaluate(`return document.querySelector('.ck-step.is-active').id`) === 'step2');
  check('abas entrar/criar conta', await evaluate(`return document.querySelectorAll('.ck-acc-tab').length`) === 2);
  await evaluate(`document.getElementById('ckAccTabRegister').click(); return true`);
  await settle(200);
  check('aba criar conta abre o formulário', await evaluate(`return !document.getElementById('ckAccRegForm').hidden`));

  await evaluate(`
    document.getElementById('ckRegName').value = 'Ana Souza';
    document.getElementById('ckRegEmail').value = 'ana@teste.com';
    document.getElementById('ckRegPhone').value = '(11) 98765-4321';
    document.getElementById('ckRegPass').value = 'Limone2026';
    document.getElementById('ckAccRegForm').dispatchEvent(new Event('submit', { cancelable: true }));
    return true;
  `);
  await sleep(1500);
  check('cadastro no checkout loga', await evaluate(`return !!(VLAuth.user && VLAuth.user.email === 'ana@teste.com')`),
    await evaluate(`return VLAuth.user ? VLAuth.user.email : 'sem usuário'`));
  check('bloco de logado aparece', await evaluate(`return !document.getElementById('ckAccLogged').hidden`));
  await shot('checkout-identificacao');

  /* cartão salvo + dados lembrados */
  await evaluate(`
    (async () => {
      await VLAuth.saveCard({ kind:'debit_card', number:'4022055000000000', holder:'ANA SOUZA', exp:'12/30', cvv:'321' });
      await VLAuth.saveAddress({ recipient:'Ana Souza', cep:'01310100', street:'Av. Paulista', number:'1000', district:'Bela Vista', city:'São Paulo', state:'SP' });
      return true;
    })()
  `);
  await evaluate(`goStep(3); return true`);
  await settle(400);
  check('etapa 3 é a entrega', await evaluate(`return document.querySelector('.ck-step.is-active').id`) === 'step3');
  check('quem está comprando aparece', await evaluate(`return /Ana Souza/.test(document.getElementById('ckWho').textContent)`));
  check('endereço veio da conta', await evaluate(`return document.getElementById('ckAddress').value === 'Av. Paulista' && document.getElementById('ckCity').value === 'São Paulo'`),
    await evaluate(`return document.getElementById('ckAddress').value + ' · ' + document.getElementById('ckCity').value`));
  await shot('checkout-entrega');

  /* rascunho: sai e volta */
  check('rascunho salvo no storage', await evaluate(`return !!localStorage.getItem('vl_ck_draft')`));
  await evaluate(`document.getElementById('ckComp').value = 'Apto 52'; document.getElementById('ckComp').dispatchEvent(new Event('input')); return true`);
  await sleep(900);
  await goto(fileUrl('checkout.html'));
  await settle(700);
  check('dados lembrados ao voltar', await evaluate(`return document.getElementById('ckAddress').value === 'Av. Paulista' && document.getElementById('ckComp').value === 'Apto 52'`),
    await evaluate(`return document.getElementById('ckComp').value || '(vazio)'`));
  check('nada de cartão no rascunho', await evaluate(`
    const raw = localStorage.getItem('vl_ck_draft') || '';
    return !/4022|5162|cvv|\\d{13,}/.test(raw);
  `), await evaluate(`return (localStorage.getItem('vl_ck_draft') || '').slice(0, 90) + '…'`));

  /* etapa 4: pagamento */
  await evaluate(`goStep(4); return true`);
  await settle(500);
  check('etapa 4 é o pagamento', await evaluate(`return document.querySelector('.ck-step.is-active').id`) === 'step4');
  check('lista de meios completa', await evaluate(`return document.querySelectorAll('.ck-pay-opt').length`) === 10,
    await evaluate(`return Array.from(document.querySelectorAll('.ck-pay-opt')).map(b => b.dataset.method).join(', ')`));
  check('badges oficiais do Figma carregadas', await evaluate(`
    const imgs = Array.from(document.querySelectorAll('.ck-pay-opt img'));
    return imgs.length >= 4 && imgs.every(i => i.naturalWidth > 0);
  `), await evaluate(`return Array.from(document.querySelectorAll('.ck-pay-opt img')).map(i => i.src.split('/').pop()).join(', ')`));
  check('faixa de bandeiras aceitas', await evaluate(`return document.querySelectorAll('.pay-strip-item').length`) >= 4);
  check('descontos aparecem na linha certa', await evaluate(`
    const pix = Array.from(document.querySelectorAll('.ck-pay-opt')).find(b => b.dataset.method === 'pix');
    const cc = Array.from(document.querySelectorAll('.ck-pay-opt')).find(b => b.dataset.method === 'credit_card');
    return !!pix.querySelector('.ck-pay-off') && !cc.querySelector('.ck-pay-off');
  `));

  /* escolher cartão de crédito → carteira + slots */
  await evaluate(`Array.from(document.querySelectorAll('.ck-pay-opt')).find(b => b.dataset.method === 'credit_card').click(); return true`);
  await settle(500);
  const slots = await evaluate(`
    (async () => {
      await VLAuth.saveCard({ kind:'credit_card', number:'5162306000000004', holder:'ANA SOUZA', exp:'12/30', cvv:'123' });
      VLWallet.refresh();
      return document.querySelectorAll('#ckWalletHost [data-slot]').length;
    })()
  `);
  check('carteira monta o slot do cartão de crédito', slots === 1, slots + ' slot de cartão + botão de adicionar');
  check('parcelamento em 12x aparece', await evaluate(`return !!document.querySelector('#ckWalletHost [data-input="installments"]')`));
  check('resumo mostra o parcelamento', await evaluate(`return /12x|à vista|••••/.test(document.getElementById('ckSumPay').textContent)`),
    await evaluate(`return document.getElementById('ckSumPay').textContent.trim().replace(/\\s+/g,' ')`));
  await shot('checkout-pagamento-cartao', { height: 1400 });

  /* cartão de visitante aparece como slot */
  const guestSlots = await evaluate(`
    (() => {
      VLWallet._internal.guestTokenCard = { id:'g1', kind:'credit_card', brandId:'elo', brandName:'Elo', bankId:'itau', bankName:'Itaú', last4:'1111', holder:'ANA SOUZA', expMonth:3, expYear:2031, token:'tok_mem', guest:true, isDefault:true };
      VLWallet._internal.selectedId = 'g1';
      VLWallet.refresh();
      return { slots: document.querySelectorAll('#ckWalletHost [data-slot]').length, selo: document.querySelectorAll('#ckWalletHost .wl-slot-cap.is-guest').length };
    })()
  `);
  check('cartão de sessão vira slot com selo', guestSlots.slots === 2 && guestSlots.selo === 1, JSON.stringify(guestSlots));

  /* pix */
  await evaluate(`Array.from(document.querySelectorAll('.ck-pay-opt')).find(b => b.dataset.method === 'pix').click(); return true`);
  await settle(400);
  check('pix mostra QR e código copiável', await evaluate(`return !!document.querySelector('#ckQr svg') && document.getElementById('ckPixCode').textContent.startsWith('000201')`));
  await shot('checkout-pagamento-pix', { height: 1400 });

  /* finalizar pedido */
  await evaluate(`goStep(4); return true`);
  await settle(200);
  await evaluate(`
    Array.from(document.querySelectorAll('.ck-pay-opt')).find(b => b.dataset.method === 'credit_card').click();
    return true;
  `);
  await settle(500);
  const order = await evaluate(`
    (async () => {
      document.getElementById('ckConfirm').click();
      await new Promise(r => setTimeout(r, 1200));
      return {
        etapa: document.querySelector('.ck-step.is-active').id,
        id: document.getElementById('ckOrderId').textContent,
        pedidos: VLAuth.orders.length,
        total: document.getElementById('ckSuccessSum').textContent.replace(/\\s+/g, ' ').trim(),
      };
    })()
  `);
  check('pedido finaliza e vai para a etapa 5', order.etapa === 'step5', JSON.stringify(order));
  check('pedido fica no histórico da conta', order.pedidos >= 1, order.pedidos + ' pedido(s) · ' + order.id);
  check('sacola é esvaziada', await evaluate(`return document.querySelectorAll('.ck-item').length === 0`));
  await shot('checkout-pronto');

  /* pedido de visitante (sem conta) */
  await evaluate(`(async () => { await VLAuth.logout(); return true; })()`);
  await evaluate(`localStorage.setItem('vl_cart', JSON.stringify([{ key:'k2', id:'hoodie-puff', color:'preto', size:'G', qty:1, price:269 }])); return true`);
  await goto(fileUrl('checkout.html'));
  await settle(700);
  const guestOrder = await evaluate(`
    (async () => {
      const antes = { cart: ck.cart.length, pay: ck.pay, busy: ck.busy, step: ck.step, logado: !!(VLAuth && VLAuth.logged) };
      goStep(3);
      await new Promise(r => setTimeout(r, 200));
      document.getElementById('ckName').value = 'Visitante Teste';
      document.getElementById('ckEmail').value = 'visitante@teste.com';
      document.getElementById('ckPhone').value = '(11) 99999-9999';
      document.getElementById('ckCep').value = '01310-100';
      document.getElementById('ckAddress').value = 'Av. Paulista';
      document.getElementById('ckNumber').value = '1000';
      document.getElementById('ckDistrict').value = 'Bela Vista';
      document.getElementById('ckCity').value = 'São Paulo';
      document.getElementById('ckUf').value = 'SP';
      goStep(4);
      await new Promise(r => setTimeout(r, 300));
      /* visitante paga com Pix (o rascunho não deve mais trazer "cartão") */
      const pix = Array.from(document.querySelectorAll('.ck-pay-opt')).find(b => b.dataset.method === 'pix');
      if (pix) pix.click();
      await new Promise(r => setTimeout(r, 200));
      const valido = validate(DELIVERY_FIELDS);
      document.getElementById('ckConfirm').click();
      await new Promise(r => setTimeout(r, 1500));
      const db = JSON.parse(localStorage.getItem('vl_db') || '{}');
      return {
        antes, valido,
        depois: { step: ck.step, busy: ck.busy, cart: ck.cart.length, id: document.getElementById('ckOrderId').textContent },
        pedidos: (db.orders || []).length,
      };
    })()
  `);
  check('visitante fecha pedido sem conta', guestOrder.depois && guestOrder.depois.step === 5, JSON.stringify(guestOrder));
  check('rascunho guardou só o essencial', await evaluate(`
    const d = JSON.parse(localStorage.getItem('vl_ck_draft') || '{}');
    return Object.keys(d.fields || {}).every(k => ['ckName','ckEmail','ckPhone','ckCep','ckAddress','ckNumber','ckComp','ckDistrict','ckCity','ckUf'].includes(k));
  `));
  check('"apagar dados salvos" limpa o rascunho', await evaluate(`
    (() => { document.getElementById('ckForgetData').click(); return !localStorage.getItem('vl_ck_draft'); })()
  `));
};

/* -------------------------------------------------------------------- main */
(async () => {
  if (!CHROME) {
    console.error('\n  Chrome não encontrado. Defina CHROME_PATH.\n');
    process.exit(1);
  }
  console.log('\n  DAVVERO LIMONE · verificação no navegador (modo local, sem servidor)');
  console.log('  ──────────────────────────────────────────────────────────────');
  let port;
  try {
    port = await startChrome();
    await connect(port);
    for (const [name, fn] of Object.entries(SCENARIOS)) {
      if (only && only !== name) continue;
      console.log(`\n▸ ${name}`);
      await fn();
    }
    if (pageErrors.length) {
      console.log('\n  erros de página:');
      pageErrors.slice(0, 8).forEach(e => console.log('   ! ' + String(e).split('\n')[0]));
    }
    check('nenhum erro de JavaScript na página', pageErrors.length === 0, pageErrors.length + ' erro(s)');
    console.log(`\n  ${pass} passaram, ${fail} falharam\n`);
  } catch (err) {
    console.error('\n  erro na verificação:', err.message, '\n');
    fail++;
  } finally {
    try { ws && ws.close(); } catch {}
    try { chrome && chrome.kill(); } catch {}
  }
  process.exit(fail ? 1 : 0);
})();
