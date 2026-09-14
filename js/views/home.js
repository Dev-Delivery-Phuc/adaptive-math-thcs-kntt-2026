/**
 * Home dashboard — the daily hub.
 *
 * Shows where the student is in the flow (onboarding → diagnostic → study),
 * today's tasks, a compact knowledge tree, a practice calendar and overall
 * progress numbers.
 */
(function (AM) {
  'use strict';

  const U = AM.util;
  const el = U.el;
  const ui = AM.ui;
  const C = AM.const;

  function heroCard(ctx) {
    let title;
    let body;
    let cta;
    let href;

    if (!ctx.hasProfile) {
      title = 'Bắt đầu từ đây';
      body =
        'Cho hệ thống biết lớp, mục tiêu và quỹ thời gian của bạn — mất khoảng 1 phút. ' +
        'Sau đó bạn sẽ làm bài kiểm tra đầu vào để hệ thống hiểu bạn đang ở đâu.';
      cta = 'Thiết lập hồ sơ';
      href = '#/onboarding';
    } else if (!ctx.hasDiagnostic) {
      title = 'Làm bài kiểm tra đầu vào';
      body =
        'Bài kiểm tra thích ứng sẽ đi qua từng chủ đề theo thang Nhận biết → Thông hiểu → ' +
        'Vận dụng để xác định chính xác bạn đang vững ở đâu và hổng ở đâu.';
      cta = 'Bắt đầu kiểm tra';
      href = '#/diagnostic';
    } else {
      const mastered = ctx.tree ? ctx.tree.stageCounts['ra-hoa'] : 0;
      title = 'Tiếp tục lộ trình của bạn';
      body =
        'Bạn đã có hồ sơ năng lực. ' +
        (mastered > 0
          ? 'Đã có ' + mastered + ' chủ đề ở giai đoạn "Ra hoa – kết quả". '
          : '') +
        'Xem lộ trình hôm nay hoặc mở hồ sơ để biết cần củng cố phần nào.';
      cta = 'Xem lộ trình';
      href = '#/learning-path';
    }

    return el(
      'section',
      { class: 'card card-dark stack-sm' },
      el('div', { class: 'section-label', style: { color: '#b2f746' } }, 'Bước tiếp theo'),
      el('h2', { class: 'page-title', style: { color: '#fff' } }, title),
      el('p', { style: { color: 'rgba(234,255,245,0.8)', lineHeight: '1.7', fontWeight: 500 } }, body),
      el('div', { class: 'row' }, el('a', { class: 'btn btn-lime', href: href }, cta, U.icon('trending_flat'))),
    );
  }

  function todayCard(ctx) {
    if (!ctx.hasDiagnostic) return null;

    const items = AM.today.computeTodayActivities(ctx.path, ctx.learner);
    const completed = new Set(ctx.learner.completedActivities);

    if (items.length === 0) {
      return ui.sectionCard(
        [U.icon('task_alt'), 'Hôm nay cần làm'],
        null,
        el(
          'p',
          { class: 'muted' },
          ctx.path
            ? 'Không còn việc nào cho hôm nay. Bạn có thể luyện thêm từ lộ trình.'
            : 'Chưa có lộ trình. Mở trang Lộ trình học để hệ thống tạo cho bạn.',
        ),
        el(
          'div',
          { class: 'row' },
          el('a', { class: 'btn btn-ghost btn-sm', href: '#/learning-path' }, 'Mở lộ trình'),
        ),
      );
    }

    return ui.sectionCard(
      [U.icon('task_alt'), 'Hôm nay cần làm (' + items.length + ')'],
      'Ưu tiên ôn tập theo lịch SRS trước, rồi tới lộ trình.',
      el(
        'div',
        { class: 'list' },
        items.map((item) => activityRow(item.activity, item.reason, completed)),
      ),
    );
  }

  function activityRow(act, reason, completedSet) {
    const done = completedSet.has(act.activityId);
    const href =
      act.type === 'theory'
        ? '#/theory?topic=' + encodeURIComponent(act.topicId)
        : '#/practice?topic=' +
          encodeURIComponent(act.topicId) +
          '&levels=' +
          encodeURIComponent((act.levels || ['N', 'H']).join(',')) +
          '&activityId=' +
          encodeURIComponent(act.activityId) +
          '&count=' +
          (act.questionCount || 5);

    return el(
      'a',
      { class: U.cn('activity', done && 'is-done'), href: href },
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
            ' · ' +
            act.estimatedMinutes +
            ' phút — ' +
            reason,
        ),
      ),
      done ? U.icon('check_circle') : U.icon('chevron_right'),
    );
  }

  function treeCard(ctx) {
    if (!ctx.tree) return null;
    const stages = C.TREE_STAGES;

    return ui.sectionCard(
      [U.icon('park'), 'Cây tri thức'],
      'Độ vững của thân cây: ' + U.pct(ctx.tree.trunkStrength) + '.',
      el(
        'div',
        { class: 'row' },
        stages.map((s) =>
          ui.pill(s.icon + ' ' + s.label + ': ' + ctx.tree.stageCounts[s.id], 'tone-' + s.id),
        ),
      ),
      ui.bar(ctx.tree.trunkStrength, ctx.tree.overallStage),
      el(
        'div',
        { class: 'row' },
        el('a', { class: 'btn btn-ghost btn-sm', href: '#/profile' }, 'Xem chi tiết hồ sơ'),
      ),
    );
  }

  function statsCard(ctx) {
    if (!ctx.hasDiagnostic) return null;
    const totalTopics = AM.topics.getTopicsByGrade(ctx.profile.grade).length;
    const stats = AM.today.computeProgressStats(ctx.path, ctx.learner, totalTopics);
    const g = ctx.learner.gamification;

    return el(
      'section',
      { class: 'grid-3' },
      ui.statTile(String(C.xpToLevel(g.xp)), 'Cấp độ · ' + g.xp + ' XP'),
      ui.statTile(g.currentStreak + ' ngày', 'Chuỗi hiện tại'),
      ui.statTile(stats.masteredTopics + '/' + totalTopics, 'Chủ đề thành thạo'),
      ui.statTile(String(g.totalQuestionsAttempted), 'Câu đã làm'),
      ui.statTile(String(stats.totalSessions), 'Phiên luyện tập'),
      ui.statTile(
        stats.pathDaysTotal > 0
          ? stats.pathDaysCompleted + '/' + stats.pathDaysTotal
          : '—',
        'Hoạt động lộ trình',
      ),
    );
  }

  function badgesCard(ctx) {
    const earned = ctx.learner.gamification.badges;
    if (!earned.length) return null;
    return ui.sectionCard(
      [U.icon('workspace_premium'), 'Huy hiệu'],
      null,
      el(
        'div',
        { class: 'row' },
        earned
          .map((id) => C.BADGE_DEFINITIONS.find((b) => b.id === id))
          .filter(Boolean)
          .map((b) => ui.pill(b.icon + ' ' + b.label, 'amber')),
      ),
    );
  }

  function calendarCard(ctx) {
    const dates = AM.today.getPracticeDatesThisMonth(ctx.learner);
    return ui.sectionCard(
      [U.icon('calendar_month'), 'Lịch luyện tập tháng này'],
      dates.size + ' ngày đã học trong tháng.',
      ui.miniCalendar(dates),
    );
  }

  function bankWarning() {
    if (AM.bank.isLoaded) return null;
    return ui.banner(
      'error',
      el('strong', {}, 'Không nạp được ngân hàng câu hỏi. '),
      'Kiểm tra file data/questions.js có nằm cạnh index.html không.',
    );
  }

  function view(params, ctx) {
    const resetBtn = el(
      'button',
      {
        class: 'icon-btn',
        title: 'Đặt lại toàn bộ dữ liệu',
        onclick: function () {
          const ok = window.confirm(
            'Đặt lại toàn bộ dữ liệu học tập?\n\n' +
              'Hồ sơ, kết quả kiểm tra, lộ trình và sổ tay lỗi sẽ bị xoá — ' +
              'cả trên máy này lẫn trên tài khoản của bạn.\n\n' +
              'Hành động này không thể hoàn tác.',
          );
          if (!ok) return;
          // Loud clear: the deletion propagates to Firestore too, which is
          // what "đặt lại" should mean for an account-backed app.
          AM.store.clearAll();
          AM.router.render();
        },
      },
      U.icon('restart_alt'),
    );

    const greeting = ctx.hasProfile
      ? 'Xin chào, học sinh ' + C.GRADE_LABELS[ctx.profile.grade] + '!'
      : 'Chào mừng đến AdaptiveMath!';

    const goalLabel = ctx.profile
      ? (C.GOAL_OPTIONS.find((g) => g.value === ctx.profile.goal) || {}).label
      : null;

    const subtitle = ctx.hasProfile
      ? 'Sẵn sàng cho ' +
        ctx.profile.dailyMinutes +
        ' phút học tập trung hôm nay để tiến gần hơn tới mục tiêu ' +
        String(goalLabel || '').toLowerCase() +
        ' chứ?'
      : 'Bắt đầu bằng cách nhập lớp, mục tiêu và thời gian học để hệ thống chuẩn bị bài kiểm tra đầu vào phù hợp.';

    return ui.page(
      { title: 'AdaptiveMath', activeRoute: '#/', actions: [resetBtn] },
      bankWarning(),
      el(
        'section',
        {},
        el('h1', { class: 'page-title' }, greeting),
        el('p', { class: 'page-sub' }, subtitle),
      ),
      heroCard(ctx),
      todayCard(ctx),
      statsCard(ctx),
      el('div', { class: 'grid-2' }, treeCard(ctx), calendarCard(ctx)),
      badgesCard(ctx),
      ui.footerNote(),
    );
  }

  AM.views = AM.views || {};
  AM.views.home = view;
})(window.AM);
