/**
 * Theory viewer — the "KIẾN THỨC TRỌNG TÂM" and "PHÂN LOẠI VÀ PHƯƠNG PHÁP"
 * blocks prepared for one lesson in the THCS curriculum.
 *
 * Opening the page marks the matching `::theory` activity complete, which is
 * how the learning path knows the reading was done.
 */
(function (AM) {
  'use strict';

  const U = AM.util;
  const el = U.el;
  const ui = AM.ui;

  const BLOCK_LABELS = {
    dn: 'Định nghĩa',
    vd: 'Ví dụ',
    dang: 'Dạng bài',
    chuy: 'Chú ý',
    nx: 'Nhận xét',
    section: 'Mục',
  };

  const BLOCK_TONES = {
    dn: 'green',
    vd: 'sky',
    dang: 'violet',
    chuy: 'amber',
    nx: 'teal',
    section: 'green',
  };

  function blockCard(block, index) {
    if (block.type === 'section') {
      return el(
        'h3',
        { class: 'section-label', style: { marginTop: '1.25rem' } },
        AM.latex.toPlainText(block.content) || 'Mục ' + (index + 1),
      );
    }

    return el(
      'div',
      { class: 'card card-tight stack-sm' },
      el(
        'div',
        { class: 'row' },
        ui.pill(BLOCK_LABELS[block.type] || block.type, BLOCK_TONES[block.type] || 'green'),
        block.title ? el('strong', { class: 'muted' }, block.title) : null,
      ),
      AM.latex.render(block.content, 'qprompt'),
      block.solution
        ? el(
            'details',
            { class: 'debug' },
            el('summary', {}, 'Lời giải'),
            AM.latex.render(block.solution, 'qprompt'),
          )
        : null,
    );
  }

  function view(params, ctx) {
    const topicId = params.topic;
    const topic = topicId ? AM.topics.getTopicById(topicId) : null;

    if (!topic) {
      return ui.page(
        { title: 'Lý thuyết', activeRoute: '#/learning-path', actions: [ui.homeButton()] },
        ui.empty('📚', 'Không tìm thấy bài học', 'Đường dẫn thiếu mã chủ đề hợp lệ.'),
      );
    }

    const theory = AM.bank.getTheory(topicId);
    const knowledgeBlocks = theory ? theory.knowledgeBlocks : [];
    const methodBlocks = theory ? theory.methodBlocks : [];

    // Reading the page is what "completes" the theory activity.
    const activityId = topicId + '::theory';
    if (ctx.learner.completedActivities.indexOf(activityId) === -1) {
      const next = Object.assign({}, ctx.learner, {
        completedActivities: ctx.learner.completedActivities.concat([activityId]),
      });
      AM.store.saveLearnerState(next);
    }

    if (knowledgeBlocks.length === 0 && methodBlocks.length === 0) {
      return ui.page(
        { title: topic.title, activeRoute: '#/learning-path', actions: [ui.homeButton()] },
        ui.empty(
          '📖',
          'Chưa có lý thuyết cho bài này',
          'Bài "' + topic.title + '" chưa được trích lý thuyết từ tài liệu gốc.',
          el(
            'a',
            {
              class: 'btn btn-primary',
              href: '#/practice?topic=' + encodeURIComponent(topicId) + '&levels=N,H&count=5',
            },
            'Chuyển sang luyện tập',
          ),
        ),
      );
    }

    return ui.page(
      { title: 'Lý thuyết', activeRoute: '#/learning-path', actions: [ui.homeButton()] },
      el(
        'section',
        {},
        el('div', { class: 'section-label' }, topic.chapterTitle),
        el('h1', { class: 'page-title' }, topic.title),
        el(
          'p',
          { class: 'page-sub' },
          knowledgeBlocks.length +
            ' khối kiến thức · ' +
            methodBlocks.length +
            ' khối phương pháp · biên soạn: ' +
            topic.teacher,
        ),
      ),
      knowledgeBlocks.length > 0
        ? el(
            'section',
            { class: 'stack-sm' },
            el('h2', { class: 'card-title' }, U.icon('lightbulb'), 'Kiến thức trọng tâm'),
            knowledgeBlocks.map(blockCard),
          )
        : null,
      methodBlocks.length > 0
        ? el(
            'section',
            { class: 'stack-sm' },
            el('h2', { class: 'card-title' }, U.icon('construction'), 'Phân loại và phương pháp'),
            methodBlocks.map(blockCard),
          )
        : null,
      el(
        'div',
        { class: 'row' },
        el(
          'a',
          {
            class: 'btn btn-lime',
            href: '#/practice?topic=' + encodeURIComponent(topicId) + '&levels=N,H&count=5',
          },
          'Luyện tập bài này',
          U.icon('trending_flat'),
        ),
        el('a', { class: 'btn btn-ghost', href: '#/learning-path' }, 'Về lộ trình'),
      ),
      ui.footerNote(),
    );
  }

  AM.views = AM.views || {};
  AM.views.theory = view;
})(window.AM);
