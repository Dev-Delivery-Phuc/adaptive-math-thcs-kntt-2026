/**
 * Knowledge profiling pipeline. Ported from src/lib/profiling.ts.
 *
 *   session ─┐
 *   profile ─┤── buildKnowledgeProfile ──► KnowledgeProfile
 *   pool    ─┤                            (topics, chapters, gaps, signals)
 *   topics  ─┘
 *
 * Per topic t:
 *   attempts   = #responses whose question belongs to t
 *   observed   = Σ score / attempts          (null when attempts = 0)
 *   expected   = mean P(θ, q.irt) over the topic's pool
 *   confidence = min(1, attempts / 5)
 *   mastery    = confidence·observed + (1−confidence)·expected
 *
 * With zero attempts this degenerates to pure `expected`, so a topic the
 * student never saw still gets a calibrated estimate from their overall θ.
 */
(function (AM) {
  'use strict';

  const probabilityCorrect = AM.irt.probabilityCorrect;
  const timeLimitForItem = AM.cat.timeLimitForItem;
  const MASTERY_BANDS = AM.const.MASTERY_BANDS;
  const TARGET_BY_GOAL = AM.const.TARGET_BY_GOAL;

  function durationOf(r) {
    if (r.endedAt === null || r.endedAt === undefined) return 0;
    return Math.max(0, r.endedAt - r.startedAt);
  }

  /** Classify a 0..1 mastery value into one of the five bands. */
  function classifyBand(mastery) {
    for (const band of MASTERY_BANDS) {
      if (mastery >= band.min && mastery < band.max) return band.id;
    }
    return mastery >= 1 ? 'thanh-thao' : 'chua-biet';
  }

  function bandLabel(bandId) {
    const b = MASTERY_BANDS.find((x) => x.id === bandId);
    return b ? b.label : bandId;
  }

  /** Mastery for one topic. Caller has already sliced pool + responses. */
  function computeTopicMastery(topic, poolForTopic, responsesForTopic, theta) {
    const attempts = responsesForTopic.length;
    const correctWeighted = responsesForTopic.reduce((acc, r) => acc + r.response.score, 0);
    const observed = attempts > 0 ? correctWeighted / attempts : null;

    const expected =
      poolForTopic.length > 0
        ? poolForTopic.reduce((acc, q) => acc + probabilityCorrect(theta, q.irt), 0) /
          poolForTopic.length
        : // Neutral fallback so empty-slice topics still get a sensible prior.
          probabilityCorrect(theta, { a: 1.2, b: 0, c: 0.25 });

    const confidence = Math.min(1, attempts / 5);
    const mastery =
      observed === null ? expected : confidence * observed + (1 - confidence) * expected;

    // Seed all five level keys so downstream code can iterate safely.
    const levelBreakdown = {
      N: { attempts: 0, correct: 0, avgScore: 0 },
      H: { attempts: 0, correct: 0, avgScore: 0 },
      V: { attempts: 0, correct: 0, avgScore: 0 },
      T: { attempts: 0, correct: 0, avgScore: 0 },
      unknown: { attempts: 0, correct: 0, avgScore: 0 },
    };
    const scoreSum = {};
    for (const item of responsesForTopic) {
      const bucket = levelBreakdown[item.question.level];
      if (!bucket) continue;
      bucket.attempts += 1;
      scoreSum[item.question.level] = (scoreSum[item.question.level] || 0) + item.response.score;
    }
    for (const key of Object.keys(levelBreakdown)) {
      const b = levelBreakdown[key];
      b.avgScore = b.attempts > 0 ? (scoreSum[key] || 0) / b.attempts : 0;
      b.correct = scoreSum[key] || 0;
    }

    const durations = responsesForTopic
      .filter((r) => r.response.answered && r.response.endedAt !== null)
      .map((r) => durationOf(r.response));
    const avgDurationMs =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;

    return {
      topicId: topic.id,
      title: topic.title,
      chapterTitle: topic.chapterTitle,
      grade: topic.grade,
      attempts: attempts,
      correctWeighted: correctWeighted,
      observed: observed,
      expected: expected,
      confidence: confidence,
      mastery: mastery,
      band: classifyBand(mastery),
      tested: attempts > 0,
      levelBreakdown: levelBreakdown,
      avgDurationMs: avgDurationMs,
    };
  }

  /**
   * Chapter rollup. Each topic is weighted `attempts + 1`, so tested topics
   * dominate while zero-attempt topics still pull the chapter toward the
   * student's θ-expected level instead of being ignored outright.
   */
  function computeChapterMastery(topicMasteries) {
    const byChapter = new Map();
    for (const t of topicMasteries) {
      const w = t.attempts + 1;
      const bucket = byChapter.get(t.chapterTitle) || {
        weightedSum: 0,
        weight: 0,
        count: 0,
        tested: 0,
      };
      bucket.weightedSum += t.mastery * w;
      bucket.weight += w;
      bucket.count += 1;
      if (t.tested) bucket.tested += 1;
      byChapter.set(t.chapterTitle, bucket);
    }
    return Array.from(byChapter.entries()).map(([chapterTitle, v]) => ({
      chapterTitle: chapterTitle,
      mastery: v.weight > 0 ? v.weightedSum / v.weight : 0,
      topicCount: v.count,
      testedCount: v.tested,
    }));
  }

  /** Topics meaningfully below target, sorted by gap × weak bonus, capped at 8. */
  function computeGaps(topicMasteries, target, weakSet) {
    const GAP_CUTOFF = 0.15;
    const rows = [];
    for (const t of topicMasteries) {
      const gap = Math.max(0, target - t.mastery);
      if (gap <= GAP_CUTOFF) continue;
      const weakBonus = weakSet.has(t.topicId) ? 1.25 : 1.0;
      rows.push({
        topicId: t.topicId,
        title: t.title,
        mastery: t.mastery,
        target: target,
        gap: gap,
        weakBonus: weakBonus,
        priority: gap * weakBonus,
      });
    }
    rows.sort((a, b) => b.priority - a.priority);
    return rows;
  }

  /**
   * Error patterns, speed profile and engagement.
   *
   * Everything is inferred from timing and level metadata — there is no deep
   * semantic error classification, which would need solution-step analysis
   * the corpus doesn't provide.
   */
  function detectSignals(session, poolById) {
    const carelessExamples = [];
    const conceptExamples = [];
    const perTopic = new Map();

    let durationRatioSum = 0;
    let durationRatioN = 0;

    for (const r of session.responses) {
      const q = poolById.get(r.questionId);
      if (!q) continue;

      const duration = durationOf(r);
      const ratio = duration / (timeLimitForItem(q) * 1000);

      if (r.answered) {
        durationRatioSum += ratio;
        durationRatioN += 1;
      }

      // Careless: wrong, and answered very fast.
      if (r.answered && r.score < 0.5 && ratio < 0.3) carelessExamples.push(q.id);

      // Concept gap: wrong on a recognition-level item.
      if (r.answered && r.score < 0.5 && q.level === 'N') conceptExamples.push(q.id);

      // Application weakness: track N/H vs V/T per topic.
      const bucket = perTopic.get(q.topicId) || {
        nhAttempts: 0,
        nhCorrect: 0,
        vtAttempts: 0,
        vtCorrect: 0,
      };
      if (q.level === 'N' || q.level === 'H') {
        bucket.nhAttempts += 1;
        if (r.score >= 0.75) bucket.nhCorrect += 1;
      } else if (q.level === 'V' || q.level === 'T') {
        bucket.vtAttempts += 1;
        if (r.score >= 0.75) bucket.vtCorrect += 1;
      }
      perTopic.set(q.topicId, bucket);
    }

    const applicationWeakTopics = [];
    for (const [topicId, b] of perTopic) {
      if (b.nhAttempts === 0 || b.vtAttempts === 0) continue;
      const nh = b.nhCorrect / b.nhAttempts;
      const vt = b.vtCorrect / b.vtAttempts;
      if (nh >= 0.6 && vt <= 0.3) applicationWeakTopics.push(topicId);
    }

    const avgRatio = durationRatioN > 0 ? durationRatioSum / durationRatioN : 0;
    const speedKind = avgRatio < 0.4 ? 'fast' : avgRatio > 0.75 ? 'slow' : 'medium';

    const answeredCount = session.responses.filter((r) => r.answered).length;
    const skippedCount = session.responses.length - answeredCount;
    const answeredRate =
      session.responses.length > 0 ? answeredCount / session.responses.length : 1;

    return {
      careless: { count: carelessExamples.length, examples: carelessExamples },
      conceptGap: { count: conceptExamples.length, examples: conceptExamples },
      applicationWeak: { topicIds: applicationWeakTopics },
      speedProfile: { kind: speedKind, avgRatio: avgRatio },
      engagement: { answeredRate: answeredRate, skippedCount: skippedCount },
    };
  }

  /**
   * A session is "preliminary" when the estimate isn't trustworthy yet — wide
   * SE, very few items, or cancelled midway. The UI shows a banner for these.
   */
  function isPreliminary(session) {
    if (session.stopReason === 'user-cancelled') return true;
    if (session.responses.length < 10) return true;
    if (Number.isFinite(session.standardError) && session.standardError > 0.45) return true;
    return false;
  }

  // -------------------------------------------------------------------------
  // Entry point
  // -------------------------------------------------------------------------

  function buildKnowledgeProfile(session, profile, pool, topics) {
    // 1. Bucket the pool and the responses by topic for O(1) lookup below.
    const poolByTopic = new Map();
    for (const q of pool) {
      const bucket = poolByTopic.get(q.topicId) || [];
      bucket.push(q);
      poolByTopic.set(q.topicId, bucket);
    }
    const poolById = new Map(pool.map((q) => [q.id, q]));

    const respByTopic = new Map();
    let orphanResponses = 0;
    for (const r of session.responses) {
      const q = poolById.get(r.questionId);
      if (!q) {
        orphanResponses++;
        continue;
      }
      const bucket = respByTopic.get(q.topicId) || [];
      bucket.push({ response: r, question: q });
      respByTopic.set(q.topicId, bucket);
    }

    // 2. Per-topic mastery for every topic in the student's grade.
    const gradeTopics = topics.filter((t) => t.grade === profile.grade);
    const topicMasteries = gradeTopics.map((topic) =>
      computeTopicMastery(
        topic,
        poolByTopic.get(topic.id) || [],
        respByTopic.get(topic.id) || [],
        session.theta,
      ),
    );

    // 3-6. Rollups, gaps, signals, global stats.
    const chapters = computeChapterMastery(topicMasteries);
    const target = TARGET_BY_GOAL[profile.goal];
    // `gaps` is the short list the profile page shows; `allGaps` is every
    // topic below target, so the learning path can keep scheduling topics
    // 9, 10, … once the first eight are mastered instead of stalling.
    const allGaps = computeGaps(topicMasteries, target, new Set(profile.weakTopicIds));
    const gaps = allGaps.slice(0, 8);
    const signals = detectSignals(session, poolById);

    const answered = session.responses.filter((r) => r.answered);
    const totalCorrect = answered.filter((r) => r.score >= 0.75).length;
    const avgDurationMs =
      answered.length > 0
        ? answered.reduce((a, r) => a + durationOf(r), 0) / answered.length
        : 0;

    return {
      builtAt: new Date().toISOString(),
      sessionId: session.sessionId || null,
      grade: profile.grade,
      theta: session.theta,
      standardError: session.standardError,
      isPreliminary: isPreliminary(session),
      target: target,
      topics: topicMasteries,
      chapters: chapters,
      gaps: gaps,
      allGaps: allGaps,
      signals: signals,
      stats: {
        totalAnswered: answered.length,
        totalCorrect: totalCorrect,
        avgDurationMs: avgDurationMs,
        orphanResponses: orphanResponses,
      },
    };
  }

  AM.profiling = {
    buildKnowledgeProfile: buildKnowledgeProfile,
    computeTopicMastery: computeTopicMastery,
    computeChapterMastery: computeChapterMastery,
    computeGaps: computeGaps,
    detectSignals: detectSignals,
    classifyBand: classifyBand,
    bandLabel: bandLabel,
    isPreliminary: isPreliminary,
  };
})(window.AM);
