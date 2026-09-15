-- ============================================================================
--  DAVVERO LIMONE — esquema do banco (SQLite 3.35+)
--  Convive com o servidor em `server/server.js` (node:sqlite, zero deps).
--
--  Como aplicar:
--     sqlite3 data/vero.db < sql/schema.sql          (CLI)
--     node server/server.js                          (cria/migra sozinho)
--
--  ---------------------------------------------------------------------------
--  MODELO DE SEGURANÇA (leia antes de mexer)
--  ---------------------------------------------------------------------------
--  1. SENHA .......... nunca em claro. Guardamos só `password_hash` derivado
--                      com scrypt (N=2^15, r=8, p=1, 32 bytes) + `salt`
--                      aleatório de 16 bytes. Parâmetros ficam na coluna
--                      `params` para permitir rotação futura (argon2id etc.).
--  2. SESSÃO ......... o cliente recebe um token aleatório (32 bytes) em
--                      cookie HttpOnly + SameSite=Strict. No banco guardamos
--                      apenas sha256(token). Vazamento do banco não permite
--                      sequestrar sessão.
--  3. CARTÃO ......... PROIBIDO armazenar PAN completo, CVV, PIN ou trilha
--                      (PCI DSS v4.0 req. 3.2). Guardamos somente:
--                        - `token`     → referência opaca do PSP/cofre
--                        - `bin6`      → 6 primeiros dígitos (emissor)
--                        - `last4`     → 4 últimos dígitos (exibição)
--                        - `fingerprint` → HMAC-SHA256(PAN) com pepper do
--                                          servidor, só para deduplicar
--                      O PAN em claro existe apenas em memória durante a
--                      tokenização e é descartado em seguida.
--  4. CPF ............ guardamos `cpf_hash` (HMAC) + `cpf_last3`. Nunca o CPF
--                      completo (LGPD art. 5º II + princípio da minimização).
--  5. LOGS ........... `audit_log` registra evento, ator e IP pseudonimizado
--                      (sha256 com pepper). Sem PII em claro.
--  6. LGPD ........... `consents` guarda finalidade, base legal, versão do
--                      texto e data — permite provar consentimento e atender
--                      exclusão (soft delete em `users.status`).
-- ============================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;

-- ---------------------------------------------------------------------------
-- metadados / migração
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_meta (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO schema_meta (key, value) VALUES ('schema_version', '1')
  ON CONFLICT(key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- usuários
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id         TEXT    NOT NULL UNIQUE,           -- uuid v4 exposto na API
  name              TEXT    NOT NULL,
  email             TEXT    NOT NULL,                  -- sempre minúsculo/trim
  email_verified_at TEXT,
  phone             TEXT,
  cpf_hash          TEXT,                              -- HMAC-SHA256(cpf, pepper)
  cpf_last3         TEXT,                              -- exibição "•••.456-••"
  birth_date        TEXT,
  marketing_opt_in  INTEGER NOT NULL DEFAULT 0 CHECK (marketing_opt_in IN (0,1)),
  status            TEXT    NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','locked','deleted')),
  failed_logins     INTEGER NOT NULL DEFAULT 0,
  locked_until      TEXT,
  last_login_at     TEXT,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  deleted_at        TEXT
);
-- e-mail único entre contas vivas (soft delete libera o endereço)
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email_active
  ON users(email) WHERE status <> 'deleted';
CREATE INDEX IF NOT EXISTS ix_users_public_id ON users(public_id);

-- credenciais separadas do perfil: rotação de senha não toca em PII
CREATE TABLE IF NOT EXISTS user_credentials (
  user_id             INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  algo                TEXT NOT NULL DEFAULT 'scrypt',
  password_hash       TEXT NOT NULL,                   -- base64
  salt                TEXT NOT NULL,                   -- base64 (16 bytes)
  params              TEXT NOT NULL DEFAULT '{"N":32768,"r":8,"p":1,"len":32}',
  pepper_version      INTEGER NOT NULL DEFAULT 1,
  password_changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  must_rotate         INTEGER NOT NULL DEFAULT 0 CHECK (must_rotate IN (0,1))
);

-- histórico de senhas (impede reuso das últimas N)
CREATE TABLE IF NOT EXISTS password_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  algo       TEXT NOT NULL,
  hash       TEXT NOT NULL,
  salt       TEXT NOT NULL,
  params     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_pwd_history_user ON password_history(user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- sessões (guardamos hash, nunca o token)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT    NOT NULL UNIQUE,                -- sha256(token)
  csrf_hash    TEXT    NOT NULL,                       -- double-submit cookie
  user_agent   TEXT,
  ip_hash      TEXT,                                   -- sha256(ip|pepper)
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT    NOT NULL,
  revoked_at   TEXT
);
CREATE INDEX IF NOT EXISTS ix_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS ix_sessions_exp  ON sessions(expires_at);

-- tentativas de login → rate limit e detecção de credential stuffing
CREATE TABLE IF NOT EXISTS login_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT,
  ip_hash    TEXT,
  ok         INTEGER NOT NULL CHECK (ok IN (0,1)),
  reason     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_attempts_email ON login_attempts(email, created_at);
CREATE INDEX IF NOT EXISTS ix_attempts_ip    ON login_attempts(ip_hash, created_at);

-- tokens de uso único (verificação de e-mail, reset de senha, 2FA)
CREATE TABLE IF NOT EXISTS one_time_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL CHECK (purpose IN ('email_verify','password_reset','two_factor')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- consentimentos (LGPD art. 7º/8º)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  purpose       TEXT NOT NULL,                         -- marketing, analytics, termos…
  granted       INTEGER NOT NULL CHECK (granted IN (0,1)),
  policy_version TEXT NOT NULL,
  legal_basis   TEXT NOT NULL DEFAULT 'consent',
  ip_hash       TEXT,
  user_agent    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_consents_user ON consents(user_id, purpose);

-- ---------------------------------------------------------------------------
-- endereços
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS addresses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label        TEXT    NOT NULL DEFAULT 'Casa',
  recipient    TEXT    NOT NULL,
  phone        TEXT,
  cep          TEXT    NOT NULL,
  street       TEXT    NOT NULL,
  number       TEXT    NOT NULL,
  complement   TEXT,
  district     TEXT    NOT NULL,
  city         TEXT    NOT NULL,
  state        TEXT    NOT NULL,                       -- UF
  country      TEXT    NOT NULL DEFAULT 'BR',
  is_default   INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_addresses_user ON addresses(user_id);

-- ---------------------------------------------------------------------------
-- meios de pagamento (metadados comuns a todos os tipos)
--   o segredo de cada meio mora na tabela especializada (cards, pix_keys…)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_methods (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id    TEXT    NOT NULL UNIQUE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT    NOT NULL CHECK (kind IN (
                 'credit_card','debit_card','pix','boleto','picpay',
                 'mercadopago','paypal','google_pay','apple_pay','samsung_pay')),
  label        TEXT    NOT NULL,
  is_default   INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  status       TEXT    NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','expired','revoked')),
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_pm_user ON payment_methods(user_id, kind);
-- Obs.: o padrão único por (usuário, tipo) é garantido por trigger, não por
-- índice parcial. No SQLite a unicidade é checada antes dos triggers AFTER,
-- então um índice parcial bloquearia a promoção de um cartão a padrão.
-- A API sempre executa "limpar outros → definir um", o que mantém o invariante.

-- cartões: apenas dados NÃO sensíveis + token do cofre/PSP
CREATE TABLE IF NOT EXISTS cards (
  payment_method_id INTEGER PRIMARY KEY REFERENCES payment_methods(id) ON DELETE CASCADE,
  brand_id     TEXT NOT NULL,                          -- visa, mastercard, elo…
  brand_name   TEXT NOT NULL,
  bank_id      TEXT,                                   -- nubank, itau, bb…
  bank_name    TEXT,
  bin6         TEXT NOT NULL CHECK (length(bin6) = 6), -- emissor (não sensível)
  last4        TEXT NOT NULL CHECK (length(last4) = 4),
  exp_month    INTEGER NOT NULL CHECK (exp_month BETWEEN 1 AND 12),
  exp_year     INTEGER NOT NULL CHECK (exp_year  BETWEEN 2000 AND 2099),
  holder_name  TEXT NOT NULL,
  token        TEXT NOT NULL,                          -- ref. opaca do PSP
  token_provider TEXT NOT NULL DEFAULT 'demo-vault',
  fingerprint  TEXT NOT NULL,                          -- HMAC-SHA256(PAN, pepper)
  is_debit     INTEGER NOT NULL DEFAULT 0 CHECK (is_debit IN (0,1)),
  requires_3ds INTEGER NOT NULL DEFAULT 0 CHECK (requires_3ds IN (0,1)),
  verified_at  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cards_fingerprint
  ON cards(fingerprint);                               -- evita duplicar o mesmo cartão
CREATE INDEX IF NOT EXISTS ix_cards_bin ON cards(bin6);

-- CPF/CNPJ do titular usado só na cobrança (nunca em claro)
CREATE TABLE IF NOT EXISTS payment_holders (
  payment_method_id INTEGER PRIMARY KEY REFERENCES payment_methods(id) ON DELETE CASCADE,
  doc_type    TEXT NOT NULL CHECK (doc_type IN ('cpf','cnpj')),
  doc_hash    TEXT NOT NULL,
  doc_last3   TEXT NOT NULL
);

-- chave Pix salva (opcional)
CREATE TABLE IF NOT EXISTS pix_keys (
  payment_method_id INTEGER PRIMARY KEY REFERENCES payment_methods(id) ON DELETE CASCADE,
  key_type  TEXT NOT NULL CHECK (key_type IN ('cpf','cnpj','email','phone','random')),
  key_hash  TEXT NOT NULL,
  key_mask  TEXT NOT NULL
);

-- tabela de BINs (bandeira + banco emissor) para validação no servidor
CREATE TABLE IF NOT EXISTS card_bins (
  bin_prefix  TEXT PRIMARY KEY,                        -- 4 a 8 dígitos
  brand_id    TEXT NOT NULL,
  bank_id     TEXT,
  kind        TEXT CHECK (kind IN ('credit','debit','both')),
  card_length INTEGER NOT NULL DEFAULT 16,
  cvv_length  INTEGER NOT NULL DEFAULT 3,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_bins_brand ON card_bins(brand_id);
CREATE INDEX IF NOT EXISTS ix_bins_bank  ON card_bins(bank_id);

-- ---------------------------------------------------------------------------
-- catálogo mínimo (produtos podem vir do site; aqui para integridade do pedido)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id        TEXT PRIMARY KEY,                          -- slug do catálogo (data.js)
  name      TEXT NOT NULL,
  type      TEXT,
  price     REAL NOT NULL,
  active    INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);

CREATE TABLE IF NOT EXISTS coupons (
  code        TEXT PRIMARY KEY,
  percent_off REAL NOT NULL CHECK (percent_off > 0 AND percent_off <= 1),
  min_subtotal REAL NOT NULL DEFAULT 0,
  max_uses    INTEGER,
  used_count  INTEGER NOT NULL DEFAULT 0,
  starts_at   TEXT,
  ends_at     TEXT,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);

-- ---------------------------------------------------------------------------
-- pedidos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id      TEXT    NOT NULL UNIQUE,              -- VL-2026-0000 (mostrado)
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  guest_email    TEXT,
  status         TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN (
                   'pending','paid','processing','shipped','delivered',
                   'canceled','refunded','chargeback')),
  currency       TEXT    NOT NULL DEFAULT 'BRL',
  subtotal       REAL    NOT NULL,
  discount       REAL    NOT NULL DEFAULT 0,
  shipping       REAL    NOT NULL DEFAULT 0,
  total          REAL    NOT NULL,
  coupon_code    TEXT REFERENCES coupons(code),
  ship_service   TEXT,                                 -- standard | express
  ship_eta_from  TEXT,
  ship_eta_to    TEXT,
  address_id     INTEGER REFERENCES addresses(id) ON DELETE SET NULL,
  ship_address   TEXT,                                 -- snapshot JSON (imutável)
  customer       TEXT    NOT NULL,                     -- snapshot JSON (nome/email/fone)
  notes          TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  paid_at        TEXT
);
CREATE INDEX IF NOT EXISTS ix_orders_user   ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT,
  name       TEXT NOT NULL,
  color      TEXT,
  size       TEXT,
  qty        INTEGER NOT NULL CHECK (qty > 0),
  unit_price REAL NOT NULL,
  line_total REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_payments (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id          INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_method_id INTEGER REFERENCES payment_methods(id) ON DELETE SET NULL,
  kind              TEXT NOT NULL,
  provider          TEXT NOT NULL DEFAULT 'demo',
  provider_ref      TEXT,                              -- id da transação no PSP
  method_snapshot   TEXT,                              -- JSON: bandeira, banco, last4
  installments      INTEGER NOT NULL DEFAULT 1 CHECK (installments BETWEEN 1 AND 24),
  installment_value REAL,
  amount            REAL NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                      'pending','authorized','paid','failed','refunded','canceled')),
  authorized_at     TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_op_order ON order_payments(order_id);

CREATE TABLE IF NOT EXISTS order_status_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- auditoria (quem fez o quê, quando, de onde)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor      TEXT,                                     -- 'user:12' | 'system'
  action     TEXT NOT NULL,                            -- auth.login, card.add…
  entity     TEXT,
  entity_id  TEXT,
  ip_hash    TEXT,
  user_agent TEXT,
  meta       TEXT,                                     -- JSON sem PII
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_audit_action ON audit_log(action, created_at DESC);

-- ---------------------------------------------------------------------------
-- gatilhos de updated_at
-- ---------------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS tg_users_updated
AFTER UPDATE ON users FOR EACH ROW
BEGIN
  UPDATE users SET updated_at = datetime('now') WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS tg_orders_updated
AFTER UPDATE ON orders FOR EACH ROW
BEGIN
  UPDATE orders SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- mantém no máximo um padrão por (usuário, tipo)
CREATE TRIGGER IF NOT EXISTS tg_pm_single_default_upd
AFTER UPDATE OF is_default ON payment_methods FOR EACH ROW
WHEN NEW.is_default = 1
BEGIN
  UPDATE payment_methods SET is_default = 0
   WHERE user_id = NEW.user_id AND kind = NEW.kind
     AND id <> NEW.id AND is_default = 1;
END;

CREATE TRIGGER IF NOT EXISTS tg_pm_single_default_ins
AFTER INSERT ON payment_methods FOR EACH ROW
WHEN NEW.is_default = 1
BEGIN
  UPDATE payment_methods SET is_default = 0
   WHERE user_id = NEW.user_id AND kind = NEW.kind
     AND id <> NEW.id AND is_default = 1;
END;

-- ---------------------------------------------------------------------------
-- visões de apoio (nunca expõem hash de senha)
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS v_user_profile;
CREATE VIEW v_user_profile AS
SELECT u.public_id, u.name, u.email, u.phone, u.cpf_last3, u.status,
       u.marketing_opt_in, u.created_at, u.last_login_at,
       c.algo, c.password_changed_at
  FROM users u
  LEFT JOIN user_credentials c ON c.user_id = u.id
 WHERE u.status <> 'deleted';

DROP VIEW IF EXISTS v_wallet;
CREATE VIEW v_wallet AS
SELECT pm.public_id, pm.user_id, pm.kind, pm.label, pm.is_default, pm.status,
       c.brand_id, c.brand_name, c.bank_id, c.bank_name,
       c.bin6, c.last4, c.exp_month, c.exp_year, c.holder_name, c.token
  FROM payment_methods pm
  LEFT JOIN cards c ON c.payment_method_id = pm.id;

-- ---------------------------------------------------------------------------
-- SEEDS — BINs de bandeiras e bancos brasileiros (detecção ao digitar)
--   faixas reais de emissor; o servidor cruza o BIN com esta tabela
-- ---------------------------------------------------------------------------
INSERT INTO card_bins (bin_prefix, brand_id, bank_id, kind, card_length, cvv_length) VALUES
  -- Nubank (Mastercard / Visa / Elo)
  ('516230','mastercard','nubank','both',16,3),
  ('516292','mastercard','nubank','both',16,3),
  ('523612','mastercard','nubank','both',16,3),
  ('526961','mastercard','nubank','both',16,3),
  ('531307','mastercard','nubank','both',16,3),
  ('535450','mastercard','nubank','both',16,3),
  ('536853','mastercard','nubank','both',16,3),
  ('550209','mastercard','nubank','both',16,3),
  ('552289','mastercard','nubank','both',16,3),
  ('554905','mastercard','nubank','both',16,3),
  ('428600','visa','nubank','both',16,3),
  ('449155','visa','nubank','both',16,3),
  ('508115','elo','nubank','both',16,3),
  ('650412','elo','nubank','both',16,3),
  -- Itaú
  ('400279','visa','itau','credit',16,3),
  ('411920','visa','itau','both',16,3),
  ('422731','visa','itau','both',16,3),
  ('457631','visa','itau','both',16,3),
  ('513845','mastercard','itau','both',16,3),
  ('516220','mastercard','itau','credit',16,3),
  ('529195','mastercard','itau','both',16,3),
  ('544825','mastercard','itau','credit',16,3),
  ('547256','mastercard','itau','both',16,3),
  ('636368','elo','itau','credit',16,3),
  ('504175','elo','itau','both',16,3),
  -- Bradesco
  ('401185','visa','bradesco','both',16,3),
  ('402051','visa','bradesco','both',16,3),
  ('451415','visa','bradesco','both',16,3),
  ('455187','visa','bradesco','credit',16,3),
  ('515047','mastercard','bradesco','both',16,3),
  ('521374','mastercard','bradesco','credit',16,3),
  ('527405','mastercard','bradesco','both',16,3),
  ('541057','mastercard','bradesco','both',16,3),
  ('545273','mastercard','bradesco','credit',16,3),
  -- Banco do Brasil
  ('403224','visa','bb','both',16,3),
  ('409079','visa','bb','both',16,3),
  ('451466','visa','bb','credit',16,3),
  ('506723','mastercard','bb','both',16,3),
  ('515106','mastercard','bb','both',16,3),
  ('529042','mastercard','bb','credit',16,3),
  ('552301','mastercard','bb','both',16,3),
  -- Caixa Econômica Federal
  ('411234','visa','caixa','both',16,3),
  ('440998','visa','caixa','both',16,3),
  ('449170','visa','caixa','credit',16,3),
  ('515956','mastercard','caixa','both',16,3),
  ('524988','mastercard','caixa','credit',16,3),
  ('534614','mastercard','caixa','both',16,3),
  -- Santander
  ('402552','visa','santander','both',16,3),
  ('430581','visa','santander','both',16,3),
  ('452791','visa','santander','both',16,3),
  ('516178','mastercard','santander','both',16,3),
  ('529565','mastercard','santander','credit',16,3),
  ('543318','mastercard','santander','both',16,3),
  -- Inter
  ('535137','mastercard','inter','both',16,3),
  ('549099','mastercard','inter','both',16,3),
  ('516276','mastercard','inter','credit',16,3),
  ('402066','visa','inter','both',16,3),
  -- C6 Bank
  ('533314','mastercard','c6','both',16,3),
  ('539126','mastercard','c6','credit',16,3),
  ('542543','mastercard','c6','both',16,3),
  ('403163','visa','c6','both',16,3),
  -- BTG Pactual
  ('516779','mastercard','btg','credit',16,3),
  ('539949','mastercard','btg','credit',16,3),
  ('402343','visa','btg','credit',16,3),
  -- Banco Safra
  ('413703','visa','safra','both',16,3),
  ('545821','mastercard','safra','credit',16,3),
  -- PagBank / PagSeguro
  ('507518','elo','pagbank','both',16,3),
  ('636297','elo','pagbank','both',16,3),
  ('517102','mastercard','pagbank','both',16,3),
  -- Mercado Pago
  ('518903','mastercard','mercadopago','both',16,3),
  ('526474','mastercard','mercadopago','credit',16,3),
  ('506724','mastercard','mercadopago','both',16,3),
  -- PicPay
  ('529551','mastercard','picpay','both',16,3),
  ('555017','mastercard','picpay','credit',16,3),
  -- Neon
  ('535258','mastercard','neon','both',16,3),
  ('403202','visa','neon','both',16,3),
  -- Sicredi
  ('513805','mastercard','sicredi','both',16,3),
  ('402205','visa','sicredi','both',16,3),
  -- Sicoob
  ('522076','mastercard','sicoob','both',16,3),
  ('403795','visa','sicoob','both',16,3),
  -- Banrisul
  ('515730','mastercard','banrisul','both',16,3),
  ('403695','visa','banrisul','both',16,3),
  -- Banco Original / Will Bank
  ('536303','mastercard','original','both',16,3),
  ('525232','mastercard','will','both',16,3),
  -- Digio
  ('539018','mastercard','digio','both',16,3),
  -- Amex (emissor próprio)
  ('341111','amex','amex','credit',15,4),
  ('371449','amex','amex','credit',15,4),
  ('378282','amex','amex','credit',15,4),
  -- Hipercard (emissor Itaú)
  ('606282','hipercard','itau','both',16,3),
  ('384100','hipercard','itau','both',16,3),
  -- regionais, cooperativos e de atacado
  ('401190','visa','banese','both',16,3),
  ('521075','mastercard','banese','both',16,3),
  ('412856','visa','banestes','both',16,3),
  ('515891','mastercard','banestes','both',16,3),
  ('401717','visa','banpara','both',16,3),
  ('523682','mastercard','banpara','both',16,3),
  ('401690','visa','banrisul','both',16,3),
  ('516714','mastercard','banrisul','both',16,3),
  ('531398','mastercard','banrisul','credit',16,3),
  ('401670','visa','bmg','both',16,3),
  ('519134','mastercard','bmg','both',16,3),
  ('531703','mastercard','bmg','credit',16,3),
  ('518834','mastercard','bmg','both',16,3),
  ('401749','visa','bnb','both',16,3),
  ('522015','mastercard','bnb','both',16,3),
  ('402642','visa','brb','both',16,3),
  ('529953','mastercard','brb','both',16,3),
  ('406655','visa','bv','both',16,3),
  ('519086','mastercard','bv','both',16,3),
  ('520088','mastercard','daycoval','both',16,3),
  ('543048','mastercard','daycoval','credit',16,3),
  ('404751','visa','pan','both',16,3),
  ('517121','mastercard','pan','both',16,3),
  ('527053','mastercard','pan','credit',16,3),
  ('519059','mastercard','pine','credit',16,3),
  ('531192','mastercard','pine','credit',16,3),
  ('401564','visa','sofisa','both',16,3),
  ('516753','mastercard','sofisa','both',16,3),
  ('414698','visa','xp','both',16,3),
  ('528704','mastercard','xp','both',16,3),
  -- bandeiras sem banco (cartões internacionais)
  ('401288','visa',NULL,'both',16,3),
  ('453201','mastercard',NULL,'both',16,3),
  ('601100','discover',NULL,'both',16,3),
  ('305693','diners',NULL,'both',14,3),
  ('352800','jcb',NULL,'both',16,3),
  ('507860','aura',NULL,'both',16,3),
  ('622126','unionpay',NULL,'both',16,3)
ON CONFLICT(bin_prefix) DO UPDATE SET
  brand_id = excluded.brand_id,
  bank_id  = excluded.bank_id,
  kind     = excluded.kind,
  updated_at = datetime('now');

INSERT INTO coupons (code, percent_off, min_subtotal, active) VALUES
  ('LIMONE10', 0.10, 0, 1)
ON CONFLICT(code) DO NOTHING;
