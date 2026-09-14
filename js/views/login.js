/**
 * Sign-in / registration screen.
 *
 * One form, three modes: đăng nhập, đăng ký, quên mật khẩu.
 *
 * Registration asks for a role, student or teacher, because the two use
 * completely different halves of the app and guessing wrong would strand
 * someone on the wrong dashboard. There is deliberately no "admin" option:
 * a role the browser can pick is not a role — see the note in `core/auth.js`
 * about how admin is granted.
 */
(function (AM) {
  'use strict';

  const U = AM.util;
  const el = U.el;
  const ui = AM.ui;

  function view(params) {
    const container = el('div', {});

    // The landing page links here with ?mode=signup for its "create account"
    // buttons, so the form opens on the step the visitor actually asked for.
    const requested = params && params.mode;
    const initialMode =
      requested === 'signup' || requested === 'reset' ? requested : 'signin';

    const form = {
      mode: initialMode, // 'signin' | 'signup' | 'reset'
      role: 'student', // only consulted when mode === 'signup'
      email: '',
      password: '',
      name: '',
      busy: false,
      error: null,
      notice: null,
    };

    function setMode(mode) {
      form.mode = mode;
      form.error = null;
      form.notice = null;
      render();
    }

    async function submit() {
      form.error = null;
      form.notice = null;

      if (!form.email.trim()) {
        form.error = 'Bạn chưa nhập email.';
        return render();
      }
      if (form.mode !== 'reset' && form.password.length < 6) {
        form.error = 'Mật khẩu cần ít nhất 6 ký tự.';
        return render();
      }

      form.busy = true;
      render();

      try {
        if (form.mode === 'reset') {
          await AM.auth.resetPassword(form.email);
          form.mode = 'signin';
          form.notice =
            'Đã gửi email đặt lại mật khẩu tới ' + form.email.trim() + '. Kiểm tra hộp thư.';
        } else if (form.mode === 'signup') {
          await AM.auth.register(form.email, form.password, form.name, form.role);
          // onAuthStateChanged takes over from here and boots the app.
          return;
        } else {
          await AM.auth.signIn(form.email, form.password);
          return;
        }
      } catch (err) {
        form.error = AM.fb.describeError(err);
      } finally {
        form.busy = false;
        render();
      }
    }

    function field(label, type, key, placeholder, autocomplete) {
      const input = el('input', {
        class: 'field',
        type: type,
        value: form[key],
        placeholder: placeholder || '',
        autocomplete: autocomplete || 'off',
        disabled: form.busy,
        oninput: function (e) {
          form[key] = e.target.value;
        },
        onkeydown: function (e) {
          if (e.key === 'Enter' && !form.busy) submit();
        },
      });
      return el('div', {}, el('label', { class: 'field-label' }, label), input);
    }

    /**
     * Role picker, shown only when registering.
     *
     * Two large targets rather than a <select>: this is the one decision on the
     * form that cannot be changed afterwards without an admin, so it should
     * look like a decision instead of a dropdown someone tabs past.
     */
    function rolePicker() {
      const OPTIONS = [
        ['student', 'school', 'Học sinh', 'Học theo lộ trình riêng, tham gia lớp bằng mã.'],
        ['teacher', 'groups', 'Giáo viên', 'Tạo lớp, theo dõi và hỗ trợ học sinh.'],
      ];

      return el(
        'div',
        {},
        el('label', { class: 'field-label' }, 'Bạn là'),
        el(
          'div',
          { class: 'role-picker' },
          OPTIONS.map(([value, iconName, title, body]) =>
            el(
              'button',
              {
                type: 'button',
                class: U.cn('role-option', form.role === value && 'is-selected'),
                'aria-pressed': form.role === value ? 'true' : 'false',
                disabled: form.busy,
                onclick: function () {
                  form.role = value;
                  render();
                },
              },
              el('span', { class: 'role-option-icon' }, U.icon(iconName)),
              el('span', { class: 'role-option-title' }, title),
              el('span', { class: 'role-option-body' }, body),
            ),
          ),
        ),
      );
    }

    function render() {
      const isSignup = form.mode === 'signup';
      const isReset = form.mode === 'reset';

      const title = isSignup
        ? 'Tạo tài khoản'
        : isReset
          ? 'Đặt lại mật khẩu'
          : 'Đăng nhập';

      const subtitle = isSignup
        ? 'Chọn vai trò của bạn, phần còn lại chỉ mất một phút.'
        : isReset
          ? 'Nhập email đã đăng ký, hệ thống sẽ gửi liên kết đặt lại mật khẩu.'
          : 'Đăng nhập để tiếp tục.';

      const submitLabel = isSignup
        ? 'Tạo tài khoản'
        : isReset
          ? 'Gửi email đặt lại'
          : 'Đăng nhập';

      const body = el(
        'div',
        { class: 'auth-card stack-sm' },
        el('div', { class: 'auth-logo' }, '📐'),
        el('h1', { class: 'page-title' }, title),
        el('p', { class: 'muted', style: { lineHeight: 1.65 } }, subtitle),

        !AM.fb.isReady()
          ? ui.banner(
              'error',
              el('strong', {}, 'Không kết nối được Firebase. '),
              AM.fb.initError() || 'Kiểm tra kết nối mạng rồi tải lại trang.',
            )
          : null,

        form.error ? ui.banner('error', form.error) : null,
        form.notice ? ui.banner('info', form.notice) : null,

        isSignup ? rolePicker() : null,
        isSignup ? field('Họ tên', 'text', 'name', 'Nguyễn Văn A', 'name') : null,
        field('Email', 'email', 'email', 'ban@example.com', 'email'),
        isReset
          ? null
          : field(
              'Mật khẩu',
              'password',
              'password',
              'Ít nhất 6 ký tự',
              isSignup ? 'new-password' : 'current-password',
            ),

        el(
          'button',
          {
            class: 'btn btn-primary btn-block',
            disabled: form.busy || !AM.fb.isReady(),
            onclick: submit,
          },
          form.busy ? U.icon('autorenew', 'spin') : null,
          form.busy ? 'Đang xử lý…' : submitLabel,
        ),

        el(
          'div',
          { class: 'auth-links' },
          isSignup
            ? el(
                'button',
                { class: 'link-btn', onclick: () => setMode('signin') },
                'Đã có tài khoản? Đăng nhập',
              )
            : el(
                'button',
                { class: 'link-btn', onclick: () => setMode('signup') },
                'Chưa có tài khoản? Đăng ký',
              ),
          !isReset && !isSignup
            ? el(
                'button',
                { class: 'link-btn', onclick: () => setMode('reset') },
                'Quên mật khẩu?',
              )
            : null,
          isReset
            ? el(
                'button',
                { class: 'link-btn', onclick: () => setMode('signin') },
                '← Quay lại đăng nhập',
              )
            : null,
        ),

        el(
          'a',
          { class: 'link-btn', href: '#/landing', style: { display: 'inline-block' } },
          '← Về trang giới thiệu',
        ),
      );

      U.mount(
        container,
        el(
          'div',
          { class: 'auth-screen' },
          body,
          el(
            'p',
            { class: 'auth-foot' },
            'AdaptiveMath · Nền tảng học Toán THCS lớp 6, 7, 8, 9 theo Chương trình GDPT 2018',
          ),
        ),
      );
    }

    render();
    return container;
  }

  AM.views = AM.views || {};
  AM.views.login = view;
})(window.AM);
