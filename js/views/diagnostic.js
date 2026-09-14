/**
 * Diagnostic runner — the adaptive entry test.
 *
 * Drives the ladder selector in core/cat.js:
 *   select item → student answers → grade → transition that topic's ladder
 *   → re-estimate θ → check stop rules → repeat.
 *
 * The session is written to localStorage on every response, so closing the
 * tab mid-test never loses progress: reopening the page offers to resume.
 */
(function (AM) {
  'use strict';

  const U = AM.util;
  const el = U.el;
  const ui = AM.ui;
  const C = AM.const;

  function view(params, ctx) {
    if (!ctx.hasProfile) {
      return ui.page(
        { title: 'Kiểm tra đầu vào', activeRoute: '#/diagnostic', actions: [ui.homeButton()] },
        ui.empty(
          '📝',
          'Cần thiết lập hồ sơ trước',
          'Hệ thống cần biết lớp và mục tiêu của bạn để chọn đúng ngân hàng câu hỏi.',
          el('a', { class: 'btn btn-primary', href: '#/onboarding' }, 'Thiết lập ngay'),
        ),
      );
    }

    const profile = ctx.profile;
    const pool = ctx.pool;

    if (pool.length === 0) {
      return ui.page(
        { title: 'Kiểm tra đầu vào', activeRoute: '#/diagnostic', actions: [ui.homeButton()] },
        ui.empty('📭', 'Chưa có câu hỏi', 'Ngân hàng câu hỏi cho lớp này đang trống.'),
      );
    }

    const container = el('div', {});
    let timerId = null;

    // ---- Session state ----------------------------------------------------

    /** Runtime state: the persisted session plus the in-flight question. */
    const rt = {
      session: null,
      current: null, // { question, startedAt, limitSec }
      answer: null,
      reveal: false,
      lastScore: 0,
      secondsLeft: 0,
      showIntro: true,
      debug: null,
    };

    function freshSession() {
      const startingTheta = AM.irt.startingThetaFromSelfLevel(profile.selfLevel);
      return {
        sessionId: U.uid('cat'),
        grade: profile.grade,
        selfLevel: profile.selfLevel,
        theta: startingTheta,
        standardError: Math.sqrt(AM.irt.PRIOR_VARIANCE),
        responses: [],
        shownIds: [],
        sessionStartedAt: Date.now(),
        finished: false,
        stopReason: null,
        topicStates: AM.cat.initTopicStates(pool, AM.topics.TOPICS, profile.grade),
      };
    }

    // An unfinished session from a previous visit can be resumed.
    const saved = ctx.diagnostic;
    const resumable = saved && !saved.finished && saved.grade === profile.grade;

    function stopTimer() {
      if (timerId !== null) {
        window.clearInterval(timerId);
        timerId = null;
      }
    }

    /**
     * Save the session — but not before the first answer. A fresh session
     * written at "Bắt đầu" would overwrite a finished one the moment a student
     * clicked "Làm lại từ đầu", so backing out of a retake destroyed the real
     * result. Until something has been answered there is nothing worth keeping.
     */
    function persist() {
      if (rt.session.responses.length === 0 && !rt.session.finished) return;
      AM.store.saveDiagnostic(rt.session);
    }

    // ---- Flow -------------------------------------------------------------

    function startSession(existing) {
      rt.session = existing || freshSession();
      if (existing) {
        // The time budget is for *active* time. Coming back a day later must
        // not end the session on its first question with "time-expired", so
        // the idle gap since the last answer is added to the start stamp.
        const last = existing.responses[existing.responses.length - 1];
        const lastActive = last ? last.endedAt : existing.sessionStartedAt;
        const idleMs = Math.max(0, Date.now() - lastActive);
        rt.session.sessionStartedAt = existing.sessionStartedAt + idleMs;
      }
      rt.showIntro = false;
      persist();
      nextQuestion();
    }

    function nextQuestion() {
      stopTimer();
      rt.answer = null;
      rt.reveal = false;

      const stop = AM.cat.shouldStop(rt.session);
      if (stop) return finish(stop);

      const picked = AM.cat.selectNextQuestionWithDebug(pool, rt.session);
      if (!picked) return finish('no-more-items');

      rt.debug = picked.debug;
      const question = picked.chosen;
      const limitSec = AM.cat.timeLimitForItem(question);

      rt.current = { question: question, startedAt: Date.now(), limitSec: limitSec };
      rt.answer = ui.blankAnswer(question);
      rt.secondsLeft = limitSec;

      timerId = window.setInterval(function () {
        rt.secondsLeft -= 1;
        if (rt.secondsLeft <= 0) {
          // Out of time: whatever has been entered is graded as-is; with
          // nothing entered it counts as a skip, not a wrong answer.
          submit(true);
        } else {
          updateTimerDisplay();
        }
      }, 1000);

      rerender();
    }

    /** Grade the current answer, update the ladder + θ, then reveal. */
    function submit(timedOut) {
      stopTimer();
      const question = rt.current.question;
      const answered = ui.hasAnswer(question, rt.answer);
      const score = answered ? AM.cat.gradeAnswer(question, rt.answer) : 0;

      rt.session.responses.push({
        questionId: question.id,
        startedAt: rt.current.startedAt,
        endedAt: Date.now(),
        score: score,
        answered: answered,
        timedOut: !!timedOut,
      });
      rt.session.shownIds.push(question.id);

      // Ladder transition for this topic.
      const shownSet = new Set(rt.session.shownIds);
      rt.session.topicStates[question.topicId] = AM.cat.transitionTopicState(
        rt.session.topicStates[question.topicId] || {
          level: 'N',
          wrongsAtLevel: 0,
          ceilingLevel: 'none',
        },
        question,
        score >= 0.75,
        pool,
        shownSet,
      );

      // Re-estimate θ across the whole history.
      const poolById = new Map(pool.map((q) => [q.id, q]));
      const estimate = AM.irt.estimateThetaFromSession(
        rt.session.responses,
        function (id) {
          const q = poolById.get(id);
          return q ? q.irt : null;
        },
        { startingTheta: rt.session.theta },
      );
      rt.session.theta = estimate.theta;
      rt.session.standardError = estimate.standardError;

      rt.lastScore = score;
      rt.reveal = true;
      persist();
      rerender();
    }

    function finish(reason) {
      stopTimer();
      rt.session.finished = true;
      rt.session.stopReason = reason;
      persist();
      AM.router.navigate('#/profile');
    }

    function cancel() {
      if (!window.confirm('Dừng bài kiểm tra? Kết quả hiện tại vẫn được lưu.')) return;
      if (rt.session.responses.length === 0) {
        stopTimer();
        AM.router.navigate('#/');
        return;
      }
      finish('user-cancelled');
    }

    // ---- Rendering --------------------------------------------------------

    /** Enable/disable "Trả lời" without rebuilding the question card. */
    function syncSubmitButton(question) {
      const btn = U.qs('#cat-submit', container);
      if (btn) btn.disabled = !ui.hasAnswer(question, rt.answer);
    }

    function updateTimerDisplay() {
      const node = U.qs('#cat-timer', container);
      if (!node) return;
      node.textContent = U.formatClock(rt.secondsLeft);
      node.parentNode.className = U.cn('timer', rt.secondsLeft <= 15 && 'is-low');
    }

    function introScreen() {
      const topicCount = AM.topics.getTopicsByGrade(profile.grade).length;
      return el(
        'div',
        { class: 'card stack-sm' },
        el('div', { style: { fontSize: '2.5rem' } }, '🧭'),
        el('h1', { class: 'page-title' }, 'Bài kiểm tra đầu vào'),
        el(
          'p',
          { class: 'page-sub' },
          'Bài kiểm tra đi qua từng chủ đề theo thang Nhận biết → Thông hiểu → Vận dụng. ' +
            'Trả lời đúng thì lên mức khó hơn; trả lời sai thì có một câu xác minh trước ' +
            'khi chuyển chủ đề. Không có điểm số — mục tiêu là vẽ đúng bản đồ năng lực của bạn.',
        ),
        el(
          'div',
          { class: 'grid-3' },
          ui.statTile(String(topicCount), 'Chủ đề sẽ quét'),
          ui.statTile('≤ ' + C.CAT_CONFIG.maxItems, 'Câu hỏi tối đa'),
          ui.statTile('90–180s', 'Mỗi câu'),
        ),
        ui.banner(
          'info',
          'Bạn có thể dừng giữa chừng — tiến trình được lưu lại và có thể học tiếp sau.',
        ),
        el(
          'div',
          { class: 'row' },
          el(
            'button',
            { class: 'btn btn-lime', onclick: () => startSession(null) },
            resumable ? 'Làm lại từ đầu' : 'Bắt đầu',
            U.icon('trending_flat'),
          ),
          resumable
            ? el(
                'button',
                { class: 'btn btn-ghost', onclick: () => startSession(saved) },
                'Tiếp tục bài đang dở (' + saved.responses.length + ' câu)',
              )
            : null,
        ),
      );
    }

    function progressHeader() {
      const answered = rt.session.responses.length;
      const doneTopics = Object.keys(rt.session.topicStates).filter(
        (k) => rt.session.topicStates[k].level === 'done',
      ).length;
      const totalTopics = Object.keys(rt.session.topicStates).length;

      return el(
        'div',
        { class: 'card card-tight stack-sm' },
        el(
          'div',
          { class: 'row', style: { justifyContent: 'space-between' } },
          el(
            'div',
            { class: 'row' },
            ui.pill('Câu ' + (answered + 1), 'green', 'quiz'),
            ui.pill('Chủ đề xong: ' + doneTopics + '/' + totalTopics, 'sky', 'checklist'),
            ui.pill('θ ≈ ' + rt.session.theta.toFixed(2), 'violet', 'analytics'),
          ),
          el(
            'span',
            { class: U.cn('timer', rt.secondsLeft <= 15 && 'is-low') },
            U.icon('timer'),
            el('span', { id: 'cat-timer' }, U.formatClock(rt.secondsLeft)),
          ),
        ),
        ui.bar(totalTopics > 0 ? doneTopics / totalTopics : 0),
      );
    }

    function feedbackBox() {
      const correct = rt.lastScore >= 0.75;
      const partial = rt.lastScore > 0 && rt.lastScore < 0.75;
      return ui.banner(
        correct ? 'info' : partial ? 'warn' : 'error',
        el(
          'div',
          {},
          el(
            'strong',
            {},
            correct ? 'Chính xác!' : partial ? 'Đúng một phần.' : 'Chưa đúng.',
          ),
          ' Điểm câu này: ' + U.pct(rt.lastScore) + '.',
        ),
      );
    }

    function questionScreen() {
      const question = rt.current.question;
      const topic = AM.topics.getTopicById(question.topicId);

      /**
       * Swap just the question card when an answer changes.
       *
       * A full rerender would restart the countdown interval and, for the
       * short-answer input, blow away the caret position on every keystroke.
       * Text input therefore updates state without re-rendering at all.
       */
      function handleAnswerChange(next) {
        const isText = question.type === 'shortans';
        rt.answer = next;
        if (isText) {
          syncSubmitButton(question);
          return;
        }
        const box = U.qs('.qbox', container);
        if (!box) return;
        const fresh = ui.questionCard(
          question,
          { answer: rt.answer, reveal: rt.reveal },
          handleAnswerChange,
        );
        box.parentNode.replaceChild(fresh, box);
        syncSubmitButton(question);
      }

      return el(
        'div',
        { class: 'stack-sm' },
        progressHeader(),
        el(
          'p',
          { class: 'muted-sm' },
          topic ? topic.chapterTitle + ' · ' + topic.title : question.topicId,
        ),
        ui.questionCard(
          question,
          { answer: rt.answer, reveal: rt.reveal },
          handleAnswerChange,
        ),
        rt.reveal ? feedbackBox() : null,
        rt.reveal ? ui.solutionBlock(question) : null,
        el(
          'div',
          { class: 'row', style: { justifyContent: 'space-between' } },
          el('button', { class: 'btn btn-danger btn-sm', onclick: cancel }, 'Dừng bài'),
          rt.reveal
            ? el(
                'button',
                { class: 'btn btn-primary', onclick: nextQuestion },
                'Câu tiếp theo',
                U.icon('chevron_right'),
              )
            : el(
                'div',
                { class: 'row' },
                el(
                  'button',
                  { class: 'btn btn-outline', onclick: () => submit(true) },
                  'Bỏ qua',
                ),
                el(
                  'button',
                  {
                    id: 'cat-submit',
                    class: 'btn btn-lime',
                    disabled: !ui.hasAnswer(question, rt.answer),
                    onclick: () => submit(false),
                  },
                  'Trả lời',
                ),
              ),
        ),
        debugPanel(),
      );
    }

    function debugPanel() {
      if (!rt.debug) return null;
      return el(
        'details',
        { class: 'debug' },
        el('summary', {}, 'Vì sao câu này được chọn?'),
        el(
          'div',
          { class: 'stack-sm', style: { marginTop: '0.75rem' } },
          el(
            'p',
            { class: 'muted-sm' },
            'Giai đoạn: ',
            el('strong', {}, rt.debug.phase === 'coverage' ? 'phủ chủ đề' : 'leo thang'),
            ' — ',
            rt.debug.phase === 'coverage'
              ? 'ưu tiên chủ đề chưa được hỏi lần nào.'
              : 'ưu tiên chủ đề có ít lượt hỏi nhất để leo tiếp thang.',
          ),
          el(
            'div',
            { class: 'list' },
            rt.debug.topicRanking.map(function (t) {
              const topic = AM.topics.getTopicById(t.topicId);
              return el(
                'div',
                { class: 'list-row' },
                el('span', { class: 'grow muted-sm' }, topic ? topic.title : t.topicId),
                ui.pill(t.attempts + ' lượt', 'green'),
                ui.pill('mức ' + t.level, 'sky'),
                t.wrongsAtLevel ? ui.pill('đang xác minh', 'amber') : null,
              );
            }),
          ),
        ),
      );
    }

    function rerender() {
      U.mount(
        container,
        ui.page(
          {
            title: 'Kiểm tra đầu vào',
            activeRoute: '#/diagnostic',
            actions: [ui.homeButton()],
          },
          rt.showIntro ? introScreen() : questionScreen(),
        ),
      );
    }

    rerender();

    // The router calls this before swapping in another view, so the ticking
    // interval can't outlive the page it belongs to.
    return { node: container, cleanup: stopTimer };
  }

  AM.views = AM.views || {};
  AM.views.diagnostic = view;
})(window.AM);
