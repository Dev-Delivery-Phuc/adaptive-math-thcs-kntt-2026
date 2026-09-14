/**
 * Admin roster — every student account and how far along they are.
 *
 * Reads only the `users` collection. Each student's progress summary is
 * denormalised onto their own user document by `core/sync.js`, so listing a
 * class of 40 costs one query rather than 40 document reads — and the admin
 * never needs read access to anyone's raw learner data.
 *
 * Sorting and filtering happen in memory: a Firestore `where` combined with an
 * `orderBy` on a different field would demand a composite index for no real
 * benefit at this size.
 */
(function (AM) {
  'use strict';

  const U = AM.util;
  const el = U.el;
  const ui = AM.ui;
  const C = AM.const;

  // Both were private helpers here until the teacher class view needed the same
  // behaviour; they now live in core/util.js.
  const tsToDate = U.toDate;
  const relativeTime = U.relativeTime;

  /** Firestore retries reads for a very long time; fail visibly instead. */
  const READ_TIMEOUT_MS = 15000;

  function view(params, ctx) {
    if (!AM.auth.isAdmin()) {
      return ui.page(
        { title: 'Quản trị', activeRoute: '#/admin', actions: [ui.homeButton()] },
        ui.empty(
          '🔒',
          'Không có quyền truy cập',
          'Trang này chỉ dành cho tài khoản quản trị.',
          el('a', { class: 'btn btn-primary', href: '#/' }, 'Về trang chính'),
        ),
      );
    }

    const container = el('div', {});

    const state = {
      loading: true,
      error: null,
      rows: [],
      gradeFilter: 'all',
      sortBy: 'lastActive',
      search: '',
    };

    async function load() {
      state.loading = true;
      state.error = null;
      render();

      if (!AM.fb.isReady()) {
        state.loading = false;
        state.error = AM.fb.initError() || 'Firebase chưa sẵn sàng.';
        return render();
      }

      try {
        const snap = await AM.sync.withTimeout(
          AM.fb.db().collection(AM.fb.PATHS.users).get(),
          READ_TIMEOUT_MS,
          'Tải danh sách tài khoản',
        );
        state.rows = snap.docs.map(function (doc) {
          const d = doc.data() || {};
          return {
            uid: doc.id,
            email: d.email || '',
            displayName: d.displayName || '',
            role: ['student', 'teacher', 'admin'].indexOf(d.role) !== -1 ? d.role : 'student',
            className: d.className || null,
            grade: d.grade || null,
            goal: d.goal || null,
            dailyMinutes: d.dailyMinutes || null,
            hasDiagnostic: d.hasDiagnostic === true,
            xp: d.xp || 0,
            level: d.level || 0,
            currentStreak: d.currentStreak || 0,
            longestStreak: d.longestStreak || 0,
            masteredTopics: d.masteredTopics || 0,
            totalQuestions: d.totalQuestions || 0,
            totalSessions: d.totalSessions || 0,
            unresolvedErrors: d.unresolvedErrors || 0,
            createdAt: tsToDate(d.createdAt),
            lastActiveAt: tsToDate(d.lastActiveAt) || tsToDate(d.lastLoginAt),
          };
        });
        state.loading = false;
      } catch (err) {
        state.loading = false;
        state.error = AM.fb.describeError(err);
      }
      render();
    }

    function visibleRows() {
      let rows = state.rows.filter((r) => r.role === 'student');

      if (state.gradeFilter !== 'all') {
        rows = rows.filter((r) => r.grade === Number(state.gradeFilter));
      }
      const q = state.search.trim().toLowerCase();
      if (q) {
        rows = rows.filter(
          (r) =>
            r.email.toLowerCase().indexOf(q) !== -1 ||
            r.displayName.toLowerCase().indexOf(q) !== -1,
        );
      }

      const sorters = {
        lastActive: (a, b) =>
          (b.lastActiveAt ? b.lastActiveAt.getTime() : 0) -
          (a.lastActiveAt ? a.lastActiveAt.getTime() : 0),
        xp: (a, b) => b.xp - a.xp,
        mastered: (a, b) => b.masteredTopics - a.masteredTopics,
        streak: (a, b) => b.currentStreak - a.currentStreak,
        name: (a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email),
      };
      return rows.sort(sorters[state.sortBy] || sorters.lastActive);
    }

    function studentRow(r) {
      const goal = C.GOAL_OPTIONS.find((g) => g.value === r.goal);
      const totalTopics = r.grade ? AM.topics.getTopicsByGrade(r.grade).length : 0;
      const ratio = totalTopics > 0 ? r.masteredTopics / totalTopics : 0;

      return el(
        'div',
        { class: 'list-row admin-row' },
        el(
          'span',
          { class: 'avatar-dot' },
          (r.displayName || r.email || '?').trim().charAt(0).toUpperCase(),
        ),
        el(
          'span',
          { class: 'grow' },
          el(
            'span',
            { class: 'title', style: { display: 'block' } },
            r.displayName || r.email.split('@')[0],
          ),
          el(
            'span',
            { class: 'muted-sm' },
            r.email +
              ' · ' +
              (r.grade ? C.GRADE_LABELS[r.grade] : 'chưa chọn lớp') +
              (goal ? ' · ' + goal.label : '') +
              ' · hoạt động ' +
              relativeTime(r.lastActiveAt),
          ),
        ),
        el(
          'span',
          { class: 'admin-metrics' },
          r.hasDiagnostic
            ? ui.pill(r.masteredTopics + '/' + totalTopics + ' thành thạo', 'green')
            : ui.pill('chưa kiểm tra đầu vào', 'amber'),
          ui.pill('Lv' + r.level + ' · ' + r.xp + ' XP', 'lime'),
          r.currentStreak > 0 ? ui.pill('🔥 ' + r.currentStreak + ' ngày', 'rose') : null,
          ui.pill(r.totalQuestions + ' câu', 'sky'),
          r.unresolvedErrors > 0
            ? ui.pill(r.unresolvedErrors + ' lỗi chưa sửa', 'amber')
            : null,
        ),
        el('span', { class: 'admin-bar' }, ui.bar(ratio, 'kha')),
      );
    }

    function summaryTiles(rows) {
      const students = state.rows.filter((r) => r.role === 'student');
      const active7d = students.filter(
        (r) => r.lastActiveAt && Date.now() - r.lastActiveAt.getTime() < 7 * 86400000,
      ).length;
      const diagnosed = students.filter((r) => r.hasDiagnostic).length;
      const totalQ = students.reduce((s, r) => s + r.totalQuestions, 0);

      return el(
        'section',
        { class: 'grid-3' },
        ui.statTile(String(students.length), 'Tài khoản học sinh'),
        ui.statTile(String(active7d), 'Hoạt động trong 7 ngày'),
        ui.statTile(diagnosed + '/' + students.length, 'Đã làm kiểm tra đầu vào'),
        ui.statTile(String(totalQ), 'Tổng câu đã làm'),
        ui.statTile(String(rows.length), 'Đang hiển thị'),
        ui.statTile(
          String(state.rows.filter((r) => r.role === 'teacher').length),
          'Tài khoản giáo viên',
        ),
      );
    }

    function filterBar() {
      const gradeSelect = el(
        'select',
        {
          class: 'field',
          style: { width: 'auto' },
          onchange: function (e) {
            state.gradeFilter = e.target.value;
            render();
          },
        },
        el('option', { value: 'all', selected: state.gradeFilter === 'all' }, 'Tất cả lớp'),
        [6, 7, 8, 9].map((g) =>
          el(
            'option',
            { value: String(g), selected: state.gradeFilter === String(g) },
            C.GRADE_LABELS[g],
          ),
        ),
      );

      const sortSelect = el(
        'select',
        {
          class: 'field',
          style: { width: 'auto' },
          onchange: function (e) {
            state.sortBy = e.target.value;
            render();
          },
        },
        el('option', { value: 'lastActive' }, 'Mới hoạt động'),
        el('option', { value: 'xp' }, 'XP cao nhất'),
        el('option', { value: 'mastered' }, 'Thành thạo nhiều nhất'),
        el('option', { value: 'streak' }, 'Chuỗi ngày dài nhất'),
        el('option', { value: 'name' }, 'Tên A→Z'),
      );
      sortSelect.value = state.sortBy;

      const searchInput = el('input', {
        class: 'field',
        type: 'search',
        placeholder: 'Tìm theo tên hoặc email…',
        value: state.search,
        oninput: function (e) {
          state.search = e.target.value;
          renderListOnly();
        },
      });

      return el(
        'div',
        { class: 'card card-tight row' },
        el('span', { class: 'grow', style: { minWidth: '12rem' } }, searchInput),
        gradeSelect,
        sortSelect,
        el('button', { class: 'btn btn-ghost btn-sm', onclick: load }, U.icon('refresh'), 'Tải lại'),
      );
    }

    /** Re-render just the list, so typing in the search box keeps focus. */
    function renderListOnly() {
      const holder = U.qs('#admin-list', container);
      if (!holder) return render();
      const rows = visibleRows();
      U.mount(
        holder,
        rows.length === 0
          ? ui.empty('🔍', 'Không có học sinh nào khớp', 'Thử bỏ bớt bộ lọc.')
          : el('div', { class: 'list' }, rows.map(studentRow)),
      );
    }

    function render() {
      let body;

      if (state.loading) {
        body = el(
          'div',
          { class: 'empty' },
          el('span', { class: 'material-symbols-outlined spin', style: { fontSize: '2.5rem' } }, 'autorenew'),
          el('p', { class: 'muted' }, 'Đang tải danh sách học sinh…'),
        );
      } else if (state.error) {
        body = ui.banner(
          'error',
          el('strong', {}, 'Không tải được danh sách. '),
          state.error,
        );
      } else {
        const rows = visibleRows();
        body = el(
          'div',
          { class: 'stack-sm' },
          summaryTiles(rows),
          filterBar(),
          el(
            'div',
            { id: 'admin-list' },
            rows.length === 0
              ? ui.empty('🔍', 'Không có học sinh nào khớp', 'Thử bỏ bớt bộ lọc.')
              : el('div', { class: 'list' }, rows.map(studentRow)),
          ),
        );
      }

      U.mount(
        container,
        ui.page(
          { title: 'Quản trị', activeRoute: '#/admin', actions: [ui.homeButton()] },
          el(
            'section',
            {},
            el('h1', { class: 'page-title' }, 'Danh sách học sinh'),
            el(
              'p',
              { class: 'page-sub' },
              'Số liệu được cập nhật mỗi khi học sinh hoàn thành một hoạt động. ' +
                'Trang này chỉ đọc phần tóm tắt tiến độ — không mở dữ liệu bài làm chi tiết của học sinh.',
            ),
          ),
          body,
          ui.footerNote(),
        ),
      );
    }

    render();
    void load();
    return container;
  }

  AM.views = AM.views || {};
  AM.views.admin = view;
})(window.AM);
