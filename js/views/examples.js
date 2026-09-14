/**
 * Nhiệm vụ số — chín ví dụ minh họa (4.1 → 4.9) của chương 4.
 *
 * `#/digital-tasks`       : danh sách nhiệm vụ, nhóm theo biện pháp.
 * `#/digital-tasks?id=vd41`: một nhiệm vụ — đề bài, mức hỗ trợ, câu hỏi tương
 * tác (chấm bằng AM.cat.gradeAnswer như phiên luyện tập), phiếu học tập cho
 * học sinh điền kèm sản phẩm minh họa để đối chiếu, và bảng phản hồi/đánh giá
 * của giáo viên. Bài làm và phiếu được lưu localStorage nên tải lại không mất.
 */
(function (AM) {
  'use strict';

  const U = AM.util;
  const el = U.el;
  const ui = AM.ui;

  const EXAMPLES = Array.isArray(window.AM_EXAMPLES) ? window.AM_EXAMPLES : [];
  const STORE_KEY = 'am_digital_tasks_v1';

  // ---- Lưu / đọc trạng thái làm bài ---------------------------------------

  function loadAll() {
    try {
      return JSON.parse(window.localStorage.getItem(STORE_KEY)) || {};
    } catch (err) {
      return {};
    }
  }

  function saveAll(all) {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(all));
    } catch (err) {
      // Hết quota hoặc bị chặn — bài làm chỉ mất khi tải lại trang, không chặn UI.
    }
  }

  function loadState(exampleId) {
    const s = loadAll()[exampleId] || {};
    return {
      support: typeof s.support === 'number' ? s.support : 0,
      showModels: !!s.showModels,
      notes: s.notes || {},
      answers: s.answers || {},
      revealed: s.revealed || {},
      scores: s.scores || {},
    };
  }

  function saveState(exampleId, state) {
    const all = loadAll();
    all[exampleId] = state;
    saveAll(all);
  }

  function isDone(example) {
    const st = loadState(example.id);
    return example.questions.every((q) => st.revealed[q.id]);
  }

  // ---- Khối dựng chung -----------------------------------------------------

  function latexBlock(content, className) {
    return AM.latex.render(content, className || 'qprompt');
  }

  /** Bảng tĩnh (phân công vai trò, phản hồi của giáo viên…) — ô chứa LaTeX. */
  function staticTable(head, rows) {
    const thead = el(
      'tr',
      {},
      head.map((h) => el('th', { class: 'kntt-td', style: { fontWeight: 700 } }, h)),
    );
    const body = rows.map((cells) =>
      el('tr', {}, cells.map((c) => {
        const td = el('td', { class: 'kntt-td' });
        td.appendChild(AM.latex.render(c, '', 'div'));
        return td;
      })),
    );
    return el(
      'div',
      { style: { overflowX: 'auto' } },
      el('table', { class: 'kntt-table' }, thead, body),
    );
  }

  // =========================================================================
  // Danh sách nhiệm vụ
  // =========================================================================

  function listScreen() {
    const groups = new Map();
    for (const ex of EXAMPLES) {
      const bucket = groups.get(ex.method) || [];
      bucket.push(ex);
      groups.set(ex.method, bucket);
    }

    const doneCount = EXAMPLES.filter(isDone).length;

    return el(
      'div',
      { class: 'stack' },
      el(
        'section',
        { class: 'card card-dark stack-sm' },
        el('h1', { class: 'page-title', style: { color: '#fff' } }, 'Nhiệm vụ phát triển năng lực số'),
        el(
          'p',
          { style: { color: 'rgba(234,255,245,0.85)', lineHeight: 1.7 } },
          'Chín nhiệm vụ minh họa cho năm biện pháp phát triển năng lực số trong dạy học Toán. ' +
            'Mỗi nhiệm vụ gồm: tình huống, các mức hỗ trợ, câu hỏi làm trực tiếp trên hệ thống và phiếu học tập để tạo sản phẩm/minh chứng.',
        ),
        el(
          'div',
          { class: 'row' },
          ui.pill('Hoàn thành ' + doneCount + '/' + EXAMPLES.length + ' nhiệm vụ', doneCount === EXAMPLES.length ? 'lime' : 'sky'),
        ),
      ),
      Array.from(groups.entries()).map(([method, items]) =>
        ui.sectionCard(
          method,
          null,
          el(
            'div',
            { class: 'list' },
            items.map((ex) =>
              el(
                'a',
                {
                  class: 'list-row',
                  href: '#/digital-tasks?id=' + ex.id,
                  style: { textDecoration: 'none', color: 'inherit' },
                },
                ui.pill(ex.code, 'violet'),
                el(
                  'span',
                  { class: 'grow' },
                  el('span', { class: 'title', style: { display: 'block' } }, ex.title),
                  el(
                    'span',
                    { class: 'muted-sm' },
                    'Lớp ' + ex.grade + ' · ' +
                      ((AM.topics.getTopicById(ex.topicId) || {}).title || '') +
                      ' · ' + ex.competency,
                  ),
                ),
                isDone(ex) ? ui.pill('Đã hoàn thành', 'lime') : ui.pill('Chưa làm', 'amber'),
              ),
            ),
          ),
        ),
      ),
      ui.footerNote(),
    );
  }

  // =========================================================================
  // Một nhiệm vụ
  // =========================================================================

  function detailScreen(example, rerender) {
    const st = loadState(example.id);
    const topic = AM.topics.getTopicById(example.topicId);

    function persist() {
      saveState(example.id, st);
    }

    // ---- Đầu trang ---------------------------------------------------------

    const header = el(
      'section',
      { class: 'card stack-sm' },
      el(
        'div',
        { class: 'row' },
        ui.pill(example.code, 'violet'),
        ui.pill('Lớp ' + example.grade, 'sky'),
        topic ? ui.pill(topic.title, 'green') : null,
      ),
      el('h1', { class: 'page-title' }, example.title),
      el('p', { class: 'muted-sm' }, example.method),
      el(
        'p',
        { class: 'muted-sm' },
        el('strong', {}, 'Yếu tố năng lực số hướng tới: '),
        example.competency,
      ),
    );

    // ---- Nhiệm vụ ----------------------------------------------------------

    const taskCard = ui.sectionCard(
      [U.icon('assignment'), ' Nhiệm vụ trên hệ thống'],
      null,
      latexBlock(example.taskIntro),
    );

    // ---- Mức hỗ trợ --------------------------------------------------------

    function supportCard() {
      return ui.sectionCard(
        [U.icon('tune'), ' Mức hỗ trợ thích ứng'],
        'Giáo viên phân hóa mức hỗ trợ — chọn mức phù hợp với em.',
        el(
          'div',
          { class: 'row' },
          example.supports.map((_, i) =>
            el(
              'button',
              {
                class: U.cn('btn', 'btn-sm', i === st.support ? 'btn-primary' : 'btn-outline'),
                onclick: function () {
                  st.support = i;
                  persist();
                  rerender();
                },
              },
              'Mức hỗ trợ ' + (i + 1),
            ),
          ),
        ),
        ui.banner('info', latexBlock(example.supports[st.support], '')),
      );
    }

    // ---- Câu hỏi tương tác -------------------------------------------------

    function questionBlock(question, index) {
      const revealed = !!st.revealed[question.id];
      let answer = st.answers.hasOwnProperty(question.id)
        ? st.answers[question.id]
        : ui.blankAnswer(question);

      const holder = el('div', { class: 'stack-sm' });

      function draw() {
        holder.innerHTML = '';
        holder.appendChild(
          el('p', { class: 'muted-sm' }, el('strong', {}, 'Câu ' + (index + 1) + '/' + example.questions.length)),
        );
        holder.appendChild(
          ui.questionCard(question, { answer: answer, reveal: revealedNow() }, onChange),
        );
        if (revealedNow()) {
          const score = st.scores[question.id] || 0;
          holder.appendChild(
            ui.banner(
              score >= 0.75 ? 'info' : score > 0 ? 'warn' : 'error',
              el(
                'div',
                {},
                el('strong', {}, score >= 0.75 ? 'Chính xác!' : score > 0 ? 'Đúng một phần.' : 'Chưa đúng.'),
                ' Điểm: ' + U.pct(score) + '.',
              ),
            ),
          );
          const sol = ui.solutionBlock(question);
          if (sol) holder.appendChild(sol);
        } else {
          holder.appendChild(
            el(
              'div',
              { class: 'row', style: { justifyContent: 'flex-end' } },
              el(
                'button',
                {
                  class: 'btn btn-lime ex-submit',
                  disabled: !ui.hasAnswer(question, answer),
                  onclick: submit,
                },
                'Nộp câu trả lời',
              ),
            ),
          );
        }
      }

      function revealedNow() {
        return !!st.revealed[question.id];
      }

      function onChange(next) {
        answer = next;
        st.answers[question.id] = answer;
        persist();
        // Typing into the short-answer box must not rebuild the box (that
        // dropped the caret after every character). Only the submit button
        // needs to follow the answer; choice questions redraw as before.
        if (question.type === 'shortans') {
          const btn = holder.querySelector('.ex-submit');
          if (btn) btn.disabled = !ui.hasAnswer(question, answer);
          return;
        }
        draw();
      }

      function submit() {
        if (!ui.hasAnswer(question, answer)) return;
        st.revealed[question.id] = true;
        st.scores[question.id] = AM.cat.gradeAnswer(question, answer);
        st.answers[question.id] = answer;
        persist();
        // Câu cuối cùng vừa nộp xong: vẽ lại cả trang để banner "đã hoàn
        // thành" và trạng thái danh sách cập nhật ngay, không đợi tải lại.
        if (example.questions.every((q) => st.revealed[q.id])) {
          rerender();
        } else {
          draw();
        }
      }

      draw();
      return holder;
    }

    function questionsCard() {
      const allDone = example.questions.every((q) => st.revealed[q.id]);
      return ui.sectionCard(
        [U.icon('quiz'), ' Trả lời trên hệ thống'],
        'Hệ thống chấm tự động và lưu vết bài làm — kết quả dùng cho bước phản hồi của giáo viên.',
        el(
          'div',
          { class: 'stack' },
          example.questions.map((q, i) => questionBlock(q, i)),
        ),
        allDone
          ? ui.banner(
              'info',
              el('strong', {}, 'Đã hoàn thành phần trả lời. '),
              'Tiếp tục hoàn thiện phiếu học tập bên dưới để tạo sản phẩm/minh chứng.',
            )
          : null,
      );
    }

    // ---- Phiếu học tập -----------------------------------------------------

    function worksheetCard() {
      const ws = example.worksheet;
      if (!ws) return null;

      return ui.sectionCard(
        [U.icon('edit_note'), ' ' + ws.title],
        ws.note || null,
        el(
          'div',
          { class: 'stack-sm' },
          ws.rows.map((row, i) =>
            el(
              'div',
              { class: 'stack-sm', style: { marginBottom: '0.35rem' } },
              el('label', { class: 'field-label' }, AM.latex.render(row.label, '', 'span')),
              el(
                'textarea',
                {
                  class: 'field',
                  rows: 2,
                  placeholder: 'Câu trả lời của em…',
                  oninput: function (e) {
                    st.notes[i] = e.target.value;
                    persist();
                  },
                },
                st.notes[i] || '',
              ),
              st.showModels
                ? ui.banner('info', el('div', {},
                    el('strong', {}, 'Sản phẩm minh họa: '),
                    latexBlock(row.model, '')))
                : null,
            ),
          ),
        ),
        el(
          'div',
          { class: 'row' },
          el(
            'button',
            {
              class: U.cn('btn', st.showModels ? 'btn-outline' : 'btn-primary'),
              onclick: function () {
                st.showModels = !st.showModels;
                persist();
                rerender();
              },
            },
            st.showModels ? 'Ẩn sản phẩm minh họa' : 'Đối chiếu với sản phẩm minh họa',
          ),
        ),
      );
    }

    // ---- Bảng của giáo viên ------------------------------------------------

    function teacherCard() {
      const t = example.teacherTable;
      if (!t) return null;
      return ui.sectionCard([U.icon('fact_check'), ' ' + t.title], null, staticTable(t.head, t.rows));
    }

    // ---- Điều hướng tiếp ---------------------------------------------------

    const footer = el(
      'div',
      { class: 'row', style: { justifyContent: 'space-between' } },
      el('a', { class: 'btn btn-outline', href: '#/digital-tasks' }, 'Danh sách nhiệm vụ'),
      el(
        'div',
        { class: 'row' },
        topic
          ? el(
              'a',
              { class: 'btn btn-ghost', href: '#/theory?topic=' + example.topicId },
              'Lý thuyết chủ đề',
            )
          : null,
        topic
          ? el(
              'a',
              { class: 'btn btn-lime', href: '#/practice?topic=' + example.topicId + '&levels=N,H' },
              'Luyện tập củng cố chủ đề này',
            )
          : null,
      ),
    );

    return el(
      'div',
      { class: 'stack' },
      header,
      taskCard,
      supportCard(),
      questionsCard(),
      worksheetCard(),
      teacherCard(),
      footer,
      ui.footerNote(),
    );
  }

  // =========================================================================
  // View
  // =========================================================================

  function view(params) {
    const container = el('div', {});
    const example = params.id ? EXAMPLES.find((e) => e.id === params.id) : null;

    function rerender() {
      U.mount(
        container,
        ui.page(
          {
            title: example ? example.code + ' · Nhiệm vụ số' : 'Nhiệm vụ số',
            activeRoute: '#/digital-tasks',
            actions: [ui.homeButton()],
          },
          example
            ? detailScreen(example, rerender)
            : params.id
              ? ui.empty('🔎', 'Không tìm thấy nhiệm vụ', 'Mã nhiệm vụ không hợp lệ.',
                  el('a', { class: 'btn btn-primary', href: '#/digital-tasks' }, 'Về danh sách'))
              : listScreen(),
        ),
      );
    }

    rerender();
    return container;
  }

  AM.views = AM.views || {};
  AM.views.digitalTasks = view;
})(window.AM);
