/**
 * Practice question selector. Ported from src/lib/practiceSelector.ts.
 *
 * Picks questions for each phase of a practice session (warm-up, practice,
 * mini assessment). Questions used in earlier sessions are deprioritised
 * rather than hard-blocked — some topics have small pools and a hard block
 * would leave the student with nothing to do.
 */
(function (AM) {
  'use strict';

  const U = AM.util;

  /**
   * Take up to `n` from `pool`, preferring unseen questions and padding with
   * already-used ones only when the pool is too small.
   */
  function pickN(pool, n, usedSet, rng) {
    const fresh = pool.filter((q) => !usedSet.has(q.id));
    const used = pool.filter((q) => usedSet.has(q.id));
    return U.shuffled(fresh, rng).concat(U.shuffled(used, rng)).slice(0, n);
  }

  /**
   * Select questions for a full three-phase practice session.
   *
   * @param pool             Question bank for the student's grade.
   * @param topicId          Target topic.
   * @param levels           Levels to practise (from the Activity).
   * @param learner          Learner state, for used-question tracking.
   * @param masteredTopicIds Topics already BKT-mastered — source of warm-ups.
   * @param sessionSeed      Seed for this session's RNG.
   */
  function selectPracticeQuestions(
    pool,
    topicId,
    levels,
    learner,
    masteredTopicIds,
    sessionSeed,
  ) {
    const rng = U.mulberry32(sessionSeed);
    const usedSet = new Set(learner.usedQuestionIds);

    // --- Warm-up: up to 3 recognition items from topics already mastered ---
    const warmupPool = pool.filter(
      (q) =>
        masteredTopicIds.indexOf(q.topicId) !== -1 &&
        q.topicId !== topicId &&
        (q.level === 'N' || q.level === 'unknown'),
    );
    const warmup = pickN(warmupPool, 3, usedSet, rng);

    // --- Practice: up to 8 items at the target levels ---
    const targetLevelSet = new Set(levels);
    // Untagged items double as medium difficulty.
    if (targetLevelSet.has('H')) targetLevelSet.add('unknown');

    const practicePool = pool.filter(
      (q) => q.topicId === topicId && targetLevelSet.has(q.level),
    );
    const practice = pickN(practicePool, 8, usedSet, rng);

    // --- Assessment: 5 mixed items (2N + 2H + 1V), none reused from practice --
    const practiceIds = new Set(practice.map((p) => p.id));
    const assessPool = pool.filter(
      (q) => q.topicId === topicId && !practiceIds.has(q.id),
    );
    const assessment = pickN(
      assessPool.filter((q) => q.level === 'N' || q.level === 'unknown'),
      2,
      usedSet,
      rng,
    )
      .concat(pickN(assessPool.filter((q) => q.level === 'H'), 2, usedSet, rng))
      .concat(pickN(assessPool.filter((q) => q.level === 'V'), 1, usedSet, rng));

    return { warmup: warmup, practice: practice, assessment: assessment };
  }

  /** Serialize a student's answer for the error journal. */
  function serializeAnswer(answer) {
    if (typeof answer === 'string') return answer;
    if (Array.isArray(answer)) {
      return answer.map((v) => (v === true ? 'Đ' : v === false ? 'S' : '—')).join(',');
    }
    return String(answer === null || answer === undefined ? '' : answer);
  }

  /** Serialize the correct answer for a question. */
  function serializeCorrectAnswer(question) {
    if (question.type === 'mcq') {
      const correct = question.options.find((o) => o.isCorrect);
      return correct ? correct.label : '?';
    }
    if (question.type === 'tf') {
      return question.statements.map((s) => (s.isTrue ? 'Đ' : 'S')).join(',');
    }
    if (question.type === 'shortans') return question.correctAnswer;
    return '?';
  }

  AM.practiceSelector = {
    selectPracticeQuestions: selectPracticeQuestions,
    serializeAnswer: serializeAnswer,
    serializeCorrectAnswer: serializeCorrectAnswer,
  };
})(window.AM);
