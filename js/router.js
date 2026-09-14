/**
 * Hash-based router.
 *
 * Hash routing rather than the History API is deliberate: `#/profile` works
 * when index.html is opened straight from disk, whereas pushState URLs would
 * 404 without a server rewrite rule.
 *
 * A view is `function (params, ctx) → HTMLElement`. Views are re-run from
 * scratch on every navigation — there is no diffing, and at this page size
 * a full rebuild is imperceptible and much easier to reason about.
 */
(function (AM) {
  'use strict';

  const routes = {};
  let notFound = null;
  let currentCleanup = null;

  function register(path, view) {
    routes[path] = view;
  }

  function setNotFound(view) {
    notFound = view;
  }

  /** decodeURIComponent that tolerates a truncated escape like "%E0%A". */
  function safeDecode(text) {
    try {
      return decodeURIComponent(text);
    } catch (err) {
      return text;
    }
  }

  /** Parse `#/practice?topic=x&levels=N,H` → { path, params }. */
  function parseHash() {
    const raw = window.location.hash.replace(/^#/, '') || '/';
    const qIndex = raw.indexOf('?');
    const path = qIndex === -1 ? raw : raw.slice(0, qIndex);
    const params = {};
    if (qIndex !== -1) {
      for (const pair of raw.slice(qIndex + 1).split('&')) {
        if (!pair) continue;
        const eq = pair.indexOf('=');
        const key = eq === -1 ? pair : pair.slice(0, eq);
        const value = eq === -1 ? '' : pair.slice(eq + 1);
        params[safeDecode(key)] = safeDecode(value);
      }
    }
    return { path: path === '' ? '/' : path, params: params };
  }

  function navigate(hash, replace) {
    const clean = hash.replace(/^#/, '');
    if (!replace) {
      window.location.hash = clean;
      return;
    }
    // replaceState can throw on file:// in some browsers; falling back to a
    // normal hash change is worse only in that it adds a history entry.
    try {
      window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search + '#' + clean,
      );
      render();
    } catch (err) {
      window.location.hash = clean;
    }
  }

  /** Routes a teacher account has no data for, and so never renders. */
  const STUDENT_ONLY = [
    '/onboarding',
    '/diagnostic',
    '/profile',
    '/learning-path',
    '/theory',
    '/practice',
    '/errors',
    '/classroom',
  ];

  /**
   * Decide which view actually runs, given who is signed in.
   *
   * Three rules, in order:
   *
   *  1. Not signed in → the landing page, whatever was typed in the address
   *     bar. A visitor who arrives on an unexplained password box learns
   *     nothing about the product; `#/login` is the one exception, because
   *     asking for the login form is an explicit request for it.
   *
   *  2. A teacher's home is their class list, and the learner screens are not
   *     offered at all — a teacher account has no diagnostic, no learning path
   *     and no error notebook to render.
   *
   *  3. The admin route is gated. The client-side check here is only about not
   *     drawing a broken page: what genuinely stops a student reading the
   *     roster is `firestore.rules`, which refuses the query itself.
   */
  function resolveView(path) {
    if (!AM.auth.isSignedIn()) {
      return path === '/login' ? AM.views.login : AM.views.landing;
    }

    if (path === '/login' || path === '/landing') {
      // Already signed in — nothing to do on either of those screens.
      return homeFor();
    }

    if (AM.auth.isTeacher()) {
      if (path === '/' || STUDENT_ONLY.indexOf(path) !== -1) return AM.views.teacher;
      return routes[path] || notFound;
    }

    if (path === '/teacher') return homeFor();
    if (path === '/admin' && !AM.auth.isAdmin()) return homeFor();

    return routes[path] || notFound;
  }

  /** Whichever dashboard belongs to the signed-in role. */
  function homeFor() {
    return AM.auth.isTeacher() ? AM.views.teacher : routes['/'];
  }

  function render() {
    const parsed = parseHash();
    const view = resolveView(parsed.path);
    const root = document.getElementById('app');

    // Let the previous view tear down timers/listeners before it's discarded.
    if (typeof currentCleanup === 'function') {
      try {
        currentCleanup();
      } catch (err) {
        console.warn('[router] Lỗi khi dọn dẹp view trước:', err);
      }
      currentCleanup = null;
    }

    let node;
    try {
      const ctx = AM.ui.buildContext();
      const result = view(parsed.params, ctx);
      if (result && result.node) {
        node = result.node;
        currentCleanup = result.cleanup || null;
      } else {
        node = result;
      }
    } catch (err) {
      console.error('[router] View lỗi:', err);
      node = errorScreen(err);
    }

    root.innerHTML = '';
    root.appendChild(node);
    // Tells the boot guard the app is alive, so its watchdog stands down.
    root.setAttribute('data-booted', '1');
    window.scrollTo(0, 0);
  }

  /**
   * Last line of defence: a crashing view shows an explanation and a way out
   * instead of a blank page. The student's data is untouched by the crash.
   */
  function errorScreen(err) {
    const el = AM.util.el;
    return el(
      'div',
      { class: 'main' },
      el(
        'div',
        { class: 'card stack-sm', style: { maxWidth: '38rem', margin: '4rem auto' } },
        el('div', { style: { fontSize: '2.5rem' } }, '😵‍💫'),
        el('h1', { class: 'page-title' }, 'Trang này gặp sự cố'),
        el(
          'p',
          { class: 'muted' },
          'Dữ liệu học tập của bạn vẫn an toàn trên máy. Thử tải lại trang, hoặc quay về trang chính.',
        ),
        el('pre', { class: 'mono', style: { whiteSpace: 'pre-wrap', color: '#9f1239' } },
          String((err && err.message) || err)),
        el(
          'div',
          { class: 'row' },
          el('button', { class: 'btn btn-primary', onclick: () => window.location.reload() }, 'Tải lại'),
          el('a', { class: 'btn btn-ghost', href: '#/' }, 'Về trang chính'),
        ),
      ),
    );
  }

  function start() {
    window.addEventListener('hashchange', render);
    render();
  }

  AM.router = {
    register: register,
    setNotFound: setNotFound,
    navigate: navigate,
    render: render,
    parseHash: parseHash,
    start: start,
  };
})(window.AM);
