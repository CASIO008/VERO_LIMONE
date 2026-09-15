/* ============================================================
   DAVVERO LIMONE — núcleo de pagamentos (VLPAY)
   ------------------------------------------------------------
   Sem DOM, sem dependências. Reúne:

     · bandeiras  → detecção por BIN (faixas reais de emissor)
     · bancos BR  → detecção por prefixo + logo SVG
     · validação  → Luhn, validade, CVV por bandeira
     · formatação → máscara progressiva enquanto digita
     · arte       → cartão de crédito (referência "UI Credit Cards")
     · métodos    → lista no padrão Hotmart (Pix, boleto, carteiras…)

   As mesmas regras existem no servidor (server/server.js + tabela
   card_bins no sql/schema.sql). Aqui elas servem à experiência:
   reconhecer a bandeira/banco no instante em que o número é digitado.

   Marcas e logotipos citados pertencem aos seus titulares e são
   usados apenas de forma ilustrativa nesta demonstração.
   ============================================================ */
'use strict';

const VLPAY = (() => {

  /* ---------------------------------------------------------- utilidades */
  const digits = s => String(s ?? '').replace(/\D/g, '');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function luhn(num) {
    const d = digits(num);
    if (d.length < 12) return false;
    let sum = 0, alt = false;
    for (let i = d.length - 1; i >= 0; i--) {
      let n = +d[i];
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n; alt = !alt;
    }
    return sum % 10 === 0;
  }

  const escapeHTML = s => String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  /* ------------------------------------------------------------ bandeiras */
  /* ranges: [início, fim] comparados com os N primeiros dígitos (prefixLen) */
  const BRANDS = {
    visa: {
      id: 'visa', name: 'Visa', lengths: [16, 13, 19], cvv: [3], groups: [4, 8, 12],
      ranges: [[4, 4]], prefixLen: 1, palette: ['#1A1F71', '#2A3EB1'],
    },
    mastercard: {
      id: 'mastercard', name: 'Mastercard', lengths: [16], cvv: [3], groups: [4, 8, 12],
      ranges: [[51, 55], [2221, 2720]], prefixLen: 4, palette: ['#EB001B', '#F79E1B'],
    },
    elo: {
      id: 'elo', name: 'Elo', lengths: [16], cvv: [3], groups: [4, 8, 12],
      ranges: [
        [4011, 4011], [4312, 4312], [4389, 4389], [4514, 4514], [4576, 4576],
        [5041, 5041], [5066, 5067], [5090, 5090], [6277, 6277], [6362, 6363],
        [6500, 6516], [6550, 6550],
      ], prefixLen: 4, palette: ['#1B1B1B', '#FFCB05'],
    },
    amex: {
      id: 'amex', name: 'Amex', lengths: [15], cvv: [4], groups: [4, 10],
      ranges: [[34, 34], [37, 37]], prefixLen: 2, palette: ['#006FCF', '#00A3E0'],
    },    hipercard: {
      id: 'hipercard', name: 'Hipercard', lengths: [16], cvv: [3], groups: [4, 8, 12],
      ranges: [[6062, 6062], [3841, 3841]], prefixLen: 4, palette: ['#B3131B', '#E30613'],
    },
    diners: {
      id: 'diners', name: 'Diners Club', lengths: [14, 16], cvv: [3], groups: [4, 8, 12],
      ranges: [[300, 305], [3095, 3095], [36, 36], [38, 39]], prefixLen: 4, palette: ['#0079BE', '#004A7C'],
    },
    discover: {
      id: 'discover', name: 'Discover', lengths: [16], cvv: [3], groups: [4, 8, 12],
      ranges: [[6011, 6011], [644, 649], [65, 65]], prefixLen: 3, palette: ['#FF6000', '#F5A623'],
    },
    jcb: {
      id: 'jcb', name: 'JCB', lengths: [16, 17, 18, 19], cvv: [3], groups: [4, 8, 12],
      ranges: [[3528, 3589]], prefixLen: 4, palette: ['#0E4C96', '#E30B17'],
    },
    aura: {
      id: 'aura', name: 'Aura', lengths: [16], cvv: [3], groups: [4, 8, 12],
      ranges: [[50, 50]], prefixLen: 2, palette: ['#E30613', '#F5A623'],
    },
    unionpay: {
      id: 'unionpay', name: 'UnionPay', lengths: [16, 17, 18, 19], cvv: [3], groups: [4, 8, 12],
      ranges: [[62, 62], [81, 81]], prefixLen: 2, palette: ['#00447C', '#E21836'],
    },
    unknown: {
      id: 'unknown', name: 'Cartão', lengths: [16], cvv: [3, 4], groups: [4, 8, 12],
      ranges: [], prefixLen: 1, palette: ['#2B2B2B', '#191813'],
    },
  };
  /* ordem importa: bandeiras com faixas mais específicas vêm antes */
  const BRAND_ORDER = ['elo', 'hipercard', 'amex', 'diners', 'discover', 'jcb', 'aura', 'unionpay', 'mastercard', 'visa'];

  function matchRange(num, brand) {
    const d = digits(num);
    if (d.length < brand.prefixLen) return false;
    const value = Number(d.slice(0, brand.prefixLen));
    return brand.ranges.some(([a, b]) => {
      const len = String(b).length;
      return Number(d.slice(0, len)) >= a && Number(d.slice(0, len)) <= b;
    });
  }

  function detectBrand(number) {
    const d = digits(number);
    if (d.length < 2) return BRANDS.unknown;
    for (const id of BRAND_ORDER) if (matchRange(d, BRANDS[id])) return BRANDS[id];
    return BRANDS.unknown;
  }

  /* --------------------------------------------------------------- bancos */
  /* prefixos reais de emissor; a lista canônica também vive no SQL */
  const BIN_BANK = {
    // Nubank
    '516230': 'nubank', '516292': 'nubank', '523612': 'nubank', '526961': 'nubank',
    '531307': 'nubank', '535450': 'nubank', '536853': 'nubank', '550209': 'nubank',
    '552289': 'nubank', '554905': 'nubank', '428600': 'nubank', '449155': 'nubank',
    '508115': 'nubank', '650412': 'nubank',
    // Itaú
    '400279': 'itau', '411920': 'itau', '422731': 'itau', '457631': 'itau',
    '513845': 'itau', '516220': 'itau', '529195': 'itau', '544825': 'itau',
    '547256': 'itau', '636368': 'itau', '504175': 'itau',
    // Bradesco
    '401185': 'bradesco', '402051': 'bradesco', '451415': 'bradesco', '455187': 'bradesco',
    '515047': 'bradesco', '521374': 'bradesco', '527405': 'bradesco', '541057': 'bradesco', '545273': 'bradesco',
    // Banco do Brasil
    '403224': 'bb', '409079': 'bb', '451466': 'bb', '506723': 'bb',
    '515106': 'bb', '529042': 'bb', '552301': 'bb',
    // Caixa
    '411234': 'caixa', '440998': 'caixa', '449170': 'caixa',
    '515956': 'caixa', '524988': 'caixa', '534614': 'caixa',
    // Santander
    '402552': 'santander', '430581': 'santander', '452791': 'santander',
    '516178': 'santander', '529565': 'santander', '543318': 'santander',
    // Inter
    '535137': 'inter', '549099': 'inter', '516276': 'inter', '402066': 'inter',
    // C6
    '533314': 'c6', '539126': 'c6', '542543': 'c6', '403163': 'c6',
    // BTG
    '516779': 'btg', '539949': 'btg', '402343': 'btg',
    // Safra
    '413703': 'safra', '545821': 'safra',
    // PagBank
    '507518': 'pagbank', '636297': 'pagbank', '517102': 'pagbank',
    // Mercado Pago
    '518903': 'mercadopago', '526474': 'mercadopago', '506724': 'mercadopago',
    // PicPay
    '529551': 'picpay', '555017': 'picpay',
    // Neon
    '535258': 'neon', '403202': 'neon',
    // Sicredi / Sicoob / Banrisul
    '513805': 'sicredi', '402205': 'sicredi',
    '522076': 'sicoob', '403795': 'sicoob',
    '515730': 'banrisul', '403695': 'banrisul',
    // digitais
    '536303': 'original', '525232': 'will', '539018': 'digio',
    // regionais, cooperativos e de atacado
    '401190': 'banese', '521075': 'banese',
    '412856': 'banestes', '515891': 'banestes',
    '401717': 'banpara', '523682': 'banpara',
    '401690': 'banrisul', '516714': 'banrisul', '531398': 'banrisul',
    '401670': 'bmg', '519134': 'bmg', '531703': 'bmg', '518834': 'bmg',
    '401749': 'bnb', '522015': 'bnb',
    '402642': 'brb', '529953': 'brb',
    '406655': 'bv', '519086': 'bv',
    '520088': 'daycoval', '543048': 'daycoval',
    '404751': 'pan', '517121': 'pan', '527053': 'pan',
    '519059': 'pine', '531192': 'pine',
    '401564': 'sofisa', '516753': 'sofisa',
    '414698': 'xp', '528704': 'xp',
    // emissores próprios
    '341111': 'amex', '371449': 'amex', '378282': 'amex',
    '606282': 'itau', '384100': 'itau',
  };

  /* ------------------------------------------------- assets oficiais
     tools/banks-from-github.mjs baixa os logos de banco do repositório
     Tgentil/Bancos-em-SVG; tools/build-assets.mjs escreve assets.js com
     o que existe em disco. Onde há arquivo, usamos o original; onde não
     há, cai no desenho inline. */
  const ASSETS = (typeof window !== 'undefined' && window.VLASSETS) || { banks: [], brands: [], pay: [] };
  const hasAsset = (kind, id) => Array.isArray(ASSETS[kind]) && ASSETS[kind].indexOf(id) > -1;
  const assetSrc = (kind, id) => `images/${kind}/${id}.svg`;
  const assetImg = (kind, id, w, h, cls = 'bico bico-img') =>
    `<img class="${cls}" src="${assetSrc(kind, id)}" width="${w}" height="${h}" alt="" loading="lazy" decoding="async">`;

  const BANKS = {
    nubank:      { id: 'nubank',      name: 'Nubank',       tile: '#820AD1', text: 'Nu',      glyph: 'word' },
    itau:        { id: 'itau',        name: 'Itaú',         tile: '#003399', tile2: '#EC7000', text: 'itaú', glyph: 'itau' },
    bradesco:    { id: 'bradesco',    name: 'Bradesco',     tile: '#CC092F', text: 'Bradesco', glyph: 'word' },
    bb:          { id: 'bb',          name: 'Banco do Brasil', tile: '#FAE128', tile2: '#003399', text: 'BB', glyph: 'bb' },
    caixa:       { id: 'caixa',       name: 'Caixa',        tile: '#005CA9', tile2: '#F39200', text: 'CAIXA', glyph: 'caixa' },
    santander:   { id: 'santander',   name: 'Santander',    tile: '#EC0000', text: 'Santander', glyph: 'flame' },
    inter:       { id: 'inter',       name: 'Inter',        tile: '#FF7A00', text: 'inter', glyph: 'word' },
    c6:          { id: 'c6',          name: 'C6 Bank',      tile: '#242424', text: 'C6', glyph: 'word' },
    btg:         { id: 'btg',         name: 'BTG Pactual',  tile: '#001E62', text: 'BTG', glyph: 'word' },
    safra:       { id: 'safra',       name: 'Safra',        tile: '#0B2D5C', tile2: '#C9A227', text: 'S', glyph: 'word' },
    pagbank:     { id: 'pagbank',     name: 'PagBank',      tile: '#0FA958', text: 'PagBank', glyph: 'word' },
    mercadopago: { id: 'mercadopago', name: 'Mercado Pago', tile: '#00A1E0', tile2: '#FFE600', text: 'mp', glyph: 'handshake' },
    picpay:      { id: 'picpay',      name: 'PicPay',       tile: '#21C25E', text: 'picpay', glyph: 'word' },
    neon:        { id: 'neon',        name: 'Neon',         tile: '#00AEEF', text: 'neon', glyph: 'word' },
    sicredi:     { id: 'sicredi',     name: 'Sicredi',      tile: '#008D4C', text: 'Sicredi', glyph: 'word' },
    sicoob:      { id: 'sicoob',      name: 'Sicoob',       tile: '#00664F', text: 'Sicoob', glyph: 'word' },
    banrisul:    { id: 'banrisul',    name: 'Banrisul',     tile: '#00539F', text: 'BANRISUL', glyph: 'word' },
    original:    { id: 'original',    name: 'Original',     tile: '#00A44B', text: 'original', glyph: 'word' },
    will:        { id: 'will',        name: 'Will Bank',    tile: '#1B1B1B', tile2: '#7C3AED', text: 'will', glyph: 'word' },
    digio:       { id: 'digio',       name: 'Digio',        tile: '#1B1B1B', tile2: '#FF7A00', text: 'digio', glyph: 'word' },
    amex:        { id: 'amex',        name: 'Amex',         tile: '#006FCF', text: 'AMEX', glyph: 'word' },
    /* digitais e cooperativas com logo oficial baixado */
    next:        { id: 'next',        name: 'Next',         tile: '#00E88F', text: 'next', glyph: 'word' },
    iti:         { id: 'iti',         name: 'Iti',          tile: '#FF1F55', text: 'iti', glyph: 'word' },
    stone:       { id: 'stone',       name: 'Stone',        tile: '#00C853', text: 'stone', glyph: 'word' },
    nomad:       { id: 'nomad',       name: 'Nomad',        tile: '#1B1B1B', text: 'nomad', glyph: 'word' },
    efi:         { id: 'efi',         name: 'Efí',          tile: '#FF6B00', text: 'efí', glyph: 'word' },
    bndes:       { id: 'bndes',       name: 'BNDES',        tile: '#0B4EA2', text: 'BNDES', glyph: 'word' },
    unicred:     { id: 'unicred',     name: 'Unicred',      tile: '#00703C', text: 'unicred', glyph: 'word' },
    cresol:      { id: 'cresol',      name: 'Cresol',       tile: '#1B7A3C', text: 'cresol', glyph: 'word' },
    credisis:    { id: 'credisis',    name: 'CrediSIS',     tile: '#00695C', text: 'credisis', glyph: 'word' },
    /* regionais, de atacado e digitais com logo oficial baixado */
    banese:      { id: 'banese',      name: 'Banese',      tile: '#F26A21', tile2: '#0B3C74', text: 'banese', glyph: 'word' },
    banestes:    { id: 'banestes',    name: 'Banestes',    tile: '#0B5AA5', text: 'banestes', glyph: 'word' },
    banpara:     { id: 'banpara',     name: 'Banpará',     tile: '#0067A5', text: 'banpará', glyph: 'word' },
    bmg:         { id: 'bmg',         name: 'Banco BMG',   tile: '#EC6608', text: 'BMG', glyph: 'word' },
    bnb:         { id: 'bnb',         name: 'Banco do Nordeste', tile: '#0072BC', tile2: '#F58220', text: 'BNB', glyph: 'word' },
    brb:         { id: 'brb',         name: 'BRB',         tile: '#1B4E9B', text: 'BRB', glyph: 'word' },
    bv:          { id: 'bv',          name: 'Banco BV',    tile: '#0086D6', text: 'bv', glyph: 'word' },
    daycoval:    { id: 'daycoval',    name: 'Daycoval',    tile: '#F58220', text: 'daycoval', glyph: 'word' },
    pan:         { id: 'pan',         name: 'Banco Pan',   tile: '#0072CE', text: 'pan', glyph: 'word' },
    pine:        { id: 'pine',        name: 'Banco Pine',  tile: '#0A3D2C', text: 'pine', glyph: 'word' },
    sofisa:      { id: 'sofisa',      name: 'Sofisa Direto', tile: '#00529B', text: 'sofisa', glyph: 'word' },
    xp:          { id: 'xp',          name: 'XP',          tile: '#111111', tile2: '#BFA054', text: 'XP', glyph: 'word' },
  };

  function detectBank(number) {
    const d = digits(number);
    for (let len = 6; len >= 4; len--) {
      if (d.length < len) continue;
      const hit = BIN_BANK[d.slice(0, len)];
      if (hit && BANKS[hit]) return BANKS[hit];
    }
    return null;
  }

  /* ---------------------------------------------------- normalização
     Cartão salvo (local ou servidor) chega em formatos diferentes.
     Aqui vira sempre { brandId, brandName, bankId, bankName } no plano,
     e o banco é reconhecido de novo pelo bin6 quando ficou em branco —
     conserta cartões guardados antes de a bandeira existir. */
  function normalizeCard(card) {
    if (!card) return card;
    const brandId = card.brandId
      || (typeof card.brand === 'string' ? card.brand : card.brand && card.brand.id)
      || null;
    const brandName = card.brandName
      || (card.brand && card.brand.name)
      || (BRANDS[brandId] && BRANDS[brandId].name)
      || 'Cartão';
    let bankId = card.bankId
      || (typeof card.bank === 'string' ? card.bank : card.bank && card.bank.id)
      || null;
    if (!bankId && card.bin6) {
      const found = detectBank(card.bin6);
      if (found) bankId = found.id;
    }
    const bankName = bankId
      ? (card.bankName || (card.bank && card.bank.name) || (BANKS[bankId] && BANKS[bankId].name) || null)
      : null;
    return { ...card, brandId, brandName, bankId, bankName };
  }

  /* ---------------------------------------------------------- formatação */
  function formatNumber(value, brand = detectBrand(value)) {
    const d = digits(value).slice(0, Math.max(...brand.lengths));
    const out = [];
    let prev = 0;
    for (const cut of brand.groups) {
      if (d.length <= prev) break;
      out.push(d.slice(prev, cut));
      prev = cut;
    }
    if (prev < d.length) out.push(d.slice(prev));
    return out.join(' ');
  }
  const maxNumberLength = brand => Math.max(...brand.lengths);

  const maskNumber = last4 => `•••• •••• •••• ${String(last4 || '').slice(-4)}`;
  const maskNumberBrand = (last4, brand = BRANDS.unknown) =>
    brand.id === 'amex' ? `•••• •••••• •${String(last4).slice(-4)}` : maskNumber(last4);

  function formatExp(value) {
    const d = digits(value).slice(0, 4);
    if (d.length <= 2) return d;
    return `${d.slice(0, 2)}/${d.slice(2)}`;
  }
  const formatCvv = (value, len = 3) => digits(value).slice(0, len);
  const formatHolder = v => String(v || '')
    .replace(/[0-9]/g, '')
    .replace(/\s{2,}/g, ' ')
    .toUpperCase()
    .slice(0, 26);

  /* ----------------------------------------------------------- validação */
  const LENGTH_MSG = { amex: 'O Amex tem 15 dígitos.', diners: 'O Diners tem 14 dígitos.' };

  function validateNumber(value, brand = detectBrand(value)) {
    const d = digits(value);
    if (!d) return 'Informe o número do cartão.';
    if (d.length < Math.min(...brand.lengths)) return 'Número incompleto.';
    if (!brand.lengths.includes(d.length)) return LENGTH_MSG[brand.id] || `Esse cartão deve ter ${brand.lengths[0]} dígitos.`;
    if (!luhn(d)) return 'Número inválido. Confira os dígitos.';
    return true;
  }
  function validateHolder(value) {
    if (!value || value.trim().length < 3) return 'Informe o nome impresso no cartão.';
    if (!/^[A-Za-zÀ-ú'.\s]+$/.test(value)) return 'Use apenas letras, como está no cartão.';
    return true;
  }
  function validateExp(value) {
    const d = digits(value);
    if (d.length !== 4) return 'Use o formato MM/AA.';
    const m = +d.slice(0, 2), y = 2000 + +d.slice(2);
    if (m < 1 || m > 12) return 'Mês inválido.';
    const today = new Date();
    if (y < today.getFullYear() || (y === today.getFullYear() && m < today.getMonth() + 1)) return 'Cartão vencido.';
    if (y > today.getFullYear() + 30) return 'Ano inválido.';
    return true;
  }
  function validateCvv(value, brand = BRANDS.unknown) {
    const len = brand.cvv.length === 1 ? brand.cvv[0] : (brand.id === 'amex' ? 4 : 3);
    if (digits(value).length !== len) return `CVV deve ter ${len} dígitos.`;
    return true;
  }

  function cardProblems({ number, holder, exp, cvv, brand = detectBrand(number) }) {
    const out = {};
    const n = validateNumber(number, brand); if (n !== true) out.number = n;
    const h = validateHolder(holder); if (h !== true) out.holder = h;
    const e = validateExp(exp); if (e !== true) out.exp = e;
    const c = validateCvv(cvv, brand); if (c !== true) out.cvv = c;
    return out;
  }

  /* --------------------------------------------------------------- logos */
  const SVGO = (inner, size = 34, box = 36) =>
    `<svg class="bico" viewBox="0 0 ${box} ${box}" width="${size}" height="${size}" aria-hidden="true">${inner}</svg>`;

  function brandLogo(id, size = 34) {
    switch (id) {
      case 'visa':
        return SVGO(`<rect width="36" height="36" rx="8" fill="#fff"/>
          <text x="18" y="23.4" text-anchor="middle" font-family="Jost,Inter,sans-serif" font-size="13" font-weight="800" font-style="italic" letter-spacing=".5" fill="#1A1F71">VISA</text>`, size);
      case 'mastercard':
        return SVGO(`<rect width="36" height="36" rx="8" fill="#fff"/>
          <circle cx="14.5" cy="18" r="7.4" fill="#EB001B"/>
          <circle cx="21.5" cy="18" r="7.4" fill="#F79E1B" fill-opacity=".92"/>
          <path d="M18 12.4a7.4 7.4 0 0 0 0 11.2 7.4 7.4 0 0 0 0-11.2Z" fill="#FF5F00"/>`, size);
      case 'elo':
        return SVGO(`<rect width="36" height="36" rx="8" fill="#fff"/>
          <circle cx="11" cy="18" r="5.6" fill="#FFCB05"/>
          <circle cx="18" cy="18" r="5.6" fill="#00A4E4"/>
          <circle cx="25" cy="18" r="5.6" fill="#EF4123"/>
          <circle cx="18" cy="18" r="2.6" fill="#1B1B1B"/>`, size);
      case 'amex':
        return SVGO(`<rect width="36" height="36" rx="8" fill="#006FCF"/>
          <text x="18" y="22.6" text-anchor="middle" font-family="Jost,Inter,sans-serif" font-size="9.4" font-weight="800" fill="#fff">AMEX</text>`, size);
      case 'hipercard':
        return SVGO(`<rect width="36" height="36" rx="8" fill="#B3131B"/>
          <text x="18" y="22.4" text-anchor="middle" font-family="Jost,Inter,sans-serif" font-size="9" font-weight="700" letter-spacing="-.2" fill="#fff">Hiper</text>`, size);
      case 'diners':
        return SVGO(`<rect width="36" height="36" rx="8" fill="#fff"/>
          <circle cx="18" cy="18" r="9.4" fill="#0079BE"/>
          <circle cx="18" cy="18" r="4.2" fill="#fff"/>`, size);
      case 'discover':
        return SVGO(`<rect width="36" height="36" rx="8" fill="#fff"/>
          <circle cx="22.5" cy="20" r="8" fill="#FF6000"/>
          <text x="9" y="22" text-anchor="middle" font-family="Jost,Inter,sans-serif" font-size="8" font-weight="700" fill="#231F20">D</text>`, size);
      case 'jcb':
        return SVGO(`<rect width="36" height="36" rx="8" fill="#fff"/>
          <rect x="6" y="11" width="7.4" height="14" rx="3.4" fill="#0E4C96"/>
          <rect x="14.6" y="11" width="7.4" height="14" rx="3.4" fill="#E30B17"/>
          <rect x="23.2" y="11" width="7.4" height="14" rx="3.4" fill="#00A650"/>`, size);
      case 'aura':
        return SVGO(`<rect width="36" height="36" rx="8" fill="#fff"/>
          <circle cx="18" cy="18" r="9.4" fill="#E30613"/>
          <path d="M13.6 22.6 18 12.6l4.4 10h-2.1l-2.3-5.6-2.3 5.6h-2.1Z" fill="#fff"/>`, size);
      case 'unionpay':
        return SVGO(`<rect width="36" height="36" rx="8" fill="#fff"/>
          <path d="M5 26 9.4 10h8.2L13.2 26H5Z" fill="#E21836"/>
          <path d="M12.4 26 16.8 10h8.2L20.6 26h-8.2Z" fill="#00447C"/>
          <path d="M19.8 26 24.2 10h8.2L28 26h-8.2Z" fill="#007B84"/>`, size);
      default:
        return SVGO(`<rect width="36" height="36" rx="8" fill="#EDEAE0"/>
          <rect x="7" y="12" width="22" height="12" rx="2.6" fill="#191813" fill-opacity=".55"/>
          <rect x="12" y="16" width="6" height="4" rx="1.4" fill="#fff"/>`, size);
    }
  }

  function bankGlyph(bank) {
    if (!bank) return '';
    const c = bank.tile, c2 = bank.tile2 || c;
    switch (bank.glyph) {
      case 'itau':
        return `<rect width="36" height="36" rx="10" fill="${c}"/>
          <rect x="21.5" y="9.5" width="8" height="8" rx="1.4" fill="${c2}" transform="rotate(45 25.5 13.5)"/>
          <text x="17.6" y="24.4" text-anchor="middle" font-family="Jost,Inter,sans-serif" font-size="10" font-weight="700" fill="#fff">itaú</text>`;
      case 'bb':
        return `<rect width="36" height="36" rx="10" fill="${c}"/>
          <text x="18" y="24.6" text-anchor="middle" font-family="Jost,Inter,sans-serif" font-size="15.5" font-weight="800" fill="${c2}">BB</text>`;
      case 'caixa':
        return `<rect width="36" height="36" rx="10" fill="${c}"/>
          <text x="18" y="23.4" text-anchor="middle" font-family="Jost,Inter,sans-serif" font-size="9.6" font-weight="700" fill="#fff">CAIXA</text>
          <path d="M8.4 27.4h19.2" stroke="${c2}" stroke-width="2.6" stroke-linecap="round"/>`;
      case 'flame':
        return `<rect width="36" height="36" rx="10" fill="${c}"/>
          <path d="M18 8.6c3.4 3.6 6.6 6.4 6.6 10.6a6.6 6.6 0 0 1-13.2 0c0-2.4 1.4-4.2 3-6 .9-.9 1.9-1.9 2.6-3.1.3-.6.6-1.1 1-1.5Z" fill="#fff"/>
          <circle cx="18" cy="20.4" r="3" fill="${c}"/>`;
      case 'handshake':
        return `<rect width="36" height="36" rx="10" fill="${c}"/>
          <path d="M6 21.4c3-3.4 6.6-3.2 8.6-1.2l2.4 2.4 2.4-2.4c2-2 5.6-2.2 8.6 1.2" fill="none" stroke="${c2}" stroke-width="3.2" stroke-linecap="round"/>`;
      default:
        return `<rect width="36" height="36" rx="10" fill="${c}"/>` +
          (bank.text && bank.text.length > 2
            ? `<text x="18" y="22.4" text-anchor="middle" font-family="Jost,Inter,sans-serif" font-size="${bank.text.length > 7 ? 7.6 : bank.text.length > 5 ? 9 : 11.4}" font-weight="700" fill="#fff">${escapeHTML(bank.text)}</text>`
            : `<text x="18" y="24" text-anchor="middle" font-family="Jost,Inter,sans-serif" font-size="14" font-weight="800" fill="#fff">${escapeHTML(bank.text || '')}</text>`);
    }
  }
  const bankLogo = (bankOrId, size = 34) => {
    const bank = typeof bankOrId === 'string' ? BANKS[bankOrId] : bankOrId;
    if (!bank) return '';
    /* tile 60x60 oficial baixado do Figma */
    if (hasAsset('banks', bank.id)) return assetImg('banks', bank.id, size, size);
    return SVGO(bankGlyph(bank).replace(/^<rect width="36" height="36" rx="10"/, '<rect class="bico-bg" width="36" height="36" rx="10"'), size);
  };

  /* --------------------------------------------------------------- badges
     Padrão do arquivo Hotmart: tile de 70x48, canto 5.5 e borda #D9D9D9.
     Onde existe o SVG oficial, ele entra inteiro; onde não existe, montamos
     o mesmo tile com o logo (bandeira ou banco) centralizado.            */
  const BADGE_W = 70, BADGE_H = 48;

  function badgeWrap(inner) {
    return `<span class="pay-badge" style="--pb-w:${BADGE_W};--pb-h:${BADGE_H}">${inner}</span>`;
  }
  function badgeFile(id) {
    return badgeWrap(assetImg('pay', id, BADGE_W, BADGE_H, 'pay-badge-img'));
  }
  function badgeTile(kind, id, size = 34) {
    const inner = kind === 'banks' ? bankLogo(id, size) : brandLogo(id, size);
    return badgeWrap(`<span class="pay-badge-tile">${inner}</span>`);
  }
  /* selo desenhado à mão no mesmo formato, para quem não tem arquivo */
  function badgeArt(paths, opts = {}) {
    const fill = opts.fill || 'white';
    const stroke = opts.stroke || '#D9D9D9';
    return badgeWrap(`<svg class="pay-badge-art" width="${BADGE_W}" height="${BADGE_H}" viewBox="0 0 ${BADGE_W} ${BADGE_H}" aria-hidden="true">
        <rect x=".5" y=".5" width="${BADGE_W - 1}" height="${BADGE_H - 1}" rx="5.5" fill="${fill}" stroke="${stroke}"/>
        ${paths}
      </svg>`);
  }
  const CARD_GLYPH = `
    <rect x="20" y="14" width="30" height="20" rx="3" fill="#191813" fill-opacity=".08" stroke="#191813" stroke-opacity=".55" stroke-width="1.4"/>
    <rect x="20" y="19" width="30" height="4" fill="#191813" fill-opacity=".55"/>
    <rect x="23.5" y="26" width="6" height="4.6" rx="1.2" fill="#191813" fill-opacity=".35"/>`;
  const SAMSUNG_GLYPH = `
    <rect x="13" y="11" width="44" height="26" rx="4" fill="#1428A0"/>
    <text x="35" y="23.5" text-anchor="middle" font-family="Inter,sans-serif" font-size="7.2" font-weight="600" letter-spacing=".2" fill="#fff">SAMSUNG</text>
    <text x="35" y="32.4" text-anchor="middle" font-family="Inter,sans-serif" font-size="7.8" font-weight="700" letter-spacing=".4" fill="#fff">Pay</text>`;
  const D = 'M25 33.6c-.4-.5-.9-.6-1.5-.4l-.32.1c-1.05.35-2.05.05-2.8-.85l-3.1-3.7c-.75-.9-.7-1.95.15-2.85l.92-.95c.42-.45.45-1 .1-1.5l-.16-.22c-.5-.7-.4-1.4.25-1.98l.72-.65c.6-.55 1.3-.5 1.8.2l.18.25c.35.5.9.6 1.42.28l1.2-.72c1-.6 2.05-.4 2.75.5l3 3.8c.75.95.7 2-.2 2.85l-1.1 1.03c-.4.38-.45.9-.14 1.35l.3.44c.5.72.4 1.45-.28 2.02l-.66.55c-.6.5-1.28.43-1.78-.2l-.2-.25Z';
  const BOLETO_GLYPH = `
    <rect x="20" y="14" width="30" height="20" rx="3" fill="#191813" fill-opacity=".06" stroke="#191813" stroke-opacity=".35" stroke-width="1.2"/>
    <path d="M24 19v10M27.6 19v10M31.6 19v7M35 19v10M39 19v10M42.6 19v10M46 19v10" stroke="#191813" stroke-opacity=".7" stroke-width="1.6" stroke-linecap="round"/>`;

  /* ------------------------------------------------------------- métodos */
  /* lista no padrão do checkout Hotmart Brasil (badges de 70x48) */
  const METHODS = [
    {
      id: 'credit_card', label: 'Cartão de crédito', group: 'card',
      note: (n = 12) => `em até ${n}x sem juros`, discount: () => 0,
      badge: badgeArt(CARD_GLYPH),
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2.6"/><path d="M2.5 9.8h19M6 15h4"/></svg>`,
    },
    {
      id: 'debit_card', label: 'Cartão de débito', group: 'card',
      note: () => 'aprovação na hora', discount: () => 0,
      badge: badgeArt(CARD_GLYPH + `<path d="M35 12.5v-4.5m0 0-2.6 2.6m2.6-2.6 2.6 2.6" stroke="#191813" stroke-opacity=".5" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`),
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2.6"/><path d="M2.5 9.8h19M6 14.4h3.4M11.4 14.4h1.6"/></svg>`,
    },
    {
      id: 'pix', label: 'Pix', group: 'instant',
      note: () => 'aprovação imediata', tag: '5% off', discount: () => 0.05,
      badge: badgeFile('pix'),
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l4 4-4 4-4-4 4-4Z"/><path d="M12 13l4 4-4 4-4-4 4-4Z"/><path d="M7 8l-4 4 4 4M17 8l4 4-4 4"/></svg>',
    },
    {
      id: 'boleto', label: 'Boleto bancário', group: 'voucher',
      note: () => 'vence em 3 dias úteis', discount: () => 0,
      badge: hasAsset('pay', 'boleto') ? badgeFile('boleto') : badgeArt(BOLETO_GLYPH),
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 5v14M7.4 5v14M11.6 5v10M15 5v14M18.6 5v14M21 5v14"/></svg>',
    },
    {
      id: 'picpay', label: 'PicPay', group: 'wallet',
      note: () => 'pague pelo app', discount: () => 0.02,
      badge: badgeTile('banks', 'picpay'),
      icon: bankLogo('picpay', 22),
    },
    {
      id: 'mercadopago', label: 'Mercado Pago', group: 'wallet',
      note: () => 'saldo ou cartão', discount: () => 0,
      badge: badgeTile('banks', 'mercadopago'),
      icon: bankLogo('mercadopago', 22),
    },
    {
      id: 'paypal', label: 'PayPal', group: 'wallet',
      note: () => 'conta internacional', discount: () => 0,
      badge: hasAsset('pay', 'paypal') ? badgeFile('paypal') : badgeArt(`<path d="${D}" fill="none"/>`),
      icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M8.6 21.4 9.9 13h3.4c3.2 0 5.3-1.6 5.8-4.4.4-2.4-1.2-3.9-4-3.9H9.4c-.4 0-.6.2-.7.6L6.3 20.4c-.04.3.2.6.5.6h1.8Z" fill="#003087"/><path d="M13.1 21.4 14.4 13h2.6c2.9 0 4.9-1.4 5.4-4 .4-2.2-1-3.6-3.6-3.8h-.5c-.3 0-.5.2-.6.6l-2.3 15.6h-2.3Z" fill="#009CDE" fill-opacity=".9"/></svg>`,
    },
    {
      id: 'google_pay', label: 'Google Pay', group: 'wallet',
      note: () => '1 toque no Android', discount: () => 0,
      badge: hasAsset('pay', 'googlepay') ? badgeFile('googlepay') : badgeArt(''),
      icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M20.6 12.2c0-.6-.05-1.2-.15-1.7H12v3.3h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5Z" fill="#4285F4"/><path d="M12 21c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H3.9v2.3A9 9 0 0 0 12 21Z" fill="#34A853"/><path d="M6.9 13.7a5.4 5.4 0 0 1 0-3.4V8H3.9a9 9 0 0 0 0 8l3-2.3Z" fill="#FBBC04"/><path d="M12 6.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 3.9 8l3 2.3c.7-2.2 2.7-3.7 5.1-3.7Z" fill="#EA4335"/></svg>`,
    },
    {
      id: 'apple_pay', label: 'Apple Pay', group: 'wallet',
      note: () => 'Face ID no iPhone', discount: () => 0,
      badge: hasAsset('pay', 'applepay') ? badgeFile('applepay') : badgeArt(''),
      icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M16.4 12.6c0-2 1.6-3 1.7-3.1-1-1.4-2.4-1.6-2.9-1.6-1.3-.1-2.5.7-3.1.7-.7 0-1.7-.7-2.8-.7-1.4 0-2.8.9-3.5 2.2-1.5 2.6-.4 6.4 1.1 8.5.7 1 1.6 2.1 2.7 2.1 1.1 0 1.5-.7 2.8-.7s1.7.7 2.8.7c1.2 0 2-1.1 2.7-2.1.4-.6.7-1.2.9-1.9-.1 0-2.4-1-2.4-3.6Z" fill="currentColor"/><path d="M14.9 6.3c.6-.7.9-1.7.8-2.7-.9.1-1.9.6-2.5 1.3-.5.6-1 1.6-.8 2.5 1 .1 1.9-.5 2.5-1.1Z" fill="currentColor"/></svg>`,
    },
    {
      id: 'samsung_pay', label: 'Samsung Pay', group: 'wallet',
      note: () => '1 toque no Galaxy', discount: () => 0,
      badge: badgeArt(SAMSUNG_GLYPH),
      icon: `<svg viewBox="0 0 24 24" fill="none"><rect x="2.5" y="6" width="19" height="12" rx="3" fill="#1428A0"/><text x="12" y="14.2" text-anchor="middle" font-family="Inter,sans-serif" font-size="4.6" font-weight="600" fill="#fff">SAMSUNG</text><text x="12" y="18.4" text-anchor="middle" font-family="Inter,sans-serif" font-size="5" font-weight="700" fill="#fff">Pay</text></svg>`,
    },
  ];
  const methodById = id => METHODS.find(m => m.id === id) || null;

  /* faixa "bandeiras aceitas" — usa os arquivos oficiais do Figma */
  const ACCEPTED_BRANDS = ['visa', 'mastercard', 'amex', 'elo', 'hipercard', 'diners'];
  function brandStrip(ids = ACCEPTED_BRANDS) {
    const badges = ids.map(id => {
      if (hasAsset('pay', id)) return `<span class="pay-strip-item">${assetImg('pay', id, 70, 48, 'pay-strip-img')}</span>`;
      if (hasAsset('brands', id)) return `<span class="pay-strip-item">${assetImg('brands', id, 70, 48, 'pay-strip-img')}</span>`;
      return `<span class="pay-strip-item">${badgeTile('brands', id, 30)}</span>`;
    }).join('');
    return `<div class="pay-strip" aria-label="Bandeiras aceitas">${badges}</div>`;
  }

  /* ---------------------------------------------------------------- arte */
  let ccSeq = 0;
  const chipSVG = uid => `<svg viewBox="0 0 44 34" aria-hidden="true">
      <rect x="1" y="1" width="42" height="32" rx="6" fill="url(#chipg${uid})" stroke="rgba(0,0,0,.18)"/>
      <path d="M14 1v32M30 1v32M1 12h42M1 22h42" stroke="rgba(0,0,0,.22)" stroke-width="1.2" fill="none"/>
    </svg>`;
  const chipDefs = uid => `<svg class="vlcc-defs" width="0" height="0" aria-hidden="true"><defs>
        <linearGradient id="chipg${uid}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#F6E7A8"/><stop offset=".45" stop-color="#D9B65C"/><stop offset="1" stop-color="#B98F2E"/>
        </linearGradient>
      </defs></svg>`;
  const CONTACTLESS_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
      <path d="M8.6 7.4a6.4 6.4 0 0 1 0 9.2M12 4.6a10.6 10.6 0 0 1 0 14.8M5.4 10a2.9 2.9 0 0 1 0 4"/>
    </svg>`;

  /* ------------------------------------------------------ cor da arte
     O cartão do banco reconhecido assume um degradê da própria cor,
     como no Google Wallet. Sem segunda cor cadastrada, derivamos um
     tom mais escuro da primeira (nada de cair na paleta da bandeira). */
  function hexToRgb(hex) {
    const h = String(hex || '').replace('#', '');
    const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h.padEnd(6, '0');
    return [parseInt(v.slice(0, 2), 16) || 0, parseInt(v.slice(2, 4), 16) || 0, parseInt(v.slice(4, 6), 16) || 0];
  }
  function mixHex(hex, target, amt) {
    const a = hexToRgb(hex), b = hexToRgb(target), t = clamp(amt, 0, 1);
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  const darkenHex = (hex, amt) => mixHex(hex, '#000000', amt);
  const isLightHex = hex => {
    const [r, g, b] = hexToRgb(hex);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.68;
  };

  /* cartão no estilo "UI Credit Cards": vidro + gradiente + chip + aproximação */
  function cardArt(o = {}) {
    const uid = ++ccSeq;
    const brand = typeof o.brand === 'string' ? BRANDS[o.brand] : (o.brand || BRANDS.unknown);
    const bank = typeof o.bank === 'string' ? BANKS[o.bank] : o.bank;
    const pal = (brand.palette || BRANDS.unknown.palette);
    const num = o.number ? formatNumber(o.number, brand) : (o.last4 ? maskNumberBrand(o.last4, brand) : '•••• •••• •••• ••••');
    const holder = (o.holder || 'NOME NO CARTÃO').toUpperCase();
    const exp = o.exp || 'MM/AA';
    const kindLabel = o.kind === 'debit_card' ? 'Débito' : o.kind === 'credit_card' ? 'Crédito' : '';
    /* com o banco reconhecido, o cartão assume as cores do emissor */
    const bankHex = bank && bank.tile ? bank.tile : null;
    /* um tom só, como no Google Wallet — gradiente suave da cor do banco */
    const gradA = bankHex ? bankHex : pal[0];
    const gradB = bankHex ? darkenHex(bankHex, .4) : (pal[1] || pal[0]);
    const onLight = bankHex ? isLightHex(bankHex) : false;
    /* nome do banco em tipografia limpa: sem chapa/selo de fundo no cartão */
    const issuer = bank ? `<span class="vlcc-bank"><em>${escapeHTML(bank.name)}</em></span>` : '';
    return `<div class="vlcc${o.compact ? ' vlcc--compact' : ''}${bank ? ' vlcc--known' : ''}${onLight ? ' vlcc--onlight' : ''}" data-brand="${brand.id}" data-bank="${bank ? bank.id : ''}"
      style="--cc-a:${gradA};--cc-b:${gradB};--cc-t:${pal[0]};--cc-fg:${onLight ? '#191813' : '#FFFFFF'}">
      ${chipDefs(uid)}
      <span class="vlcc-glow" aria-hidden="true"></span>
      <span class="vlcc-sheen" aria-hidden="true"></span>
      <div class="vlcc-top">
        <span class="vlcc-chip">${chipSVG(uid)}</span>
        <span class="vlcc-nfc">${CONTACTLESS_SVG}</span>
        ${kindLabel ? `<span class="vlcc-kind">${kindLabel}</span>` : ''}
      </div>
      <div class="vlcc-mid">
        <span class="vlcc-issuer">${issuer}</span>
        <span class="vlcc-brand">${brandLogo(brand.id, 38)}</span>
      </div>
      <p class="vlcc-num" aria-label="Número do cartão">${num}</p>
      <div class="vlcc-bottom">
        <span class="vlcc-field"><em>Titular</em><strong>${escapeHTML(holder)}</strong></span>
        <span class="vlcc-field"><em>Validade</em><strong>${escapeHTML(exp)}</strong></span>
      </div>
      <span class="vlcc-shine" aria-hidden="true"></span>
    </div>`;
  }

  /* ------------------------------------------------------------ API final */
  return {
    BRANDS, BRAND_ORDER, BANKS, BIN_BANK, METHODS, ASSETS, ACCEPTED_BRANDS,
    digits, luhn, escapeHTML, clamp, hasAsset, assetSrc, assetImg,
    detectBrand, detectBank, matchRange, normalizeCard,
    formatNumber, maskNumber, maskNumberBrand, formatExp, formatCvv, formatHolder, maxNumberLength,
    validateNumber, validateHolder, validateExp, validateCvv, cardProblems,
    brandLogo, bankLogo, cardArt, methodById, brandStrip,
  };
})();

if (typeof window !== 'undefined') window.VLPAY = VLPAY;
