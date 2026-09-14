/**
 * "Hôm nay cần làm" — the daily task list on the dashboard.
 * Ported from src/lib/todayActivities.ts.
 *
 * Merges three sources, in priority order:
 *   1. SRS reviews due today (the forgetting curve waits for nobody)
 *   2. Learning-path activities dated today
 *   3. Catch-up: unfinished activities from earlier days
 *
 * Capped at 5 so the list never feels overwhelming.
 */
(function (AM) {
  'use strict';

  const U = AM.util;
  const getTopicById = AM.topics.getTopicById;

  function computeTodayActivities(path, learner) {
    const today = U.todayVNStr();
    const activities = [];
    const completedSet = new Set(learner.completedActivities);
    const isDone = (act) => completedSet.has(act.activityId);

    // --- 1. SRS reviews due today ---
    for (const topicId of Object.keys(learner.srs)) {
      const srs = learner.srs[topicId];
      if (!srs || typeof srs.nextReviewDate !== 'string') continue;
      if (srs.nextReviewDate > today) continue;
      const activityId = 'srs-' + topicId + '-' + today;
      if (completedSet.has(activityId)) continue; // reviewed already today
      const topic = getTopicById(topicId);
      activities.push({
        key: 'srs-' + topicId,
        source: 'srs',
        reason: 'Ôn tập theo lịch SRS',
        activity: {
          activityId: activityId,
          type: 'review',
          topicId: topicId,
          topicTitle: topic ? topic.title : topicId,
          levels: ['N', 'H'],
          questionCount: 3,
          theoryBlockCount: 0,
          workedExampleCount: 0,
          estimatedMinutes: 5,
          reason: 'SRS review (interval ' + srs.intervalDays + 'd)',
        },
      });
    }

    // --- 2. Today's learning-path activities ---
    if (path) {
      for (const sprint of path.sprints) {
        for (const day of sprint.days) {
          if (day.date !== today) continue;
          for (const act of day.activities) {
            if (isDone(act)) continue;
            // Don't duplicate a topic already queued as an SRS review.
            if (
              activities.some(
                (a) => a.activity.topicId === act.topicId && a.source === 'srs',
              )
            ) {
              continue;
            }
            activities.push({
              key: 'path-' + act.topicId + '-' + act.type,
              source: 'path',
              activity: act,
              reason: 'Lộ trình ngày ' + day.dayNumber,
            });
          }
        }
      }
    }

    // --- 3. Catch-up from earlier days ---
    if (path && activities.length < 3) {
      outer: for (const sprint of path.sprints) {
        for (const day of sprint.days) {
          if (day.date >= today) break outer;
          for (const act of day.activities) {
            if (activities.length >= 5) break outer;
            if (isDone(act)) continue;
            if (
              activities.some(
                (a) =>
                  a.activity.topicId === act.topicId && a.activity.type === act.type,
              )
            ) {
              continue;
            }
            // Already mastered → no point resurfacing it (reviews excepted).
            const bkt = learner.bkt[act.topicId];
            if (bkt && bkt.pL >= 0.85 && act.type !== 'review') continue;

            activities.push({
              key: 'catchup-' + act.topicId + '-' + act.type,
              source: 'catchup',
              activity: act,
              reason: 'Bù từ ngày trước',
            });
          }
        }
      }
    }

    return activities.slice(0, 5);
  }

  /** Dashboard roll-up numbers. */
  function computeProgressStats(path, learner, totalTopicsInGrade) {
    const bktEntries = Object.keys(learner.bkt).map((k) => learner.bkt[k]);
    const masteredTopics = bktEntries.filter((b) => b.pL >= 0.85).length;

    const avgMastery =
      bktEntries.length > 0 && totalTopicsInGrade > 0
        ? bktEntries.reduce((s, b) => s + b.pL, 0) / totalTopicsInGrade
        : 0;

    const completedSet = new Set(learner.completedActivities);
    let totalActivities = 0;
    let completedActivities = 0;
    if (path) {
      for (const sprint of path.sprints) {
        for (const day of sprint.days) {
          for (const act of day.activities) {
            totalActivities++;
            if (completedSet.has(act.activityId)) completedActivities++;
          }
        }
      }
    }

    return {
      masteredTopics: masteredTopics,
      totalTopics: totalTopicsInGrade,
      avgMastery: avgMastery,
      totalSessions: learner.gamification.totalSessions,
      totalQuestions: learner.gamification.totalQuestionsAttempted,
      estimatedCompletion: path ? path.estimatedCompletionDate : null,
      pathDaysCompleted: completedActivities,
      pathDaysTotal: totalActivities,
    };
  }

  /** Dates this month on which the student practised — for the mini calendar. */
  function getPracticeDatesThisMonth(learner) {
    // Session dates are YYYY-MM-DD strings in Vietnam time; compare as strings
    // so no timezone conversion can move a session into the wrong month.
    const thisMonth = U.todayVNStr().slice(0, 7);
    const dates = new Set();
    for (const session of learner.sessions) {
      if (typeof session.date === 'string' && session.date.slice(0, 7) === thisMonth) {
        dates.add(session.date);
      }
    }
    return dates;
  }

  AM.today = {
    computeTodayActivities: computeTodayActivities,
    computeProgressStats: computeProgressStats,
    getPracticeDatesThisMonth: getPracticeDatesThisMonth,
  };
})(window.AM);
