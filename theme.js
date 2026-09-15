/* ============================================================
   DAVVERO LIMONE — tema claro/escuro
   Segue o sistema por padrão; o botão permite forçar o tema
   e a escolha fica salva no navegador.
   ============================================================ */
'use strict';

(function () {
  const root = document.documentElement;
  const KEY = 'vl_theme';
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  const saved = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const store = v => {
    try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch (e) {}
  };

  const systemTheme = () => (mq && mq.matches ? 'dark' : 'light');
  const resolved = () => {
    const s = saved();
    return (s === 'light' || s === 'dark') ? s : systemTheme();
  };

  function apply(theme) {
    root.dataset.theme = theme;
    /* escolha manual fixa o color-scheme; sem escolha, volta ao automático */
    root.style.colorScheme = saved() ? theme : '';
    const btn = document.getElementById('themeToggle');
    if (btn) btn.setAttribute('aria-pressed', String(theme === 'dark'));
    document.dispatchEvent(new CustomEvent('vl:theme', { detail: { theme } }));
  }

  /* estado inicial — o script inline no <head> já evitou o flash */
  if (!root.dataset.theme) apply(resolved());

  /* acompanha o sistema enquanto o usuário não forçar */
  if (mq) {
    const onChange = () => { if (saved() == null) apply(systemTheme()); };
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
  }

  /* botão de alternância */
  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.setAttribute('aria-pressed', String(resolved() === 'dark'));
    btn.addEventListener('click', () => {
      const next = resolved() === 'dark' ? 'light' : 'dark';
      const commit = () => { store(next); apply(next); };
      const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (document.startViewTransition && !reduce) {
        const r = btn.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        root.style.setProperty('--vt-x', x + 'px');
        root.style.setProperty('--vt-y', y + 'px');
        root.style.setProperty('--vt-r', radius + 'px');
        root.classList.add('vt-theme');
        const vt = document.startViewTransition(commit);
        if (vt && vt.finished) vt.finished.finally(() => root.classList.remove('vt-theme'));
        else root.classList.remove('vt-theme');
      } else {
        commit();
      }
    });
  }
})();
