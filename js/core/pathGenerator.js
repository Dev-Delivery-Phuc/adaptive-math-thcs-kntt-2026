/**
 * Learning path generator. Ported from src/lib/pathGenerator.ts.
 *
 * Turns the KnowledgeProfile + UserProfile into a concrete day-by-day
 * schedule. Each gap topic produces a sequence of sessions:
 *
 *   1. Theory     — read definitions + worked examples (~10 min)
 *   2. Practice N — 5 questions at Nhận biết   (~15 min)
 *   3. Practice H — 5 questions at Thông hiểu  (~15 min)
 *   4. Practice V — 5 questions at Vận dụng    (~15 min)   [if the gap is there]
 *
 * Those slots are packed into days inside the student's `dailyMinutes` budget,
 * interleaved with a review day every few learning days, then grouped into
 * weekly sprints.
 */
(function (AM) {
  'use strict';

  const U = AM.util;
  const TOPICS = AM.topics.TOPICS;

  const QUESTIONS_PER_SESSION = 5;
  const QUESTIONS_PER_REVIEW = 3;
  const REVIEW_EVERY_N_DAYS = 4;
  const MAX_NEW_TOPICS_PER_DAY = 2;
  const THEORY_MINUTES = 10;
  const PRACTICE_MINUTES = 15;
  const MAX_DAYS = 90;

  const PRIORITY_WEIGHTS = {
    gap: 0.3,
    urgency: 0.2,
    fragility: 0.2,
    exam: 0.15,
    weak: 0.15,
  };

  // -------------------------------------------------------------------------
  // Priority scoring
  // -------------------------------------------------------------------------

  /**
   * Deadline → 0.5..1 urgency. No deadline is treated as middling (0.5), and a
   * deadline that is still far off never ranks *below* having none at all.
   */
  function computeUrgency(deadline) {
    if (!deadline) return 0.5;
    const daysLeft = U.daysFromTodayVN(deadline);
    if (!Number.isFinite(daysLeft)) return 0.5;
    if (daysLeft <= 0) return 1.0;
    return Math.max(0.5, 1 - daysLeft / 90);
  }

  /** Which levels still need work for this topic. */
  function computeGapLevels(tm, target) {
    const levels = [];
    for (const lv of ['N', 'H', 'V']) {
      const b = tm.levelBreakdown[lv];
      if (!b || b.attempts === 0 || b.avgScore < target) levels.push(lv);
    }
    if (levels.length === 0 && tm.mastery < target) levels.push('N');
    return levels;
  }

  function buildPriorityList(profile, knowledge, pool, learner) {
    const weakSet = new Set(profile.weakTopicIds);

    // Exam density = share of a topic's items that came from a real exam.
    const examCountByTopic = new Map();
    const totalCountByTopic = new Map();
    for (const q of pool) {
      totalCountByTopic.set(q.topicId, (totalCountByTopic.get(q.topicId) || 0) + 1);
      if (q.source) {
        examCountByTopic.set(q.topicId, (examCountByTopic.get(q.topicId) || 0) + 1);
      }
    }

    const urgency = computeUrgency(profile.deadline);

    const errorsByTopic = new Map();
    for (const e of learner.errors) {
      const bucket = errorsByTopic.get(e.topicId) || [];
      bucket.push(e);
      errorsByTopic.set(e.topicId, bucket);
    }
    const currentStreak = learner.gamification.currentStreak;

    const list = [];
    const gaps = knowledge.allGaps || knowledge.gaps;
    for (const gap of gaps) {
      const tm = knowledge.topics.find((t) => t.topicId === gap.topicId);
      if (!tm) continue;
      // Practice has already closed this gap — BKT knows more than the
      // diagnostic did. Leave it to the SRS schedule.
      const bkt = learner.bkt[gap.topicId];
      if (bkt && AM.bkt.isMastered(bkt)) continue;

      const examTotal = totalCountByTopic.get(gap.topicId) || 1;
      const examSourced = examCountByTopic.get(gap.topicId) || 0;
      const examDensity = examSourced / examTotal;
      const weakBonus = weakSet.has(gap.topicId) ? 1.0 : 0.0;

      const stability = AM.tree.computeStability(
        tm,
        learner.bkt[gap.topicId],
        learner.srs[gap.topicId],
        errorsByTopic.get(gap.topicId) || [],
        currentStreak,
      ).stability;
      const fragility = Math.max(0, Math.min(1, 1 - stability));

      const score =
        PRIORITY_WEIGHTS.gap * gap.gap +
        PRIORITY_WEIGHTS.urgency * urgency +
        PRIORITY_WEIGHTS.fragility * fragility +
        PRIORITY_WEIGHTS.exam * examDensity +
        PRIORITY_WEIGHTS.weak * weakBonus;

      const gapLevels = computeGapLevels(tm, knowledge.target);

      list.push({
        topicId: gap.topicId,
        title: gap.title,
        mastery: gap.mastery,
        gap: gap.gap,
        urgency: urgency,
        weakBonus: weakBonus,
        examDensity: examDensity,
        fragility: fragility,
        score: score,
        estimatedMinutes: THEORY_MINUTES + gapLevels.length * PRACTICE_MINUTES,
        gapLevels: gapLevels,
      });
    }

    list.sort((a, b) => b.score - a.score);
    return list;
  }

  /**
   * Nudge near-tied topics back into curriculum order — if two topics score
   * within 0.1 of each other, the earlier lesson should come first.
   */
  function stabilitySort(list) {
    const meta = new Map(TOPICS.map((t) => [t.id, t]));
    for (let i = 0; i < list.length - 1; i++) {
      if (Math.abs(list[i].score - list[i + 1].score) < 0.1) {
        const a = meta.get(list[i].topicId);
        const b = meta.get(list[i + 1].topicId);
        if (a && b && a.chapter * 100 + a.lesson > b.chapter * 100 + b.lesson) {
          const tmp = list[i];
          list[i] = list[i + 1];
          list[i + 1] = tmp;
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Session slots
  // -------------------------------------------------------------------------

  function generateSessionSlots(priorities) {
    const slots = [];

    for (const p of priorities) {
      const theory = AM.bank.getTheory(p.topicId);
      const knowledgeCount = theory
        ? theory.knowledgeBlocks.filter((b) => b.type !== 'section').length
        : 0;
      const exampleCount = theory
        ? theory.methodBlocks.filter((b) => b.type === 'vd').length
        : 0;

      // Phase 0 — theory always comes first.
      if (knowledgeCount + exampleCount > 0) {
        slots.push({
          topicId: p.topicId,
          phase: 0,
          activity: {
            activityId: p.topicId + '::theory',
            type: 'theory',
            topicId: p.topicId,
            topicTitle: p.title,
            levels: [],
            questionCount: 0,
            theoryBlockCount: knowledgeCount,
            workedExampleCount: exampleCount,
            estimatedMinutes: THEORY_MINUTES,
            reason: knowledgeCount + ' khái niệm + ' + exampleCount + ' ví dụ mẫu',
          },
        });
      }

      // Phases 1-3 — one practice session per gap level. The level is part of
      // the id so "learn N" and "practice H" are tracked independently.
      for (let i = 0; i < p.gapLevels.length; i++) {
        const lv = p.gapLevels[i];
        const type = i === 0 ? 'learn' : 'practice';
        slots.push({
          topicId: p.topicId,
          phase: i + 1,
          activity: {
            activityId: p.topicId + '::' + type + '-' + lv,
            type: type,
            topicId: p.topicId,
            topicTitle: p.title,
            levels: [lv],
            questionCount: QUESTIONS_PER_SESSION,
            theoryBlockCount: 0,
            workedExampleCount: 0,
            estimatedMinutes: PRACTICE_MINUTES,
            reason:
              'gap ' + p.gap.toFixed(2) + ', mức ' + lv + ', ưu tiên ' + p.score.toFixed(3),
          },
        });
      }
    }

    return slots;
  }

  // -------------------------------------------------------------------------
  // Day packing
  // -------------------------------------------------------------------------

  function buildReviewActivities(topics) {
    const seen = new Map();
    for (const t of topics) seen.set(t.topicId, t);
    return Array.from(seen.values())
      .slice(0, 3)
      .map((t, i) => ({
        activityId: 'review::' + t.topicId + '::' + i,
        type: 'review',
        topicId: t.topicId,
        topicTitle: t.title,
        levels: t.levels.slice(0, 1),
        questionCount: QUESTIONS_PER_REVIEW,
        theoryBlockCount: 0,
        workedExampleCount: 0,
        estimatedMinutes: Math.round((QUESTIONS_PER_REVIEW * 90) / 60),
        reason: 'ôn tập sau vài ngày học',
      }));
  }

  function packIntoDays(slots, dailyMinutes, startDate) {
    if (slots.length === 0) return [];

    const days = [];
    const queue = slots.slice();
    let recentTopics = [];
    let learnDaysSinceReview = 0;
    let dayNumber = 0;

    while (queue.length > 0 || (learnDaysSinceReview > 0 && recentTopics.length > 0)) {
      dayNumber++;
      if (dayNumber > MAX_DAYS) break;

      const ds = U.dateStr(U.addDays(startDate, dayNumber - 1));

      const shouldReview =
        recentTopics.length > 0 &&
        (learnDaysSinceReview >= REVIEW_EVERY_N_DAYS - 1 || queue.length === 0);

      if (shouldReview) {
        const reviewActs = buildReviewActivities(recentTopics.slice(-6));
        days.push({
          dayNumber: dayNumber,
          date: ds,
          activities: reviewActs,
          estimatedMinutes: reviewActs.reduce((s, a) => s + a.estimatedMinutes, 0),
          isReviewDay: true,
        });
        learnDaysSinceReview = 0;
        recentTopics = [];
        continue;
      }

      if (queue.length === 0) break;

      const activities = [];
      let minutesLeft = dailyMinutes;
      let newTopicsToday = 0;
      const topicsSeenToday = new Set();

      while (queue.length > 0 && minutesLeft >= 5) {
        const next = queue[0];

        const isNewTopic =
          !recentTopics.some((r) => r.topicId === next.topicId) &&
          !topicsSeenToday.has(next.topicId);
        if (isNewTopic && newTopicsToday >= MAX_NEW_TOPICS_PER_DAY) break;

        // Doesn't fit, but the day already has something → stop filling.
        if (next.activity.estimatedMinutes > minutesLeft && activities.length > 0) break;

        queue.shift();
        activities.push(next.activity);
        minutesLeft -= next.activity.estimatedMinutes;

        if (isNewTopic) {
          newTopicsToday++;
          topicsSeenToday.add(next.topicId);
        }

        if (next.activity.type !== 'theory') {
          if (!recentTopics.some((r) => r.topicId === next.topicId)) {
            recentTopics.push({
              topicId: next.topicId,
              title: next.activity.topicTitle,
              levels: next.activity.levels,
            });
          }
        }
      }

      if (activities.length === 0) break;

      days.push({
        dayNumber: dayNumber,
        date: ds,
        activities: activities,
        estimatedMinutes: activities.reduce((s, a) => s + a.estimatedMinutes, 0),
        isReviewDay: false,
      });
      learnDaysSinceReview++;
    }

    return days;
  }

  // -------------------------------------------------------------------------
  // Sprint grouping
  // -------------------------------------------------------------------------

  function groupIntoSprints(days, startDate) {
    if (days.length === 0) return [];
    const sprints = [];
    let weekStart = new Date(startDate);
    let weekNumber = 1;
    let dayIdx = 0;

    while (dayIdx < days.length) {
      const weekEnd = U.addDays(weekStart, 6);
      const sprintDays = [];
      while (dayIdx < days.length) {
        if (new Date(days[dayIdx].date) > weekEnd) break;
        sprintDays.push(days[dayIdx]);
        dayIdx++;
      }
      if (sprintDays.length > 0) {
        const topicSet = new Set();
        for (const d of sprintDays) {
          for (const a of d.activities) topicSet.add(a.topicTitle);
        }
        sprints.push({
          weekNumber: weekNumber,
          label: 'Tuần ' + weekNumber,
          startDate: U.dateStr(weekStart),
          endDate: U.dateStr(weekEnd),
          days: sprintDays,
          topicSummary: Array.from(topicSet),
        });
      }
      weekStart = U.addDays(weekEnd, 1);
      weekNumber++;
      if (weekNumber > 15) break;
    }
    return sprints;
  }

  // -------------------------------------------------------------------------
  // Entry point
  // -------------------------------------------------------------------------

  function generateLearningPath(profile, knowledge, pool, learner) {
    const startDate = U.todayVNDate();
    const priorityList = buildPriorityList(profile, knowledge, pool, learner);
    stabilitySort(priorityList);

    const days = packIntoDays(
      generateSessionSlots(priorityList),
      profile.dailyMinutes,
      startDate,
    );
    const sprints = groupIntoSprints(days, startDate);
    const lastDay = days.length > 0 ? days[days.length - 1] : null;

    return {
      builtAt: new Date().toISOString(),
      // Which diagnostic this path was built from; the path page regenerates
      // only when this changes (or the profile does), never merely on a visit.
      diagnosticSessionId: knowledge.sessionId || null,
      grade: knowledge.grade,
      goal: profile.goal,
      dailyMinutes: profile.dailyMinutes,
      deadline: profile.deadline,
      estimatedCompletionDate: lastDay ? lastDay.date : U.dateStr(startDate),
      totalDays: days.length,
      totalTopics: priorityList.length,
      sprints: sprints,
      priorityList: priorityList,
    };
  }

  AM.path = {
    generateLearningPath: generateLearningPath,
    computeUrgency: computeUrgency,
    QUESTIONS_PER_SESSION: QUESTIONS_PER_SESSION,
  };
})(window.AM);
