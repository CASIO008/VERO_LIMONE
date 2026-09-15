/* ============================================================
   DAVVERO LIMONE — carteira de cartões (VLWallet)
   ------------------------------------------------------------
   · Slots no estilo Google Wallet: os cartões salvos viram uma
     trilha deslizável; o escolhido sobe e ganha destaque. Com mais
     de um cartão aparecem pontos e as setas do teclado navegam.
   · Crédito e débito têm trilhas separadas (abas).
   · Ao digitar, a bandeira e o banco emissor são reconhecidos na
     hora (VLPAY) e o cartão de pré-visualização se atualiza — a
     experiência de "adicionar cartão" do Google Wallet.
   · O número completo e o CVV nunca saem da memória do formulário:
     o que é salvo é token + bin6 + last4 + bandeira + banco + validade.

   VLWallet.mount(el, opções) → renderiza
   VLWallet.selection()       → o que o checkout deve usar
   VLWallet.reset()           → limpa o formulário
   ============================================================ */
'use strict';

const VLWallet = (() => {

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const esc = s => (window.VLPAY ? VLPAY.escapeHTML(s) : String(s ?? ''));

  const listeners = new Set();
  const state = {
    mounted: false,
    kind: 'credit_card',
    lockedKind: false,
    allowSave: true,
    allowManage: true,
    showInstallments: false,
    total: 0,
    selectedId: null,
    form: { number: '', holder: '', exp: '', cvv: '', cpf: '', save: true },
    problems: {},
    installments: 1,
    formOpen: false,
    busy: false,
    guestTokenCard: null,   // visitante: token vive só aqui, na memória
  };

  const sel = () => ({
    kind: state.kind,
    methodId: state.selectedId,
    card: cards().find(c => c.id === state.selectedId) || null,
    installments: state.kind === 'credit_card' ? state.installments : 1,
    save: state.form.save,
    form: { ...state.form },
  });
  function emit() { listeners.forEach(fn => { try { fn(sel()); } catch (e) { console.error(e); } }); }

  /* cartões salvos + o cartão da sessão (visitante ou "não salvar").
     O de sessão vive só na memória: nunca vai para o armazenamento. */
  const savedCards = () => (window.VLAuth ? VLAuth.wallet.filter(c => c.kind === state.kind) : []);
  const guestCard = () => (state.guestTokenCard && state.guestTokenCard.kind === state.kind ? state.guestTokenCard : null);
  const cards = () => {
    const g = guestCard();
    return g ? savedCards().concat([{ ...g, kind: state.kind }]) : savedCards();
  };
  const isGuestCard = id => !!(guestCard() && guestCard().id === id);
  const cardOf = id => cards().find(c => c.id === id) || null;
  const hasAnyCard = () => cards().length > 0;

  /* limpa os campos do cartão (o PAN não fica na memória depois de usar) */
  function resetFormFields() {
    state.form = { number: '', holder: '', exp: '', cvv: '', cpf: '', save: state.form.save };
  }

  /* ------------------------------------------------------ trilha de slots */
  function railHTML() {
    const list = cards();
    const items = list.map((c, i) => {
      const active = c.id === state.selectedId;
      const guest = isGuestCard(c.id) || c.guest === true;
      const tag = guest ? 'Não salvo' : (c.isDefault ? 'Principal' : '');
      return `<button type="button" class="wl-slot${active ? ' is-active' : ''}${guest ? ' is-guest' : ''}" role="radio"
                aria-checked="${active}" data-slot="${esc(c.id)}" data-index="${i}"
                aria-label="${esc(c.brandName || 'Cartão')} terminando em ${esc(c.last4)}${guest ? ', usado só nesta compra' : (c.isDefault ? ', principal' : '')}">
          ${VLPAY.cardArt({ brand: c.brandId, bank: c.bankId, last4: c.last4, holder: c.holder, exp: `${String(c.expMonth).padStart(2, '0')}/${String(c.expYear).slice(-2)}`, kind: c.kind, compact: true })}
          ${tag ? `<span class="wl-slot-cap${guest ? ' is-guest' : ''}">${tag}</span>` : ''}
          <span class="wl-slot-check" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>
          </span>
        </button>`;
    });
    const add = `<button type="button" class="wl-slot wl-slot--add${state.formOpen ? ' is-active' : ''}"
                    data-add role="radio" aria-checked="${state.formOpen}" aria-label="Adicionar novo cartão">
        <span class="wl-add-plus" aria-hidden="true">+</span>
        <span class="wl-add-text">${list.length ? 'Outro cartão' : 'Novo cartão'}</span>
      </button>`;
    const dots = list.length > 1
      ? `<div class="wl-dots" role="tablist" aria-label="Cartões salvos">
           ${list.map((c, i) => `<button type="button" class="wl-dot${c.id === state.selectedId ? ' is-active' : ''}" data-dot="${esc(c.id)}" role="tab" aria-selected="${c.id === state.selectedId}" aria-label="Cartão ${i + 1}"></button>`).join('')}
         </div>`
      : '';
    return `<div class="wl-rail-wrap">
        <div class="wl-rail" data-rail role="radiogroup" aria-label="Cartões salvos">${items.join('')}${add}</div>
      </div>${dots}`;
  }

  /* -------------------------------------------------------------- preview
     Com o formulário fechado, mostra o cartão escolhido; enquanto o
     usuário digita, mostra o cartão sendo montado em tempo real.        */
  function previewHTML() {
    const P = window.VLPAY;
    const f = state.form;
    const chosen = (!state.formOpen && !state.busy) ? cardOf(state.selectedId) : null;
    if (chosen) {
      const validade = `${String(chosen.expMonth).padStart(2, '0')}/${String(chosen.expYear).slice(-2)}`;
      const guest = isGuestCard(chosen.id) || chosen.guest === true;
      /* com o formulário fechado mostramos apenas o RESUMO do cartão escolhido.
         A arte do cartão vive no slot da trilha — nada de cartão duplicado. */
      return `<div class="wl-preview wl-preview--chosen" data-preview>
          <div class="wl-chosen">
            <span class="wl-chosen-label">Cartão selecionado</span>
            <strong>${esc(chosen.brandName || 'Cartão')}${chosen.bankName ? ' · ' + esc(chosen.bankName) : ''} •••• ${esc(chosen.last4)}</strong>
            <em>Validade ${validade}${guest ? ' · usado só nesta compra' : (chosen.isDefault ? ' · principal' : '')}</em>
          </div>
          <div class="wl-recognize" data-recognize>
            <span class="wl-chip-brand">${P.brandLogo(chosen.brandId, 26)}<em>${esc(chosen.brandName)}</em></span>
            ${chosen.bankId ? `<span class="wl-chip-bank">${P.bankLogo(chosen.bankId, 26)}<em>${esc(chosen.bankName)}</em></span>` : ''}
          </div>
        </div>`;
    }
    const brand = P.detectBrand(f.number);
    const bank = P.detectBank(f.number);
    const number = P.digits(f.number).length >= 2 ? f.number : '';
    return `<div class="wl-preview" data-preview>
        ${P.cardArt({ brand, bank, number, holder: f.holder, exp: f.exp || 'MM/AA', kind: state.kind })}
        <div class="wl-recognize" data-recognize>
          ${P.digits(f.number).length >= 4 ? `
            <span class="wl-chip-brand">${P.brandLogo(brand.id, 26)}<em>${esc(brand.name)}</em></span>
            ${bank ? `<span class="wl-chip-bank">${P.bankLogo(bank, 26)}<em>${esc(bank.name)}</em></span>` : '<span class="wl-chip-bank is-empty"><em>banco não identificado</em></span>'}
          ` : '<span class="wl-chip-hint">Digite o número e a bandeira aparece sozinha</span>'}
        </div>
      </div>`;
  }

  /* --------------------------------------------------------------- painel */
  function panelHTML() {
    const P = window.VLPAY;
    const card = cardOf(state.selectedId);
    const list = cards();
    const showForm = state.formOpen || !list.length;
    const tabs = `<div class="wl-tabs" role="tablist" aria-label="Tipo de cartão">
        ${[['credit_card', 'Crédito'], ['debit_card', 'Débito']].map(([id, label]) => `
          <button type="button" class="wl-tab${state.kind === id ? ' is-active' : ''}" data-kind="${id}"
            role="tab" aria-selected="${state.kind === id}"${state.lockedKind ? ' disabled' : ''}>${label}
            <em data-count="${id}">${(window.VLAuth ? VLAuth.wallet.filter(c => c.kind === id).length : 0) || ''}</em>
          </button>`).join('')}
      </div>`;

    const guest = card ? isGuestCard(card.id) : false;
    const actions = (!showForm && card) ? `
      <div class="wl-actions">
        ${guest
          ? '<span class="wl-actions-note">Cartão usado só nesta compra — não fica guardado.</span>'
          : (state.allowManage && !card.isDefault ? `<button type="button" class="btn btn-ghost sm" data-default="${esc(card.id)}">Tornar principal</button>` : '')}
        ${state.allowManage ? `<button type="button" class="btn btn-ghost sm danger" data-remove="${esc(card.id)}">${guest ? 'Descartar' : 'Remover'}</button>` : ''}
        <button type="button" class="btn btn-ghost sm" data-edit>Trocar cartão</button>
      </div>` : '';

    const form = showForm ? formHTML() : '';

    return `${tabs}${railHTML()}${actions}${form}`;
  }

  function formHTML() {
    const f = state.form;
    const P = window.VLPAY;
    const brand = P.detectBrand(f.number);
    const cvvLen = brand.cvv.length === 1 ? brand.cvv[0] : (brand.id === 'amex' ? 4 : 3);
    const logged = window.VLAuth && VLAuth.logged;
    const err = k => state.problems[k] ? `<small class="wl-error">${esc(state.problems[k])}</small>` : '';
    const installments = state.showInstallments && state.kind === 'credit_card' ? `
      <label class="ck-field wl-field-inst">
        <span>Parcelas</span>
        <select data-input="installments">${installmentOptions()}</select>
      </label>` : '';
    return `<form class="wl-form" data-form novalidate autocomplete="off">
      <div class="wl-form-grid">
        <div class="ck-field wl-field-num${state.problems.number ? ' is-invalid' : ''}">
          <span>Número do cartão</span>
          <div class="wl-num-wrap">
            <input type="text" inputmode="numeric" data-input="number" value="${esc(f.number)}"
              placeholder="0000 0000 0000 0000" autocomplete="cc-number" aria-label="Número do cartão" />
            <span class="wl-num-brand" data-num-brand>${P.digits(f.number).length >= 2 ? P.brandLogo(brand.id, 28) : ''}</span>
          </div>
          ${err('number')}
        </div>
        <div class="ck-field wl-field-holder${state.problems.holder ? ' is-invalid' : ''}">
          <span>Nome impresso no cartão</span>
          <input type="text" data-input="holder" value="${esc(f.holder)}" placeholder="COMO ESTÁ NO CARTÃO"
            autocomplete="cc-name" aria-label="Nome impresso no cartão" />
          ${err('holder')}
        </div>
        <div class="wl-form-row">
          <div class="ck-field${state.problems.exp ? ' is-invalid' : ''}">
            <span>Validade</span>
            <input type="text" inputmode="numeric" data-input="exp" value="${esc(f.exp)}" placeholder="MM/AA" autocomplete="cc-exp" aria-label="Validade" />
            ${err('exp')}
          </div>
          <div class="ck-field wl-field-cvv${state.problems.cvv ? ' is-invalid' : ''}">
            <span>CVV</span>
            <input type="text" inputmode="numeric" data-input="cvv" value="${esc(f.cvv)}" placeholder="${'•'.repeat(cvvLen)}" maxlength="${cvvLen}"
              autocomplete="cc-csc" aria-label="Código de segurança" />
            ${err('cvv')}
          </div>
          ${installments}
        </div>
        <div class="ck-field wl-field-cpf">
          <span>CPF do titular <em>(opcional)</em></span>
          <input type="text" inputmode="numeric" data-input="cpf" value="${esc(f.cpf)}" placeholder="000.000.000-00" aria-label="CPF do titular" />
        </div>
      </div>
      <div class="wl-form-foot">
        <label class="wl-save${logged ? '' : ' is-off'}">
          <input type="checkbox" data-input="save" ${f.save && logged ? 'checked' : ''} ${logged ? '' : 'disabled'} />
          <span>
            <strong>Salvar este cartão</strong>
            <em>${logged
              ? 'Guardamos só a bandeira, o banco, os 4 últimos dígitos e a validade.'
              : 'Entre na sua conta para salvar. Agora o cartão vale só para esta compra.'}</em>
          </span>
        </label>
        <div class="wl-secure">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v6c0 4.2-2.9 7.4-7 9-4.1-1.6-7-4.8-7-9V6l7-3Z"/><path d="M9.2 12.2l2 2 3.6-3.8"/></svg>
          <span>Ambiente seguro · o número completo e o CVV <strong>não são guardados</strong>.</span>
        </div>
        <div class="wl-form-actions">
          ${cards().length ? '<button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>' : ''}
          <button type="button" class="btn btn-dark" data-submit ${state.busy ? 'disabled' : ''}>
            ${state.busy ? 'Processando…' : (cards().length ? 'Adicionar cartão' : 'Adicionar cartão')}
          </button>
        </div>
      </div>
    </form>`;
  }

  function installmentOptions() {
    const total = Number(state.total || 0);
    const opts = [];
    for (let n = 1; n <= 12; n++) {
      const value = total > 0 ? total / n : null;
      const label = n === 1
        ? (value ? `À vista — ${money(value)}` : 'À vista')
        : (value ? `${n}x de ${money(value)} sem juros` : `${n}x sem juros`);
      opts.push(`<option value="${n}"${n === state.installments ? ' selected' : ''}>${label}</option>`);
    }
    return opts.join('');
  }
  /* usa o formatador do data.js quando existir (mesma moeda do site) */
  const money = v => {
    try { return brl(v); } catch (e) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); }
  };

  /* ------------------------------------------------------------- montagem */
  let root = null;
  let opts = {};
  let authBound = false;

  function mount(el, options = {}) {
    if (!el) return;
    root = typeof el === 'string' ? $(el) : el;
    opts = options;
    state.mounted = true;
    state.kind = options.kind || state.kind;
    state.lockedKind = !!options.lockedKind;
    state.allowSave = options.allowSave !== false;
    state.allowManage = options.allowManage !== false;
    state.showInstallments = !!options.showInstallments;
    state.total = Number(options.total || 0);
    listeners.clear();
    if (options.onChange) listeners.add(options.onChange);
    /* escolhe o padrão da trilha — e só abre o formulário se não houver
       nenhum cartão (salvo ou da sessão) para escolher */
    if (!state.selectedId) autoSelect();
    if (options.openForm === true) state.formOpen = true;
    else if (hasAnyCard()) state.formOpen = false;
    render();
    if (!authBound && window.VLAuth) {
      authBound = true;
      VLAuth.onChange(() => { syncSelection(); render(); });
    }
    return api;
  }

  function syncSelection() {
    const list = cards();
    if (state.selectedId && !list.some(c => c.id === state.selectedId)) {
      const def = list.find(c => c.isDefault) || list[0];
      state.selectedId = def ? def.id : null;
      if (!state.selectedId) state.formOpen = true;
    }
  }

  /* escolhe o cartão padrão da trilha atual (usado ao montar e ao trocar de aba) */
  function autoSelect() {
    const list = cards();
    const def = list.find(c => c.isDefault) || list[0];
    state.selectedId = def ? def.id : null;
    state.formOpen = !def;
    return def;
  }

  function render() {
    if (!root) return;
    const scrollLeft = (() => { const r = $('[data-rail]', root); return r ? r.scrollLeft : 0; })();
    root.innerHTML = `<div class="wl" data-kind="${state.kind}">${panelHTML()}${previewHTML()}</div>`;
    bind();
    const rail = $('[data-rail]', root);
    if (rail && scrollLeft) rail.scrollLeft = scrollLeft;
    focusActiveSlot();
    emit();
  }

  function focusActiveSlot() {
    const rail = $('[data-rail]', root);
    if (!rail) return;
    const slot = rail.scrollWidth > rail.clientWidth + 4;
    if (slot) rail.classList.add('is-scrollable');
  }

  function updateLive() {
    if (!root) return;
    const P = window.VLPAY;
    const f = state.form;
    const brand = P.detectBrand(f.number);
    const cvvLen = brand.cvv.length === 1 ? brand.cvv[0] : (brand.id === 'amex' ? 4 : 3);
    const prev = $('[data-preview]', root);
    if (prev) prev.outerHTML = previewHTML();
    const numBrand = $('[data-num-brand]', root);
    if (numBrand) numBrand.innerHTML = P.digits(f.number).length >= 2 ? P.brandLogo(brand.id, 28) : '';
    const cvv = $('[data-input="cvv"]', root);
    if (cvv) {
      cvv.maxLength = cvvLen;
      cvv.placeholder = '•'.repeat(cvvLen);
    }
    $$('[data-count="credit_card"], [data-count="debit_card"]', root).forEach(el2 => {
      const n = window.VLAuth ? VLAuth.wallet.filter(c => c.kind === el2.dataset.count).length : 0;
      el2.textContent = n || '';
    });
  }

  function setError(field, msg) {
    if (!root) return;
    if (msg) state.problems[field] = msg; else delete state.problems[field];
    const input = $(`[data-input="${field}"]`, root);
    if (!input) return;
    const box = input.closest('.ck-field');
    if (!box) return;
    box.classList.toggle('is-invalid', !!msg);
    let small = $('.wl-error', box);
    if (msg) {
      if (!small) { small = document.createElement('small'); small.className = 'wl-error'; box.appendChild(small); }
      small.textContent = msg;
    } else if (small) small.remove();
  }

  /* -------------------------------------------------------------- eventos */
  function bind() {
    if (!root) return;
    const P = window.VLPAY;

    $$('.wl-tabs [data-kind]', root).forEach(tab => tab.addEventListener('click', () => {
      if (state.lockedKind || tab.classList.contains('is-active')) return;
      state.kind = tab.dataset.kind;
      state.installments = 1;
      autoSelect();
      render();
      if (opts.onKindChange) opts.onKindChange(state.kind);
    }));

    $$('[data-slot]', root).forEach(slot => {
      const pick = () => {
        state.selectedId = slot.dataset.slot;
        state.formOpen = false;
        state.guestTokenCard = null;
        render();
      };
      slot.addEventListener('click', pick);
      slot.addEventListener('keydown', e => {
        const rail = $('[data-rail]', root);
        const slots = $$('[data-slot],[data-add]', rail);
        const i = slots.indexOf(slot);
        if (e.key === 'ArrowRight' && i < slots.length - 1) { e.preventDefault(); slots[i + 1].focus(); slots[i + 1].click(); }
        if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); slots[i - 1].focus(); slots[i - 1].click(); }
      });
    });
    const add = $('[data-add]', root);
    if (add) add.addEventListener('click', () => { state.formOpen = true; render(); const n = $('[data-input="number"]', root); if (n) n.focus(); });

    $$('[data-dot]', root).forEach(dot => dot.addEventListener('click', () => {
      state.selectedId = dot.dataset.dot; state.formOpen = false; render();
    }));
    const edit = $('[data-edit]', root);
    if (edit) edit.addEventListener('click', () => { state.formOpen = true; render(); });
    const cancel = $('[data-cancel]', root);
    if (cancel) cancel.addEventListener('click', () => { state.formOpen = false; state.problems = {}; render(); });

    $$('[data-default]', root).forEach(btn => btn.addEventListener('click', async () => {
      btn.disabled = true;
      try { await VLAuth.setDefaultCard(btn.dataset.default); } catch (e) { toast(e.message); }
      render();
    }));
    $$('[data-remove]', root).forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.dataset.remove;
      /* cartão da sessão: basta esquecer (nada foi guardado) */
      if (isGuestCard(id)) {
        state.guestTokenCard = null;
        state.selectedId = null;
        syncSelection();
        render();
        toast('Cartão descartado.');
        return;
      }
      if (!confirm('Remover este cartão da sua conta?')) return;
      btn.disabled = true;
      try { await VLAuth.removeCard(id); } catch (e) { toast(e.message); }
      state.selectedId = null;
      syncSelection();
      render();
    }));

    /* digitação → máscara + reconhecimento imediato */
    const bindInput = (field, formatter) => {
      const input = $(`[data-input="${field}"]`, root);
      if (!input) return;
      if (formatter) {
        const pos = input.selectionStart;
        const before = input.value.length;
        input.value = formatter(input.value);
        if (input.value.length !== before && pos != null) {
          const delta = input.value.length - before;
          try { input.setSelectionRange(pos + delta, pos + delta); } catch {}
        }
      }
      input.addEventListener('input', () => {
        const caret = input.selectionStart;
        const raw = input.value;
        if (formatter) {
          input.value = formatter(raw);
          if (input.value.length !== raw.length && caret != null) {
            const delta = input.value.length - raw.length;
            try { input.setSelectionRange(caret + delta, caret + delta); } catch {}
          }
        }
        state.form[field] = input.value;
        if (state.problems[field]) setError(field, null);
        updateLive();
      });
      input.addEventListener('blur', () => validateField(field, true));
    };

    bindInput('number', v => P.formatNumber(v, P.detectBrand(v)));
    bindInput('holder', v => P.formatHolder(v));
    bindInput('exp', v => P.formatExp(v));
    bindInput('cvv', v => P.formatCvv(v, (() => { const b = P.detectBrand(state.form.number); return b.cvv.length === 1 ? b.cvv[0] : (b.id === 'amex' ? 4 : 3); })()));
    bindInput('cpf', v => { const d = P.digits(v).slice(0, 11); return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); });

    const save = $('[data-input="save"]', root);
    if (save) save.addEventListener('change', () => { state.form.save = save.checked; emit(); });
    const inst = $('[data-input="installments"]', root);
    if (inst) inst.addEventListener('change', () => { state.installments = Number(inst.value) || 1; emit(); });

    const form = $('[data-form]', root);
    if (form) form.addEventListener('submit', e => { e.preventDefault(); submit(); });
    const submit = $('[data-submit]', root);
    if (submit) submit.addEventListener('click', () => submitCard());
    if (form) form.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submitCard(); } });
  }

  function validateField(field, show) {
    const P = window.VLPAY;
    const f = state.form;
    let msg = null;
    if (field === 'number') { const r = P.validateNumber(f.number, P.detectBrand(f.number)); if (r !== true) msg = r; }
    if (field === 'holder') { const r = P.validateHolder(f.holder); if (r !== true) msg = r; }
    if (field === 'exp') { const r = P.validateExp(f.exp); if (r !== true) msg = r; }
    if (field === 'cvv') { const r = P.validateCvv(f.cvv, P.detectBrand(f.number)); if (r !== true) msg = r; }
    if (field === 'cpf' && P.digits(f.cpf).length && P.digits(f.cpf).length !== 11) msg = 'CPF incompleto.';
    if (show || msg) setError(field, msg);
    return !msg;
  }

  async function submitCard() {
    if (state.busy) return;
    const P = window.VLPAY;
    const f = state.form;
    const fields = ['number', 'holder', 'exp', 'cvv', 'cpf'];
    const okAll = fields.map(k => validateField(k, true)).every(Boolean);
    if (!okAll) {
      const first = $('.ck-field.is-invalid input', root);
      if (first) first.focus();
      if (opts.onInvalid) opts.onInvalid(state.problems);
      return;
    }
    state.busy = true;
    render();
    try {
      const payload = { kind: state.kind, number: P.digits(f.number), holder: f.holder, exp: f.exp, cvv: P.digits(f.cvv), cpf: P.digits(f.cpf) };
      const last4 = P.digits(payload.number).slice(-4);
      if (window.VLAuth && VLAuth.logged && state.form.save && state.allowSave) {
        const out = await VLAuth.saveCard(payload);
        state.busy = false;
        state.formOpen = false;
        state.problems = {};
        const list = cards();
        /* se já existia, seleciona o que estava guardado */
        const chosen = (out && out.duplicated ? list.find(c => c.last4 === last4) : null)
          || list.find(c => c.last4 === last4)
          || list.find(c => c.isDefault) || list[list.length - 1] || list[0];
        state.selectedId = chosen ? chosen.id : null;
        resetFormFields();
        if (out && out.duplicated) toast('Esse cartão já estava na sua conta.');
        else toast('Cartão adicionado.');
        render();
      } else {
        /* visitante (ou "não salvar"): guarda só o suficiente para a compra,
           aqui na memória — nada vai para o armazenamento do navegador */
        const brand = P.detectBrand(payload.number);
        const bank = P.detectBank(payload.number);
        state.guestTokenCard = {
          id: 'guest_' + Math.random().toString(16).slice(2),
          kind: state.kind, brandId: brand.id, brandName: brand.name,
          bankId: bank ? bank.id : null, bankName: bank ? bank.name : null,
          bin6: P.digits(payload.number).slice(0, 6), last4,
          expMonth: Number(f.exp.slice(0, 2)), expYear: 2000 + Number(f.exp.slice(2)),
          holder: f.holder, token: 'tok_mem_' + Math.random().toString(16).slice(2),
          isDefault: true, guest: true,
          label: `${brand.name}${bank ? ' ' + bank.name : ''} •••• ${last4}`,
        };
        state.selectedId = state.guestTokenCard.id;
        state.busy = false;
        state.formOpen = false;
        state.problems = {};
        resetFormFields();
        toast('Cartão pronto para esta compra.');
        render();
      }
      if (opts.onSaved) opts.onSaved(sel());
    } catch (err) {
      state.busy = false;
      if (err.problems) {
        Object.entries(err.problems).forEach(([k, v]) => setError(k, v));
      } else if (err.code === 'email_taken') {
        toast(err.message);
      } else {
        toast(err.message || 'Não foi possível salvar o cartão.');
      }
      render();
    }
  }

  function toast(msg) {
    if (typeof window.toast === 'function') return window.toast(msg);
    if (opts.onToast) return opts.onToast(msg);
    console.warn(msg);
  }

  const api = {
    mount,
    selection: sel,
    reset() { resetFormFields(); state.problems = {}; state.guestTokenCard = null; state.selectedId = null; render(); },
    refresh() { syncSelection(); render(); },
    setTotal(v) { state.total = Number(v || 0); if (root) render(); },
    setKind(kind) { state.kind = kind; state.selectedId = null; state.formOpen = !cards().length; render(); },
    get state() { return sel(); },
    _internal: state,
  };
  return api;
})();

if (typeof window !== 'undefined') window.VLWallet = VLWallet;
