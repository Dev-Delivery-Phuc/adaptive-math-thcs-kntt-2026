/**
 * Learning path — the day-by-day schedule.
 *
 * The path is regenerated whenever the profile or diagnostic is newer than
 * the stored copy, so changing your goal or retaking the test reshapes the
 * plan immediately. Completion ticks live in LearnerState, not in the path,
 * which is why regenerating never loses progress.
 */
(function (AM) {
  'use strict';

  const U = AM.util;
  const el = U.el;
  const ui = AM.ui;
  const C = AM.const;

  function activityHref(act) {
    if (act.type === 'theory') {
      return '#/theory?topic=' + encodeURIComponent(act.topicId);
    }
    return (
      '#/practice?topic=' +
      encodeURIComponent(act.topicId) +
      '&levels=' +
      encodeURIComponent((act.levels && act.levels.length ? act.levels : ['N', 'H']).join(',')) +
      '&activityId=' +
      encodeURIComponent(act.activityId) +
      '&count=' +
      (act.questionCount || 5)
    );
  }

  function activityChip(act, completedSet) {
    const done = completedSet.has(act.activityId);
    return el(
      'a',
      { class: U.cn('activity', done && 'is-done'), href: activityHref(act), title: act.reason },
      el('span', { class: 'type-dot type-' + act.type }, U.icon(C.ACTIVITY_ICONS[act.type])),
      el(
        'span',
        { class: 'grow' },
        el('span', { class: 'title', style: { display: 'block' } }, act.topicTitle),
        el(
          'span',
          { class: 'muted-sm' },
          C.ACTIVITY_LABELS[act.type] +
            (act.levels && act.levels.length ? ' · mức ' + act.levels.join(', ') : '') +
            (act.questionCount ? ' · ' + act.questionCount + ' câu' : '') +
            ' · ' +
            act.estimatedMinutes +
            ' phút',
        ),
      ),
      done ? U.icon('check_circle') : U.icon('chevron_right'),
    );
  }

  function dayRow(day, completedSet, todayStr) {
    const isToday = day.date === todayStr;
    return el(
      'div',
      { class: U.cn('day-row', day.isReviewDay && 'is-review') },
      el(
        'header',
        {},
        el('span', { class: 'day-badge' }, 'N' + day.dayNumber),
        el(
          'span',
          { class: 'grow' },
          el('strong', { style: { display: 'block' } }, U.formatDateVN(day.date)),
          el(
            'span',
            { class: 'muted-sm' },
            (day.isReviewDay ? 'Ngày ôn tập · ' : '') + day.estimatedMinutes + ' phút',
          ),
        ),
        isToday ? ui.pill('Hôm nay', 'lime') : null,
      ),
      el('div', { class: 'list' }, day.activities.map((a) => activityChip(a, completedSet))),
    );
  }

  function sprintCard(sprint, completedSet, todayStr) {
    let total = 0;
    let done = 0;
    for (const d of sprint.days) {
      for (const a of d.activities) {
        total++;
        if (completedSet.has(a.activityId)) done++;
      }
    }
    const ratio = total > 0 ? done / total : 0;

    // Plain .card, not .card.stack-sm: `display:flex` on <details> breaks the
    // disclosure widget in Safari and older Chrome.
    return el(
      'details',
      { class: 'card', open: sprint.weekNumber <= 2 ? true : null },
      el(
        'summary',
        { style: { cursor: 'pointer', listStyle: 'none' } },
        el(
          'div',
          { class: 'row', style: { justifyContent: 'space-between' } },
          el(
            'span',
            {},
            el('span', { class: 'card-title' }, sprint.label),
            el(
              'span',
              { class: 'muted-sm', style: { display: 'block' } },
              U.formatDateVN(sprint.startDate) +
                ' – ' +
                U.formatDateVN(sprint.endDate) +
                ' · ' +
                sprint.days.length +
                ' ngày',
            ),
          ),
          ui.pill(done + '/' + total + ' hoạt động', ratio >= 1 ? 'lime' : 'green'),
        ),
      ),
      el('div', { style: { marginTop: '0.5rem' } }, ui.bar(ratio, 'kha')),
      el(
        'p',
        { class: 'muted-sm' },
        'Chủ đề: ' + sprint.topicSummary.slice(0, 6).join(', ') +
          (sprint.topicSummary.length > 6 ? '…' : ''),
      ),
      el(
        'div',
        { class: 'stack-sm', style: { marginTop: '0.5rem' } },
        sprint.days.map((d) => dayRow(d, completedSet, todayStr)),
      ),
    );
  }

  function priorityPanel(path) {
    if (!path.priorityList || path.priorityList.length === 0) return null;
    return el(
      'details',
      { class: 'debug' },
      el('summary', {}, 'Vì sao thứ tự lại như vậy?'),
      el(
        'p',
        { class: 'muted-sm', style: { marginTop: '0.5rem' } },
        'Điểm ưu tiên = 0.30·khoảng cách + 0.20·độ gấp (hạn thi) + 0.20·độ mong manh + ' +
          '0.15·mật độ đề thi + 0.15·bạn tự đánh dấu yếu.',
      ),
      el(
        'div',
        { class: 'list', style: { marginTop: '0.5rem' } },
        path.priorityList.map((p) =>
          el(
            'div',
            { class: 'list-row', style: { flexWrap: 'wrap' } },
            el(
              'span',
              { class: 'grow' },
              el('span', { class: 'title', style: { display: 'block' } }, p.title),
              el(
                'span',
                { class: 'muted-sm mono' },
                'gap ' +
                  p.gap.toFixed(2) +
                  ' · gấp ' +
                  p.urgency.toFixed(2) +
                  ' · mong manh ' +
                  p.fragility.toFixed(2) +
                  ' · đề thi ' +
                  p.examDensity.toFixed(2) +
                  ' · mức cần học: ' +
                  p.gapLevels.join(', '),
              ),
            ),
            ui.pill('điểm ' + p.score.toFixed(3), 'violet'),
          ),
        ),
      ),
    );
  }

  function view(params, ctx) {
    if (!ctx.hasDiagnostic) {
      return ui.page(
        { title: 'Lộ trình học', activeRoute: '#/learning-path', actions: [ui.homeButton()] },
        ui.empty(
          '🗺️',
          'Chưa thể tạo lộ trình',
          'Lộ trình được xây từ kết quả bài kiểm tra đầu vào.',
          el('a', { class: 'btn btn-primary', href: '#/diagnostic' }, 'Làm bài kiểm tra'),
        ),
      );
    }

    // Regenerate when the stored path was built from a different diagnostic
    // or profile. (Comparing `builtAt` stamps was wrong: the knowledge profile
    // is rebuilt on every page load, so the path was re-anchored to "today"
    // on every visit and the student could never fall behind or catch up.)
    let path = ctx.path;
    const stale =
      !path ||
      path.grade !== ctx.knowledge.grade ||
      path.goal !== ctx.profile.goal ||
      path.dailyMinutes !== ctx.profile.dailyMinutes ||
      (path.deadline || null) !== (ctx.profile.deadline || null) ||
      (path.diagnosticSessionId || null) !== (ctx.knowledge.sessionId || null);

    if (stale) {
      path = AM.path.generateLearningPath(ctx.profile, ctx.knowledge, ctx.pool, ctx.learner);
      AM.store.savePath(path);
    }

    if (path.sprints.length === 0) {
      return ui.page(
        { title: 'Lộ trình học', activeRoute: '#/learning-path', actions: [ui.homeButton()] },
        ui.empty(
          '🎉',
          'Không có chủ đề nào cần bù',
          'Mọi chủ đề đều đã đạt hoặc gần đạt mục tiêu của bạn. Hãy tiếp tục ôn tập theo lịch SRS.',
          el('a', { class: 'btn btn-primary', href: '#/profile' }, 'Xem hồ sơ'),
        ),
      );
    }

    const completedSet = new Set(ctx.learner.completedActivities);
    const todayStr = U.todayVNStr();

    let totalActs = 0;
    let doneActs = 0;
    for (const s of path.sprints) {
      for (const d of s.days) {
        for (const a of d.activities) {
          totalActs++;
          if (completedSet.has(a.activityId)) doneActs++;
        }
      }
    }

    const regenerate = el(
      'button',
      {
        class: 'icon-btn',
        title: 'Tạo lại lộ trình',
        onclick: function () {
          if (!window.confirm('Tạo lại lộ trình từ kết quả mới nhất?')) return;
          AM.store.savePath(
            AM.path.generateLearningPath(ctx.profile, ctx.knowledge, ctx.pool, ctx.learner),
          );
          AM.router.render();
        },
      },
      U.icon('refresh'),
    );

    return ui.page(
      {
        title: 'Lộ trình học',
        activeRoute: '#/learning-path',
        actions: [regenerate, ui.homeButton()],
      },
      el(
        'section',
        {},
        el('h1', { class: 'page-title' }, 'Lộ trình học của bạn'),
        el(
          'p',
          { class: 'page-sub' },
          path.totalTopics +
            ' chủ đề cần bù, xếp trong ' +
            path.totalDays +
            ' ngày (' +
            path.sprints.length +
            ' tuần), mỗi ngày ' +
            path.dailyMinutes +
            ' phút. Dự kiến xong ' +
            U.formatDateVN(path.estimatedCompletionDate) +
            '.',
        ),
      ),
      path.deadline &&
        new Date(path.estimatedCompletionDate) > new Date(path.deadline)
        ? ui.banner(
            'warn',
            'Lộ trình dự kiến kết thúc sau ngày thi (' +
              U.formatDateVN(path.deadline) +
              '). Cân nhắc tăng thời gian học mỗi ngày trong phần thiết lập hồ sơ.',
          )
        : null,
      el(
        'section',
        { class: 'grid-3' },
        ui.statTile(doneActs + '/' + totalActs, 'Hoạt động hoàn thành'),
        ui.statTile(String(path.totalDays), 'Tổng số ngày'),
        ui.statTile(U.formatDateVN(path.estimatedCompletionDate), 'Dự kiến hoàn thành'),
      ),
      ui.bar(totalActs > 0 ? doneActs / totalActs : 0, 'kha'),
      el('div', { class: 'stack-sm' }, path.sprints.map((s) => sprintCard(s, completedSet, todayStr))),
      priorityPanel(path),
      ui.footerNote(),
    );
  }

  AM.views = AM.views || {};
  AM.views.learningPath = view;
})(window.AM);
