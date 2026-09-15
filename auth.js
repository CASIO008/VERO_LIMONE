/* ============================================================
   DAVVERO LIMONE — conta do usuário (VLAuth)
   ------------------------------------------------------------
   Funciona em dois modos, escolhidos automaticamente:

     · modo "server"  → existe API em /api (rode ABRIR-LOJA.cmd).
                        Cadastro, login, cartões e pedidos ficam no
                        SQLite (sql/schema.sql) com scrypt no servidor.
     · modo "local"   → sem servidor. Tudo vive no navegador, com a
                        MESMA disciplina: a senha nunca é guardada, só
                        um derivado PBKDF2-SHA256 (210k iterações) com
                        salt aleatório; o cartão vira token e só
                        sobrevivem bin6, last4, bandeira, banco e
                        validade. Nada de PAN, nada de CVV.

   Em qualquer modo a página nunca recebe de volta dados sensíveis.
   ============================================================ */
'use strict';

const VLAuth = (() => {

  /* ------------------------------------------------------------ constantes */
  const DB_KEY = 'vl_db';
  const SESSION_KEY = 'vl_session';
  const SESSION_DAYS = 30;
  const PBKDF2_ITER = 210000;
  const PBKDF2_ITER_FALLBACK = 60000;
  const MAX_FAILS = 5;
  const LOCK_MINUTES = 15;
  const POLICY_VERSION = '2026-01';

  const state = {
    mode: 'local',            // 'server' | 'local'
    ready: false,
    user: null,
    wallet: [],
    addresses: [],
    orders: [],
    error: null,
  };
  const listeners = new Set();
  const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
  function emit() { listeners.forEach(fn => { try { fn(snapshot()); } catch (e) { console.error(e); } }); }
  function snapshot() {
    return {
      mode: state.mode, ready: state.ready, user: state.user,
      wallet: state.wallet.slice(), addresses: state.addresses.slice(),
      orders: state.orders.slice(), logged: !!state.user,
    };
  }

  /* ------------------------------------------------------------- utilidades */
  const bytesToHex = buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  const hexToBytes = hex => new Uint8Array((hex.match(/.{1,2}/g) || []).map(h => parseInt(h, 16)));
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const randomBytes = n => crypto.getRandomValues(new Uint8Array(n));
  const randomHex = n => bytesToHex(randomBytes(n));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : randomHex(16));
  const nowISO = () => new Date().toISOString();
  const digits = s => String(s ?? '').replace(/\D/g, '');
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
  const normEmail = v => String(v || '').trim().toLowerCase();
  /* comparação em tempo constante (evita deduzir o hash pelo tempo) */
  function safeEqual(a, b) {
    const x = String(a), y = String(b);
    if (x.length !== y.length) return false;
    let diff = 0;
    for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
    return diff === 0;
  }

  /* ------------------------------------------- SHA-256 puro (só fallback) */
  const K256 = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  function sha256JS(bytes) {
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const len = bytes.length;
    const withOne = new Uint8Array((((len + 9) >> 6) + 1) << 6);
    withOne.set(bytes);
    withOne[len] = 0x80;
    const bitLen = len * 8;
    const dv = new DataView(withOne.buffer);
    dv.setUint32(withOne.length - 4, bitLen >>> 0);
    dv.setUint32(withOne.length - 8, Math.floor(bitLen / 0x100000000));
    const w = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let off = 0; off < withOne.length; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K256[i] + w[i]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    const out = new Uint8Array(32);
    const odv = new DataView(out.buffer);
    H.forEach((v, i) => odv.setUint32(i * 4, v));
    return out;
  }
  function hmacJS(keyBytes, msgBytes) {
    let key = keyBytes;
    if (key.length > 64) key = sha256JS(key);
    const block = new Uint8Array(64);
    block.set(key);
    const inner = new Uint8Array(64 + msgBytes.length);
    const outer = new Uint8Array(64 + 32);
    for (let i = 0; i < 64; i++) { inner[i] = block[i] ^ 0x36; outer[i] = block[i] ^ 0x5c; }
    inner.set(msgBytes, 64);
    outer.set(sha256JS(inner), 64);
    return sha256JS(outer);
  }
  function pbkdf2JS(password, salt, iterations, dkLen) {
    const pw = new TextEncoder().encode(password.normalize('NFKC'));
    const out = new Uint8Array(dkLen);
    let offset = 0, block = 1;
    while (offset < dkLen) {
      const saltBlock = new Uint8Array(salt.length + 4);
      saltBlock.set(salt);
      new DataView(saltBlock.buffer).setUint32(salt.length, block);
      let u = hmacJS(pw, saltBlock);
      const acc = u.slice();
      for (let i = 1; i < iterations; i++) {
        u = hmacJS(pw, u);
        for (let j = 0; j < acc.length; j++) acc[j] ^= u[j];
      }
      out.set(acc.slice(0, Math.min(32, dkLen - offset)), offset);
      offset += 32; block++;
    }
    return out;
  }

  /* ---------------------------------------- derivação (WebCrypto primeiro) */
  const hasSubtle = typeof crypto !== 'undefined' && !!crypto.subtle && typeof crypto.subtle.importKey === 'function';

  async function pbkdf2(password, saltBytes, iterations, dkLen = 32) {
    if (hasSubtle) {
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' }, key, dkLen * 8);
      return new Uint8Array(bits);
    }
    return pbkdf2JS(password, saltBytes, iterations, dkLen);
  }

  async function makeCredential(password) {
    const iterations = hasSubtle ? PBKDF2_ITER : PBKDF2_ITER_FALLBACK;
    const salt = randomBytes(16);
    const hash = await pbkdf2(password, salt, iterations);
    return {
      algo: hasSubtle ? 'PBKDF2-SHA256' : 'PBKDF2-SHA256-JS',
      iterations,
      salt: b64(salt),
      hash: b64(hash),
    };
  }
  async function checkCredential(password, cred) {
    if (!cred) return false;
    const salt = Uint8Array.from(atob(cred.salt), c => c.charCodeAt(0));
    const hash = await pbkdf2(password, salt, cred.iterations, atob(cred.hash).length);
    return safeEqual(b64(hash), cred.hash);
  }
  async function fingerprintOf(pan, saltHex) {
    const msg = new TextEncoder().encode(digits(pan));
    if (hasSubtle) {
      const key = await crypto.subtle.importKey('raw', hexToBytes(saltHex), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      return bytesToHex(await crypto.subtle.sign('HMAC', key, msg));
    }
    return bytesToHex(hmacJS(hexToBytes(saltHex), msg));
  }
  /* sha256 puro em hex — usado no hash dos códigos de redefinição */
  async function sha256hex(text) {
    const bytes = new TextEncoder().encode(String(text));
    if (hasSubtle) return bytesToHex(await crypto.subtle.digest('SHA-256', bytes));
    return bytesToHex(sha256JS(bytes));
  }

  /* --------------------------------------------------------------- banco local */
  function emptyDb() {
    return {
      version: 1,
      createdAt: nowISO(),
      fingerprintSalt: randomHex(32),
      users: [],            // { id, name, email, phone, cpfLast3, marketing, since, cred, fails, lockedUntil, lastLogin }
      sessions: [],         // { token, userId, createdAt, expiresAt }
      cards: [],            // { id, userId, kind, ... token }
      addresses: [],
      orders: [],
      resets: [],           // { userId, codeHash, expiresAt }
      audit: [],
    };
  }
  function readDb() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (!raw) return emptyDb();
      const db = JSON.parse(raw);
      db.users ||= []; db.sessions ||= []; db.cards ||= [];
      db.addresses ||= []; db.orders ||= []; db.audit ||= []; db.resets ||= [];
      db.fingerprintSalt ||= randomHex(32);
      return db;
    } catch { return emptyDb(); }
  }
  function writeDb(db) {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) { console.warn('armazenamento cheio', e); }
  }
  function audit(db, action, meta) {
    db.audit.unshift({ at: nowISO(), action, meta: meta || null });
    db.audit = db.audit.slice(0, 200);
  }
  const publicUser = u => u && ({
    id: u.id, name: u.name, email: u.email, phone: u.phone || '',
    cpfLast3: u.cpfLast3 || null, marketing: !!u.marketing, since: u.since,
  });

  /* --------------------------------------------------------------- sessão */
  function saveSessionLocal(token, userId, remember = true) {
    const data = { token, userId, createdAt: nowISO(), expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5).toISOString() };
    try {
      (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(data));
    } catch {}
    return data;
  }
  function readSessionLocal() {
    try {
      const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (new Date(s.expiresAt) < new Date()) { clearSessionLocal(); return null; }
      return s;
    } catch { return null; }
  }
  function clearSessionLocal() {
    try { localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); } catch {}
  }

  /* ------------------------------------------------------- cliente da API */
  const cookie = name => (document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)')) || [])[2];
  async function api(method, path, body) {
    const headers = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    const csrf = cookie('vl_csrf');
    if (csrf) headers['x-csrf-token'] = decodeURIComponent(csrf);
    const res = await fetch(path, {
      method, headers, credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch {}
    if (!res.ok) {
      const err = new Error(json?.error?.message || 'Não foi possível concluir a operação.');
      err.code = json?.error?.code;
      err.status = res.status;
      err.problems = json?.error?.problems || null;
      throw err;
    }
    return json;
  }

  /* -------------------------------------------------- detecção do modo */
  async function detectMode() {
    try {
      const res = await fetch('/api/health', { headers: { Accept: 'application/json' } });
      if (!res.ok) return 'local';
      const data = await res.json();
      return data && data.ok && data.auth ? 'server' : 'local';
    } catch { return 'local'; }
  }

  /* -------------------------------------------------------- cartões (local) */
  async function localSaveCard(user, input) {
    const P = window.VLPAY;
    const brand = P.detectBrand(input.number);
    const bank = P.detectBank(input.number);
    const pan = digits(input.number);
    const problems = P.cardProblems({ ...input, brand });
    if (Object.keys(problems).length) {
      const err = new Error(Object.values(problems)[0]);
      err.problems = problems;
      throw err;
    }
    const db = readDb();
    const fingerprint = await fingerprintOf(pan, db.fingerprintSalt);
    if (db.cards.some(c => c.userId === user.id && c.fingerprint === fingerprint)) {
      return { duplicated: true };
    }
    const sameKind = db.cards.filter(c => c.userId === user.id && c.kind === input.kind);
    const card = {
      id: uid(),
      userId: user.id,
      kind: input.kind === 'debit_card' ? 'debit_card' : 'credit_card',
      brandId: brand.id, brandName: brand.name,
      bankId: bank ? bank.id : null, bankName: bank ? bank.name : null,
      bin6: pan.slice(0, 6), last4: pan.slice(-4),
      expMonth: Number(digits(input.exp).slice(0, 2)),
      expYear: 2000 + Number(digits(input.exp).slice(2)),
      holder: String(input.holder || '').trim().slice(0, 40),
      token: 'tok_' + randomHex(12),          // referência opaca: o PAN morre aqui
      fingerprint,
      isDebit: input.kind === 'debit_card',
      isDefault: sameKind.length === 0,
      createdAt: nowISO(),
    };
    card.label = `${card.brandName}${card.bankName ? ' ' + card.bankName : ''} •••• ${card.last4}`;
    db.cards.push(card);
    audit(db, 'card.add', { brand: card.brandId, bank: card.bankId, last4: card.last4 });
    writeDb(db);
    return { duplicated: false, card };
  }
  function localWallet(user) {
    if (!user) return [];
    return readDb().cards
      .filter(c => c.userId === user.id)
      .sort((a, b) => (b.isDefault - a.isDefault) || (a.createdAt < b.createdAt ? 1 : -1))
      .map(c => ({ ...c }));
  }

  /* ------------------------------------------------------------- API pública */
  const publicState = () => snapshot();

  let initPromise = null;
  function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      state.mode = await detectMode();
      if (state.mode === 'server') {
        try {
          const me = await api('GET', '/api/auth/me');
          state.user = me.user; state.wallet = me.wallet || []; state.addresses = me.addresses || [];
        } catch { state.user = null; state.wallet = []; state.addresses = []; }
      } else {
        const s = readSessionLocal();
        const db = readDb();
        const u = s ? db.users.find(x => x.id === s.userId) : null;
        state.user = u ? publicUser(u) : null;
        state.wallet = localWallet(u);
        state.addresses = db.addresses.filter(a => a.userId === (u && u.id));
        state.orders = db.orders.filter(o => o.userId === (u && u.id));
      }
      state.ready = true;
      emit();
      return publicState();
    })();
    return initPromise;
  }

  async function register(input) {
    const name = String(input.name || '').trim();
    const email = normEmail(input.email);
    const password = String(input.password || '');
    if (name.split(/\s+/).length < 2) throw new Error('Informe nome e sobrenome.');
    if (!EMAIL_RE.test(email)) throw new Error('E-mail inválido.');
    const weak = passwordProblem(password);
    if (weak) throw new Error(weak);

    if (state.mode === 'server') {
      const out = await api('POST', '/api/auth/register', {
        name, email, password,
        phone: digits(input.phone), cpf: digits(input.cpf),
        marketing: !!input.marketing,
      });
      state.user = out.user; state.wallet = out.wallet || []; state.addresses = out.addresses || [];
      emit();
      return state.user;
    }

    const db = readDb();
    if (db.users.some(u => u.email === email)) {
      const err = new Error('Já existe uma conta com esse e-mail. Faça login.');
      err.code = 'email_taken';
      throw err;
    }
    const cred = await makeCredential(password);
    const user = {
      id: uid(), name, email,
      phone: digits(input.phone).slice(0, 13),
      cpfLast3: digits(input.cpf).length === 11 ? digits(input.cpf).slice(-3) : null,
      cpfHash: digits(input.cpf) ? await fingerprintOf(digits(input.cpf), db.fingerprintSalt) : null,
      marketing: !!input.marketing,
      since: nowISO(), lastLogin: nowISO(), fails: 0, lockedUntil: null,
      cred,
      consent: { purpose: 'marketing', granted: !!input.marketing, policyVersion: POLICY_VERSION, at: nowISO() },
    };
    db.users.push(user);
    audit(db, 'auth.register', { email });
    const token = randomHex(24);
    db.sessions.push({ token, userId: user.id, createdAt: nowISO(), expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5).toISOString() });
    writeDb(db);
    saveSessionLocal(token, user.id, input.remember !== false);
    state.user = publicUser(user); state.wallet = []; state.addresses = []; state.orders = [];
    emit();
    return state.user;
  }

  async function login(input) {
    const email = normEmail(input.email);
    const password = String(input.password || '');

    if (state.mode === 'server') {
      const out = await api('POST', '/api/auth/login', { email, password });
      state.user = out.user; state.wallet = out.wallet || []; state.addresses = out.addresses || [];
      await loadOrders().catch(() => {});
      emit();
      return state.user;
    }

    const db = readDb();
    const user = db.users.find(u => u.email === email);
    if (!user) {
      await pbkdf2(password, randomBytes(16), 1000);   // mesma demora: não revela se o e-mail existe
      throw new Error('E-mail ou senha incorretos.');
    }
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      throw new Error(`Conta bloqueada por tentativas erradas. Tente de novo em alguns minutos.`);
    }
    if (!(await checkCredential(password, user.cred))) {
      user.fails = (user.fails || 0) + 1;
      if (user.fails >= MAX_FAILS) user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
      audit(db, 'auth.login_failed', { email });
      writeDb(db);
      throw new Error(user.fails >= MAX_FAILS
        ? `Muitas tentativas erradas. Conta bloqueada por ${LOCK_MINUTES} minutos.`
        : 'E-mail ou senha incorretos.');
    }
    user.fails = 0; user.lockedUntil = null; user.lastLogin = nowISO();
    const token = randomHex(24);
    db.sessions.push({ token, userId: user.id, createdAt: nowISO(), expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5).toISOString() });
    audit(db, 'auth.login', { email });
    writeDb(db);
    saveSessionLocal(token, user.id, input.remember !== false);
    state.user = publicUser(user);
    state.wallet = localWallet(user);
    state.addresses = db.addresses.filter(a => a.userId === user.id);
    state.orders = db.orders.filter(o => o.userId === user.id);
    emit();
    return state.user;
  }

  async function logout() {
    if (state.mode === 'server') {
      try { await api('POST', '/api/auth/logout'); } catch {}
    } else {
      const s = readSessionLocal();
      const db = readDb();
      db.sessions = db.sessions.filter(x => x.token !== (s && s.token));
      audit(db, 'auth.logout', {});
      writeDb(db);
      clearSessionLocal();
    }
    state.user = null; state.wallet = []; state.addresses = []; state.orders = [];
    emit();
  }

  async function updateProfile(patch) {
    if (state.mode === 'server') {
      const out = await api('PATCH', '/api/auth/me', patch);
      state.user = out.user; emit(); return state.user;
    }
    const s = readSessionLocal(); const db = readDb();
    const user = db.users.find(u => u.id === (s && s.userId));
    if (!user) throw new Error('Sessão expirada.');
    if (patch.name != null) {
      const name = String(patch.name).trim();
      if (name.split(/\s+/).length < 2) throw new Error('Informe nome e sobrenome.');
      user.name = name;
    }
    if (patch.phone != null) user.phone = digits(patch.phone).slice(0, 13);
    if (patch.marketing != null) user.marketing = !!patch.marketing;
    audit(db, 'account.update', {}); writeDb(db);
    state.user = publicUser(user); emit(); return state.user;
  }

  async function changePassword(input) {
    if (state.mode === 'server') { await api('POST', '/api/auth/password', input); return true; }
    const s = readSessionLocal(); const db = readDb();
    const user = db.users.find(u => u.id === (s && s.userId));
    if (!user) throw new Error('Sessão expirada.');
    if (!(await checkCredential(String(input.current || ''), user.cred))) throw new Error('Senha atual incorreta.');
    const weak = passwordProblem(String(input.next || ''));
    if (weak) throw new Error(weak);
    user.cred = await makeCredential(String(input.next));
    db.sessions = db.sessions.filter(x => x.userId !== user.id || x.token === s.token);
    audit(db, 'account.password', {}); writeDb(db);
    return true;
  }

  async function saveCard(input) {
    if (!state.user) throw new Error('Entre na sua conta para salvar o cartão.');
    if (state.mode === 'server') {
      const out = await api('POST', '/api/payment-methods/card', { ...input, expMonth: Number(digits(input.exp).slice(0, 2)), expYear: 2000 + Number(digits(input.exp).slice(2)) });
      if (out.wallet) state.wallet = out.wallet;
      emit();
      return { duplicated: !!out.duplicated };
    }
    const out = await localSaveCard(state.user, input);
    state.wallet = localWallet(state.user);
    emit();
    return out;
  }

  async function removeCard(id) {
    if (!state.user) return;
    if (state.mode === 'server') { const out = await api('DELETE', '/api/payment-methods/' + encodeURIComponent(id)); state.wallet = out.wallet || []; emit(); return; }
    const db = readDb();
    db.cards = db.cards.filter(c => !(c.id === id && c.userId === state.user.id));
    audit(db, 'card.remove', { id }); writeDb(db);
    state.wallet = localWallet(state.user); emit();
  }

  async function setDefaultCard(id) {
    if (!state.user) return;
    if (state.mode === 'server') { const out = await api('POST', `/api/payment-methods/${encodeURIComponent(id)}/default`); state.wallet = out.wallet || []; emit(); return; }
    const db = readDb();
    const card = db.cards.find(c => c.id === id && c.userId === state.user.id);
    if (!card) return;
    db.cards.forEach(c => { if (c.userId === state.user.id && c.kind === card.kind) c.isDefault = (c.id === card.id); });
    audit(db, 'card.default', { id }); writeDb(db);
    state.wallet = localWallet(state.user); emit();
  }

  async function saveAddress(input) {
    if (!state.user) throw new Error('Entre na sua conta para salvar o endereço.');
    if (state.mode === 'server') {
      const out = await api('POST', '/api/addresses', input);
      state.addresses = out.addresses || []; emit(); return state.addresses;
    }
    const db = readDb();
    const list = db.addresses.filter(a => a.userId === state.user.id);
    const addr = {
      id: uid(), userId: state.user.id,
      label: String(input.label || 'Casa').slice(0, 24),
      recipient: String(input.recipient || state.user.name).trim(),
      phone: digits(input.phone) || state.user.phone || '',
      cep: digits(input.cep), street: String(input.street || '').trim(),
      number: String(input.number || '').trim(), complement: String(input.complement || '').trim(),
      district: String(input.district || '').trim(), city: String(input.city || '').trim(),
      state: String(input.state || '').toUpperCase().slice(0, 2), country: 'BR',
      isDefault: list.length === 0, createdAt: nowISO(),
    };
    if (addr.cep.length !== 8) throw new Error('CEP deve ter 8 dígitos.');
    if (!addr.street || !addr.number || !addr.district || !addr.city || addr.state.length !== 2) throw new Error('Preencha o endereço completo.');
    db.addresses.push(addr);
    audit(db, 'address.add', { id: addr.id }); writeDb(db);
    state.addresses = db.addresses.filter(a => a.userId === state.user.id);
    emit();
    return state.addresses;
  }

  async function removeAddress(id) {
    if (!state.user) return;
    if (state.mode === 'server') { const out = await api('DELETE', '/api/addresses/' + encodeURIComponent(id)); state.addresses = out.addresses || []; emit(); return; }
    const db = readDb();
    db.addresses = db.addresses.filter(a => !(a.id === id && a.userId === state.user.id));
    writeDb(db);
    state.addresses = db.addresses.filter(a => a.userId === state.user.id);
    emit();
  }

  async function createOrder(payload) {
    if (state.mode === 'server') {
      const out = await api('POST', '/api/orders', payload);
      await loadOrders().catch(() => {});
      return out.order;
    }
    const db = readDb();
    const year = new Date().getFullYear();
    const order = {
      id: `VL-${year}-${String(1000 + db.orders.length + 1).slice(-4)}`,
      userId: state.user ? state.user.id : null,
      status: 'pending',
      createdAt: nowISO(),
      ...payload,
    };
    db.orders.unshift(order);
    audit(db, 'order.create', { id: order.id, total: order.total }); writeDb(db);
    if (state.user) state.orders = db.orders.filter(o => o.userId === state.user.id);
    emit();
    return order;
  }

  async function loadOrders() {
    if (state.mode === 'server') { const out = await api('GET', '/api/orders'); state.orders = out.orders || []; emit(); return state.orders; }
    const db = readDb();
    state.orders = db.orders.filter(o => o.userId === (state.user && state.user.id));
    emit();
    return state.orders;
  }

  /* Direito de exclusão (LGPD art. 18 VI): apaga perfil, cartões,
     endereços, pedidos e sessões deste usuário. */
  async function deleteAccount() {
    if (!state.user) throw new Error('Sessão expirada.');
    if (state.mode === 'server') {
      await api('DELETE', '/api/auth/me');
    } else {
      const uid = state.user.id;
      const db = readDb();
      db.cards = db.cards.filter(c => c.userId !== uid);
      db.addresses = db.addresses.filter(a => a.userId !== uid);
      db.orders = db.orders.filter(o => o.userId !== uid);
      db.sessions = db.sessions.filter(s => s.userId !== uid);
      db.users = db.users.filter(u => u.id !== uid);
      audit(db, 'account.delete', {});
      writeDb(db);
      clearSessionLocal();
    }
    state.user = null; state.wallet = []; state.addresses = []; state.orders = [];
    emit();
    return true;
  }

  /* ------------------------------------------ redefinição de senha
     Sem servidor de e-mail nesta demonstração, o código de 6 dígitos
     volta na própria resposta e aparece na tela. Em produção ele iria
     por e-mail (ou SMS) e a resposta NUNCA conteria o código.        */
  const RESET_MINUTES = 30;

  async function requestPasswordReset(email) {
    const mail = normEmail(email);
    if (!EMAIL_RE.test(mail)) throw new Error('E-mail inválido.');
    const generic = {
      ok: true, sent: true, expiresInMin: RESET_MINUTES,
      note: 'Se existir uma conta com esse e-mail, o código aparece aqui — nesta demonstração não há envio de e-mail.',
    };

    if (state.mode === 'server') {
      const out = await api('POST', '/api/auth/reset/request', { email: mail });
      return { ...generic, ...out };
    }

    const db = readDb();
    const user = db.users.find(u => u.email === mail);
    if (!user) {
      await pbkdf2('x', randomBytes(16), 1000);          // mesma demora
      audit(db, 'auth.reset_request_unknown', { email: mail });
      writeDb(db);
      return generic;
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    db.resets = db.resets.filter(r => r.userId !== user.id);
    db.resets.push({
      userId: user.id,
      codeHash: await sha256hex(`${code}:${user.id}`),
      expiresAt: new Date(Date.now() + RESET_MINUTES * 60000).toISOString(),
    });
    audit(db, 'auth.reset_request', { email: mail });
    writeDb(db);
    return { ...generic, devCode: code };
  }

  async function confirmPasswordReset({ email, code, next }) {
    const mail = normEmail(email);
    const clean = digits(code);
    const problem = passwordProblem(String(next || ''));
    if (problem) throw new Error(problem);

    if (state.mode === 'server') {
      await api('POST', '/api/auth/reset/confirm', { email: mail, code: clean, next: String(next) });
      state.user = null; state.wallet = []; state.addresses = []; state.orders = [];
      emit();
      return true;
    }

    const db = readDb();
    const user = db.users.find(u => u.email === mail);
    const err = new Error('Código inválido ou expirado.');
    if (!user) throw err;
    const entry = db.resets.find(r => r.userId === user.id);
    if (!entry || new Date(entry.expiresAt) < new Date()) throw err;
    if (!safeEqual(entry.codeHash, await sha256hex(`${clean}:${user.id}`))) throw err;

    const cred = user.cred;
    if (cred) {
      (user.history ||= []).unshift({ algo: cred.algo, hash: cred.hash, salt: cred.salt, params: cred.iterations });
      user.history = user.history.slice(0, 5);
    }
    user.cred = await makeCredential(String(next));
    user.fails = 0;
    user.lockedUntil = null;
    db.resets = db.resets.filter(r => r.userId !== user.id);
    db.sessions = db.sessions.filter(s => s.userId !== user.id);   // derruba todas as sessões
    audit(db, 'auth.reset_confirm', { email: mail });
    writeDb(db);
    clearSessionLocal();
    state.user = null; state.wallet = []; state.addresses = []; state.orders = [];
    emit();
    return true;
  }

  /* ------------------------------------------------------- força da senha */
  function passwordStrength(pw) {
    const v = String(pw || '');
    const hints = [];
    let score = 0;
    if (v.length >= 8) score++; else hints.push('Use ao menos 8 caracteres');
    if (v.length >= 12) score++;
    if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++; else hints.push('Misture maiúsculas e minúsculas');
    if (/\d/.test(v)) score++; else hints.push('Inclua números');
    if (/[^A-Za-z0-9]/.test(v)) score++; else hints.push('Inclua um símbolo');
    if (/(vero|limone|street|basics)/i.test(v)) { score--; hints.unshift('Evite palavras da marca'); }
    if (/^(123|abc|senha|password|qwerty|admin)/i.test(v)) { score = Math.min(score, 1); hints.unshift('Evite palavras óbvias'); }
    score = Math.max(0, Math.min(score, 5));
    const labels = ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte', 'Excelente'];
    return { score, label: labels[score], hints };
  }
  function passwordProblem(pw) {
    const v = String(pw || '');
    if (v.length < 8) return 'Use ao menos 8 caracteres.';
    if (!/[A-Za-zÀ-ú]/.test(v)) return 'Inclua ao menos uma letra.';
    if (!/\d/.test(v)) return 'Inclua ao menos um número.';
    if (/^(123|abc|senha|password|qwerty|admin)/i.test(v)) return 'Essa senha é fácil de adivinhar.';
    return null;
  }

  return {
    /* estado */
    get mode() { return state.mode; },
    get user() { return state.user; },
    get wallet() { return state.wallet.slice(); },
    get addresses() { return state.addresses.slice(); },
    get orders() { return state.orders.slice(); },
    get logged() { return !!state.user; },
    get ready() { return state.ready; },
    onChange, snapshot: publicState,
    /* ciclo de vida */
    init, detectMode,
    /* conta */
    register, login, logout, updateProfile, changePassword,
    requestPasswordReset, confirmPasswordReset,
    /* pagamentos */
    saveCard, removeCard, setDefaultCard, saveAddress, removeAddress,
    createOrder, loadOrders, deleteAccount,
    /* utilidades expostas */
    passwordStrength, passwordProblem, makeCredential, checkCredential, pbkdf2,
    _internals: { sha256JS, hmacJS, pbkdf2JS, pbkdf2, makeCredential, checkCredential, safeEqual, randomHex, bytesToHex, hexToBytes, hasSubtle },
  };
})();

if (typeof window !== 'undefined') window.VLAuth = VLAuth;

/* ------------------------------------------------------------------
   Marcador do ícone "Minha conta": se a página tem o botão, o
   Auth se inicializa sozinho e acende o ponto quando há sessão.
   (Nas páginas de checkout/conta quem chama o init é a própria página.)
   ------------------------------------------------------------------ */
if (typeof document !== 'undefined') {
  (async function accountBadge() {
    const btn = document.getElementById('accountBtn');
    if (!btn) return;
    try { await VLAuth.init(); } catch (e) { console.warn(e); }
    const paint = () => {
      const dot = document.getElementById('accountDot');
      const logged = !!(VLAuth && VLAuth.logged);
      btn.classList.toggle('is-logged', logged);
      if (dot) dot.hidden = !logged;
      const initial = VLAuth && VLAuth.user && VLAuth.user.name ? VLAuth.user.name.trim()[0] : '';
      if (initial) btn.dataset.initial = initial.toUpperCase();
    };
    paint();
    VLAuth.onChange(paint);
  })();
}
