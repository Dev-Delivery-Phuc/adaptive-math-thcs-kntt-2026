/**
 * Typed handle on the question bank loaded by `data/questions.js`.
 *
 * That file assigns `window.AM_QUESTION_BANK` — a plain script rather than a
 * fetch()'d .json, so the app works when index.html is opened straight from
 * disk. If it somehow failed to load we degrade to an empty bank and let the
 * UI show an explanation instead of throwing on first access.
 */
(function (AM) {
  'use strict';

  const BANK =
    window.AM_QUESTION_BANK && Array.isArray(window.AM_QUESTION_BANK.questions)
      ? window.AM_QUESTION_BANK
      : { builtAt: null, totalCount: 0, questions: [], theory: [] };

  if (BANK.totalCount === 0) {
    console.error(
      '[questionBank] Không nạp được data/questions.js — kiểm tra file có tồn tại không.',
    );
  }

  const THEORY_BY_TOPIC = new Map(
    (BANK.theory || []).map((t) => [t.topicId, t]),
  );

  const BY_ID = new Map(BANK.questions.map((q) => [q.id, q]));

  /** Every question for a grade that CAT can actually show. */
  function getPoolForGrade(grade) {
    return BANK.questions.filter((q) => q.grade === grade && q.type !== 'essay');
  }

  function getQuestionById(id) {
    return BY_ID.get(id) || null;
  }

  function getTheory(topicId) {
    return THEORY_BY_TOPIC.get(topicId) || null;
  }

  /** Count of questions per topic — used by the profile + path pages. */
  function countByTopic(grade) {
    const counts = new Map();
    for (const q of BANK.questions) {
      if (grade && q.grade !== grade) continue;
      counts.set(q.topicId, (counts.get(q.topicId) || 0) + 1);
    }
    return counts;
  }

  AM.bank = {
    QUESTION_BANK: BANK,
    isLoaded: BANK.totalCount > 0,
    getPoolForGrade: getPoolForGrade,
    getQuestionById: getQuestionById,
    getTheory: getTheory,
    countByTopic: countByTopic,
  };
})(window.AM);
