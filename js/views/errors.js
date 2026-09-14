/**
 * Error journal — every question the student has got wrong, grouped by topic.
 *
 * An entry resolves itself: answering the same question correctly in a later
 * practice session flips `resolved` (see views/practice.js). Unresolved errors
 * also drag down a topic's stability score in the knowledge tree, which is how
 * they feed back into scheduling.
 */
(function (AM) {
  'use strict';

  const U = AM.util;
  const el = U.el;
  const ui = AM.ui;

  function errorRow(entry) {
    const question = AM.bank.getQuestionById(entry.questionId);
    const preview = question
      ? AM.latex.truncate(AM.latex.toPlainText(question.prompt), 140)
      : entry.questionId;

    return el(
      'div',
      { class: 'card card-tight stack-sm' },
      el(
        'div',
        { class: 'row', style: { justifyContent: 'space-between' } },
        el(
          'div',
          { class: 'row' },
          entry.resolved
            ? ui.pill('Đã sửa', 'lime', 'check')
            : ui.pill('Chưa sửa', 'rose', 'priority_high'),
          question ? ui.levelChip(question.level) : null,
        ),
        el('span', { class: 'muted-sm' }, U.formatDateVN(entry.timestamp)),
      ),
      question
        ? AM.latex.render(question.prompt, 'qprompt')
        : el('p', { class: 'muted' }, preview),
      el(
        'div',
        { class: 'row' },
        ui.pill('Bạn trả lời: ' + (entry.studentAnswer || '—'), 'rose'),
        ui.pill('Đáp án đúng: ' + entry.correctAnswer, 'green'),
      ),
      question && question.solution ? ui.solutionBlock(question) : null,
    );
  }

  function topicGroup(topicId, entries) {
    const topic = AM.topics.getTopicById(topicId);
    const unresolved = entries.filter((e) => !e.resolved).length;

    // Plain .card: `display:flex` on <details> breaks the disclosure widget.
    return el(
      'details',
      { class: 'card', open: unresolved > 0 ? true : null },
      el(
        'summary',
        { style: { cursor: 'pointer' } },
        el(
          'div',
          { class: 'row', style: { justifyContent: 'space-between' } },
          el(
            'span',
            {},
            el('span', { class: 'card-title' }, topic ? topic.title : topicId),
            el(
              'span',
              { class: 'muted-sm', style: { display: 'block' } },
              topic ? topic.chapterTitle : '',
            ),
          ),
          el(
            'span',
            { class: 'row' },
            ui.pill(entries.length + ' lỗi', 'green'),
            unresolved > 0 ? ui.pill(unresolved + ' chưa sửa', 'rose') : ui.pill('Đã sửa hết', 'lime'),
          ),
        ),
      ),
      el(
        'div',
        { class: 'stack-sm', style: { marginTop: '0.75rem' } },
        entries
          .slice()
          .sort((a, b) => (a.resolved === b.resolved ? 0 : a.resolved ? 1 : -1))
          .map(errorRow),
      ),
      el(
        'div',
        { class: 'row', style: { marginTop: '0.75rem' } },
        el(
          'a',
          {
            class: 'btn btn-primary btn-sm',
            href: '#/practice?topic=' + encodeURIComponent(topicId) + '&levels=N,H&count=5',
          },
          'Luyện lại chủ đề này',
        ),
      ),
    );
  }

  function view(params, ctx) {
    const errors = ctx.learner.errors;

    if (errors.length === 0) {
      return ui.page(
        { title: 'Sổ tay lỗi sai', activeRoute: '#/errors', actions: [ui.homeButton()] },
        ui.empty(
          '📓',
          'Sổ tay còn trống',
          'Mỗi câu trả lời sai trong lúc luyện tập sẽ được ghi lại đây kèm đáp án đúng, ' +
            'để bạn xem lại và luyện tới khi sửa được.',
          el('a', { class: 'btn btn-primary', href: '#/learning-path' }, 'Bắt đầu luyện tập'),
        ),
      );
    }

    const byTopic = U.groupBy(errors, (e) => e.topicId);
    const unresolvedTotal = errors.filter((e) => !e.resolved).length;

    const groups = Array.from(byTopic.entries()).sort(function (a, b) {
      const ua = a[1].filter((e) => !e.resolved).length;
      const ub = b[1].filter((e) => !e.resolved).length;
      return ub - ua;
    });

    return ui.page(
      { title: 'Sổ tay lỗi sai', activeRoute: '#/errors', actions: [ui.homeButton()] },
      el(
        'section',
        {},
        el('h1', { class: 'page-title' }, 'Sổ tay lỗi sai'),
        el(
          'p',
          { class: 'page-sub' },
          'Một lỗi tự đánh dấu là đã sửa khi bạn làm đúng chính câu đó ở lần luyện tập sau. ' +
            'Lỗi chưa sửa cũng làm giảm độ vững của chủ đề trên cây tri thức.',
        ),
      ),
      el(
        'section',
        { class: 'grid-3' },
        ui.statTile(String(errors.length), 'Tổng số lỗi'),
        ui.statTile(String(unresolvedTotal), 'Chưa sửa'),
        ui.statTile(String(byTopic.size), 'Chủ đề liên quan'),
      ),
      el('div', { class: 'stack-sm' }, groups.map((g) => topicGroup(g[0], g[1]))),
      ui.footerNote(),
    );
  }

  AM.views = AM.views || {};
  AM.views.errors = view;
})(window.AM);
