/**
 * Bayesian Knowledge Tracing — per-topic mastery. Ported from src/lib/bkt.ts.
 *
 * Models knowledge of a skill as a two-state hidden Markov model and updates
 * P(learned) after every response.
 *
 *   p(L) — prior probability of mastery (seeded from the diagnostic)
 *   p(T) — chance of learning per opportunity
 *   p(G) — correct answer without mastery (guess)
 *   p(S) — wrong answer despite mastery (slip)
 */
(function (AM) {
  'use strict';

  const BKT_DEFAULTS = {
    pT: 0.15, // conservative learning rate
    pG: 0.25, // 4-option MCQ baseline
    pS: 0.1, // small slip rate
  };

  /** p(L) ≥ this → the topic counts as mastered. */
  const MASTERY_THRESHOLD = 0.85;

  const clamp = (x, min, max) => Math.max(min, Math.min(max, x));

  /** Seed a topic, using diagnostic mastery as the prior when available. */
  function initBktState(diagnosticMastery) {
    return {
      pL:
        typeof diagnosticMastery === 'number'
          ? clamp(diagnosticMastery, 0.01, 0.99)
          : 0.1,
      pT: BKT_DEFAULTS.pT,
      pG: BKT_DEFAULTS.pG,
      pS: BKT_DEFAULTS.pS,
      totalAttempts: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Update after one response.
   *
   * Step 1 — posterior (Bayes):
   *   correct: p(L|c) = p(L)(1−p(S)) / [p(L)(1−p(S)) + (1−p(L))p(G)]
   *   wrong:   p(L|w) = p(L)p(S)     / [p(L)p(S)     + (1−p(L))(1−p(G))]
   *
   * Step 2 — transition:
   *   p(L') = p(L|obs) + (1 − p(L|obs)) × p(T)
   *
   * The transition step models learning *from* the opportunity itself, even
   * when the student wasn't in the learned state going in.
   */
  function updateBkt(state, correct) {
    const pL = state.pL;
    const pT = state.pT;
    const pG = state.pG;
    const pS = state.pS;

    let posterior;
    if (correct) {
      const num = pL * (1 - pS);
      const denom = pL * (1 - pS) + (1 - pL) * pG;
      posterior = denom > 0 ? num / denom : pL;
    } else {
      const num = pL * pS;
      const denom = pL * pS + (1 - pL) * (1 - pG);
      posterior = denom > 0 ? num / denom : pL;
    }

    const pLNew = posterior + (1 - posterior) * pT;

    return Object.assign({}, state, {
      pL: clamp(pLNew, 0.001, 0.999),
      totalAttempts: state.totalAttempts + 1,
      updatedAt: new Date().toISOString(),
    });
  }

  /** Fold a whole practice session's responses in one pass. */
  function updateBktBatch(state, responses) {
    let current = state;
    for (const r of responses) current = updateBkt(current, r.correct);
    return current;
  }

  function isMastered(state) {
    return !!state && state.pL >= MASTERY_THRESHOLD;
  }

  function masteryLabel(pL) {
    if (pL >= 0.85) return 'Thành thạo';
    if (pL >= 0.7) return 'Khá';
    if (pL >= 0.5) return 'Sơ cấp';
    if (pL >= 0.3) return 'Đang học';
    return 'Chưa biết';
  }

  AM.bkt = {
    BKT_DEFAULTS: BKT_DEFAULTS,
    MASTERY_THRESHOLD: MASTERY_THRESHOLD,
    initBktState: initBktState,
    updateBkt: updateBkt,
    updateBktBatch: updateBktBatch,
    isMastered: isMastered,
    masteryLabel: masteryLabel,
  };
})(window.AM);
