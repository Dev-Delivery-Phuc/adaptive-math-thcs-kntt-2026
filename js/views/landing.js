/**
 * Landing page — what a visitor sees before signing in.
 *
 * Deliberately short. The previous version explained all six subsystems in
 * full paragraphs (IRT, BKT, SM-2, the stability model…) and a visitor had to
 * read ~400 words before finding the sign-up button. None of that detail helps
 * someone decide whether to try the site; it only makes the page look busy.
 *
 * What survives: one promise, one picture, three claims of a line each, three
 * steps, one button repeated. Everything the old copy explained is still true
 * and still discoverable — just after signing in, where it is actually useful.
 *
 * The login form lives at `#/login`; every call to action here points at it.
 */
(function (AM) {
  'use strict';

  const U = AM.util;
  const el = U.el;
  const icon = U.icon;

  /** Three claims, one line each. Any longer and this becomes a wall again. */
  const POINTS = [
    ['target', 'Kiểm tra đầu vào', 'Khoảng 30 phút để biết bạn đang vững và hổng ở đâu.'],
    ['map', 'Lộ trình riêng', 'Học đúng phần còn yếu, không cày lại phần đã vững.'],
    ['groups', 'Lớp học của thầy cô', 'Nhập mã lớp để thầy cô theo dõi và hỗ trợ bạn.'],
  ];

  const STEPS = [
    'Tạo tài khoản',
    'Làm bài kiểm tra đầu vào',
    'Học theo lộ trình mỗi ngày',
  ];

  /**
   * A miniature of the real profile screen.
   *
   * This is the one piece of visual weight the page keeps, because it does the
   * job that three paragraphs of copy used to do badly: it shows what the
   * product produces. No prose inside it beyond four topic names.
   */
  function previewCard() {
    const rows = [
      ['Số hữu tỉ', 0.86, 'thanh-thao'],
      ['Tam giác đồng dạng', 0.64, 'kha'],
      ['Căn thức', 0.41, 'dang-hoc'],
      ['Xác suất', 0.23, 'chua-biet'],
    ];

    return el(
      'div',
      { class: 'preview' },
      el('div', { class: 'preview-head' }, 'Hồ sơ năng lực'),
      el(
        'div',
        { class: 'preview-body' },
        rows.map(([label, value, tone]) =>
          el(
            'div',
            { class: 'preview-row' },
            el('span', { class: 'preview-label' }, label),
            el(
              'span',
              { class: 'bar fill-' + tone },
              el('span', { style: { width: Math.round(value * 100) + '%' } }),
            ),
          ),
        ),
      ),
    );
  }

  function hero() {
    return el(
      'section',
      { class: 'landing-hero' },
      el(
        'div',
        {},
        el(
          'h1',
          { class: 'landing-title' },
          'Học Toán THCS đúng chỗ ',
          el('span', { class: 'accent' }, 'bạn còn yếu'),
        ),
        el(
          'p',
          { class: 'landing-lead' },
          'Làm một bài kiểm tra, nhận lộ trình học riêng cho mình.',
        ),
        el(
          'div',
          { class: 'landing-cta' },
          el(
            'a',
            { class: 'btn btn-lime btn-lg', href: '#/login?mode=signup' },
            'Bắt đầu miễn phí',
            icon('trending_flat'),
          ),
          el('a', { class: 'btn btn-outline btn-lg', href: '#/login' }, 'Đăng nhập'),
        ),
        el('p', { class: 'landing-note' }, 'Miễn phí · Dành cho học sinh và giáo viên'),
      ),
      previewCard(),
    );
  }

  function points() {
    return el(
      'section',
      { class: 'landing-points' },
      POINTS.map(([iconName, title, body]) =>
        el(
          'article',
          { class: 'point' },
          el('span', { class: 'point-icon' }, icon(iconName)),
          el('h2', { class: 'point-title' }, title),
          el('p', { class: 'point-body' }, body),
        ),
      ),
    );
  }

  function steps() {
    return el(
      'section',
      { class: 'landing-steps' },
      STEPS.map((label, i) =>
        el(
          'div',
          { class: 'step' },
          el('span', { class: 'step-num' }, String(i + 1)),
          el('span', { class: 'step-label' }, label),
        ),
      ),
    );
  }

  function closing() {
    return el(
      'section',
      { class: 'landing-closing' },
      el('h2', { class: 'closing-title' }, 'Sẵn sàng bắt đầu?'),
      el(
        'a',
        { class: 'btn btn-lime btn-lg', href: '#/login?mode=signup' },
        'Tạo tài khoản',
        icon('trending_flat'),
      ),
    );
  }

  function view() {
    return el(
      'div',
      { class: 'landing' },
      el(
        'header',
        { class: 'landing-nav' },
        el('span', { class: 'landing-brand' }, el('span', { class: 'dot' }, '📐'), 'AdaptiveMath'),
        el(
          'span',
          { class: 'landing-nav-actions' },
          el('a', { class: 'btn btn-ghost btn-sm', href: '#/login' }, 'Đăng nhập'),
          el('a', { class: 'btn btn-primary btn-sm', href: '#/login?mode=signup' }, 'Đăng ký'),
        ),
      ),
      el('main', { class: 'landing-main' }, hero(), points(), steps(), closing()),
      el(
        'footer',
        { class: 'landing-footer' },
        'AdaptiveMath · Toán THCS lớp 6, 7, 8, 9 theo Chương trình GDPT 2018',
      ),
    );
  }

  AM.views = AM.views || {};
  AM.views.landing = view;
})(window.AM);
