/**
 * Shared UI building blocks: app shell, small display primitives, and the
 * question renderers used by both the diagnostic and practice runners.
 */
(function (AM) {
  'use strict';

  const U = AM.util;
  const el = U.el;
  const icon = U.icon;
  const C = AM.const;

  // =========================================================================
  // App context — everything a page needs, derived once per render
  // =========================================================================

  /**
   * Read storage and derive the profile / tree / path in one place.
   *
   * The React build recomputed this inside component bodies, which meant the
   * whole 891-question bank was walked on every re-render. Here each page
   * calls this exactly once when it mounts.
   */
  function buildContext() {
    const profile = AM.store.loadProfile();
    const diagnostic = AM.store.loadDiagnostic();
    const learner = AM.store.loadLearnerState();
    const path = AM.store.loadPath();

    const pool = profile ? AM.bank.getPoolForGrade(profile.grade) : [];

    // Only a *finished* session for the *current* grade counts. A session the
    // student abandoned after zero answers, or one taken for another grade,
    // used to unlock the profile page and generate a learning path from
    // nothing.
    const hasDiagnostic =
      profile !== null &&
      diagnostic !== null &&
      diagnostic.finished === true &&
      diagnostic.grade === profile.grade;

    let knowledge = null;
    let tree = null;
    if (hasDiagnostic) {
      knowledge = AM.profiling.buildKnowledgeProfile(
        diagnostic,
        profile,
        pool,
        AM.topics.TOPICS,
      );
      tree = AM.tree.buildKnowledgeTree(knowledge, learner);
    }

    return {
      profile: profile,
      diagnostic: diagnostic,
      learner: learner,
      path: path,
      pool: pool,
      knowledge: knowledge,
      tree: tree,
      hasProfile: profile !== null,
      hasDiagnostic: hasDiagnostic,
    };
  }

  // =========================================================================
  // Shell
  // =========================================================================

  /**
   * Navigation, per role.
   *
   * A teacher account has no learning data of its own, so offering it a
   * diagnostic or a learning path would be offering something that cannot
   * work. The menus are therefore disjoint rather than one list with items
   * greyed out.
   */
  const STUDENT_NAV = [
    { route: '#/', label: 'Trang chính', icon: 'home' },
    { route: '#/profile', label: 'Hồ sơ năng lực', icon: 'insights' },
    { route: '#/learning-path', label: 'Lộ trình học', icon: 'map' },
    { route: '#/diagnostic', label: 'Kiểm tra đầu vào', icon: 'quiz' },
    { route: '#/digital-tasks', label: 'Nhiệm vụ số', icon: 'task_alt' },
    { route: '#/errors', label: 'Sổ tay lỗi sai', icon: 'error' },
    { route: '#/classroom', label: 'Lớp học', icon: 'groups' },
  ];

  const TEACHER_NAV = [{ route: '#/teacher', label: 'Lớp của tôi', icon: 'groups' }];

  const ADMIN_NAV = [{ route: '#/admin', label: 'Quản trị', icon: 'admin_panel_settings' }];

  function navItems() {
    if (AM.auth.isTeacher()) return TEACHER_NAV;
    if (AM.auth.isAdmin()) return ADMIN_NAV.concat(STUDENT_NAV);
    return STUDENT_NAV;
  }

  function sidebarFootText() {
    if (AM.auth.isTeacher()) {
      return 'Học sinh vào lớp bằng mã lớp. Tiến độ của các em cập nhật sau mỗi buổi luyện tập.';
    }
    return 'Tiến trình học được lưu vào tài khoản của bạn — đăng nhập ở thiết bị khác vẫn thấy đầy đủ.';
  }

  function sidebar(activeRoute) {
    return el(
      'aside',
      { class: 'sidebar' },
      el('div', { class: 'sidebar-brand' }, el('span', { class: 'dot' }, '📐'), 'AdaptiveMath'),
      el(
        'nav',
        { class: 'sidebar-nav' },
        navItems().map((item) =>
          el(
            'a',
            {
              class: U.cn('sidebar-link', activeRoute === item.route && 'is-active'),
              href: item.route,
            },
            icon(item.icon),
            item.label,
          ),
        ),
      ),
      el('div', { class: 'sidebar-foot' }, sidebarFootText()),
    );
  }

  /**
   * Signed-in identity + sign-out, shown on every page.
   *
   * Sign-out wipes the local copy of the learner data, so the next person to
   * use this browser starts clean instead of inheriting someone's diagnostic.
   */
  function userChip() {
    if (!AM.auth.isSignedIn()) return null;

    const role = AM.auth.role();

    return el(
      'div',
      { class: 'user-chip' },
      el('span', { class: 'avatar-dot' }, AM.auth.displayName().trim().charAt(0).toUpperCase()),
      el(
        'span',
        { class: 'user-meta' },
        el('span', { class: 'user-name' }, AM.auth.displayName()),
        el('span', { class: U.cn('user-role', 'is-' + role) }, AM.auth.roleLabel()),
      ),
      el(
        'button',
        {
          class: 'icon-btn',
          title: 'Đăng xuất',
          'aria-label': 'Đăng xuất',
          onclick: async function (e) {
            const btn = e.currentTarget;
            btn.disabled = true;
            try {
              await AM.auth.signOut();
            } catch (err) {
              if (err && err.code === 'unsynced') {
                const proceed = window.confirm(
                  err.message +
                    '\n\nĐăng xuất bây giờ sẽ MẤT phần tiến trình chưa đồng bộ trên máy này. ' +
                    'Bấm Huỷ để thử lại khi có mạng, hoặc OK để đăng xuất và bỏ phần đó.',
                );
                if (proceed) {
                  try {
                    await AM.auth.signOut({ force: true });
                    return;
                  } catch (err2) {
                    err = err2;
                  }
                }
              }
              btn.disabled = false;
              if (!(err && err.code === 'unsynced')) {
                window.alert('Không đăng xuất được: ' + AM.fb.describeError(err));
              }
            }
          },
        },
        icon('logout'),
      ),
    );
  }

  function topbar(title, actions) {
    const list = (actions || []).slice();
    const chip = userChip();
    if (chip) list.push(chip);

    return el(
      'header',
      { class: 'topbar' },
      el('div', { class: 'topbar-title' }, title),
      el('div', { class: 'topbar-actions' }, list),
    );
  }

  /**
   * Standard page shell. `opts.bare` skips the sidebar/topbar — used by the
   * diagnostic and practice runners, which want the full screen.
   */
  function page(opts, ...children) {
    const activeRoute = opts.activeRoute || '#/';
    if (opts.bare) {
      return el('div', { class: 'layout' }, el('div', { class: 'main' }, el('div', { class: 'main-inner' }, children)));
    }
    return el(
      'div',
      { class: 'layout' },
      sidebar(activeRoute),
      el(
        'main',
        {},
        topbar(opts.title || 'AdaptiveMath', opts.actions),
        el('div', { class: 'main' }, el('div', { class: 'main-inner stack' }, children)),
      ),
    );
  }

  function homeButton() {
    return el(
      'a',
      { class: 'icon-btn', href: '#/', title: 'Trang chính', 'aria-label': 'Trang chính' },
      icon('home'),
    );
  }

  // =========================================================================
  // Display primitives
  // =========================================================================

  function pill(text, tone, iconName) {
    return el(
      'span',
      { class: U.cn('pill', tone && (tone.indexOf('tone-') === 0 ? tone : 'pill-' + tone)) },
      iconName ? icon(iconName, 'pill-icon') : null,
      text,
    );
  }

  function bar(value, fillClass) {
    const w = Math.round(U.clamp(value, 0, 1) * 100);
    return el(
      'div',
      { class: U.cn('bar', fillClass && 'fill-' + fillClass) },
      el('span', { style: { width: w + '%' } }),
    );
  }

  function statTile(value, label) {
    return el(
      'div',
      { class: 'stat-tile' },
      el('div', { class: 'value' }, value),
      el('div', { class: 'label' }, label),
    );
  }

  function banner(kind, ...children) {
    const iconName =
      kind === 'warn' ? 'warning' : kind === 'error' ? 'error' : 'info';
    return el('div', { class: 'banner banner-' + kind }, icon(iconName), el('div', {}, children));
  }

  function empty(emoji, title, message, action) {
    return el(
      'div',
      { class: 'empty' },
      el('div', { class: 'big' }, emoji),
      el('div', {}, el('h3', { class: 'card-title', style: { justifyContent: 'center' } }, title),
        message ? el('p', { class: 'muted', style: { marginTop: '0.35rem' } }, message) : null),
      action || null,
    );
  }

  function sectionCard(title, subtitle, ...children) {
    return el(
      'section',
      { class: 'card stack-sm' },
      el(
        'div',
        {},
        el('h2', { class: 'card-title' }, title),
        subtitle ? el('p', { class: 'muted-sm', style: { marginTop: '0.25rem' } }, subtitle) : null,
      ),
      children,
    );
  }

  function footerNote() {
    return el('div', { class: 'footer-note' }, 'Nurturing Human Potential');
  }

  /** Mastery band chip for a 0..1 value. */
  function bandChip(mastery) {
    const bandId = AM.profiling.classifyBand(mastery);
    return pill(AM.profiling.bandLabel(bandId) + ' · ' + U.pct(mastery), 'tone-' + bandId);
  }

  function levelChip(level) {
    const tones = { N: 'green', H: 'sky', V: 'amber', T: 'rose', unknown: 'violet' };
    return pill(C.LEVEL_LABELS[level] || level, tones[level] || 'green');
  }

  // =========================================================================
  // Question rendering
  // =========================================================================

  /**
   * Render one question with its answer controls.
   *
   * `state.answer` holds the current answer (string for mcq/shortans, array of
   * booleans for tf). `onChange(answer)` fires on every edit; the caller owns
   * submission. When `state.reveal` is true the controls become read-only and
   * show which options were right.
   */
  function questionCard(question, state, onChange) {
    const reveal = !!state.reveal;
    const nodes = [];

    // --- Header: level + source ---
    nodes.push(
      el(
        'div',
        { class: 'row', style: { marginBottom: '1rem' } },
        levelChip(question.level),
        pill(
          question.type === 'mcq'
            ? 'Trắc nghiệm'
            : question.type === 'tf'
              ? 'Đúng / Sai'
              : 'Trả lời ngắn',
          'green',
        ),
        question.source ? el('span', { class: 'muted-sm' }, question.source) : null,
      ),
    );

    // --- Prompt ---
    nodes.push(AM.latex.render(question.prompt, 'qprompt'));

    // --- Answer controls ---
    if (question.type === 'mcq') {
      nodes.push(
        el(
          'div',
          { class: 'choices' },
          question.options.map(function (opt) {
            const selected = state.answer === opt.label;
            const cls = U.cn(
              'choice',
              selected && !reveal && 'is-selected',
              reveal && opt.isCorrect && 'is-correct',
              reveal && selected && !opt.isCorrect && 'is-wrong',
            );
            return el(
              'button',
              {
                type: 'button',
                class: cls,
                disabled: reveal,
                onclick: function () {
                  if (!reveal) onChange(opt.label);
                },
              },
              el('span', { class: 'key' }, opt.label),
              // <span>, not <div>: only phrasing content is valid in a button.
              AM.latex.render(opt.content, 'grow', 'span'),
            );
          }),
        ),
      );
    } else if (question.type === 'tf') {
      const current = Array.isArray(state.answer)
        ? state.answer.slice()
        : question.statements.map(() => null);

      nodes.push(
        el(
          'div',
          { class: 'choices' },
          question.statements.map(function (stmt, idx) {
            const value = current[idx];
            const correct = reveal && value === stmt.isTrue;
            const wrong = reveal && value !== null && value !== stmt.isTrue;

            const mkBtn = (label, boolValue, activeClass) =>
              el(
                'button',
                {
                  type: 'button',
                  class: U.cn(value === boolValue && activeClass),
                  disabled: reveal,
                  onclick: function () {
                    if (reveal) return;
                    const next = current.slice();
                    next[idx] = boolValue;
                    onChange(next);
                  },
                },
                label,
              );

            return el(
              'div',
              {
                class: U.cn(
                  'tf-row',
                  correct && 'is-correct',
                  wrong && 'is-wrong',
                ),
              },
              el('span', { class: 'key' }, stmt.label),
              el('div', { class: 'stmt' }, AM.latex.render(stmt.content, '')),
              el(
                'div',
                { class: 'tf-toggle' },
                mkBtn('Đúng', true, 'on-true'),
                mkBtn('Sai', false, 'on-false'),
              ),
              reveal
                ? pill(stmt.isTrue ? 'Đ' : 'S', stmt.isTrue ? 'green' : 'rose')
                : null,
            );
          }),
        ),
      );
    } else if (question.type === 'shortans') {
      const input = el('input', {
        class: 'field',
        type: 'text',
        inputmode: 'decimal',
        placeholder: 'Nhập đáp án…',
        value: typeof state.answer === 'string' ? state.answer : '',
        disabled: reveal,
        oninput: function (e) {
          onChange(e.target.value);
        },
      });
      nodes.push(
        el(
          'div',
          { style: { marginTop: '1.35rem', maxWidth: '22rem' } },
          el('label', { class: 'field-label' }, 'Đáp án của bạn'),
          input,
          reveal
            ? el(
                'p',
                { class: 'muted-sm', style: { marginTop: '0.5rem' } },
                'Đáp án đúng: ',
                el('strong', {}, question.correctAnswer),
              )
            : null,
        ),
      );
    }

    return el('div', { class: 'qbox' }, nodes);
  }

  /** Collapsible solution, shown after an answer is revealed. */
  function solutionBlock(question) {
    if (!question.solution) return null;
    return el(
      'details',
      { class: 'debug', style: { marginTop: '1rem' } },
      el('summary', {}, 'Xem lời giải'),
      AM.latex.render(question.solution, 'qprompt'),
    );
  }

  /** An empty answer for a question type — what "not answered yet" looks like. */
  function blankAnswer(question) {
    if (question.type === 'tf') return question.statements.map(() => null);
    return '';
  }

  /** Has the student supplied anything at all? */
  function hasAnswer(question, answer) {
    if (question.type === 'tf') {
      return Array.isArray(answer) && answer.every((v) => v === true || v === false);
    }
    return typeof answer === 'string' && answer.trim() !== '';
  }

  // =========================================================================
  // Charts
  // =========================================================================

  /**
   * Radar chart of chapter mastery, drawn as inline SVG.
   * `series` is [{ label, value }]; values are 0..1.
   */
  function radarChart(series, target) {
    const size = 320;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 58;
    const n = series.length;
    if (n < 3) return null;

    const angleFor = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
    const pointAt = (i, value) => {
      const a = angleFor(i);
      const r = radius * U.clamp(value, 0, 1);
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    };

    const svgNS = 'http://www.w3.org/2000/svg';
    const mk = (tag, attrs) => {
      const node = document.createElementNS(svgNS, tag);
      for (const k of Object.keys(attrs)) node.setAttribute(k, String(attrs[k]));
      return node;
    };

    const svg = mk('svg', { viewBox: '0 0 ' + size + ' ' + size, width: size, height: size });

    // Concentric grid rings.
    for (const ring of [0.25, 0.5, 0.75, 1]) {
      const pts = series
        .map((_, i) => pointAt(i, ring).join(','))
        .join(' ');
      svg.appendChild(
        mk('polygon', {
          points: pts,
          fill: 'none',
          stroke: 'rgba(0,53,39,0.10)',
          'stroke-width': 1,
        }),
      );
    }

    // Target ring.
    if (typeof target === 'number') {
      svg.appendChild(
        mk('polygon', {
          points: series.map((_, i) => pointAt(i, target).join(',')).join(' '),
          fill: 'none',
          stroke: '#b2f746',
          'stroke-width': 2,
          'stroke-dasharray': '4 4',
        }),
      );
    }

    // Spokes.
    for (let i = 0; i < n; i++) {
      const [x, y] = pointAt(i, 1);
      svg.appendChild(
        mk('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: 'rgba(0,53,39,0.10)', 'stroke-width': 1 }),
      );
    }

    // Data polygon.
    svg.appendChild(
      mk('polygon', {
        points: series.map((s, i) => pointAt(i, s.value).join(',')).join(' '),
        fill: 'rgba(6,78,59,0.18)',
        stroke: '#064e3b',
        'stroke-width': 2,
        'stroke-linejoin': 'round',
      }),
    );

    // Vertices + labels.
    for (let i = 0; i < n; i++) {
      const [px, py] = pointAt(i, series[i].value);
      svg.appendChild(mk('circle', { cx: px, cy: py, r: 3.5, fill: '#064e3b' }));

      const [lx, ly] = pointAt(i, 1.19);
      const text = mk('text', {
        x: lx,
        y: ly,
        'text-anchor': lx < cx - 8 ? 'end' : lx > cx + 8 ? 'start' : 'middle',
        'dominant-baseline': 'middle',
        'font-size': 9.5,
        'font-weight': 700,
        fill: '#2b6954',
      });
      const label = series[i].label;
      text.textContent = label.length > 16 ? label.slice(0, 15) + '…' : label;
      svg.appendChild(text);
    }

    return el('div', { class: 'radar-wrap' }, svg);
  }

  /** Month calendar with practised days highlighted. */
  function miniCalendar(practiceDates) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const todayStr = U.todayVNStr();

    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Monday-first index.
    const leading = (firstDay.getDay() + 6) % 7;

    const cells = [];
    for (const h of ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']) {
      cells.push(el('div', { class: 'cell head' }, h));
    }
    for (let i = 0; i < leading; i++) cells.push(el('div', { class: 'cell' }, ''));

    for (let d = 1; d <= daysInMonth; d++) {
      const iso =
        year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      cells.push(
        el(
          'div',
          {
            class: U.cn(
              'cell',
              practiceDates.has(iso) && 'done',
              iso === todayStr && 'today',
            ),
          },
          String(d),
        ),
      );
    }

    return el('div', { class: 'cal' }, cells);
  }

  AM.ui = {
    buildContext: buildContext,
    page: page,
    sidebar: sidebar,
    topbar: topbar,
    homeButton: homeButton,
    userChip: userChip,
    pill: pill,
    bar: bar,
    statTile: statTile,
    banner: banner,
    empty: empty,
    sectionCard: sectionCard,
    footerNote: footerNote,
    bandChip: bandChip,
    levelChip: levelChip,
    questionCard: questionCard,
    solutionBlock: solutionBlock,
    blankAnswer: blankAnswer,
    hasAnswer: hasAnswer,
    radarChart: radarChart,
    miniCalendar: miniCalendar,
  };
})(window.AM);
