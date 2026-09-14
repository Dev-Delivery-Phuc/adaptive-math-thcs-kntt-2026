/**
 * Knowledge tree — blends the diagnostic KnowledgeProfile with the persisted
 * LearnerState (BKT, SRS, errors, streak) into a 0..1 stability score per
 * topic, then maps that to one of four growth stages.
 *
 * Ported from src/lib/treeStability.ts. Pure — the caller supplies both the
 * profile snapshot and the accumulated learner state.
 */
(function (AM) {
  'use strict';

  const TREE_STAGES = AM.const.TREE_STAGES;
  const getTopicById = AM.topics.getTopicById;

  const STABILITY_WEIGHTS = {
    mastery: 0.35,
    bkt: 0.2,
    srsStreak: 0.15,
    resolution: 0.15,
    recency: 0.1,
    regularity: 0.05,
  };

  const SRS_STREAK_TARGET = 5;
  const REGULARITY_TARGET = 7;
  const RECENCY_FRESH_DAYS = 2;
  const RECENCY_HEALED_DAYS = 30;
  const MS_PER_DAY = 86400000;

  function clamp01(x) {
    if (Number.isNaN(x)) return 0;
    if (x < 0) return 0;
    if (x > 1) return 1;
    return x;
  }

  /** Map 0..1 stability to a growth stage. */
  function classifyStage(stability) {
    for (const s of TREE_STAGES) {
      if (stability >= s.min && stability < s.max) return s.id;
    }
    return stability >= 1 ? 'ra-hoa' : 'mam-non';
  }

  function stageMeta(stageId) {
    return TREE_STAGES.find((s) => s.id === stageId) || TREE_STAGES[0];
  }

  /** Stability score plus the counts the drawer displays. */
  function computeStability(topic, bkt, srs, errorsForTopic, currentStreak) {
    const masteryComponent = clamp01(topic.mastery);
    const bktComponent = clamp01(bkt ? bkt.pL : topic.mastery);

    const srsStreak = srs ? srs.consecutiveCorrect : 0;
    const srsComponent = clamp01(srsStreak / SRS_STREAK_TARGET);

    const unresolvedErrors = errorsForTopic.filter((e) => !e.resolved).length;
    // Errors come from practice, attempts from the diagnostic, so the
    // denominator counts both: "of everything this student has faced on the
    // topic, how much is still unresolved". With nothing faced yet the
    // component is neutral 1.0 rather than a punishment.
    const faced = topic.attempts + errorsForTopic.length;
    const resolutionComponent = faced === 0 ? 1 : 1 - clamp01(unresolvedErrors / faced);

    let recentErrorDays = null;
    if (errorsForTopic.length > 0) {
      const newest = errorsForTopic.reduce(function (max, e) {
        const t = Date.parse(e.timestamp);
        return Number.isFinite(t) && t > max ? t : max;
      }, 0);
      if (newest > 0) recentErrorDays = Math.max(0, (Date.now() - newest) / MS_PER_DAY);
    }
    const recencyComponent =
      recentErrorDays === null
        ? 1
        : clamp01(
            (recentErrorDays - RECENCY_FRESH_DAYS) /
              (RECENCY_HEALED_DAYS - RECENCY_FRESH_DAYS),
          );

    const regularityComponent = clamp01(currentStreak / REGULARITY_TARGET);

    const stability = clamp01(
      STABILITY_WEIGHTS.mastery * masteryComponent +
        STABILITY_WEIGHTS.bkt * bktComponent +
        STABILITY_WEIGHTS.srsStreak * srsComponent +
        STABILITY_WEIGHTS.resolution * resolutionComponent +
        STABILITY_WEIGHTS.recency * recencyComponent +
        STABILITY_WEIGHTS.regularity * regularityComponent,
    );

    return {
      stability: stability,
      unresolvedErrors: unresolvedErrors,
      recentErrorDays: recentErrorDays,
    };
  }

  /** Lowest Bloom level that still needs attention, or null. */
  function pickWeakestLevel(topic, target) {
    for (const lv of ['N', 'H', 'V', 'T']) {
      const b = topic.levelBreakdown[lv];
      if (!b) continue;
      if (b.attempts === 0 || b.avgScore < target) return lv;
    }
    return null;
  }

  /** Build the full tree model. Either input may be empty. */
  function buildKnowledgeTree(knowledge, learner) {
    const errorsByTopic = new Map();
    for (const e of learner.errors) {
      const bucket = errorsByTopic.get(e.topicId) || [];
      bucket.push(e);
      errorsByTopic.set(e.topicId, bucket);
    }

    const currentStreak = learner.gamification.currentStreak;

    const nodes = knowledge.topics.map(function (tm) {
      const meta = getTopicById(tm.topicId);
      const result = computeStability(
        tm,
        learner.bkt[tm.topicId],
        learner.srs[tm.topicId],
        errorsByTopic.get(tm.topicId) || [],
        currentStreak,
      );
      const srs = learner.srs[tm.topicId];
      return {
        topicId: tm.topicId,
        title: tm.title,
        chapterTitle: tm.chapterTitle,
        chapterNumber: meta ? meta.chapter : 0,
        grade: tm.grade,
        mastery: tm.mastery,
        stability: result.stability,
        fragility: clamp01(1 - result.stability),
        stage: classifyStage(result.stability),
        tested: tm.tested,
        attempts: tm.attempts,
        unresolvedErrors: result.unresolvedErrors,
        consecutiveCorrect: srs ? srs.consecutiveCorrect : 0,
        weakestLevel: pickWeakestLevel(tm, knowledge.target),
        recentErrorDays: result.recentErrorDays,
      };
    });

    // Group into chapter branches, preserving curriculum order.
    const branchMap = new Map();
    const chapterOrder = new Map();
    for (const n of nodes) {
      const bucket = branchMap.get(n.chapterTitle) || [];
      bucket.push(n);
      branchMap.set(n.chapterTitle, bucket);
      const existing = chapterOrder.get(n.chapterTitle);
      if (existing === undefined || n.chapterNumber < existing) {
        chapterOrder.set(n.chapterTitle, n.chapterNumber);
      }
    }

    const branches = Array.from(branchMap.entries())
      .map(function (entry) {
        const chapterTitle = entry[0];
        const topics = entry[1]
          .slice()
          .sort(
            (a, b) =>
              a.chapterNumber - b.chapterNumber || a.topicId.localeCompare(b.topicId),
          );
        const avgMastery = topics.reduce((s, t) => s + t.mastery, 0) / topics.length;
        const avgStability = topics.reduce((s, t) => s + t.stability, 0) / topics.length;
        return {
          chapterTitle: chapterTitle,
          chapterNumber: chapterOrder.get(chapterTitle) || 0,
          topics: topics,
          avgMastery: avgMastery,
          avgStability: avgStability,
          stage: classifyStage(avgStability),
        };
      })
      .sort((a, b) => a.chapterNumber - b.chapterNumber);

    const trunkStrength =
      branches.length > 0
        ? clamp01(branches.reduce((s, b) => s + b.avgStability, 0) / branches.length)
        : 0;

    const stageCounts = { 'mam-non': 0, 'choi-non': 0, 'vuon-than': 0, 'ra-hoa': 0 };
    for (const n of nodes) stageCounts[n.stage] += 1;

    return {
      grade: knowledge.grade,
      trunkStrength: trunkStrength,
      overallStage: classifyStage(trunkStrength),
      branches: branches,
      stageCounts: stageCounts,
      builtAt: new Date().toISOString(),
    };
  }

  AM.tree = {
    computeStability: computeStability,
    classifyStage: classifyStage,
    stageMeta: stageMeta,
    buildKnowledgeTree: buildKnowledgeTree,
  };
})(window.AM);
