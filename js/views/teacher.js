/**
 * Teacher workspace — classes, and the roster inside one.
 *
 * Two screens behind one route, chosen by the `class` query parameter:
 *
 *   #/teacher              every class this account owns
 *   #/teacher?class=CODE   one class: roster, progress, help requests
 *
 * Everything shown here is the progress *summary* each student mirrors onto
 * their own roster row (see core/classroom.js). No teacher screen reads a
 * student's raw answers, and firestore.rules does not grant the access that
 * would make it possible.
 */
(function (AM) {
  'use strict';

  const U = AM.util;
  const el = U.el;
  const ui = AM.ui;
  const C = AM.const;
  const room = AM.classroom;

  /** Firestore retries reads for a very long time; fail visibly instead. */
  const READ_TIMEOUT_MS = 15000;

  // ===========================================================================
  // Class list
  // ===========================================================================

  function classListScreen(container) {
    const state = { loading: true, error: null, classes: [], creating: false, newName: '' };

    async function load() {
      state.loading = true;
      state.error = null;
      render();
      try {
        state.classes = await AM.sync.withTimeout(
          room.listMyClasses(),
          READ_TIMEOUT_MS,
          'Tải danh sách lớp',
        );
      } catch (err) {
        state.error = AM.fb.describeError(err);
      }
      state.loading = false;
      render();
    }

    async function create() {
      if (!state.newName.trim()) {
        state.error = 'Bạn chưa đặt tên lớp.';
        return render();
      }
      state.creating = true;
      state.error = null;
      render();
      try {
        const created = await room.createClass(state.newName);
        state.newName = '';
        state.classes = [created].concat(state.classes);
      } catch (err) {
        state.error = AM.fb.describeError(err);
      }
      state.creating = false;
      render();
    }

    function createCard() {
      const input = el('input', {
        class: 'field',
        type: 'text',
        placeholder: 'Ví dụ: Toán 11A1',
        value: state.newName,
        disabled: state.creating,
        oninput: function (e) {
          state.newName = e.target.value;
        },
        onkeydown: function (e) {
          if (e.key === 'Enter' && !state.creating) create();
        },
      });

      return ui.sectionCard(
        [U.icon('add_circle'), 'Tạo lớp mới'],
        'Học sinh vào lớp bằng mã lớp mà hệ thống sinh ra.',
        el(
          'div',
          { class: 'row' },
          el('span', { class: 'grow', style: { minWidth: '14rem' } }, input),
          el(
            'button',
            { class: 'btn btn-primary', disabled: state.creating, onclick: create },
            state.creating ? U.icon('autorenew', 'spin') : U.icon('add'),
            state.creating ? 'Đang tạo…' : 'Tạo lớp',
          ),
        ),
      );
    }

    function classRow(cls) {
      return el(
        'a',
        { class: 'list-row class-row', href: '#/teacher?class=' + encodeURIComponent(cls.code) },
        el(
          'span',
          { class: 'grow' },
          el('span', { class: 'title', style: { display: 'block' } }, cls.name),
          el(
            'span',
            { class: 'muted-sm' },
            'Tạo ' + U.relativeTime(cls.createdAt, 'vừa xong'),
          ),
        ),
        el('span', { class: 'class-code' }, cls.code),
        U.icon('chevron_right'),
      );
    }

    function render() {
      let body;

      if (state.loading) {
        body = loadingBlock('Đang tải danh sách lớp…');
      } else {
        body = el(
          'div',
          { class: 'stack-sm' },
          state.error ? ui.banner('error', state.error) : null,
          createCard(),
          state.classes.length === 0
            ? ui.empty(
                '🏫',
                'Bạn chưa có lớp nào',
                'Tạo lớp đầu tiên ở trên, rồi đưa mã lớp cho học sinh.',
              )
            : ui.sectionCard(
                [U.icon('groups'), 'Lớp của bạn (' + state.classes.length + ')'],
                null,
                el('div', { class: 'list' }, state.classes.map(classRow)),
              ),
        );
      }

      U.mount(
        container,
        ui.page(
          { title: 'Lớp học', activeRoute: '#/teacher', actions: [refreshButton(load)] },
          el(
            'section',
            {},
            el('h1', { class: 'page-title' }, 'Lớp của tôi'),
            el('p', { class: 'page-sub' }, 'Tạo lớp, chia sẻ mã và theo dõi tiến độ học sinh.'),
          ),
          body,
          ui.footerNote(),
        ),
      );
    }

    render();
    void load();
  }

  // ===========================================================================
  // One class
  // ===========================================================================

  function classDetailScreen(container, code) {
    const state = {
      loading: true,
      error: null,
      cls: null,
      members: [],
      sortBy: 'name',
      replyFor: null, // uid whose reply box is open
      replyText: '',
    };

    async function load() {
      state.loading = true;
      state.error = null;
      render();
      try {
        state.cls = await AM.sync.withTimeout(room.findClass(code), READ_TIMEOUT_MS, 'Tải lớp');
        if (!state.cls) {
          state.error = 'Không tìm thấy lớp này. Có thể lớp đã bị xoá.';
        } else if (state.cls.teacherId !== AM.auth.currentUser().uid) {
          state.cls = null;
          state.error = 'Lớp này không thuộc tài khoản của bạn.';
        } else {
          state.members = await AM.sync.withTimeout(
            room.listMembers(code),
            READ_TIMEOUT_MS,
            'Tải danh sách học sinh',
          );
        }
      } catch (err) {
        state.error = AM.fb.describeError(err);
      }
      state.loading = false;
      render();
    }

    function sortedMembers() {
      const sorters = {
        name: (a, b) =>
          (a.displayName || a.email).localeCompare(b.displayName || b.email, 'vi'),
        lastActive: (a, b) =>
          (b.lastActiveAt ? b.lastActiveAt.getTime() : 0) -
          (a.lastActiveAt ? a.lastActiveAt.getTime() : 0),
        mastered: (a, b) => b.masteredTopics - a.masteredTopics,
        xp: (a, b) => b.xp - a.xp,
        // Whoever is stuck should be easiest to find, so this one leads with
        // open help requests rather than with the strongest students.
        needsHelp: (a, b) => helpRank(b) - helpRank(a),
      };
      return state.members.slice().sort(sorters[state.sortBy] || sorters.name);
    }

    function helpRank(m) {
      if (m.help && m.help.status === 'pending') return 2;
      if (m.unresolvedErrors > 0) return 1;
      return 0;
    }

    async function removeStudent(m) {
      const ok = window.confirm(
        'Xoá ' +
          (m.displayName || m.email) +
          ' khỏi lớp?\n\nHọc sinh vẫn giữ nguyên dữ liệu học tập của mình và có thể vào lại bằng mã lớp.',
      );
      if (!ok) return;
      try {
        await room.removeMember(code, m.uid);
        state.members = state.members.filter((x) => x.uid !== m.uid);
        render();
      } catch (err) {
        window.alert('Không xoá được: ' + AM.fb.describeError(err));
      }
    }

    async function sendReply(m) {
      const text = state.replyText.trim();
      if (!text) return;
      try {
        await room.answerHelp(code, m.uid, text);
        const target = state.members.find((x) => x.uid === m.uid);
        if (target && target.help) {
          target.help = Object.assign({}, target.help, { status: 'answered', reply: text });
        }
        state.replyFor = null;
        state.replyText = '';
        render();
      } catch (err) {
        window.alert('Không gửi được phản hồi: ' + AM.fb.describeError(err));
      }
    }

    async function renameClass() {
      const next = window.prompt('Tên lớp mới:', state.cls.name);
      if (next === null) return;
      try {
        await room.renameClass(code, next);
        state.cls.name = next.trim();
        render();
      } catch (err) {
        window.alert('Không đổi được tên: ' + AM.fb.describeError(err));
      }
    }

    async function deleteClass() {
      const ok = window.confirm(
        'Xoá lớp "' +
          state.cls.name +
          '"?\n\n' +
          state.members.length +
          ' học sinh sẽ rời lớp. Dữ liệu học tập của các em không bị ảnh hưởng.\n\n' +
          'Hành động này không thể hoàn tác.',
      );
      if (!ok) return;
      try {
        await room.deleteClass(code);
        AM.router.navigate('#/teacher');
      } catch (err) {
        window.alert('Không xoá được lớp: ' + AM.fb.describeError(err));
      }
    }

    // --- pieces -------------------------------------------------------------

    function codeCard() {
      return el(
        'section',
        { class: 'card card-dark class-code-card' },
        el(
          'div',
          {},
          el('div', { class: 'section-label', style: { color: '#b2f746' } }, 'Mã tham gia'),
          el('div', { class: 'class-code-big' }, state.cls.code),
          el(
            'p',
            { class: 'muted-sm', style: { color: 'rgba(234,255,245,0.75)', marginTop: '0.4rem' } },
            'Học sinh nhập mã này ở mục “Lớp học” để vào lớp.',
          ),
        ),
        el(
          'button',
          {
            class: 'btn btn-lime',
            onclick: async function (e) {
              const btn = e.currentTarget;
              try {
                await window.navigator.clipboard.writeText(state.cls.code);
                btn.textContent = 'Đã sao chép';
                window.setTimeout(function () {
                  btn.textContent = 'Sao chép mã';
                }, 1500);
              } catch (err) {
                // Clipboard needs a secure context; the code is on screen anyway.
                window.prompt('Sao chép mã lớp:', state.cls.code);
              }
            },
          },
          'Sao chép mã',
        ),
      );
    }

    function summaryTiles() {
      const ms = state.members;
      const active7d = ms.filter(
        (m) => m.lastActiveAt && Date.now() - m.lastActiveAt.getTime() < 7 * 86400000,
      ).length;
      const diagnosed = ms.filter((m) => m.hasDiagnostic).length;
      const pendingHelp = ms.filter((m) => m.help && m.help.status === 'pending').length;

      return el(
        'section',
        { class: 'grid-3' },
        ui.statTile(String(ms.length), 'Học sinh trong lớp'),
        ui.statTile(String(active7d), 'Hoạt động trong 7 ngày'),
        ui.statTile(diagnosed + '/' + ms.length, 'Đã kiểm tra đầu vào'),
        ui.statTile(String(pendingHelp), 'Đang cần hỗ trợ'),
      );
    }

    function helpBlock(m) {
      if (!m.help) return null;
      const pending = m.help.status === 'pending';

      const replyBox =
        state.replyFor === m.uid
          ? el(
              'div',
              { class: 'help-reply' },
              el('textarea', {
                class: 'field',
                rows: 3,
                placeholder: 'Trả lời học sinh…',
                value: state.replyText,
                oninput: function (e) {
                  state.replyText = e.target.value;
                },
              }),
              el(
                'div',
                { class: 'row' },
                el(
                  'button',
                  { class: 'btn btn-primary btn-sm', onclick: () => sendReply(m) },
                  'Gửi phản hồi',
                ),
                el(
                  'button',
                  {
                    class: 'btn btn-ghost btn-sm',
                    onclick: function () {
                      state.replyFor = null;
                      state.replyText = '';
                      render();
                    },
                  },
                  'Huỷ',
                ),
              ),
            )
          : null;

      return el(
        'div',
        { class: U.cn('help-note', pending && 'is-pending') },
        el(
          'div',
          { class: 'row' },
          ui.pill(pending ? 'Cần hỗ trợ' : 'Đã trả lời', pending ? 'amber' : 'green', 'help'),
          el('span', { class: 'muted-sm' }, U.relativeTime(U.toDate(m.help.askedAt))),
        ),
        el('p', { class: 'help-message' }, m.help.message),
        m.help.reply
          ? el('p', { class: 'help-answer' }, el('strong', {}, 'Bạn đã trả lời: '), m.help.reply)
          : null,
        replyBox ||
          (pending || !m.help.reply
            ? el(
                'button',
                {
                  class: 'btn btn-ghost btn-sm',
                  onclick: function () {
                    state.replyFor = m.uid;
                    state.replyText = m.help.reply || '';
                    render();
                  },
                },
                U.icon('reply'),
                'Trả lời',
              )
            : null),
      );
    }

    function memberRow(m) {
      const totalTopics = m.grade ? AM.topics.getTopicsByGrade(m.grade).length : 0;
      const ratio = totalTopics > 0 ? m.masteredTopics / totalTopics : 0;

      return el(
        'div',
        { class: 'list-row member-row' },
        el(
          'span',
          { class: 'avatar-dot' },
          (m.displayName || m.email || '?').trim().charAt(0).toUpperCase(),
        ),
        el(
          'span',
          { class: 'grow' },
          el(
            'span',
            { class: 'title', style: { display: 'block' } },
            m.displayName || m.email.split('@')[0],
          ),
          el(
            'span',
            { class: 'muted-sm' },
            (m.grade ? C.GRADE_LABELS[m.grade] : 'chưa chọn lớp') +
              ' · hoạt động ' +
              U.relativeTime(m.lastActiveAt),
          ),
          el(
            'span',
            { class: 'row', style: { marginTop: '0.5rem' } },
            m.hasDiagnostic
              ? ui.pill(m.masteredTopics + '/' + totalTopics + ' thành thạo', 'green')
              : ui.pill('chưa kiểm tra đầu vào', 'amber'),
            ui.pill('Lv' + m.level + ' · ' + m.xp + ' XP', 'lime'),
            m.currentStreak > 0 ? ui.pill('🔥 ' + m.currentStreak + ' ngày', 'rose') : null,
            ui.pill(m.totalQuestions + ' câu', 'sky'),
            m.unresolvedErrors > 0 ? ui.pill(m.unresolvedErrors + ' lỗi chưa sửa', 'amber') : null,
          ),
          totalTopics > 0
            ? el('span', { class: 'member-bar' }, ui.bar(ratio, 'kha'))
            : null,
          helpBlock(m),
        ),
        el(
          'button',
          {
            class: 'icon-btn',
            title: 'Xoá khỏi lớp',
            'aria-label': 'Xoá khỏi lớp',
            onclick: () => removeStudent(m),
          },
          U.icon('person_remove'),
        ),
      );
    }

    function sortBar() {
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
        el('option', { value: 'name' }, 'Tên A→Z'),
        el('option', { value: 'needsHelp' }, 'Cần hỗ trợ trước'),
        el('option', { value: 'lastActive' }, 'Mới hoạt động'),
        el('option', { value: 'mastered' }, 'Thành thạo nhiều nhất'),
        el('option', { value: 'xp' }, 'XP cao nhất'),
      );
      sortSelect.value = state.sortBy;

      return el(
        'div',
        { class: 'card card-tight row' },
        el('span', { class: 'grow muted-sm' }, 'Sắp xếp theo'),
        sortSelect,
        el('button', { class: 'btn btn-ghost btn-sm', onclick: load }, U.icon('refresh'), 'Tải lại'),
      );
    }

    function render() {
      let body;

      if (state.loading) {
        body = loadingBlock('Đang tải lớp…');
      } else if (state.error) {
        body = el(
          'div',
          { class: 'stack-sm' },
          ui.banner('error', state.error),
          el('a', { class: 'btn btn-ghost', href: '#/teacher' }, '← Về danh sách lớp'),
        );
      } else {
        const members = sortedMembers();
        body = el(
          'div',
          { class: 'stack-sm' },
          codeCard(),
          summaryTiles(),
          members.length === 0
            ? ui.empty(
                '👋',
                'Chưa có học sinh nào',
                'Đưa mã ' + state.cls.code + ' cho học sinh để các em vào lớp.',
              )
            : el(
                'div',
                { class: 'stack-sm' },
                sortBar(),
                el('div', { class: 'list' }, members.map(memberRow)),
              ),
        );
      }

      const actions = [];
      if (state.cls) {
        actions.push(
          el(
            'button',
            { class: 'icon-btn', title: 'Đổi tên lớp', onclick: renameClass },
            U.icon('edit'),
          ),
          el(
            'button',
            { class: 'icon-btn', title: 'Xoá lớp', onclick: deleteClass },
            U.icon('delete'),
          ),
        );
      }

      U.mount(
        container,
        ui.page(
          {
            title: state.cls ? state.cls.name : 'Lớp học',
            activeRoute: '#/teacher',
            actions: actions,
          },
          el(
            'section',
            {},
            el(
              'a',
              { class: 'link-btn', href: '#/teacher', style: { display: 'inline-block' } },
              '← Danh sách lớp',
            ),
            el('h1', { class: 'page-title' }, state.cls ? state.cls.name : 'Lớp học'),
          ),
          body,
          ui.footerNote(),
        ),
      );
    }

    render();
    void load();
  }

  // ===========================================================================
  // Shared bits
  // ===========================================================================

  function loadingBlock(message) {
    return el(
      'div',
      { class: 'empty' },
      el(
        'span',
        { class: 'material-symbols-outlined spin', style: { fontSize: '2.5rem' } },
        'autorenew',
      ),
      el('p', { class: 'muted' }, message),
    );
  }

  function refreshButton(onClick) {
    return el(
      'button',
      { class: 'icon-btn', title: 'Tải lại', onclick: onClick },
      U.icon('refresh'),
    );
  }

  function view(params) {
    if (!AM.auth.isTeacher()) {
      return ui.page(
        { title: 'Lớp học', activeRoute: '#/teacher', actions: [ui.homeButton()] },
        ui.empty(
          '🔒',
          'Trang dành cho giáo viên',
          'Tài khoản của bạn không có quyền quản lý lớp.',
          el('a', { class: 'btn btn-primary', href: '#/' }, 'Về trang chính'),
        ),
      );
    }

    const container = el('div', {});
    const code = params && params.class ? room.normaliseCode(params.class) : null;

    if (code) classDetailScreen(container, code);
    else classListScreen(container);

    return container;
  }

  AM.views = AM.views || {};
  AM.views.teacher = view;
})(window.AM);
