/**
 * Onboarding wizard — 8 steps collecting the 6 profile fields.
 *
 *   0 Welcome · 1 Grade · 2 Goal · 3 DailyTime · 4 Deadline
 *   5 SelfAssessment · 6 WeakTopics · 7 Summary
 *
 * State lives in a closure and the step is re-rendered in place, so leaving
 * and returning within the wizard keeps answers. Only the final submit writes
 * to localStorage.
 */
(function (AM) {
  'use strict';

  const U = AM.util;
  const el = U.el;
  const ui = AM.ui;
  const C = AM.const;

  const STEP_COUNT = 8;

  function optionCard(opt, selected, onSelect) {
    return el(
      'button',
      {
        type: 'button',
        class: U.cn('option', selected && 'is-selected'),
        onclick: () => onSelect(opt.value),
      },
      el('span', { class: 'marker' }),
      el(
        'span',
        {},
        el('span', { class: 'opt-label', style: { display: 'block' } }, opt.label),
        opt.description ? el('span', { class: 'opt-desc' }, opt.description) : null,
      ),
    );
  }

  function view() {
    // Prefill from an existing profile so "edit my settings" works too.
    const existing = AM.store.loadProfile();
    const draft = {
      step: 0,
      grade: existing ? existing.grade : null,
      goal: existing ? existing.goal : null,
      dailyMinutes: existing ? existing.dailyMinutes : null,
      deadline: existing ? existing.deadline : null,
      selfLevel: existing ? existing.selfLevel : null,
      weakTopicIds: existing ? existing.weakTopicIds.slice() : [],
    };

    const container = el('div', {});

    /** Can we leave the current step? */
    function canProceed() {
      switch (draft.step) {
        case 1:
          return draft.grade !== null;
        case 2:
          return draft.goal !== null;
        case 3:
          return draft.dailyMinutes !== null;
        case 5:
          return draft.selfLevel !== null;
        default:
          return true; // welcome, deadline (optional), weak topics (optional), summary
      }
    }

    function set(key, value) {
      draft[key] = value;
      if (key === 'grade') draft.weakTopicIds = weakTopicsForGrade(value);
      rerender();
    }

    /** Weak-topic ids belonging to `grade` — the rest are from an old choice. */
    function weakTopicsForGrade(grade) {
      return draft.weakTopicIds.filter((id) => {
        const topic = AM.topics.getTopicById(id);
        return topic && topic.grade === grade;
      });
    }

    function go(delta) {
      const next = draft.step + delta;
      if (next < 0 || next >= STEP_COUNT) return;
      draft.step = next;
      rerender();
    }

    function submit() {
      const now = new Date().toISOString();
      const gradeChanged = !!existing && existing.grade !== draft.grade;

      // A diagnostic measures one grade's curriculum. If the learner changes
      // grade, the old diagnostic and learning path no longer match the
      // selected curriculum, so both are cleared.
      if (gradeChanged) {
        AM.store.clearDiagnostic();
        AM.store.clearPath();
      }

      AM.store.saveProfile({
        grade: draft.grade,
        goal: draft.goal,
        dailyMinutes: draft.dailyMinutes,
        deadline: draft.deadline || null,
        selfLevel: draft.selfLevel,
        weakTopicIds: weakTopicsForGrade(draft.grade),
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now,
      });
      // Straight to the diagnostic — that's the whole point of onboarding.
      AM.router.navigate('#/diagnostic');
    }

    // ---- Individual steps -------------------------------------------------

    /** Bank size is read from data/questions.js, never hard-coded. */
    function bankSummary() {
      const bank = AM.bank.QUESTION_BANK;
      const nQ = bank.totalCount || bank.questions.length;
      const nT = Array.isArray(bank.theory) ? bank.theory.length : 0;
      if (!nQ) return 'Ngân hàng câu hỏi và lý thuyết theo Chương trình GDPT 2018.';
      return (
        nQ.toLocaleString('vi-VN') +
        ' câu hỏi' +
        (nT ? ' và lý thuyết ' + nT + ' bài' : '') +
        ', biên soạn theo Chương trình GDPT 2018.'
      );
    }

    function stepWelcome() {
      return el(
        'div',
        { class: 'stack-sm' },
        el('div', { style: { fontSize: '3rem' } }, '📐'),
        el('h1', { class: 'page-title' }, 'Chào bạn!'),
        el(
          'p',
          { class: 'page-sub' },
          'AdaptiveMath xây lộ trình học Toán riêng cho học sinh lớp 6, 7, 8, 9 theo ' +
            'Chương trình GDPT 2018 và SGK Kết nối tri thức với cuộc sống đang dùng thống nhất toàn quốc. ' +
            'Trả lời 6 câu hỏi ngắn, rồi làm bài kiểm tra đầu vào ' +
            'để hệ thống biết bạn đang ở đâu.',
        ),
        el(
          'ul',
          { class: 'muted', style: { lineHeight: '2', paddingLeft: '1.2rem' } },
          el('li', {}, 'Tiến trình học được lưu trên máy bạn và đồng bộ với tài khoản.'),
          el('li', {}, bankSummary()),
          el('li', {}, 'Bạn có thể sửa lại thiết lập bất cứ lúc nào.'),
        ),
      );
    }

    /**
     * Warn when the chosen grade has noticeably fewer lessons than the best
     * covered grade, so the student isn't surprised by a thin learning path.
     * Counts come from topics.js, so the note disappears by itself once the
     * bank catches up.
     */
    function gradeCoverageNote(grade) {
      if (!grade) return null;
      const counts = [6, 7, 8, 9].map((g) => AM.topics.getTopicsByGrade(g).length);
      const mine = AM.topics.getTopicsByGrade(grade).length;
      const best = Math.max.apply(null, counts);
      if (!best || mine >= best * 0.6) return null;
      return ui.banner(
        'warn',
        C.GRADE_LABELS[grade] +
          ' hiện có ' +
          mine +
          ' bài trong ngân hàng câu hỏi, ít hơn các khối khác (' +
          best +
          ' bài). Lộ trình sẽ ngắn hơn tương ứng.',
      );
    }

    function stepGrade() {
      return el(
        'div',
        { class: 'stack-sm' },
        el('h1', { class: 'page-title' }, 'Bạn đang học lớp mấy?'),
        el('p', { class: 'page-sub' }, 'Ngân hàng câu hỏi và lộ trình sẽ bám theo lớp bạn chọn.'),
        el(
          'div',
          { class: 'option-grid cols-2' },
          [6, 7, 8, 9].map((g) => {
            const count = AM.topics.getTopicsByGrade(g).length;
            return optionCard(
              {
                value: g,
                label: C.GRADE_LABELS[g],
                description: count + ' bài học trong chương trình',
              },
              draft.grade === g,
              (v) => set('grade', v),
            );
          }),
        ),
        gradeCoverageNote(draft.grade),
      );
    }

    function stepGoal() {
      return el(
        'div',
        { class: 'stack-sm' },
        el('h1', { class: 'page-title' }, 'Mục tiêu của bạn là gì?'),
        el(
          'p',
          { class: 'page-sub' },
          'Mục tiêu quyết định mức thành thạo mà lộ trình hướng tới cho mỗi chủ đề.',
        ),
        el(
          'div',
          { class: 'option-grid' },
          C.GOAL_OPTIONS.map((opt) =>
            optionCard(opt, draft.goal === opt.value, (v) => set('goal', v)),
          ),
        ),
        draft.goal
          ? el(
              'p',
              { class: 'muted-sm' },
              'Mức thành thạo mục tiêu: ',
              el('strong', {}, U.pct(C.TARGET_BY_GOAL[draft.goal])),
              ' cho mỗi chủ đề.',
            )
          : null,
      );
    }

    function stepDailyTime() {
      return el(
        'div',
        { class: 'stack-sm' },
        el('h1', { class: 'page-title' }, 'Mỗi ngày bạn học được bao lâu?'),
        el('p', { class: 'page-sub' }, 'Lộ trình sẽ xếp bài vừa đúng quỹ thời gian này.'),
        el(
          'div',
          { class: 'option-grid cols-2' },
          C.DAILY_MINUTES_OPTIONS.map((opt) =>
            optionCard(opt, draft.dailyMinutes === opt.value, (v) => set('dailyMinutes', v)),
          ),
        ),
      );
    }

    /**
     * Deadline step. The visible field is a plain text box in Vietnamese
     * dd/mm/yyyy order (the native date input shows mm/dd/yyyy on many
     * browsers and re-rendering it mid-typing kept stealing focus). A hidden
     * native picker is still available behind the calendar button. Only the
     * status area below the field is updated while typing, never the field.
     */
    function stepDeadline() {
      const MAX_YEARS_AHEAD = 5;
      const isoToVN = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);

      let error = null;
      const status = el('div', {});

      const text = el('input', {
        class: 'field',
        type: 'text',
        inputmode: 'numeric',
        autocomplete: 'off',
        placeholder: 'dd/mm/yyyy',
        maxlength: 10,
        'aria-label': 'Ngày thi (ngày/tháng/năm)',
        value: draft.deadline ? isoToVN(draft.deadline) : '',
        oninput: (e) => {
          maskInput(e);
          applyText(false);
        },
        onblur: () => applyText(true),
        onkeydown: (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            applyText(true);
          }
        },
      });

      // Hidden native picker: kept in the DOM (invisible) so showPicker() works.
      const picker = el('input', {
        type: 'date',
        tabindex: -1,
        'aria-hidden': true,
        min: U.todayVNStr(),
        style: {
          position: 'absolute',
          width: '1px',
          height: '1px',
          opacity: '0',
          pointerEvents: 'none',
        },
        onchange: (e) => {
          if (!e.target.value) return;
          text.value = isoToVN(e.target.value);
          applyText(true);
        },
      });

      const pickerBtn = el(
        'button',
        {
          type: 'button',
          class: 'btn btn-outline btn-sm',
          title: 'Chọn trên lịch',
          'aria-label': 'Chọn ngày trên lịch',
          onclick: () => {
            picker.value = draft.deadline || '';
            if (typeof picker.showPicker === 'function') {
              try {
                picker.showPicker();
                return;
              } catch (_) {
                /* fall through to click() */
              }
            }
            picker.click();
          },
        },
        U.icon('calendar_month'),
      );

      /**
       * Light input mask, applied only when the caret is at the end:
       *  - digits flow into day / month / year segments (2 / 2 / 4 chars),
       *    overflowing into the next segment, so "25062026" → "25/06/2026";
       *  - separators the user types themselves ("/", "-", ".") are respected,
       *    so "5/6/2026" stays "5/6/2026" instead of being re-chunked;
       *  - a "/" is auto-appended after a full day or month only while
       *    inserting, never while deleting, so Backspace always works.
       */
      function maskInput(e) {
        if (text.selectionStart !== text.value.length) return;
        const inserting = !e || !e.inputType || e.inputType.indexOf('insert') === 0;
        const raw = text.value;

        // Pasted ISO date (e.g. from another app): convert straight away.
        const iso = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(raw);
        if (iso) {
          text.value = iso[3].padStart(2, '0') + '/' + iso[2].padStart(2, '0') + '/' + iso[1];
          return;
        }

        const caps = [2, 2, 4];
        const segs = [''];
        for (const ch of raw) {
          const i = segs.length - 1;
          if (ch >= '0' && ch <= '9') {
            if (segs[i].length < caps[i]) segs[i] += ch;
            else if (i < 2) segs.push(ch); // overflow starts the next segment
            // else: year is full — drop the extra digit
          } else if (ch === '/' || ch === '-' || ch === '.') {
            if (segs[i] !== '' && i < 2) segs.push('');
          }
        }
        let out = segs.join('/');
        const last = segs.length - 1;
        if (inserting && last < 2 && segs[last].length === caps[last]) out += '/';
        if (out !== raw) text.value = out;
      }

      /**
       * Parse the field into draft.deadline.
       * `final` = user finished (blur / Enter / picker) → show errors for
       * incomplete input and normalise the text to dd/mm/yyyy.
       */
      function applyText(final) {
        const raw = text.value.trim();
        error = null;

        if (raw === '') {
          draft.deadline = null;
          renderStatus();
          return;
        }

        const digitCount = raw.replace(/\D/g, '').length;
        if (digitCount < 8 && !final) {
          // Still typing — don't nag, but a half-typed date is not a deadline.
          draft.deadline = null;
          renderStatus();
          return;
        }

        const iso = U.parseDateVN(raw);
        if (!iso) {
          error = 'Ngày không hợp lệ. Nhập theo dạng ngày/tháng/năm, ví dụ 25/06/2026.';
        } else {
          const days = U.daysFromTodayVN(iso);
          if (days < 0) {
            error = 'Ngày thi phải từ hôm nay (' + isoToVN(U.todayVNStr()) + ') trở đi.';
          } else if (days > MAX_YEARS_AHEAD * 366) {
            error = 'Ngày thi quá xa (hơn ' + MAX_YEARS_AHEAD + ' năm). Bạn kiểm tra lại năm nhé.';
          }
        }

        if (error) {
          draft.deadline = null;
        } else {
          draft.deadline = iso;
          if (final) text.value = isoToVN(iso); // e.g. 5/6/2026 → 05/06/2026
        }
        renderStatus();
      }

      function renderStatus() {
        text.classList.toggle('is-invalid', !!error);
        text.setAttribute('aria-invalid', error ? 'true' : 'false');

        if (error) {
          U.mount(status, el('p', { class: 'field-error', role: 'alert' }, error));
          return;
        }

        if (draft.deadline) {
          const days = U.daysFromTodayVN(draft.deadline);
          const label = days === 0 ? 'Thi hôm nay' : days === 1 ? 'Còn 1 ngày' : 'Còn ' + days + ' ngày';
          U.mount(
            status,
            el(
              'div',
              { class: 'row' },
              ui.pill(label, days <= 7 ? 'rose' : 'amber'),
              el('span', { class: 'muted-sm' }, 'Ngày thi: ' + U.formatDateVN(draft.deadline)),
              el(
                'button',
                {
                  type: 'button',
                  class: 'btn btn-ghost btn-sm',
                  onclick: () => {
                    draft.deadline = null;
                    text.value = '';
                    error = null;
                    renderStatus();
                    text.focus();
                  },
                },
                'Xoá ngày',
              ),
            ),
          );
          return;
        }

        U.mount(
          status,
          el('p', { class: 'muted-sm' }, 'Bỏ trống nếu bạn học đều, không theo mốc thi cụ thể.'),
        );
      }

      renderStatus();

      return el(
        'div',
        { class: 'stack-sm' },
        el('h1', { class: 'page-title' }, 'Bạn có mốc thi nào không?'),
        el(
          'p',
          { class: 'page-sub' },
          'Không bắt buộc. Nếu có, hệ thống sẽ tăng độ ưu tiên cho các chủ đề còn yếu khi ngày thi đến gần.',
        ),
        el(
          'div',
          { style: { maxWidth: '22rem' } },
          el('label', { class: 'field-label' }, 'Ngày thi (ngày/tháng/năm)'),
          el(
            'div',
            { class: 'row', style: { position: 'relative', alignItems: 'stretch' } },
            el('div', { class: 'grow' }, text),
            pickerBtn,
            picker,
          ),
        ),
        status,
      );
    }

    function stepSelfAssessment() {
      return el(
        'div',
        { class: 'stack-sm' },
        el('h1', { class: 'page-title' }, 'Bạn tự đánh giá mình thế nào?'),
        el(
          'p',
          { class: 'page-sub' },
          'Chỉ dùng để chọn câu hỏi đầu tiên cho phù hợp — bài kiểm tra sẽ tự điều chỉnh sau đó.',
        ),
        el(
          'div',
          { class: 'option-grid' },
          C.SELF_LEVEL_OPTIONS.map((opt) =>
            optionCard(opt, draft.selfLevel === opt.value, (v) => set('selfLevel', v)),
          ),
        ),
      );
    }

    function stepWeakTopics() {
      const grade = draft.grade || 6;
      const groups = AM.topics.groupTopicsByChapter(grade);
      const selected = new Set(draft.weakTopicIds);

      function toggle(id) {
        if (selected.has(id)) draft.weakTopicIds = draft.weakTopicIds.filter((x) => x !== id);
        else draft.weakTopicIds = draft.weakTopicIds.concat([id]);
        rerender();
      }

      return el(
        'div',
        { class: 'stack-sm' },
        el('h1', { class: 'page-title' }, 'Chủ đề nào bạn thấy khó?'),
        el(
          'p',
          { class: 'page-sub' },
          'Không bắt buộc — chọn bao nhiêu tuỳ bạn. Những chủ đề này được cộng thêm ' +
            'độ ưu tiên khi xếp lộ trình.',
        ),
        groups.map((group) =>
          el(
            'div',
            { class: 'stack-sm' },
            el('div', { class: 'section-label' }, group.chapter),
            el(
              'div',
              { class: 'row' },
              group.topics.map((t) =>
                el(
                  'button',
                  {
                    type: 'button',
                    class: U.cn('pill', selected.has(t.id) ? 'pill-lime' : ''),
                    style: { cursor: 'pointer' },
                    onclick: () => toggle(t.id),
                  },
                  selected.has(t.id) ? '✓ ' : '',
                  t.title,
                ),
              ),
            ),
          ),
        ),
        el('p', { class: 'muted-sm' }, 'Đã chọn ' + draft.weakTopicIds.length + ' chủ đề.'),
      );
    }

    function stepSummary() {
      const goal = C.GOAL_OPTIONS.find((g) => g.value === draft.goal);
      const level = C.SELF_LEVEL_OPTIONS.find((l) => l.value === draft.selfLevel);
      const rows = [
        ['Lớp', draft.grade ? C.GRADE_LABELS[draft.grade] : '—'],
        ['Mục tiêu', goal ? goal.label : '—'],
        ['Thời gian mỗi ngày', draft.dailyMinutes ? draft.dailyMinutes + ' phút' : '—'],
        ['Ngày thi', draft.deadline ? U.formatDateVN(draft.deadline) : 'Không có'],
        ['Tự đánh giá', level ? level.label : '—'],
        ['Chủ đề tự thấy yếu', draft.weakTopicIds.length + ' chủ đề'],
      ];

      const missing = !draft.grade || !draft.goal || !draft.dailyMinutes || !draft.selfLevel;

      return el(
        'div',
        { class: 'stack-sm' },
        el('h1', { class: 'page-title' }, 'Kiểm tra lại thông tin'),
        el(
          'p',
          { class: 'page-sub' },
          'Xác nhận xong, bạn sẽ vào thẳng bài kiểm tra đầu vào.',
        ),
        el(
          'div',
          { class: 'list' },
          rows.map((r) =>
            el(
              'div',
              { class: 'list-row' },
              el('span', { class: 'grow muted' }, r[0]),
              el('strong', {}, r[1]),
            ),
          ),
        ),
        missing
          ? ui.banner('warn', 'Còn thiếu thông tin bắt buộc. Quay lại các bước trước để bổ sung.')
          : null,
      );
    }

    const STEPS = [
      stepWelcome,
      stepGrade,
      stepGoal,
      stepDailyTime,
      stepDeadline,
      stepSelfAssessment,
      stepWeakTopics,
      stepSummary,
    ];

    // ---- Frame ------------------------------------------------------------

    function rerender() {
      const isLast = draft.step === STEP_COUNT - 1;
      const ready =
        draft.grade && draft.goal && draft.dailyMinutes && draft.selfLevel;

      const body = el(
        'div',
        { class: 'card stack' },
        el(
          'div',
          { class: 'steps' },
          Array.from({ length: STEP_COUNT }, (_, i) =>
            el('i', {
              class: U.cn(i < draft.step && 'done', i === draft.step && 'current'),
            }),
          ),
        ),
        el('p', { class: 'muted-sm' }, 'Bước ' + (draft.step + 1) + ' / ' + STEP_COUNT),
        STEPS[draft.step](),
        el(
          'div',
          { class: 'row', style: { justifyContent: 'space-between', marginTop: '0.5rem' } },
          el(
            'button',
            {
              class: 'btn btn-outline',
              disabled: draft.step === 0,
              onclick: () => go(-1),
            },
            U.icon('chevron_left'),
            'Quay lại',
          ),
          isLast
            ? el(
                'button',
                {
                  class: 'btn btn-lime',
                  disabled: !ready,
                  onclick: submit,
                },
                'Bắt đầu kiểm tra',
                U.icon('trending_flat'),
              )
            : el(
                'button',
                {
                  class: 'btn btn-primary',
                  disabled: !canProceed(),
                  onclick: () => go(1),
                },
                'Tiếp tục',
                U.icon('chevron_right'),
              ),
        ),
      );

      U.mount(
        container,
        ui.page(
          {
            title: 'Thiết lập hồ sơ',
            activeRoute: '#/onboarding',
            actions: [ui.homeButton()],
          },
          body,
        ),
      );
    }

    rerender();
    return container;
  }

  AM.views = AM.views || {};
  AM.views.onboarding = view;
})(window.AM);
