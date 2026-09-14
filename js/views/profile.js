/**
 * Knowledge profile — the read-only picture of where the student stands.
 *
 * Everything here is derived on the fly from the stored diagnostic session
 * plus the accumulated learner state; nothing is persisted, so it always
 * reflects the newest data.
 */
(function (AM) {
  'use strict';

  const U = AM.util;
  const el = U.el;
  const ui = AM.ui;
  const C = AM.const;

  function headline(ctx) {
    const k = ctx.knowledge;
    return el(
      'section',
      { class: 'card card-dark stack-sm' },
      el('div', { class: 'section-label', style: { color: '#b2f746' } }, 'Năng lực tổng quát'),
      el(
        'div',
        { class: 'row', style: { alignItems: 'baseline', gap: '1rem' } },
        el('span', { style: { fontSize: '3rem', fontWeight: 800, color: '#fff' } }, k.theta.toFixed(2)),
        el('span', { style: { color: 'rgba(234,255,245,0.7)', fontWeight: 600 } },
          'θ · sai số ±' + k.standardError.toFixed(2)),
      ),
      el(
        'p',
        { style: { color: 'rgba(234,255,245,0.8)', lineHeight: '1.7', fontWeight: 500 } },
        'θ là thang năng lực của mô hình IRT: 0 là mức trung bình, dương là trên trung bình. ' +
          'Mục tiêu của bạn đặt mức thành thạo ' +
          U.pct(k.target) +
          ' cho mỗi chủ đề.',
      ),
      el(
        'div',
        { class: 'row' },
        ui.pill(k.stats.totalAnswered + ' câu đã trả lời', 'green'),
        ui.pill(k.stats.totalCorrect + ' câu đúng', 'lime'),
        ui.pill('TB ' + U.formatDuration(k.stats.avgDurationMs) + '/câu', 'sky'),
        ui.pill(
          k.signals.speedProfile.kind === 'fast'
            ? 'Làm nhanh'
            : k.signals.speedProfile.kind === 'slow'
              ? 'Làm chậm'
              : 'Tốc độ vừa',
          'violet',
        ),
      ),
    );
  }

  function preliminaryBanner(ctx) {
    if (!ctx.knowledge.isPreliminary) return null;
    return ui.banner(
      'warn',
      el('strong', {}, 'Kết quả sơ bộ. '),
      'Bạn mới trả lời ' +
        ctx.knowledge.stats.totalAnswered +
        ' câu (hoặc đã dừng giữa chừng), nên ước lượng còn rộng. ' +
        'Làm thêm bài kiểm tra để hồ sơ chính xác hơn.',
    );
  }

  function radarCard(ctx) {
    const chapters = ctx.knowledge.chapters;
    if (chapters.length < 3) return null;
    const series = chapters.map((c) => ({ label: c.chapterTitle, value: c.mastery }));
    return ui.sectionCard(
      [U.icon('radar'), 'Mức thành thạo theo chương'],
      'Đường nét đứt màu chanh là mục tiêu ' + U.pct(ctx.knowledge.target) + '.',
      ui.radarChart(series, ctx.knowledge.target),
    );
  }

  function chapterList(ctx) {
    return ui.sectionCard(
      [U.icon('menu_book'), 'Chi tiết theo chương'],
      null,
      el(
        'div',
        { class: 'list' },
        ctx.knowledge.chapters
          .slice()
          .sort((a, b) => a.mastery - b.mastery)
          .map(function (c) {
            const bandId = AM.profiling.classifyBand(c.mastery);
            return el(
              'div',
              { class: 'list-row', style: { flexWrap: 'wrap' } },
              el(
                'span',
                { class: 'grow' },
                el('span', { class: 'title', style: { display: 'block' } }, c.chapterTitle),
                el(
                  'span',
                  { class: 'muted-sm' },
                  c.testedCount + '/' + c.topicCount + ' bài đã được kiểm tra',
                ),
              ),
              el('span', { style: { minWidth: '9rem' } }, ui.bar(c.mastery, bandId)),
              ui.pill(U.pct(c.mastery), 'tone-' + bandId),
            );
          }),
      ),
    );
  }

  function gapCard(ctx) {
    const gaps = ctx.knowledge.gaps;
    if (gaps.length === 0) {
      return ui.sectionCard(
        [U.icon('flag'), 'Điểm cần củng cố'],
        null,
        el('p', { class: 'muted' }, 'Không có chủ đề nào cách mục tiêu quá xa. Rất tốt!'),
      );
    }
    return ui.sectionCard(
      [U.icon('flag'), 'Điểm cần củng cố (' + gaps.length + ')'],
      'Xếp theo khoảng cách tới mục tiêu, có cộng điểm cho chủ đề bạn tự đánh dấu là yếu.',
      el(
        'div',
        { class: 'list' },
        gaps.map(function (g) {
          return el(
            'div',
            { class: 'list-row', style: { flexWrap: 'wrap' } },
            el(
              'span',
              { class: 'grow' },
              el('span', { class: 'title', style: { display: 'block' } }, g.title),
              el(
                'span',
                { class: 'muted-sm' },
                'Hiện ' +
                  U.pct(g.mastery) +
                  ' · cần thêm ' +
                  U.pct(g.gap) +
                  (g.weakBonus > 1 ? ' · bạn tự đánh dấu yếu' : ''),
              ),
            ),
            el(
              'a',
              {
                class: 'btn btn-ghost btn-sm',
                href: '#/theory?topic=' + encodeURIComponent(g.topicId),
              },
              'Lý thuyết',
            ),
            el(
              'a',
              {
                class: 'btn btn-primary btn-sm',
                href:
                  '#/practice?topic=' + encodeURIComponent(g.topicId) + '&levels=N,H&count=5',
              },
              'Luyện tập',
            ),
          );
        }),
      ),
    );
  }

  function treeCard(ctx) {
    const tree = ctx.tree;
    return ui.sectionCard(
      [U.icon('park'), 'Cây tri thức'],
      'Độ vững kết hợp mức thành thạo, BKT, chuỗi ôn tập SRS, lỗi chưa sửa và ' +
        'độ đều đặn khi học. Bấm vào một chủ đề để luyện tập.',
      el(
        'div',
        { class: 'row' },
        C.TREE_STAGES.map((s) =>
          ui.pill(s.icon + ' ' + s.label + ': ' + tree.stageCounts[s.id], 'tone-' + s.id),
        ),
      ),
      el(
        'div',
        { class: 'stack-sm', style: { marginTop: '0.5rem' } },
        tree.branches.map(function (branch) {
          return el(
            'div',
            { class: 'tree-branch' },
            el(
              'header',
              {},
              el('strong', { class: 'grow' }, branch.chapterTitle),
              ui.pill(
                AM.tree.stageMeta(branch.stage).icon + ' ' + U.pct(branch.avgStability),
                'tone-' + branch.stage,
              ),
            ),
            el(
              'div',
              { class: 'tree-leaves' },
              branch.topics.map(function (t) {
                const meta = AM.tree.stageMeta(t.stage);
                return el(
                  'a',
                  {
                    class: 'leaf tone-' + t.stage,
                    href:
                      '#/practice?topic=' +
                      encodeURIComponent(t.topicId) +
                      '&levels=' +
                      (t.weakestLevel || 'N') +
                      '&count=5',
                    title:
                      t.title +
                      ' — độ vững ' +
                      U.pct(t.stability) +
                      ', thành thạo ' +
                      U.pct(t.mastery) +
                      (t.unresolvedErrors ? ', ' + t.unresolvedErrors + ' lỗi chưa sửa' : ''),
                  },
                  meta.icon,
                  t.title,
                );
              }),
            ),
          );
        }),
      ),
    );
  }

  function signalsCard(ctx) {
    const s = ctx.knowledge.signals;
    const rows = [];

    if (s.careless.count > 0) {
      rows.push([
        '⚡',
        'Sai do vội',
        s.careless.count +
          ' câu trả lời sai trong chưa tới 30% thời gian cho phép. Đọc kỹ đề trước khi chọn.',
      ]);
    }
    if (s.conceptGap.count > 0) {
      rows.push([
        '🧩',
        'Hổng khái niệm',
        s.conceptGap.count +
          ' câu sai ở mức Nhận biết — nên quay lại phần lý thuyết của các chủ đề đó.',
      ]);
    }
    if (s.applicationWeak.topicIds.length > 0) {
      const names = s.applicationWeak.topicIds
        .map((id) => (AM.topics.getTopicById(id) || {}).title || id)
        .join(', ');
      rows.push([
        '🏗️',
        'Yếu ở vận dụng',
        'Làm tốt câu nhận biết/thông hiểu nhưng đuối ở vận dụng: ' + names + '.',
      ]);
    }
    if (s.engagement.skippedCount > 0) {
      rows.push([
        '⏭️',
        'Câu bỏ qua',
        s.engagement.skippedCount +
          ' câu không trả lời (' +
          U.pct(1 - s.engagement.answeredRate) +
          ' số câu).',
      ]);
    }

    if (rows.length === 0) {
      rows.push(['✅', 'Không thấy tín hiệu bất thường', 'Nhịp làm bài của bạn ổn định.']);
    }

    return ui.sectionCard(
      [U.icon('bolt'), 'Tín hiệu từ bài làm'],
      'Suy ra từ thời gian làm bài và mức độ câu hỏi — không phải phân tích lời giải.',
      el(
        'div',
        { class: 'list' },
        rows.map((r) =>
          el(
            'div',
            { class: 'list-row' },
            el('span', { style: { fontSize: '1.4rem' } }, r[0]),
            el(
              'span',
              { class: 'grow' },
              el('span', { class: 'title', style: { display: 'block' } }, r[1]),
              el('span', { class: 'muted-sm' }, r[2]),
            ),
          ),
        ),
      ),
    );
  }

  function topicTable(ctx) {
    const rows = ctx.knowledge.topics.slice().sort((a, b) => a.mastery - b.mastery);
    return el(
      'details',
      { class: 'debug' },
      el('summary', {}, 'Bảng chi tiết ' + rows.length + ' chủ đề'),
      el(
        'div',
        { class: 'list', style: { marginTop: '0.75rem' } },
        rows.map(function (t) {
          const levels = ['N', 'H', 'V', 'T']
            .filter((lv) => t.levelBreakdown[lv] && t.levelBreakdown[lv].attempts > 0)
            .map((lv) => lv + ':' + U.pct(t.levelBreakdown[lv].avgScore))
            .join('  ');
          return el(
            'div',
            { class: 'list-row', style: { flexWrap: 'wrap' } },
            el(
              'span',
              { class: 'grow' },
              el('span', { class: 'title', style: { display: 'block' } }, t.title),
              el(
                'span',
                { class: 'muted-sm mono' },
                t.attempts +
                  ' lượt · quan sát ' +
                  (t.observed === null ? '—' : U.pct(t.observed)) +
                  ' · kỳ vọng ' +
                  U.pct(t.expected) +
                  ' · tin cậy ' +
                  U.pct(t.confidence) +
                  (levels ? ' · ' + levels : ''),
              ),
            ),
            ui.bandChip(t.mastery),
          );
        }),
      ),
    );
  }

  function view(params, ctx) {
    if (!ctx.hasProfile) {
      return ui.page(
        { title: 'Hồ sơ năng lực', activeRoute: '#/profile', actions: [ui.homeButton()] },
        ui.empty(
          '🧭',
          'Chưa có hồ sơ',
          'Thiết lập hồ sơ rồi làm bài kiểm tra đầu vào để xem năng lực của bạn.',
          el('a', { class: 'btn btn-primary', href: '#/onboarding' }, 'Thiết lập hồ sơ'),
        ),
      );
    }

    if (!ctx.hasDiagnostic) {
      return ui.page(
        { title: 'Hồ sơ năng lực', activeRoute: '#/profile', actions: [ui.homeButton()] },
        ui.empty(
          '📝',
          'Chưa có kết quả kiểm tra',
          'Làm bài kiểm tra đầu vào để hệ thống dựng hồ sơ năng lực cho bạn.',
          el('a', { class: 'btn btn-primary', href: '#/diagnostic' }, 'Làm bài kiểm tra'),
        ),
      );
    }

    return ui.page(
      { title: 'Hồ sơ năng lực', activeRoute: '#/profile', actions: [ui.homeButton()] },
      el(
        'section',
        {},
        el('h1', { class: 'page-title' }, 'Hồ sơ năng lực'),
        el(
          'p',
          { class: 'page-sub' },
          C.GRADE_LABELS[ctx.knowledge.grade] +
            ' · dựng lúc ' +
            new Date(ctx.knowledge.builtAt).toLocaleString('vi-VN'),
        ),
      ),
      preliminaryBanner(ctx),
      headline(ctx),
      el('div', { class: 'grid-2' }, radarCard(ctx), gapCard(ctx)),
      treeCard(ctx),
      chapterList(ctx),
      signalsCard(ctx),
      topicTable(ctx),
      el(
        'div',
        { class: 'row' },
        el('a', { class: 'btn btn-lime', href: '#/learning-path' }, 'Xem lộ trình học', U.icon('trending_flat')),
        el('a', { class: 'btn btn-ghost', href: '#/diagnostic' }, 'Kiểm tra lại'),
      ),
      ui.footerNote(),
    );
  }

  AM.views = AM.views || {};
  AM.views.profile = view;
})(window.AM);
