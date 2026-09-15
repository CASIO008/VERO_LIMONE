#!/usr/bin/env node
/* ============================================================================
   DAVVERO LIMONE — API + servidor estático (zero dependências)
   ----------------------------------------------------------------------------
   Sobe tudo com um comando:   node server/server.js
   Depois abra:                http://localhost:4173

   - Banco: SQLite via `node:sqlite` (Node >= 22.5, sem npm install)
   - Esquema: sql/schema.sql, aplicado automaticamente na primeira execução
   - Segredos: senha com scrypt + salt aleatório; sessão com token que só
     existe em claro no cookie (no banco vai sha256); PAN de cartão nunca é
     gravado (só token do cofre, bin6, last4 e fingerprint HMAC).
   - Peppers: gerados em server/data/.pepper na primeira execução
     (ou defina VL_PEPPER no ambiente para usar o seu).

   Rotas
     GET    /api/health
     POST   /api/auth/register            { name, email, password, phone?, cpf?, marketing? }
     POST   /api/auth/login               { email, password }
     POST   /api/auth/logout
     GET    /api/auth/me
     PATCH  /api/auth/me                  { name?, phone?, marketing? }
     POST   /api/auth/password            { current, next }
     GET    /api/bins/:bin                detecção de bandeira/banco pelo BIN
     GET    /api/payment-methods
     POST   /api/vault/tokenize           { number, holder, expMonth, expYear, cvv, kind }
     POST   /api/payment-methods/card     tokeniza e salva
     POST   /api/payment-methods/:id/default
     DELETE /api/payment-methods/:id
     POST   /api/addresses                GET /api/addresses · DELETE /api/addresses/:id
     POST   /api/orders                   { items, shipping, totals, payment, address }
     GET    /api/orders
   ========================================================================== */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

/* ------------------------------------------------------------------ setup */
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'vero.db');
const SCHEMA_FILE = path.join(ROOT, 'sql', 'schema.sql');
const PORT = Number(process.env.PORT || process.argv.find(a => /^\d+$/.test(a)) || 4173);
const IS_PROD = process.env.NODE_ENV === 'production';

fs.mkdirSync(DATA_DIR, { recursive: true });

/* pepper persistente: sem ele os hashes HMAC não são reproduzíveis */
function loadPepper() {
  if (process.env.VL_PEPPER) return Buffer.from(process.env.VL_PEPPER, 'hex');
  const file = path.join(DATA_DIR, '.pepper');
  if (fs.existsSync(file)) return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex');
  const p = crypto.randomBytes(32);
  fs.writeFileSync(file, p.toString('hex'), { mode: 0o600 });
  return p;
}
const PEPPER = loadPepper();

/* ----------------------------------------------------------------- banco */
const db = new DatabaseSync(DB_FILE);
db.exec(fs.readFileSync(SCHEMA_FILE, 'utf8'));
const RESET = process.argv.includes('--reset');
if (RESET) {
  db.exec('DELETE FROM sessions; DELETE FROM cards; DELETE FROM payment_methods; DELETE FROM addresses; DELETE FROM order_items; DELETE FROM order_payments; DELETE FROM order_status_history; DELETE FROM orders; DELETE FROM user_credentials; DELETE FROM password_history; DELETE FROM login_attempts; DELETE FROM audit_log; DELETE FROM users;');
  console.log('- banco limpo (--reset)');
}

/* tabela de BINs em memória (consulta por prefixo mais longo) */
const BINS = (() => {
  const rows = db.prepare('SELECT bin_prefix, brand_id, bank_id, kind, card_length, cvv_length FROM card_bins ORDER BY length(bin_prefix) DESC').all();
  const max = rows.reduce((m, r) => Math.max(m, r.bin_prefix.length), 6);
  return { rows, max: Math.max(max, 8) };
})();

function binLookup(pan) {
  const digits = String(pan || '').replace(/\D/g, '');
  for (let len = BINS.max; len >= 4; len--) {
    if (digits.length < len) continue;
    const hit = BINS.rows.find(r => r.bin_prefix === digits.slice(0, len));
    if (hit) return hit;
  }
  return null;
}

/* ------------------------------------------------------------------ utils */
const nowISO = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const uuid = () => crypto.randomUUID();
const b64 = (buf) => Buffer.from(buf).toString('base64');
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const hmac = (v, key = PEPPER) => crypto.createHmac('sha256', key).update(String(v)).digest('hex');
const digitsOnly = (s) => String(s || '').replace(/\D/g, '');
const normEmail = (s) => String(s || '').trim().toLowerCase();

function json(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(payload);
}
const fail = (res, status, code, message, extra = {}) =>
  json(res, status, { ok: false, error: { code, message, ...extra } });

/* ------------------------------------------------------------ segurança */
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "script-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; '),
};

/* rate limit simples em memória (por IP, janela deslizante) */
const buckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter(t => now - t < windowMs);
  arr.push(now);
  buckets.set(key, arr);
  return arr.length <= max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of buckets) {
    const keep = arr.filter(t => now - t < 15 * 60 * 1000);
    if (keep.length) buckets.set(k, keep); else buckets.delete(k);
  }
}, 60 * 1000).unref?.();

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket.remoteAddress || '0.0.0.0';
}
const ipHash = (req) => hmac(clientIp(req));

/* ------------------------------------------------------------------ senha */
const SCRYPT = { N: 32768, r: 8, p: 1, len: 32 };
function hashPassword(password, salt = crypto.randomBytes(16)) {
  const hash = crypto.scryptSync(password.normalize('NFKC'), salt, SCRYPT.len, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024,
  });
  return { algo: 'scrypt', hash: b64(hash), salt: b64(salt), params: JSON.stringify(SCRYPT) };
}
function verifyPassword(password, row) {
  const params = JSON.parse(row.params || '{}');
  const salt = Buffer.from(row.salt, 'base64');
  const expected = Buffer.from(row.password_hash, 'base64');
  const got = crypto.scryptSync(password.normalize('NFKC'), salt, expected.length, {
    N: params.N || SCRYPT.N, r: params.r || SCRYPT.r, p: params.p || SCRYPT.p,
    maxmem: 64 * 1024 * 1024,
  });
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}
const PASSWORD_RULES = [
  [p => typeof p === 'string' && p.length >= 8, 'Use ao menos 8 caracteres.'],
  [p => /[A-Za-zÀ-ú]/.test(p), 'Inclua ao menos uma letra.'],
  [p => /\d/.test(p), 'Inclua ao menos um número.'],
  [p => !/^(123|abc|senha|password|qwerty|admin)/i.test(p), 'Essa senha é fácil de adivinhar.'],
];
function passwordProblem(p) {
  for (const [test, msg] of PASSWORD_RULES) if (!test(p)) return msg;
  return null;
}

/* --------------------------------------------------------------- sessões */
const SESSION_DAYS = 30;
function createSession(req, res, userId) {
  const token = b64url(crypto.randomBytes(32));
  const csrf = b64url(crypto.randomBytes(24));
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  db.prepare(`INSERT INTO sessions (user_id, token_hash, csrf_hash, user_agent, ip_hash, expires_at)
              VALUES (?,?,?,?,?,?)`)
    .run(userId, sha256(token), sha256(csrf),
      String(req.headers['user-agent'] || '').slice(0, 240), ipHash(req), expires.toISOString().slice(0, 19));
  const secure = (req.socket.encrypted || process.env.VL_SECURE === '1') ? '; Secure' : '';
  res.setHeader('Set-Cookie', [
    `vl_sid=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}${secure}`,
    `vl_csrf=${csrf}; Path=/; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}${secure}`,
  ]);
  return { token, csrf };
}
function clearSession(res) {
  res.setHeader('Set-Cookie', [
    'vl_sid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
    'vl_csrf=; Path=/; SameSite=Strict; Max-Age=0',
  ]);
}
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function currentSession(req) {
  const token = parseCookies(req).vl_sid;
  if (!token) return null;
  const row = db.prepare(`SELECT s.id, s.user_id, s.csrf_hash, s.expires_at,
                                 u.public_id, u.name, u.email, u.phone, u.cpf_last3,
                                 u.marketing_opt_in, u.status
                            FROM sessions s JOIN users u ON u.id = s.user_id
                           WHERE s.token_hash = ? AND s.revoked_at IS NULL`).get(sha256(token));
  if (!row) return null;
  if (row.expires_at < nowISO()) return null;
  if (row.status !== 'active') return null;
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(nowISO(), row.id);
  return row;
}
/* CSRF: cookie legível x header; vale para todo método que muda estado */
function csrfOk(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) return false;
    } catch { return false; }
  }
  const sent = req.headers['x-csrf-token'];
  const cookie = parseCookies(req).vl_csrf;
  if (!sent || !cookie) return false;
  const a = Buffer.from(String(sent));
  const b = Buffer.from(String(cookie));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
/* visitante não tem cookie de sessão/CSRF: para ele basta a mesma origem */
function sameOrigin(req) {
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) return true;                     // sem cabeçalho: assume same-origin
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
/* exige proteção de estado: CSRF quando há sessão, origem quando não há */
function guarded(req) {
  const s = currentSession(req);
  if (!s) return sameOrigin(req);
  return csrfOk(req);
}

function audit(req, action, { actor = 'system', entity = null, entityId = null, meta = null } = {}) {
  db.prepare(`INSERT INTO audit_log (actor, action, entity, entity_id, ip_hash, user_agent, meta)
              VALUES (?,?,?,?,?,?,?)`)
    .run(actor, action, entity, entityId, ipHash(req),
      String(req.headers['user-agent'] || '').slice(0, 200), meta ? JSON.stringify(meta) : null);
}

/* ------------------------------------------------------------------ body */
function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('payload muito grande'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      const raw = Buffer.concat(chunks).toString('utf8');
      const type = String(req.headers['content-type'] || '');
      if (type.includes('application/json')) {
        try { resolve(JSON.parse(raw)); } catch { reject(Object.assign(new Error('JSON inválido'), { status: 400 })); }
      } else {
        resolve(Object.fromEntries(new URLSearchParams(raw)));
      }
    });
    req.on('error', reject);
  });
}

/* --------------------------------------------------- validação / cartões */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function luhn(num) {
  let sum = 0, alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = +num[i];
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d; alt = !alt;
  }
  return num.length > 0 && sum % 10 === 0;
}
/* fallback quando o BIN não está na tabela do banco (mesma ordem do pay-core.js) */
const BRAND_RULES = [
  ['elo', /^(4011|4312|4389|4514|4576|5041|5066|5067|5090|6277|6362|6363|650|651|6550|5067\d)/],
  ['hipercard', /^(606282|3841|60\d{4})/],
  ['amex', /^3[47]/],
  ['diners', /^(30[0-5]|3095|3[68]|39)/],
  ['discover', /^(6011|64[4-9]|65)/],
  ['jcb', /^(35|2131|1800)/],
  ['aura', /^50/],
  ['unionpay', /^(62|81)/],
  ['mastercard', /^(5[1-5]|2[2-7])/],
  ['visa', /^4/],
];
function detectBrand(pan, bin) {
  if (bin && bin.brand_id) return bin.brand_id;
  for (const [id, re] of BRAND_RULES) if (re.test(pan)) return id;
  return 'unknown';
}
const BRAND_NAMES = {
  visa: 'Visa', mastercard: 'Mastercard', elo: 'Elo', amex: 'Amex',
  hipercard: 'Hipercard', diners: 'Diners Club', discover: 'Discover',
  jcb: 'JCB', aura: 'Aura', unionpay: 'UnionPay', unknown: 'Cartão',
};
const BANK_NAMES = {
  nubank: 'Nubank', itau: 'Itaú', bradesco: 'Bradesco', bb: 'Banco do Brasil',
  caixa: 'Caixa', santander: 'Santander', inter: 'Inter', c6: 'C6 Bank',
  btg: 'BTG Pactual', safra: 'Safra', pagbank: 'PagBank', mercadopago: 'Mercado Pago',
  picpay: 'PicPay', neon: 'Neon', sicredi: 'Sicredi', sicoob: 'Sicoob',
  banrisul: 'Banrisul', original: 'Original', will: 'Will Bank', digio: 'Digio',
  amex: 'Amex',
  next: 'Next', iti: 'Iti', stone: 'Stone', nomad: 'Nomad', efi: 'Efí',
  bndes: 'BNDES', unicred: 'Unicred', cresol: 'Cresol', credisis: 'CrediSIS',
  banese: 'Banese', banestes: 'Banestes', banpara: 'Banpará', bmg: 'Banco BMG',
  bnb: 'Banco do Nordeste', brb: 'BRB', bv: 'Banco BV', daycoval: 'Daycoval',
  pan: 'Banco Pan', pine: 'Banco Pine', sofisa: 'Sofisa Direto', xp: 'XP',
};

/* tokeniza SEM guardar nada: é o que um PSP faria (Stripe/Pagar.me…) */
function tokenizeCard({ number, holder, expMonth, expYear, cvv, kind = 'credit_card' }) {
  const pan = digitsOnly(number);
  const bin = binLookup(pan);
  const brandId = detectBrand(pan, bin);
  const isDebit = kind === 'debit_card' || bin?.kind === 'debit';
  const problems = [];
  if (pan.length < 13 || pan.length > 19) problems.push('Número do cartão incompleto.');
  else if (!luhn(pan)) problems.push('Número do cartão inválido.');
  if (!holder || holder.trim().length < 3) problems.push('Informe o nome impresso no cartão.');
  const m = Number(expMonth), y = Number(expYear);
  if (!(m >= 1 && m <= 12)) problems.push('Mês de validade inválido.');
  const now = new Date();
  if (!(y >= now.getFullYear() && y <= now.getFullYear() + 30)) problems.push('Ano de validade inválido.');
  else if (y === now.getFullYear() && m < now.getMonth() + 1) problems.push('Cartão vencido.');
  const needCvv = bin?.cvv_length || (brandId === 'amex' ? 4 : 3);
  if (!new RegExp(`^\\d{${needCvv}}$`).test(String(cvv || ''))) problems.push(`CVV deve ter ${needCvv} dígitos.`);
  if (problems.length) return { ok: false, problems };

  return {
    ok: true,
    card: {
      token: 'tok_' + b64url(crypto.randomBytes(18)),
      tokenProvider: 'demo-vault',
      fingerprint: hmac(pan),                    // dedupe sem guardar o PAN
      bin6: pan.slice(0, 6),
      last4: pan.slice(-4),
      brandId,
      brandName: BRAND_NAMES[brandId] || 'Cartão',
      bankId: bin?.bank_id || null,
      bankName: BANK_NAMES[bin?.bank_id] || null,
      expMonth: m, expYear: y,
      holder: holder.trim().slice(0, 60),
      isDebit,
      cardLength: bin?.card_length || (brandId === 'amex' ? 15 : 16),
      cvvLength: needCvv,
    },
  };
}

/* --------------------------------------------------- serialização de saída */
function publicUser(row) {
  return {
    id: row.public_id,
    name: row.name,
    email: row.email,
    phone: row.phone || '',
    cpfLast3: row.cpf_last3 || null,
    marketing: !!row.marketing_opt_in,
    since: row.created_at || null,
  };
}
function walletFor(userId) {
  return db.prepare(`SELECT pm.public_id, pm.kind, pm.label, pm.is_default, pm.status,
                            c.brand_id, c.brand_name, c.bank_id, c.bank_name,
                            c.bin6, c.last4, c.exp_month, c.exp_year, c.holder_name, c.token
                       FROM payment_methods pm
                       LEFT JOIN cards c ON c.payment_method_id = pm.id
                      WHERE pm.user_id = ? AND pm.status <> 'revoked'
                      ORDER BY pm.is_default DESC, pm.id DESC`).all(userId).map(r => ({
    id: r.public_id,
    kind: r.kind,
    label: r.label,
    isDefault: !!r.is_default,
    status: r.status,
    brand: r.brand_id ? { id: r.brand_id, name: r.brand_name } : null,
    bank: r.bank_id ? { id: r.bank_id, name: r.bank_name } : null,
    last4: r.last4 || null,
    bin6: r.bin6 || null,
    holder: r.holder_name || null,
    expMonth: r.exp_month || null,
    expYear: r.exp_year || null,
    token: r.token || null,
  }));
}
function addressesFor(userId) {
  return db.prepare(`SELECT id, label, recipient, phone, cep, street, number, complement,
                            district, city, state, is_default
                       FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC`).all(userId)
    .map(r => ({
      id: r.id, label: r.label, recipient: r.recipient, phone: r.phone || '',
      cep: r.cep, street: r.street, number: r.number, complement: r.complement || '',
      district: r.district, city: r.city, state: r.state, isDefault: !!r.is_default,
    }));
}

/* ------------------------------------------------------------------ rotas */
async function api(req, res, url) {
  const route = `${req.method} ${url.pathname.replace(/\/+$/, '')}`;
  const q = url.searchParams;

  /* -------- health -------- */
  if (route === 'GET /api/health') {
    const s = currentSession(req);
    return json(res, 200, { ok: true, service: 'vero-limone', version: 1, auth: true, user: s ? publicUser(s) : null });
  }

  /* -------- BIN -------- */
  if (req.method === 'GET' && url.pathname.startsWith('/api/bins/')) {
    const pan = digitsOnly(url.pathname.split('/').pop() + '0000');
    const bin = binLookup(pan);
    const brandId = detectBrand(pan, bin);
    return json(res, 200, {
      ok: true,
      bin: { prefix: pan.slice(0, 6), brand: { id: brandId, name: BRAND_NAMES[brandId] }, bank: bin?.bank_id ? { id: bin.bank_id, name: BANK_NAMES[bin.bank_id] } : null, length: bin?.card_length || 16, cvv: bin?.cvv_length || (brandId === 'amex' ? 4 : 3) },
    });
  }

  /* -------- cadastro -------- */
  if (route === 'POST /api/auth/register') {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    const email = normEmail(body.email);
    const password = String(body.password || '');
    const phone = digitsOnly(body.phone).slice(0, 13);
    const cpf = digitsOnly(body.cpf);

    if (name.split(/\s+/).length < 2 || name.length < 3) return fail(res, 400, 'name', 'Informe nome e sobrenome.');
    if (!EMAIL_RE.test(email)) return fail(res, 400, 'email', 'E-mail inválido.');
    const pwProblem = passwordProblem(password);
    if (pwProblem) return fail(res, 400, 'password', pwProblem);
    if (cpf && cpf.length !== 11) return fail(res, 400, 'cpf', 'CPF deve ter 11 dígitos.');
    if (!rateLimit('reg:' + ipHash(req), 8, 60 * 60 * 1000)) return fail(res, 429, 'rate', 'Muitas contas criadas deste IP. Tente mais tarde.');

    const exists = db.prepare("SELECT id FROM users WHERE email = ? AND status <> 'deleted'").get(email);
    if (exists) return fail(res, 409, 'email_taken', 'Já existe uma conta com esse e-mail. Faça login.');

    const pid = uuid();
    const { algo, hash, salt, params } = hashPassword(password);
    const info = db.prepare(`INSERT INTO users (public_id, name, email, phone, cpf_hash, cpf_last3, marketing_opt_in)
                             VALUES (?,?,?,?,?,?,?)`)
      .run(pid, name, email, phone || null, cpf ? hmac(cpf) : null, cpf ? cpf.slice(-3) : null, body.marketing ? 1 : 0);
    const userId = info.lastInsertRowid;
    db.prepare(`INSERT INTO user_credentials (user_id, algo, password_hash, salt, params) VALUES (?,?,?,?,?)`)
      .run(userId, algo, hash, salt, params);
    db.prepare(`INSERT INTO consents (user_id, purpose, granted, policy_version, legal_basis, ip_hash, user_agent)
                VALUES (?,?,?,?,?,?,?)`)
      .run(userId, 'marketing', body.marketing ? 1 : 0, '2026-01', 'consent', ipHash(req), String(req.headers['user-agent'] || '').slice(0, 200));

    createSession(req, res, userId);
    audit(req, 'auth.register', { actor: 'user:' + pid, entity: 'users', entityId: pid });
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    return json(res, 201, { ok: true, user: publicUser(row), wallet: [], addresses: [] });
  }

  /* -------- login -------- */
  if (route === 'POST /api/auth/login') {
    const body = await readBody(req);
    const email = normEmail(body.email);
    const password = String(body.password || '');
    if (!rateLimit('login:' + ipHash(req), 20, 15 * 60 * 1000)) return fail(res, 429, 'rate', 'Muitas tentativas. Aguarde 15 minutos.');

    const row = db.prepare(`SELECT u.*, c.algo, c.password_hash, c.salt, c.params
                              FROM users u JOIN user_credentials c ON c.user_id = u.id
                             WHERE u.email = ? AND u.status <> 'deleted'`).get(email);
    const generic = fail(res, 401, 'credentials', 'E-mail ou senha incorretos.');
    if (!row) {
      hashPassword(password);                      // mesma latência (evita user enumeration)
      db.prepare('INSERT INTO login_attempts (email, ip_hash, ok, reason) VALUES (?,?,?,?)').run(email, ipHash(req), 0, 'unknown_user');
      return generic;
    }
    if (row.locked_until && row.locked_until > nowISO()) {
      return fail(res, 423, 'locked', 'Conta temporariamente bloqueada por tentativas erradas. Tente em alguns minutos.');
    }
    if (!verifyPassword(password, row)) {
      const fails = row.failed_logins + 1;
      db.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?')
        .run(fails, fails >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString().slice(0, 19) : row.locked_until, row.id);
      db.prepare('INSERT INTO login_attempts (email, ip_hash, ok, reason) VALUES (?,?,?,?)').run(email, ipHash(req), 0, 'bad_password');
      audit(req, 'auth.login_failed', { actor: 'user:' + row.public_id });
      if (fails >= 5) return fail(res, 423, 'locked', 'Muitas tentativas erradas. Conta bloqueada por 15 minutos.');
      return generic;
    }
    db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE id = ?').run(nowISO(), row.id);
    db.prepare('INSERT INTO login_attempts (email, ip_hash, ok, reason) VALUES (?,?,?,?)').run(email, ipHash(req), 1, 'ok');
    createSession(req, res, row.id);
    audit(req, 'auth.login', { actor: 'user:' + row.public_id });
    return json(res, 200, { ok: true, user: publicUser(row), wallet: walletFor(row.id), addresses: addressesFor(row.id) });
  }

  /* -------- logout -------- */
  if (route === 'POST /api/auth/logout') {
    const s = currentSession(req);
    if (s) {
      db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').run(nowISO(), s.id);
      audit(req, 'auth.logout', { actor: 'user:' + s.public_id });
    }
    clearSession(res);
    return json(res, 200, { ok: true });
  }

  /* -------- eu -------- */
  if (route === 'GET /api/auth/me') {
    const s = currentSession(req);
    if (!s) return fail(res, 401, 'no_session', 'Sessão expirada.');
    return json(res, 200, { ok: true, user: publicUser(s), wallet: walletFor(s.user_id), addresses: addressesFor(s.user_id) });
  }

  /* exclusão de conta (LGPD art. 18 VI): anonimiza o pedido e apaga o resto */
  if (route === 'DELETE /api/auth/me') {
    const s = currentSession(req);
    if (!s) return fail(res, 401, 'no_session', 'Sessão expirada.');
    if (!csrfOk(req)) return fail(res, 403, 'csrf', 'Requisição bloqueada por segurança.');
    db.prepare('UPDATE orders SET user_id = NULL, guest_email = NULL WHERE user_id = ?').run(s.user_id);
    db.prepare('DELETE FROM payment_methods WHERE user_id = ?').run(s.user_id);
    db.prepare('DELETE FROM addresses WHERE user_id = ?').run(s.user_id);
    db.prepare('DELETE FROM consents WHERE user_id = ?').run(s.user_id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(s.user_id);
    db.prepare('DELETE FROM user_credentials WHERE user_id = ?').run(s.user_id);
    db.prepare('DELETE FROM password_history WHERE user_id = ?').run(s.user_id);
    db.prepare(`UPDATE users SET status = 'deleted', deleted_at = datetime('now'),
                  name = 'Conta removida', email = 'removida+' || public_id || '@verolimone.invalid',
                  phone = NULL, cpf_hash = NULL, cpf_last3 = NULL, marketing_opt_in = 0
                WHERE id = ?`).run(s.user_id);
    audit(req, 'account.delete', { actor: 'user:' + s.public_id });
    clearSession(res);
    return json(res, 200, { ok: true });
  }

  if (route === 'PATCH /api/auth/me') {    const s = currentSession(req);
    if (!s) return fail(res, 401, 'no_session', 'Sessão expirada.');
    if (!csrfOk(req)) return fail(res, 403, 'csrf', 'Requisição bloqueada por segurança.');
    const body = await readBody(req);
    const name = body.name != null ? String(body.name).trim() : s.name;
    const phone = body.phone != null ? digitsOnly(body.phone).slice(0, 13) : s.phone;
    if (name.split(/\s+/).length < 2) return fail(res, 400, 'name', 'Informe nome e sobrenome.');
    db.prepare('UPDATE users SET name = ?, phone = ?, marketing_opt_in = ? WHERE id = ?')
      .run(name, phone || null, body.marketing != null ? (body.marketing ? 1 : 0) : s.marketing_opt_in, s.user_id);
    audit(req, 'account.update', { actor: 'user:' + s.public_id });
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(s.user_id);
    return json(res, 200, { ok: true, user: publicUser(row) });
  }

  /* -------- troca de senha -------- */
  if (route === 'POST /api/auth/password') {
    const s = currentSession(req);
    if (!s) return fail(res, 401, 'no_session', 'Sessão expirada.');
    if (!csrfOk(req)) return fail(res, 403, 'csrf', 'Requisição bloqueada por segurança.');
    const body = await readBody(req);
    const cur = db.prepare('SELECT * FROM user_credentials WHERE user_id = ?').get(s.user_id);
    if (!verifyPassword(String(body.current || ''), cur)) return fail(res, 400, 'current', 'Senha atual incorreta.');
    const problem = passwordProblem(String(body.next || ''));
    if (problem) return fail(res, 400, 'password', problem);
    const recent = db.prepare('SELECT algo, hash, salt, params FROM password_history WHERE user_id = ? ORDER BY id DESC LIMIT 5').all(s.user_id);
    for (const r of recent) if (verifyPassword(String(body.next), r)) return fail(res, 400, 'reuse', 'Você já usou essa senha recentemente.');
    db.prepare('INSERT INTO password_history (user_id, algo, hash, salt, params) VALUES (?,?,?,?,?)').run(s.user_id, cur.algo, cur.password_hash, cur.salt, cur.params);
    const next = hashPassword(String(body.next));
    db.prepare('UPDATE user_credentials SET algo = ?, password_hash = ?, salt = ?, params = ?, password_changed_at = ? WHERE user_id = ?')
      .run(next.algo, next.hash, next.salt, next.params, nowISO(), s.user_id);
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id <> ?').run(nowISO(), s.user_id, s.id);
    audit(req, 'account.password', { actor: 'user:' + s.public_id });
    return json(res, 200, { ok: true });
  }

  /* -------- redefinição de senha (demonstração: código na tela) -------- */
  if (route === 'POST /api/auth/reset/request') {
    const body = await readBody(req);
    const email = normEmail(body.email);
    if (!rateLimit('reset:' + ipHash(req), 10, 60 * 60 * 1000)) return fail(res, 429, 'rate', 'Muitos pedidos seguidos. Tente mais tarde.');
    const generic = {
      ok: true, sent: true,
      note: 'Se existir uma conta com esse e-mail, o código aparece aqui — nesta demonstração não há envio de e-mail.',
    };
    const user = db.prepare("SELECT id, public_id FROM users WHERE email = ? AND status = 'active'").get(email);
    if (!user) {
      await new Promise(r => setTimeout(r, 120));      // mesma demora: não revela se existe
      audit(req, 'auth.reset_request_unknown', { meta: { email } });
      return json(res, 200, generic);
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    db.prepare("UPDATE one_time_tokens SET used_at = ? WHERE user_id = ? AND purpose = 'password_reset' AND used_at IS NULL")
      .run(nowISO(), user.id);
    db.prepare('INSERT INTO one_time_tokens (user_id, purpose, token_hash, expires_at) VALUES (?,?,?,?)')
      .run(user.id, 'password_reset', sha256(code + ':' + user.public_id),
        new Date(Date.now() + 30 * 60000).toISOString().slice(0, 19));
    audit(req, 'auth.reset_request', { actor: 'user:' + user.public_id });
    console.log(`  [senha] código de redefinição para ${email}: ${code} (vale 30 min)`);
    return json(res, 200, { ...generic, devCode: code, expiresInMin: 30 });
  }

  if (route === 'POST /api/auth/reset/confirm') {
    const body = await readBody(req);
    const email = normEmail(body.email);
    const code = digitsOnly(body.code);
    const next = String(body.next || '');
    if (!rateLimit('resetc:' + ipHash(req), 15, 30 * 60 * 1000)) return fail(res, 429, 'rate', 'Muitas tentativas. Aguarde um pouco.');
    const user = db.prepare("SELECT id, public_id FROM users WHERE email = ? AND status = 'active'").get(email);
    if (!user) return fail(res, 400, 'code', 'Código inválido ou expirado.');
    const row = db.prepare(`SELECT id, expires_at FROM one_time_tokens
                             WHERE user_id = ? AND purpose = 'password_reset'
                               AND token_hash = ? AND used_at IS NULL`)
      .get(user.id, sha256(code + ':' + user.public_id));
    if (!row || row.expires_at < nowISO()) return fail(res, 400, 'code', 'Código inválido ou expirado.');
    const problem = passwordProblem(next);
    if (problem) return fail(res, 400, 'password', problem);

    db.prepare('UPDATE one_time_tokens SET used_at = ? WHERE id = ?').run(nowISO(), row.id);
    const cred = db.prepare('SELECT * FROM user_credentials WHERE user_id = ?').get(user.id);
    if (cred) {
      db.prepare('INSERT INTO password_history (user_id, algo, hash, salt, params) VALUES (?,?,?,?,?)')
        .run(user.id, cred.algo, cred.password_hash, cred.salt, cred.params);
    }
    const fresh = hashPassword(next);
    db.prepare(`UPDATE user_credentials SET algo = ?, password_hash = ?, salt = ?, params = ?, password_changed_at = ?
                 WHERE user_id = ?`).run(fresh.algo, fresh.hash, fresh.salt, fresh.params, nowISO(), user.id);
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(nowISO(), user.id);
    db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?').run(user.id);
    audit(req, 'auth.reset_confirm', { actor: 'user:' + user.public_id });
    clearSession(res);
    return json(res, 200, { ok: true });
  }

  /* -------- cofre: tokenizar sem salvar -------- */
  if (route === 'POST /api/vault/tokenize') {
    if (!rateLimit('tok:' + ipHash(req), 40, 10 * 60 * 1000)) return fail(res, 429, 'rate', 'Muitas tentativas. Aguarde um pouco.');
    const body = await readBody(req);
    const out = tokenizeCard(body);
    if (!out.ok) return fail(res, 400, 'card', 'Confira os dados do cartão.', { problems: out.problems });
    const { token, fingerprint, tokenProvider, ...safe } = out.card;
    audit(req, 'vault.tokenize', { actor: 'guest', meta: { brand: safe.brandId, bank: safe.bankId, last4: safe.last4 } });
    return json(res, 200, { ok: true, card: { ...safe, token, tokenProvider } });
  }

  /* -------- carteira: salvar cartão -------- */
  if (route === 'POST /api/payment-methods/card') {
    const s = currentSession(req);
    if (!s) return fail(res, 401, 'no_session', 'Entre na sua conta para salvar o cartão.');
    if (!csrfOk(req)) return fail(res, 403, 'csrf', 'Requisição bloqueada por segurança.');
    const body = await readBody(req);
    const kind = body.kind === 'debit_card' ? 'debit_card' : 'credit_card';
    const out = tokenizeCard({ ...body, kind });
    if (!out.ok) return fail(res, 400, 'card', 'Confira os dados do cartão.', { problems: out.problems });
    const c = out.card;

    const dup = db.prepare('SELECT pm.public_id FROM cards c JOIN payment_methods pm ON pm.id = c.payment_method_id WHERE c.fingerprint = ? AND pm.user_id = ?').get(c.fingerprint, s.user_id);
    if (dup) return json(res, 200, { ok: true, duplicated: true, wallet: walletFor(s.user_id) });

    const count = db.prepare('SELECT COUNT(*) n FROM payment_methods WHERE user_id = ? AND kind = ?').get(s.user_id, kind).n;
    const pid = uuid();
    const label = `${c.brandName}${c.bankName ? ' ' + c.bankName : ''} •••• ${c.last4}`;
    const info = db.prepare(`INSERT INTO payment_methods (public_id, user_id, kind, label, is_default)
                             VALUES (?,?,?,?,?)`).run(pid, s.user_id, kind, label, count === 0 ? 1 : 0);
    db.prepare(`INSERT INTO cards (payment_method_id, brand_id, brand_name, bank_id, bank_name, bin6, last4,
                                   exp_month, exp_year, holder_name, token, token_provider, fingerprint, is_debit)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(info.lastInsertRowid, c.brandId, c.brandName, c.bankId, c.bankName, c.bin6, c.last4,
        c.expMonth, c.expYear, c.holder, c.token, c.tokenProvider, c.fingerprint, c.isDebit ? 1 : 0);
    if (body.cpf) {
      const cpf = digitsOnly(body.cpf);
      if (cpf.length === 11) {
        db.prepare('INSERT INTO payment_holders (payment_method_id, doc_type, doc_hash, doc_last3) VALUES (?,?,?,?)')
          .run(info.lastInsertRowid, 'cpf', hmac(cpf), cpf.slice(-3));
      }
    }
    audit(req, 'card.add', { actor: 'user:' + s.public_id, entity: 'cards', entityId: pid, meta: { brand: c.brandId, bank: c.bankId, last4: c.last4 } });
    return json(res, 201, { ok: true, wallet: walletFor(s.user_id) });
  }

  /* -------- carteira: padrão / remover -------- */
  if (req.method === 'POST' && /^\/api\/payment-methods\/[^/]+\/default$/.test(url.pathname)) {
    const s = currentSession(req);
    if (!s) return fail(res, 401, 'no_session', 'Sessão expirada.');
    if (!csrfOk(req)) return fail(res, 403, 'csrf', 'Requisição bloqueada por segurança.');
    const pid = url.pathname.split('/')[3];
    const pm = db.prepare('SELECT id, kind FROM payment_methods WHERE public_id = ? AND user_id = ?').get(pid, s.user_id);
    if (!pm) return fail(res, 404, 'not_found', 'Cartão não encontrado.');
    db.prepare('UPDATE payment_methods SET is_default = 0 WHERE user_id = ? AND kind = ?').run(s.user_id, pm.kind);
    db.prepare('UPDATE payment_methods SET is_default = 1 WHERE id = ?').run(pm.id);
    audit(req, 'card.default', { actor: 'user:' + s.public_id, entityId: pid });
    return json(res, 200, { ok: true, wallet: walletFor(s.user_id) });
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/payment-methods/')) {
    const s = currentSession(req);
    if (!s) return fail(res, 401, 'no_session', 'Sessão expirada.');
    if (!csrfOk(req)) return fail(res, 403, 'csrf', 'Requisição bloqueada por segurança.');
    const pid = url.pathname.split('/').pop();
    const pm = db.prepare('SELECT id FROM payment_methods WHERE public_id = ? AND user_id = ?').get(pid, s.user_id);
    if (!pm) return fail(res, 404, 'not_found', 'Forma de pagamento não encontrada.');
    db.prepare("UPDATE payment_methods SET status = 'revoked' WHERE id = ?").run(pm.id);
    db.prepare('DELETE FROM cards WHERE payment_method_id = ?').run(pm.id);   // token deixa de existir
    audit(req, 'card.remove', { actor: 'user:' + s.public_id, entityId: pid });
    return json(res, 200, { ok: true, wallet: walletFor(s.user_id) });
  }

  /* -------- endereços -------- */
  if (route === 'GET /api/addresses') {
    const s = currentSession(req);
    if (!s) return fail(res, 401, 'no_session', 'Sessão expirada.');
    return json(res, 200, { ok: true, addresses: addressesFor(s.user_id) });
  }
  if (route === 'POST /api/addresses') {
    const s = currentSession(req);
    if (!s) return fail(res, 401, 'no_session', 'Entre na sua conta para salvar o endereço.');
    if (!csrfOk(req)) return fail(res, 403, 'csrf', 'Requisição bloqueada por segurança.');
    const b = await readBody(req);
    const need = ['recipient', 'cep', 'street', 'number', 'district', 'city', 'state'];
    for (const k of need) if (!String(b[k] || '').trim()) return fail(res, 400, k, 'Campo obrigatório.');
    if (digitsOnly(b.cep).length !== 8) return fail(res, 400, 'cep', 'CEP deve ter 8 dígitos.');
    const count = db.prepare('SELECT COUNT(*) n FROM addresses WHERE user_id = ?').get(s.user_id).n;
    const info = db.prepare(`INSERT INTO addresses (user_id, label, recipient, phone, cep, street, number, complement, district, city, state, is_default)
                             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(s.user_id, String(b.label || 'Casa').slice(0, 24), String(b.recipient).slice(0, 80), digitsOnly(b.phone).slice(0, 13) || null,
        digitsOnly(b.cep), String(b.street).slice(0, 120), String(b.number).slice(0, 12), String(b.complement || '').slice(0, 60) || null,
        String(b.district).slice(0, 60), String(b.city).slice(0, 60), String(b.state).toUpperCase().slice(0, 2), count === 0 ? 1 : 0);
    audit(req, 'address.add', { actor: 'user:' + s.public_id, entityId: String(info.lastInsertRowid) });
    return json(res, 201, { ok: true, addresses: addressesFor(s.user_id) });
  }
  if (req.method === 'DELETE' && url.pathname.startsWith('/api/addresses/')) {
    const s = currentSession(req);
    if (!s) return fail(res, 401, 'no_session', 'Sessão expirada.');
    if (!csrfOk(req)) return fail(res, 403, 'csrf', 'Requisição bloqueada por segurança.');
    const id = Number(url.pathname.split('/').pop());
    db.prepare('DELETE FROM addresses WHERE id = ? AND user_id = ?').run(id, s.user_id);
    return json(res, 200, { ok: true, addresses: addressesFor(s.user_id) });
  }

  /* -------- pedidos -------- */
  if (route === 'GET /api/orders') {
    const s = currentSession(req);
    if (!s) return fail(res, 401, 'no_session', 'Sessão expirada.');
    const orders = db.prepare(`SELECT public_id, status, subtotal, discount, shipping, total, created_at, paid_at, customer
                                 FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 50`).all(s.user_id);
    const items = db.prepare('SELECT order_id, name, color, size, qty, unit_price FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = ?)').all(s.user_id);
    return json(res, 200, { ok: true, orders: orders.map(o => ({ ...o, customer: o.customer ? JSON.parse(o.customer) : null, items: items.filter(i => i.order_id === o.order_id) })) });
  }

  if (route === 'POST /api/orders') {
    const b = await readBody(req);
    const s = currentSession(req);
    /* visitante não tem cookie de CSRF: valida pela origem; logado valida o token */
    if (!guarded(req)) return fail(res, 403, 'csrf', 'Requisição bloqueada por segurança.');
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) return fail(res, 400, 'items', 'Sacola vazia.');
    if (items.length > 40) return fail(res, 400, 'items', 'Itens demais no pedido.');

    const subtotal = items.reduce((sum, i) => sum + Number(i.price || 0) * Number(i.qty || 0), 0);
    const couponCode = b.coupon ? String(b.coupon).toUpperCase().slice(0, 24) : null;
    let discount = 0;
    if (couponCode) {
      const cp = db.prepare("SELECT code, percent_off, min_subtotal, active FROM coupons WHERE code = ?").get(couponCode);
      if (cp && cp.active && subtotal >= cp.min_subtotal) discount = +(subtotal * cp.percent_off).toFixed(2);
    }
    const ship = Number(b.shipping || 0);
    let pixOff = 0;
    const kind = String(b.payment?.kind || 'pix');
    if (kind === 'pix') pixOff = +(((subtotal - discount)) * 0.05).toFixed(2);
    const total = Math.max(0, +(subtotal - discount + ship - pixOff).toFixed(2));

    const year = new Date().getFullYear();
    const seq = (db.prepare('SELECT COUNT(*) n FROM orders').get().n + 1);
    const publicId = `VL-${year}-${String(1000 + seq).slice(-4)}`;
    const customer = {
      name: String(b.customer?.name || '').slice(0, 80),
      email: normEmail(b.customer?.email || (s ? s.email : '')),
      phone: digitsOnly(b.customer?.phone).slice(0, 13),
    };
    const info = db.prepare(`INSERT INTO orders (public_id, user_id, guest_email, status, subtotal, discount, shipping, total,
                                                    coupon_code, ship_service, ship_eta_from, ship_eta_to, ship_address, customer)
                             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(publicId, s ? s.user_id : null, customer.email || null, kind === 'pix' ? 'pending' : 'pending',
        +subtotal.toFixed(2), discount, ship, total, couponCode,
        String(b.shipService || 'standard'), b.shipEtaFrom || null, b.shipEtaTo || null,
        b.address ? JSON.stringify(b.address) : null, JSON.stringify(customer));
    const orderId = info.lastInsertRowid;
    const insItem = db.prepare('INSERT INTO order_items (order_id, product_id, name, color, size, qty, unit_price, line_total) VALUES (?,?,?,?,?,?,?,?)');
    for (const i of items) {
      insItem.run(orderId, String(i.id || '').slice(0, 60), String(i.name || 'Item').slice(0, 120),
        String(i.color || '').slice(0, 40), String(i.size || '').slice(0, 8),
        Math.max(1, Math.min(99, Number(i.qty) || 1)), +Number(i.price || 0).toFixed(2),
        +(Number(i.price || 0) * Number(i.qty || 1)).toFixed(2));
    }
    db.prepare(`INSERT INTO order_payments (order_id, payment_method_id, kind, provider, method_snapshot, installments, installment_value, amount, status)
                VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(orderId, null, kind, 'demo', JSON.stringify(b.payment?.snapshot || {}),
        Math.max(1, Math.min(24, Number(b.payment?.installments) || 1)),
        b.payment?.installments > 1 ? +(total / b.payment.installments).toFixed(2) : total,
        total, kind === 'pix' ? 'pending' : 'authorized');
    db.prepare('INSERT INTO order_status_history (order_id, status, note) VALUES (?,?,?)').run(orderId, 'pending', 'Pedido criado (demonstrativo)');
    if (couponCode) db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE code = ?').run(couponCode);
    if (s) db.prepare('UPDATE payment_methods SET last_used_at = ? WHERE public_id = ? AND user_id = ?').run(nowISO(), String(b.payment?.methodId || ''), s.user_id);
    audit(req, 'order.create', { actor: s ? 'user:' + s.public_id : 'guest', entity: 'orders', entityId: publicId, meta: { total, kind } });

    return json(res, 201, {
      ok: true,
      order: { id: publicId, status: 'pending', subtotal: +subtotal.toFixed(2), discount, shipping: ship, pixOff, total, customer, items },
    });
  }

  return fail(res, 404, 'no_route', 'Rota não encontrada.');
}

/* --------------------------------------------------------- arquivos estáticos */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
};
const BLOCKED = ['/server/', '/sql/', '/data/', '/vendor/.git'];

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  if (BLOCKED.some(b => pathname.startsWith(b)) || pathname.includes('..') || path.basename(pathname).startsWith('.')) {
    return fail(res, 403, 'forbidden', 'Acesso negado.');
  }
  const file = path.join(ROOT, pathname);
  if (!file.startsWith(ROOT)) return fail(res, 403, 'forbidden', 'Acesso negado.');
  try {
    const stat = await fsp.stat(file);
    if (!stat.isFile()) throw new Error('not file');
    const ext = path.extname(file).toLowerCase();
    const etag = `W/"${stat.size}-${stat.mtimeMs}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, SECURITY_HEADERS); return res.end(); }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      ETag: etag,
      ...SECURITY_HEADERS,
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS });
    res.end('<h1 style="font-family:sans-serif">404 — página não encontrada</h1><p><a href="/">Voltar para a loja</a></p>');
  }
}

/* -------------------------------------------------------------- servidor */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { Allow: 'GET,POST,PATCH,DELETE,OPTIONS', ...SECURITY_HEADERS });
      return res.end();
    }
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return await serveStatic(req, res, url);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[erro]', err.message);
    return fail(res, status, status === 500 ? 'internal' : 'bad_request',
      status === 500 ? 'Algo deu errado por aqui.' : err.message);
  }
});

server.listen(PORT, () => {
  const users = db.prepare('SELECT COUNT(*) n FROM users').get().n;
  const cards = db.prepare('SELECT COUNT(*) n FROM cards').get().n;
  console.log('');
  console.log('  DAVVERO LIMONE - servidor no ar');
  console.log('  ---------------------------------------------');
  console.log(`  loja   ->  http://localhost:${PORT}`);
  console.log(`  api    ->  http://localhost:${PORT}/api/health`);
  console.log(`  banco  ->  ${path.relative(process.cwd(), DB_FILE)} (${users} usuarios, ${cards} cartoes)`);
  console.log(`  modo   ->  ${IS_PROD ? 'producao' : 'desenvolvimento'} | Ctrl+C para parar`);
  console.log('');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    try { db.close(); } catch {}
    console.log('\n· servidor encerrado');
    process.exit(0);
  });
}
