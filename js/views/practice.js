/**
 * Practice runner — a three-phase session on one topic.
 *
 *   Warm-up   : easy items from topics already mastered (confidence primer)
 *   Practice  : items at the requested levels, difficulty steered live by the
 *               adaptive engine
 *   Assessment: a fixed mini-quiz used to score the session
 *
 * On finish this updates, in order: BKT mastery, SRS schedule (once mastered),
 * the error journal, XP/streak/badges, and the completed-activity list.
 */
(function (AM) {
  'use strict';

  const U = AM.util;
  const el = U.el;
  const ui = AM.ui;
  const C = AM.const;

  const PHASE_LABELS = {
    warmup: 'Khởi động',
    practice: 'Luyện tập',
    assessment: 'Kiểm tra nhanh',
  };

  function view(params, ctx) {
    const topicId = params.topic;
    const topic = topicId ? AM.topics.getTopicById(topicId) : null;

    if (!ctx.hasProfile || !topic) {
      return ui.page(
        { title: 'Luyện tập', activeRoute: '#/learning-path', actions: [ui.homeButton()] },
        ui.empty('🎯', 'Không mở được phiên luyện tập', 'Thiếu hồ sơ hoặc mã chủ đề không hợp lệ.'),
      );
    }

    const levels = (params.levels || 'N,H').split(',').filter(Boolean);
    const activityId = params.activityId || null;
    const wantCount = Math.max(1, Math.min(20, Number(params.count) || 5));

    // ---- Build the question queue ----------------------------------------

    const masteredTopicIds = Object.keys(ctx.learner.bkt).filter((id) =>
      AM.bkt.isMastered(ctx.learner.bkt[id]),
    );

    const selection = AM.practiceSelector.selectPracticeQuestions(
      ctx.pool,
      topicId,
      levels,
      ctx.learner,
      masteredTopicIds,
      U.hashStringToU32(topicId + '|' + levels.join(',') + '|' + U.todayVNStr()),
    );

    const queue = []
      .concat(selection.warmup.slice(0, 2).map((q) => ({ q: q, phase: 'warmup' })))
      .concat(selection.practice.slice(0, wantCount).map((q) => ({ q: q, phase: 'practice' })))
      .concat(selection.assessment.map((q) => ({ q: q, phase: 'assessment' })));

    if (queue.length === 0) {
      return ui.page(
        { title: 'Luyện tập', activeRoute: '#/learning-path', actions: [ui.homeButton()] },
        ui.empty(
          '📭',
          'Hết câu hỏi',
          'Không còn câu hỏi cho chủ đề "' +
            topic.title +
            '" ở mức ' +
            levels.join(', ') +
            '. Thử mức độ khác.',
          el('a', { class: 'btn btn-primary', href: '#/profile' }, 'Về hồ sơ'),
        ),
      );
    }

    const container = el('div', {});
    const startedAt = Date.now();

    const rt = {
      index: 0,
      answer: ui.blankAnswer(queue[0].q),
      reveal: false,
      lastScore: 0,
      metrics: AM.adaptive.emptySessionMetrics(),
      decision: null,
      questionStartedAt: Date.now(),
      results: [], // { question, score, answered, phase, durationMs }
      finished: false,
    };

    // ---- Submission -------------------------------------------------------

    function submit(skipped) {
      const item = queue[rt.index];
      const question = item.q;
      const answered = !skipped && ui.hasAnswer(question, rt.answer);
      const score = answered ? AM.cat.gradeAnswer(question, rt.answer) : 0;
      const durationMs = Date.now() - rt.questionStartedAt;

      rt.results.push({
        question: question,
        phase: item.phase,
        score: score,
        answered: answered,
        durationMs: durationMs,
        studentAnswer: AM.practiceSelector.serializeAnswer(rt.answer),
      });

      rt.metrics = AM.adaptive.updateMetrics(rt.metrics, question, score, durationMs, !answered);
      rt.decision = AM.adaptive.computeAdaptiveDecision(
        rt.metrics,
        ctx.knowledge ? ctx.knowledge.theta : 0,
      );

      rt.lastScore = score;
      rt.reveal = true;
      rerender();
    }

    function next() {
      if (rt.index >= queue.length - 1) return finish();
      rt.index += 1;
      rt.answer = ui.blankAnswer(queue[rt.index].q);
      rt.reveal = false;
      rt.questionStartedAt = Date.now();
      rerender();
    }

    // ---- Session completion ----------------------------------------------

    /**
     * Fold the session into LearnerState. Order matters: BKT first (SRS keys
     * off the post-session mastery), then errors, then gamification.
     */
    function finish() {
      const learner = AM.store.loadLearnerState();

      // Only the target topic's own questions move its mastery — warm-ups
      // come from other topics and would otherwise pollute the estimate.
      const ownResults = rt.results.filter((r) => r.question.topicId === topicId);
      const attempted = ownResults.length;
      const correctCount = ownResults.filter((r) => r.score >= 0.75).length;
      const accuracy = attempted > 0 ? correctCount / attempted : 0;

      // --- BKT ---
      const diagMastery =
        ctx.knowledge &&
        (ctx.knowledge.topics.find((t) => t.topicId === topicId) || {}).mastery;
      const before =
        learner.bkt[topicId] ||
        AM.bkt.initBktState(typeof diagMastery === 'number' ? diagMastery : null);
      const after = AM.bkt.updateBktBatch(
        before,
        ownResults.map((r) => ({ correct: r.score >= 0.75 })),
      );
      learner.bkt[topicId] = after;

      // --- SRS: starts the first time a topic is mastered, then reschedules
      //     on EVERY later session, pass or fail. A failed review must reach
      //     SM-2's failure branch (interval back to 1 day); gating this on
      //     "still mastered" left a stale past-due date that nagged forever. ---
      const hadSchedule = !!learner.srs[topicId];
      if (hadSchedule) {
        learner.srs[topicId] = AM.srs.scheduleReview(
          learner.srs[topicId],
          AM.srs.accuracyToQuality(accuracy),
        );
        learner.gamification.totalReviewsCompleted += 1;
      } else if (AM.bkt.isMastered(after)) {
        learner.srs[topicId] = AM.srs.initSrsState();
      }

      // --- Error journal (skipped questions are not "errors" — there is no
      //     student answer to learn from, and journaling them let a student
      //     skip through a session and fill the notebook with blanks) ---
      const nowIso = new Date().toISOString();
      for (const r of rt.results) {
        if (!r.answered) continue;
        if (r.score >= 0.75) {
          // Getting a previously-missed question right resolves that entry.
          for (const e of learner.errors) {
            if (e.questionId === r.question.id && !e.resolved) e.resolved = true;
          }
          continue;
        }
        learner.errors.push({
          questionId: r.question.id,
          topicId: r.question.topicId,
          studentAnswer: r.studentAnswer,
          correctAnswer: AM.practiceSelector.serializeCorrectAnswer(r.question),
          score: r.score,
          timestamp: nowIso,
          resolved: false,
        });
      }

      // --- Gamification. Only *answered* questions earn XP or count towards
      //     the question badges; skipping through a session earns nothing. ---
      const g = learner.gamification;
      const answeredOwnWrong = ownResults.filter((r) => r.answered && r.score < 0.75).length;
      const answeredAll = rt.results.filter((r) => r.answered).length;
      const xpEarned =
        correctCount * C.XP.perCorrect +
        answeredOwnWrong * C.XP.perAttempted +
        (!AM.bkt.isMastered(before) && AM.bkt.isMastered(after) ? C.XP.perTopicMastered : 0);
      g.xp += xpEarned;
      g.level = C.xpToLevel(g.xp);
      g.totalQuestionsAttempted += answeredAll;
      // `sessions` is pruned to the last 50 in store.js, so keep a real counter.
      g.totalSessions = Math.max(g.totalSessions || 0, learner.sessions.length) + 1;

      const today = U.todayVNStr();
      if (g.lastPracticeDate !== today) {
        const yesterday = U.addDaysStr(today, -1);
        g.currentStreak = g.lastPracticeDate === yesterday ? g.currentStreak + 1 : 1;
        g.longestStreak = Math.max(g.longestStreak, g.currentStreak);
        g.lastPracticeDate = today;
      }

      const assessResults = rt.results.filter((r) => r.phase === 'assessment');
      const perfectAssessment =
        assessResults.length > 0 && assessResults.every((r) => r.score >= 0.999);

      const earn = (id) => {
        if (g.badges.indexOf(id) === -1) g.badges.push(id);
      };
      earn('first-practice');
      if (g.currentStreak >= 5) earn('streak-5');
      if (g.currentStreak >= 10) earn('streak-10');
      if (g.totalQuestionsAttempted >= 100) earn('q-100');
      if (g.totalQuestionsAttempted >= 500) earn('q-500');
      if (AM.bkt.isMastered(after)) earn('first-mastery');
      if (perfectAssessment) earn('perfect-assessment');
      if (g.totalReviewsCompleted >= 10) earn('review-10');

      // --- Bookkeeping ---
      learner.sessions.push({
        sessionId: U.uid('prac'),
        topicId: topicId,
        date: today,
        questionsAttempted: rt.results.length,
        correctCount: rt.results.filter((r) => r.score >= 0.75).length,
        masteryBefore: before.pL,
        masteryAfter: after.pL,
        xpEarned: xpEarned,
        durationMs: Date.now() - startedAt,
        adaptiveTransitions: [],
      });

      const usedIds = new Set(learner.usedQuestionIds);
      for (const r of rt.results) usedIds.add(r.question.id);
      learner.usedQuestionIds = Array.from(usedIds);

      if (activityId && learner.completedActivities.indexOf(activityId) === -1) {
        learner.completedActivities.push(activityId);
      }

      AM.store.saveLearnerState(learner);

      rt.finished = true;
      rt.summary = {
        attempted: rt.results.length,
        correct: rt.results.filter((r) => r.score >= 0.75).length,
        accuracy: accuracy,
        xpEarned: xpEarned,
        masteryBefore: before.pL,
        masteryAfter: after.pL,
        newBadges: g.badges,
        mastered: AM.bkt.isMastered(after),
        nextReview: learner.srs[topicId] ? learner.srs[topicId].nextReviewDate : null,
      };
      rerender();
    }

    // ---- Rendering --------------------------------------------------------

    function header() {
      const item = queue[rt.index];
      return el(
        'div',
        { class: 'card card-tight stack-sm' },
        el(
          'div',
          { class: 'row', style: { justifyContent: 'space-between' } },
          el(
            'div',
            { class: 'row' },
            ui.pill(PHASE_LABELS[item.phase], item.phase === 'assessment' ? 'amber' : 'green'),
            ui.pill('Câu ' + (rt.index + 1) + '/' + queue.length, 'sky'),
            rt.metrics.streak > 1 ? ui.pill('🔥 chuỗi ' + rt.metrics.streak, 'lime') : null,
          ),
          rt.decision
            ? ui.pill(AM.adaptive.STATE_LABELS[rt.decision.state], 'violet')
            : null,
        ),
        ui.bar(rt.index / queue.length),
      );
    }

    function suggestionBox() {
      if (!rt.decision || !rt.decision.suggestion) return null;
      return ui.banner('info', rt.decision.suggestion);
    }

    function runnerScreen() {
      const item = queue[rt.index];
      const question = item.q;

      function handleAnswerChange(nextAnswer) {
        rt.answer = nextAnswer;
        if (question.type === 'shortans') {
          const btn = U.qs('#prac-submit', container);
          if (btn) btn.disabled = !ui.hasAnswer(question, rt.answer);
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
        const btn = U.qs('#prac-submit', container);
        if (btn) btn.disabled = !ui.hasAnswer(question, rt.answer);
      }

      return el(
        'div',
        { class: 'stack-sm' },
        header(),
        el(
          'p',
          { class: 'muted-sm' },
          item.phase === 'warmup'
            ? 'Khởi động từ chủ đề bạn đã thành thạo — không tính vào mức độ của bài này.'
            : topic.chapterTitle + ' · ' + topic.title,
        ),
        ui.questionCard(question, { answer: rt.answer, reveal: rt.reveal }, handleAnswerChange),
        rt.reveal
          ? ui.banner(
              rt.lastScore >= 0.75 ? 'info' : rt.lastScore > 0 ? 'warn' : 'error',
              el(
                'div',
                {},
                el(
                  'strong',
                  {},
                  rt.lastScore >= 0.75
                    ? 'Chính xác!'
                    : rt.lastScore > 0
                      ? 'Đúng một phần.'
                      : 'Chưa đúng.',
                ),
                ' Điểm: ' + U.pct(rt.lastScore) + '.',
              ),
            )
          : null,
        rt.reveal ? suggestionBox() : null,
        rt.reveal ? ui.solutionBlock(question) : null,
        el(
          'div',
          { class: 'row', style: { justifyContent: 'space-between' } },
          el(
            'a',
            { class: 'btn btn-outline btn-sm', href: '#/learning-path' },
            'Thoát',
          ),
          rt.reveal
            ? el(
                'button',
                { class: 'btn btn-primary', onclick: next },
                rt.index >= queue.length - 1 ? 'Kết thúc phiên' : 'Câu tiếp theo',
                U.icon('chevron_right'),
              )
            : el(
                'div',
                { class: 'row' },
                el('button', { class: 'btn btn-outline', onclick: () => submit(true) }, 'Bỏ qua'),
                el(
                  'button',
                  {
                    id: 'prac-submit',
                    class: 'btn btn-lime',
                    disabled: !ui.hasAnswer(question, rt.answer),
                    onclick: () => submit(false),
                  },
                  'Trả lời',
                ),
              ),
        ),
      );
    }

    function summaryScreen() {
      const s = rt.summary;
      const delta = s.masteryAfter - s.masteryBefore;

      return el(
        'div',
        { class: 'stack' },
        el(
          'section',
          { class: 'card card-dark stack-sm' },
          el('div', { style: { fontSize: '2.5rem' } }, s.accuracy >= 0.8 ? '🎉' : '💪'),
          el('h1', { class: 'page-title', style: { color: '#fff' } }, 'Hoàn thành phiên luyện tập'),
          el(
            'p',
            { style: { color: 'rgba(234,255,245,0.8)', fontWeight: 500, lineHeight: 1.7 } },
            topic.title + ' · đúng ' + s.correct + '/' + s.attempted + ' câu (' + U.pct(s.accuracy) + ').',
          ),
        ),
        el(
          'section',
          { class: 'grid-3' },
          ui.statTile('+' + s.xpEarned, 'XP nhận được'),
          ui.statTile(U.pct(s.masteryAfter), 'Mức thành thạo (BKT)'),
          ui.statTile((delta >= 0 ? '+' : '') + (delta * 100).toFixed(1) + '%', 'Thay đổi so với trước'),
        ),
        s.mastered
          ? ui.banner(
              'info',
              el('strong', {}, 'Đã thành thạo chủ đề này! '),
              s.nextReview
                ? 'Lịch ôn tập tiếp theo: ' + U.formatDateVN(s.nextReview) + '.'
                : '',
            )
          : null,
        ui.sectionCard(
          [U.icon('fact_check'), 'Chi tiết từng câu'],
          null,
          el(
            'div',
            { class: 'list' },
            rt.results.map((r, i) =>
              el(
                'div',
                { class: 'list-row' },
                ui.pill(String(i + 1), r.score >= 0.75 ? 'lime' : r.score > 0 ? 'amber' : 'rose'),
                el(
                  'span',
                  { class: 'grow' },
                  el(
                    'span',
                    { class: 'title', style: { display: 'block' } },
                    AM.latex.truncate(AM.latex.toPlainText(r.question.prompt), 90),
                  ),
                  el(
                    'span',
                    { class: 'muted-sm' },
                    PHASE_LABELS[r.phase] +
                      ' · mức ' +
                      r.question.level +
                      ' · ' +
                      U.formatDuration(r.durationMs) +
                      (r.answered ? '' : ' · bỏ qua'),
                  ),
                ),
                ui.pill(U.pct(r.score), 'green'),
              ),
            ),
          ),
        ),
        el(
          'div',
          { class: 'row' },
          el('a', { class: 'btn btn-lime', href: '#/learning-path' }, 'Về lộ trình'),
          el('a', { class: 'btn btn-ghost', href: '#/profile' }, 'Xem hồ sơ'),
          el('a', { class: 'btn btn-ghost', href: '#/errors' }, 'Sổ tay lỗi sai'),
        ),
        ui.footerNote(),
      );
    }

    function rerender() {
      U.mount(
        container,
        ui.page(
          {
            title: rt.finished ? 'Kết quả luyện tập' : 'Luyện tập · ' + topic.title,
            activeRoute: '#/learning-path',
            actions: [ui.homeButton()],
          },
          rt.finished ? summaryScreen() : runnerScreen(),
        ),
      );
    }

    rerender();
    return container;
  }

  AM.views = AM.views || {};
  AM.views.practice = view;
})(window.AM);
