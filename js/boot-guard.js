/**
 * Boot guard — makes a failed start-up visible instead of silent.
 *
 * Loaded before everything else. It does three things:
 *
 *   1. Records every uncaught error and rejected promise from the moment the
 *      page starts parsing, including syntax errors in files that load later.
 *   2. Refuses to run on file://, where Firebase Auth cannot work, and says so
 *      with the exact command to fix it.
 *   3. Runs a watchdog: if nothing has rendered a few seconds after load, it
 *      replaces the "Đang khởi động…" placeholder with a diagnostic screen
 *      listing what actually went wrong.
 *
 * Without this, any error before the first render leaves the user staring at a
 * placeholder with no clue — which is exactly the failure this file exists to
 * prevent.
 */
(function () {
  'use strict';

  const errors = [];
  const WATCHDOG_MS = 6000;

  window.addEventListener('error', function (event) {
    errors.push({
      kind: event.message && event.filename ? 'script' : 'resource',
      message: event.message || 'Không tải được tài nguyên',
      source: event.filename || (event.target && (event.target.src || event.target.href)) || '',
      line: event.lineno || 0,
      column: event.colno || 0,
    });
  }, true);

  window.addEventListener('unhandledrejection', function (event) {
    const reason = event.reason;
    errors.push({
      kind: 'promise',
      message: (reason && (reason.message || reason.code)) || String(reason),
      source: '',
      line: 0,
      column: 0,
    });
  });

  function isFileProtocol() {
    return window.location.protocol === 'file:';
  }

  function markBooted() {
    const root = document.getElementById('app');
    if (root) root.setAttribute('data-booted', '1');
  }

  function hasBooted() {
    const root = document.getElementById('app');
    return !root || root.getAttribute('data-booted') === '1';
  }

  // ---------------------------------------------------------------------------
  // Diagnostic screens (plain HTML strings — this file must not depend on
  // anything else having loaded successfully)
  // ---------------------------------------------------------------------------

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function shell(title, bodyHtml) {
    const root = document.getElementById('app');
    if (!root) return;
    root.setAttribute('data-booted', '1');
    root.innerHTML =
      '<div class="auth-screen"><div class="auth-card" style="max-width:34rem">' +
      '<div class="auth-logo">📐</div>' +
      '<h1 class="page-title" style="font-size:1.5rem">' + esc(title) + '</h1>' +
      bodyHtml +
      '</div></div>';
  }

  function showFileProtocolScreen() {
    shell(
      'Cần chạy qua web server',
      '<p class="muted" style="line-height:1.7;margin-top:.75rem">' +
        'Bạn đang mở trang bằng đường dẫn <code class="mono">file://</code>. ' +
        'Firebase không cho phép đăng nhập từ đây, nên trang sẽ không hoạt động.' +
        '</p>' +
        '<p class="muted" style="line-height:1.7;margin-top:.75rem">' +
        'Mở <b>Command Prompt</b> hoặc <b>PowerShell</b> tại thư mục dự án rồi chạy một trong hai lệnh:' +
        '</p>' +
        '<pre class="mono" style="background:#f4f7f5;padding:.85rem 1rem;border-radius:.75rem;overflow-x:auto;margin-top:.5rem">' +
        'python -m http.server 8080\n\nhoặc\n\nnpx serve .' +
        '</pre>' +
        '<p class="muted" style="line-height:1.7;margin-top:.75rem">' +
        'Sau đó mở <a href="http://localhost:8080">http://localhost:8080</a>. ' +
        'Bản đã deploy lên Cloudflare Pages cũng chạy bình thường.' +
        '</p>',
    );
  }

  /**
   * "X is not a function" on our own namespace almost always means the browser
   * mixed a fresh file with a cached older one. Say so, and say how to fix it,
   * because the raw TypeError gives the user nothing to act on.
   */
  function looksLikeStaleCache() {
    return errors.some(function (e) {
      return /is not a function|undefined is not/i.test(e.message || '');
    });
  }

  function staleCacheNotice() {
    if (!looksLikeStaleCache()) return '';
    return (
      '<div class="banner banner-warn" style="margin-top:1rem;display:block">' +
      '<b>Nhiều khả năng đây là lỗi bộ nhớ đệm.</b><br>' +
      'Trình duyệt đang trộn file mới với file cũ đã lưu. Nhấn ' +
      '<b>Ctrl + Shift + R</b> (Windows) hoặc <b>Cmd + Shift + R</b> (Mac) để tải lại toàn bộ. ' +
      'Nếu vẫn lỗi, vào Cloudflare Pages → project → <i>Deployments</i> và kiểm tra bản deploy mới nhất đã hoàn tất chưa.' +
      '</div>'
    );
  }

  function showDiagnosticScreen() {
    let list = '';
    if (errors.length === 0) {
      list =
        '<p class="muted" style="line-height:1.7">' +
        'Không bắt được lỗi JavaScript nào, nghĩa là trang đã dừng khi đang chờ ' +
        'Firebase trả lời. Thường là do mạng chặn <code class="mono">gstatic.com</code>, ' +
        'hoặc chưa bật Firestore / Authentication trong Firebase Console.' +
        '</p>';
    } else {
      list =
        '<p class="muted" style="line-height:1.7">Các lỗi đã ghi nhận:</p><ul style="line-height:1.7;padding-left:1.1rem;color:#9f1239">' +
        errors
          .map(function (e) {
            const where = e.source
              ? '<br><span class="mono" style="font-size:.78rem;color:#6b7d75">' +
                esc(e.source.split('/').slice(-2).join('/')) +
                (e.line ? ':' + e.line : '') +
                '</span>'
              : '';
            return '<li>' + esc(e.message) + where + '</li>';
          })
          .join('') +
        '</ul>';
    }

    const env =
      '<details class="debug" style="margin-top:1rem"><summary>Thông tin môi trường</summary>' +
      '<pre class="mono" style="white-space:pre-wrap;margin-top:.5rem">' +
      esc(
        'URL      : ' + window.location.href + '\n' +
          'Protocol : ' + window.location.protocol + '\n' +
          'Firebase : ' + (typeof window.firebase === 'undefined' ? 'CHƯA TẢI ĐƯỢC' : 'đã tải') + '\n' +
          'KaTeX    : ' + (typeof window.katex === 'undefined' ? 'chưa tải' : 'đã tải') + '\n' +
          'Câu hỏi  : ' +
          (window.AM_QUESTION_BANK ? window.AM_QUESTION_BANK.totalCount + ' câu' : 'CHƯA TẢI ĐƯỢC') + '\n' +
          'Module AM: ' + (window.AM ? Object.keys(window.AM).join(', ') : 'KHÔNG CÓ'),
      ) +
      '</pre></details>';

    shell(
      'Ứng dụng không khởi động được',
      list +
        staleCacheNotice() +
        env +
        '<div class="row" style="margin-top:1.25rem">' +
        '<button class="btn btn-primary" onclick="window.location.reload(true)">Tải lại trang</button>' +
        '</div>',
    );
  }

  // ---------------------------------------------------------------------------
  // Watchdog
  // ---------------------------------------------------------------------------

  function arm() {
    if (isFileProtocol()) {
      showFileProtocolScreen();
      return;
    }
    window.setTimeout(function () {
      if (!hasBooted()) showDiagnosticScreen();
    }, WATCHDOG_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arm);
  } else {
    arm();
  }

  window.AM_BOOT = {
    errors: errors,
    markBooted: markBooted,
    hasBooted: hasBooted,
    isFileProtocol: isFileProtocol,
    showDiagnosticScreen: showDiagnosticScreen,
    /** Render an arbitrary fatal message through the same shell. */
    fatal: function (title, message) {
      shell(
        title,
        '<p class="muted" style="line-height:1.7;margin-top:.75rem">' + esc(message) + '</p>' +
          '<div class="row" style="margin-top:1.25rem">' +
          '<button class="btn btn-primary" onclick="window.location.reload()">Tải lại trang</button>' +
          '</div>',
      );
    },
  };
})();
