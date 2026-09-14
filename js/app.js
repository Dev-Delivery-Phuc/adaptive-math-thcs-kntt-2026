/**
 * Entry point: wire the routes, resolve who is signed in, then start routing.
 *
 * Loaded last, after every core module and view has registered itself on the
 * `AM` namespace (see the script order in index.html).
 */
(function (AM) {
  'use strict';

  const R = AM.router;
  const V = AM.views;

  R.register('/', V.home);
  R.register('/landing', V.landing);
  R.register('/login', V.login);
  R.register('/admin', V.admin);
  R.register('/teacher', V.teacher);
  R.register('/classroom', V.classroom);
  R.register('/onboarding', V.onboarding);
  R.register('/diagnostic', V.diagnostic);
  R.register('/profile', V.profile);
  R.register('/learning-path', V.learningPath);
  R.register('/theory', V.theory);
  R.register('/practice', V.practice);
  R.register('/errors', V.errors);
  R.register('/digital-tasks', V.digitalTasks);

  /**
   * Anything unrecognised shows the dashboard for whichever role is signed in.
   *
   * The URL is normalised directly rather than through `navigate()`: this runs
   * *inside* a render pass, and re-entering the router here would mount the
   * home page only for the outer pass to overwrite it.
   */
  R.setNotFound(function (params, ctx) {
    const teacher = AM.auth.isTeacher();
    try {
      window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search + (teacher ? '#/teacher' : '#/'),
      );
    } catch (err) {
      // Some browsers refuse replaceState on file:// — a stale hash is
      // cosmetic, so carry on and render the dashboard anyway.
    }
    return teacher ? V.teacher(params, ctx) : V.home(params, ctx);
  });

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------

  function splash(message, detail) {
    const el = AM.util.el;
    const root = document.getElementById('app');
    root.innerHTML = '';
    root.appendChild(
      el(
        'div',
        { class: 'auth-screen' },
        el(
          'div',
          { class: 'auth-card stack-sm' },
          el('div', { class: 'auth-logo' }, '📐'),
          el('h1', { class: 'page-title' }, message),
          detail ? el('p', { class: 'muted', style: { lineHeight: 1.65 } }, detail) : null,
        ),
      ),
    );
  }

  /** Warn visibly if the browser blocked localStorage entirely. */
  function storageWorks() {
    try {
      const probe = '__am_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch (err) {
      return false;
    }
  }

  async function boot() {
    if (!storageWorks()) {
      splash(
        'Trình duyệt đang chặn bộ nhớ cục bộ',
        'AdaptiveMath lưu tiến trình học trong localStorage. Hãy tắt chế độ ẩn danh ' +
          'hoặc cho phép lưu dữ liệu cho trang này, rồi tải lại.',
      );
      return;
    }

    // Wait for Firebase to report whether anybody is signed in, so no page ever
    // renders in an "unknown user" state.
    await AM.auth.init();

    if (AM.auth.isSignedIn()) {
      splash('Đang tải dữ liệu học tập…', 'Sắp xong.');
      await AM.sync.pull(AM.auth.currentUser().uid);
      AM.sync.start(AM.auth.currentUser().uid);
    }

    /**
     * React to later sign-ins and sign-outs. Pulling on sign-in is what makes a
     * fresh browser show the account's existing progress instead of an empty
     * dashboard.
     */
    let syncedUid = AM.auth.isSignedIn() ? AM.auth.currentUser().uid : null;
    AM.auth.onChange(async function (state) {
      if (state.user) {
        // `onChange` also fires for profile edits such as joining a class.
        // Only a *different* account is a sign-in worth a splash and a pull;
        // re-pulling on every profile change wiped the screen mid-action.
        if (state.user.uid !== syncedUid) {
          syncedUid = state.user.uid;
          // Cover the pull with a splash. Without it the login form just sits
          // there for a second or two after a successful submit, which reads
          // as "nothing happened" and invites a second click.
          splash('Đang tải dữ liệu học tập…', 'Sắp xong.');
          await AM.sync.pull(state.user.uid);
          AM.sync.start(state.user.uid);
        }
      } else {
        syncedUid = null;
        AM.sync.stop();
      }
      R.render();
    });

    R.start();
  }

  /**
   * Never let a start-up failure end as a blank page. Anything thrown here
   * goes to the boot guard's diagnostic screen, which also lists the errors it
   * captured while the scripts were loading.
   */
  async function safeBoot() {
    // file:// is handled by the boot guard, which shows how to run a server.
    if (window.AM_BOOT && window.AM_BOOT.isFileProtocol()) return;
    try {
      await boot();
    } catch (err) {
      console.error('[app] Khởi động thất bại:', err);
      if (window.AM_BOOT) {
        window.AM_BOOT.fatal(
          'Ứng dụng không khởi động được',
          (err && err.message) || String(err),
        );
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      void safeBoot();
    });
  } else {
    void safeBoot();
  }
})(window.AM);
