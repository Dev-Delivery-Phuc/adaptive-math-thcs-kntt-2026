/**
 * SM-2 spaced repetition. Ported from src/lib/srs.ts.
 *
 * Once a topic reaches BKT mastery (p(L) ≥ 0.85), SRS takes over and schedules
 * reviews at exponentially growing intervals for as long as recall holds.
 *
 * SM-2 (Piotr Woźniak, 1987):
 *   quality ≥ 3 → successful review → interval grows by the easiness factor
 *   quality < 3 → failed review     → interval resets to 1 day, EF drops
 */
(function (AM) {
  'use strict';

  /** First review is tomorrow (Vietnam calendar day, like the dashboard). */
  function initSrsState() {
    return {
      nextReviewDate: AM.util.addDaysStr(AM.util.todayVNStr(), 1),
      intervalDays: 1,
      easinessFactor: 2.5,
      consecutiveCorrect: 0,
    };
  }

  /** Session accuracy (0..1) → SM-2 quality (0..5). */
  function accuracyToQuality(accuracy) {
    if (accuracy >= 0.9) return 5;
    if (accuracy >= 0.8) return 4;
    if (accuracy >= 0.6) return 3;
    if (accuracy >= 0.4) return 2;
    if (accuracy >= 0.2) return 1;
    return 0;
  }

  /**
   * Schedule the next review.
   *
   *   1st success: 1 day
   *   2nd success: 3 days
   *   3rd+:        interval × easinessFactor
   */
  function scheduleReview(srs, quality) {
    let easinessFactor = srs.easinessFactor;
    let intervalDays = srs.intervalDays;
    let consecutiveCorrect = srs.consecutiveCorrect;

    if (quality >= 3) {
      consecutiveCorrect++;
      if (consecutiveCorrect === 1) intervalDays = 1;
      else if (consecutiveCorrect === 2) intervalDays = 3;
      else intervalDays = Math.round(intervalDays * easinessFactor);

      easinessFactor += 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
    } else {
      consecutiveCorrect = 0;
      intervalDays = 1;
      easinessFactor -= 0.2;
    }

    easinessFactor = Math.max(1.3, easinessFactor); // SM-2 floor
    intervalDays = Math.min(180, intervalDays); // cap at ~6 months

    return {
      nextReviewDate: AM.util.addDaysStr(AM.util.todayVNStr(), intervalDays),
      intervalDays: intervalDays,
      easinessFactor: easinessFactor,
      consecutiveCorrect: consecutiveCorrect,
    };
  }

  function isReviewDue(srs) {
    return !!srs && srs.nextReviewDate <= AM.util.todayVNStr();
  }

  function getDueReviews(srsMap) {
    return Object.keys(srsMap).filter((topicId) => isReviewDue(srsMap[topicId]));
  }

  AM.srs = {
    initSrsState: initSrsState,
    accuracyToQuality: accuracyToQuality,
    scheduleReview: scheduleReview,
    isReviewDue: isReviewDue,
    getDueReviews: getDueReviews,
  };
})(window.AM);
