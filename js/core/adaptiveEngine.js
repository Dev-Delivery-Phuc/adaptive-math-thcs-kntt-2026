/**
 * Adaptive engine — real-time difficulty adjustment during practice.
 * Ported from src/lib/adaptiveEngine.ts.
 *
 * Runs after every response and watches three signal groups:
 *   Performance — accuracy, streak
 *   Engagement  — response-time ratio, skip rate
 *   Behavioural — frustration / boredom / flow
 *
 * Returns the IRT b-value the next question should aim for, plus an optional
 * message for the student. Pure functions; the runner owns the state.
 */
(function (AM) {
  'use strict';

  const mean = AM.util.mean;

  /** Zone-of-proximal-development offset applied on top of θ, per state. */
  const ZPD_OFFSETS = {
    normal: 0.3,
    frustration: -0.5,
    boredom: 0.8,
    flow: 0.4,
  };

  const FRUSTRATION_THRESHOLD = {
    wrongStreak: 3,
    skipRate: 0.3,
    accuracy: 0.3,
  };

  const BOREDOM_THRESHOLD = {
    streak: 5,
    accuracy: 0.85,
    timeRatioFast: 0.25, // avg time < 25% of the limit = too easy
  };

  function emptySessionMetrics() {
    return {
      totalResponses: 0,
      correctCount: 0,
      streak: 0,
      wrongStreak: 0,
      recentTimeRatios: [],
      recentScores: [],
      skipCount: 0,
      theoryRevisitCount: 0,
    };
  }

  /** Immutable metrics update after one response. */
  function updateMetrics(prev, question, score, durationMs, skipped) {
    const correct = score >= 0.75;
    const timeLimitMs = AM.cat.timeLimitForItem(question) * 1000;
    const timeRatio = timeLimitMs > 0 ? durationMs / timeLimitMs : 0.5;

    return {
      totalResponses: prev.totalResponses + 1,
      correctCount: prev.correctCount + (correct ? 1 : 0),
      streak: correct ? prev.streak + 1 : 0,
      wrongStreak: correct ? 0 : prev.wrongStreak + 1,
      recentTimeRatios: prev.recentTimeRatios.concat([timeRatio]).slice(-5),
      recentScores: prev.recentScores.concat([score]).slice(-5),
      skipCount: prev.skipCount + (skipped ? 1 : 0),
      theoryRevisitCount: prev.theoryRevisitCount,
    };
  }

  function detectState(metrics) {
    if (metrics.totalResponses < 3) return 'normal'; // not enough data yet

    const accuracy =
      metrics.totalResponses > 0 ? metrics.correctCount / metrics.totalResponses : 0;
    const avgTimeRatio = mean(metrics.recentTimeRatios);
    const skipRate =
      metrics.totalResponses > 0 ? metrics.skipCount / metrics.totalResponses : 0;

    // Frustration: losing streak, or slow AND inaccurate, or skipping a lot.
    if (
      metrics.wrongStreak >= FRUSTRATION_THRESHOLD.wrongStreak ||
      (accuracy < FRUSTRATION_THRESHOLD.accuracy && avgTimeRatio > 0.7) ||
      skipRate > FRUSTRATION_THRESHOLD.skipRate
    ) {
      return 'frustration';
    }

    // Boredom: very fast and very accurate.
    if (
      metrics.streak >= BOREDOM_THRESHOLD.streak &&
      accuracy >= BOREDOM_THRESHOLD.accuracy &&
      avgTimeRatio < BOREDOM_THRESHOLD.timeRatioFast
    ) {
      return 'boredom';
    }

    // Flow: steady pace, good-but-not-perfect accuracy.
    if (
      accuracy >= 0.6 &&
      accuracy <= 0.9 &&
      avgTimeRatio >= 0.3 &&
      avgTimeRatio <= 0.7 &&
      skipRate < 0.1
    ) {
      return 'flow';
    }

    return 'normal';
  }

  function buildSuggestion(state, metrics) {
    if (state === 'frustration' && metrics.wrongStreak >= 3) {
      return 'Có vẻ phần này hơi khó. Mình sẽ chuyển sang câu dễ hơn nhé!';
    }
    if (state === 'boredom' && metrics.streak >= 5) {
      return 'Tuyệt vời! Bạn đang rất giỏi. Thử thách khó hơn nhé? 🚀';
    }
    if (state === 'flow') return null; // don't interrupt flow
    if (metrics.streak >= 10) return 'Chuỗi 10 câu đúng liên tiếp! Xuất sắc! 🔥';
    return null;
  }

  /** Compute the next adaptive decision from the running metrics. */
  function computeAdaptiveDecision(metrics, theta) {
    const state = detectState(metrics);
    let offset = ZPD_OFFSETS[state];

    if (metrics.streak >= 5) offset += 0.2; // push after 5 straight correct
    if (metrics.wrongStreak >= 3) offset -= 0.3; // pull back after 3 wrong

    return {
      state: state,
      targetDifficulty: Math.max(-3, Math.min(3, theta + offset)),
      offset: offset,
      suggestion: buildSuggestion(state, metrics),
    };
  }

  /** Question in `pool` whose IRT b sits closest to the target, unseen first. */
  function pickQuestionByDifficulty(pool, targetB, shownIds) {
    const unseen = pool.filter((q) => !shownIds.has(q.id));
    const candidates = unseen.length > 0 ? unseen : pool;
    if (candidates.length === 0) return null;

    return candidates
      .slice()
      .sort((a, b) => Math.abs(a.irt.b - targetB) - Math.abs(b.irt.b - targetB))[0];
  }

  const STATE_LABELS = {
    normal: 'Bình thường',
    frustration: 'Đang gặp khó',
    boredom: 'Thấy dễ quá',
    flow: 'Đang vào guồng',
  };

  AM.adaptive = {
    emptySessionMetrics: emptySessionMetrics,
    updateMetrics: updateMetrics,
    computeAdaptiveDecision: computeAdaptiveDecision,
    pickQuestionByDifficulty: pickQuestionByDifficulty,
    STATE_LABELS: STATE_LABELS,
  };
})(window.AM);
