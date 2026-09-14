/**
 * Student's class screen — join with a code, then ask the teacher for help.
 *
 * A student belongs to at most one class. Joining is the only thing they can
 * do to a class: there is no roster here, because seeing who else is in the
 * class is not something this app needs and firestore.rules does not grant it.
 *
 * The code is confirmed before joining ("Lớp 8A1 — cô Hoa. Vào lớp?") rather
 * than joined on submit. A mistyped code that happens to exist would otherwise
 * silently drop a student into a stranger's class.
 */
(function (AM) {
  'use strict';

  const U = AM.util;
  const el = U.el;
  const ui = AM.ui;
  const room = AM.classroom;

  /** Firestore retries reads for a very long time; fail visibly instead. */
  const READ_TIMEOUT_MS = 15000;

  function view() {
    const container = el('div', {});

    const state = {
      loading: true,
      error: null,
      notice: null,
      cls: null, // the class this student is in
      membership: null, // own roster row: holds any help exchange
      codeInput: '',
      found: null, // a class looked up but not yet joined
      busy: false,
      helpText: '',
    };

    async function load() {
      state.loading = true;
      state.error = null;
      render();
      try {
        state.cls = await AM.sync.withTimeout(room.myClass(), READ_TIMEOUT_MS, 'Tải lớp học');
        state.membership = state.cls
          ? await AM.sync.withTimeout(room.myMembership(), READ_TIMEOUT_MS, 'Tải lớp học')
          : null;
      } catch (err) {
        state.error = AM.fb.describeError(err);
      }
      state.loading = false;
      render();
    }

    // --- joining ------------------------------------------------------------

    async function lookup() {
      const code = room.normaliseCode(state.codeInput);
      if (code.length !== room.CODE_LENGTH) {
        state.error = 'Mã lớp gồm ' + room.CODE_LENGTH + ' ký tự.';
        state.found = null;
        return render();
      }

      state.busy = true;
      state.error = null;
      render();
      try {
        state.found = await room.findClass(code);
        if (!state.found) {
          state.error = 'Không tìm thấy lớp với mã này. Kiểm tra lại với giáo viên.';
        }
      } catch (err) {
        state.error = AM.fb.describeError(err);
      }
      state.busy = false;
      render();
    }

    async function confirmJoin() {
      if (!state.found) return; // the code was edited after the lookup
      state.busy = true;
      state.error = null;
      render();
      try {
        const joined = await room.joinClass(state.found.code);
        state.cls = joined;
        state.membership = await room.myMembership();
        state.found = null;
        state.codeInput = '';
        state.notice = 'Bạn đã vào lớp ' + joined.name + '.';
      } catch (err) {
        state.error = AM.fb.describeError(err);
      }
      state.busy = false;
      render();
    }

    async function leave() {
      const ok = window.confirm(
        'Rời khỏi lớp ' +
          state.cls.name +
          '?\n\nDữ liệu học tập của bạn không bị ảnh hưởng. Bạn có thể vào lại bằng mã lớp.',
      );
      if (!ok) return;

      state.busy = true;
      render();
      try {
        await room.leaveClass();
        state.cls = null;
        state.membership = null;
        state.notice = 'Bạn đã rời lớp.';
      } catch (err) {
        state.error = AM.fb.describeError(err);
      }
      state.busy = false;
      render();
    }

    // --- help ---------------------------------------------------------------

    async function askForHelp() {
      if (!state.helpText.trim()) {
        state.error = 'Bạn chưa nhập nội dung cần hỗ trợ.';
        return render();
      }
      state.busy = true;
      state.error = null;
      render();
      try {
        await room.requestHelp(state.helpText);
        state.helpText = '';
        state.membership = await room.myMembership();
        state.notice = 'Đã gửi yêu cầu tới giáo viên.';
      } catch (err) {
        state.error = AM.fb.describeError(err);
      }
      state.busy = false;
      render();
    }

    async function dismissHelp() {
      state.busy = true;
      render();
      try {
        await room.clearHelp();
        state.membership = await room.myMembership();
      } catch (err) {
        state.error = AM.fb.describeError(err);
      }
      state.busy = false;
      render();
    }

    // --- pieces -------------------------------------------------------------

    function joinCard() {
      const input = el('input', {
        class: 'field code-field',
        type: 'text',
        placeholder: 'VD: K7M2QX',
        maxlength: 10,
        autocapitalize: 'characters',
        spellcheck: 'false',
        value: state.codeInput,
        disabled: state.busy,
        oninput: function (e) {
          state.codeInput = e.target.value;
          // A previous lookup no longer describes what is in the box. Drop the
          // confirm panel directly instead of re-rendering, which would
          // rebuild this input and steal the caret mid-typing.
          if (state.found) {
            state.found = null;
            const panel = container.querySelector('.join-confirm');
            if (panel) panel.remove();
          }
        },
        onkeydown: function (e) {
          if (e.key === 'Enter' && !state.busy) lookup();
        },
      });

      return ui.sectionCard(
        [U.icon('login'), 'Vào lớp của giáo viên'],
        'Nhập mã lớp giáo viên đưa cho bạn.',
        el(
          'div',
          { class: 'row' },
          el('span', { class: 'grow', style: { minWidth: '12rem' } }, input),
          el(
            'button',
            { class: 'btn btn-primary', disabled: state.busy, onclick: lookup },
            state.busy ? U.icon('autorenew', 'spin') : U.icon('search'),
            'Tìm lớp',
          ),
        ),
        state.found
          ? el(
              'div',
              { class: 'join-confirm' },
              el(
                'div',
                { class: 'grow' },
                el('strong', {}, state.found.name),
                el('span', { class: 'muted-sm', style: { display: 'block' } },
                  'Giáo viên: ' + state.found.teacherName),
              ),
              el(
                'button',
                { class: 'btn btn-lime', disabled: state.busy, onclick: confirmJoin },
                'Vào lớp này',
              ),
            )
          : null,
      );
    }

    function myClassCard() {
      return el(
        'section',
        { class: 'card card-dark class-code-card' },
        el(
          'div',
          {},
          el('div', { class: 'section-label', style: { color: '#b2f746' } }, 'Lớp của bạn'),
          el('h2', { class: 'page-title', style: { color: '#fff' } }, state.cls.name),
          el(
            'p',
            { style: { color: 'rgba(234,255,245,0.8)' } },
            'Giáo viên: ' + state.cls.teacherName + ' · Mã lớp: ' + state.cls.code,
          ),
        ),
        el(
          'button',
          { class: 'btn btn-ghost btn-on-dark', disabled: state.busy, onclick: leave },
          'Rời lớp',
        ),
      );
    }

    function helpCard() {
      const help = state.membership && state.membership.help;
      const pending = help && help.status === 'pending';
      const answered = help && help.status === 'answered';

      if (pending) {
        return ui.sectionCard(
          [U.icon('help'), 'Yêu cầu hỗ trợ'],
          'Giáo viên sẽ thấy yêu cầu này trong danh sách lớp.',
          el(
            'div',
            { class: 'help-note is-pending' },
            ui.pill('Đang chờ giáo viên', 'amber'),
            el('p', { class: 'help-message' }, help.message),
          ),
          el(
            'div',
            { class: 'row' },
            el(
              'button',
              { class: 'btn btn-ghost btn-sm', disabled: state.busy, onclick: dismissHelp },
              'Huỷ yêu cầu',
            ),
          ),
        );
      }

      if (answered) {
        return ui.sectionCard(
          [U.icon('mark_email_read'), 'Giáo viên đã trả lời'],
          null,
          el(
            'div',
            { class: 'help-note' },
            el('p', { class: 'help-message' }, el('strong', {}, 'Bạn hỏi: '), help.message),
            el('p', { class: 'help-answer' }, el('strong', {}, 'Trả lời: '), help.reply),
          ),
          el(
            'div',
            { class: 'row' },
            el(
              'button',
              { class: 'btn btn-ghost btn-sm', disabled: state.busy, onclick: dismissHelp },
              'Đã hiểu, xoá',
            ),
          ),
        );
      }

      const box = el('textarea', {
        class: 'field',
        rows: 3,
        placeholder: 'Ví dụ: Em chưa hiểu phần xét dấu tam thức bậc hai…',
        value: state.helpText,
        disabled: state.busy,
        oninput: function (e) {
          state.helpText = e.target.value;
        },
      });

      return ui.sectionCard(
        [U.icon('help'), 'Cần giáo viên hỗ trợ?'],
        'Mô tả ngắn phần bạn đang vướng.',
        box,
        el(
          'div',
          { class: 'row' },
          el(
            'button',
            { class: 'btn btn-primary', disabled: state.busy, onclick: askForHelp },
            state.busy ? U.icon('autorenew', 'spin') : U.icon('send'),
            'Gửi cho giáo viên',
          ),
        ),
      );
    }

    function render() {
      let body;

      if (state.loading) {
        body = el(
          'div',
          { class: 'empty' },
          el(
            'span',
            { class: 'material-symbols-outlined spin', style: { fontSize: '2.5rem' } },
            'autorenew',
          ),
          el('p', { class: 'muted' }, 'Đang tải…'),
        );
      } else {
        body = el(
          'div',
          { class: 'stack-sm' },
          state.error ? ui.banner('error', state.error) : null,
          state.notice ? ui.banner('info', state.notice) : null,
          state.cls
            ? el('div', { class: 'stack-sm' }, myClassCard(), helpCard())
            : el(
                'div',
                { class: 'stack-sm' },
                joinCard(),
                ui.empty(
                  '🏫',
                  'Bạn chưa vào lớp nào',
                  'Vào lớp để giáo viên theo dõi tiến độ và hỗ trợ khi bạn cần. ' +
                    'Không bắt buộc — bạn vẫn học bình thường nếu chưa có lớp.',
                ),
              ),
        );
      }

      U.mount(
        container,
        ui.page(
          {
            title: 'Lớp học',
            activeRoute: '#/classroom',
            actions: [
              el(
                'button',
                { class: 'icon-btn', title: 'Tải lại', onclick: load },
                U.icon('refresh'),
              ),
            ],
          },
          el(
            'section',
            {},
            el('h1', { class: 'page-title' }, 'Lớp học'),
            el('p', { class: 'page-sub' }, 'Tham gia lớp của giáo viên bằng mã lớp.'),
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
  AM.views.classroom = view;
})(window.AM);
