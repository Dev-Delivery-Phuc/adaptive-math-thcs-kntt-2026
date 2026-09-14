/**
 * Item Response Theory — 3-parameter logistic (3PL) with a Gaussian prior on
 * θ (Maximum A Posteriori estimation). Ported from src/lib/irt.ts.
 *
 *   P(θ) = c + (1 − c) · σ(a·(θ − b))
 *
 * θ estimation is MAP rather than MLE: at saturated P (θ far from b) Fisher
 * information tends to 0, so the plain Newton-Raphson step `score/info` blew
 * up and clamped to the θ bounds after only 3-4 responses. A weak N(0, 2²)
 * prior adds a constant 1/σ² to the observed information, guaranteeing
 * info ≥ 0.25 so the iteration always converges — and shrinking the estimate
 * toward the population mean when responses are sparse.
 *
 * Every function here is pure.
 */
(function (AM) {
  'use strict';

  const CAT_CONFIG = AM.const.CAT_CONFIG;

  /** Prior variance σ² for θ. σ = 2 → 95% of prior mass inside [-4, +4]. */
  const PRIOR_VARIANCE = 4;

  /** Max per-iteration Newton step — guards against overshoot. */
  const MAX_NEWTON_STEP = 0.75;

  function sigmoid(x) {
    if (x >= 0) {
      const e = Math.exp(-x);
      return 1 / (1 + e);
    }
    // numerically stable branch for very negative x
    const e = Math.exp(x);
    return e / (1 + e);
  }

  /** 3PL probability of a correct response. */
  function probabilityCorrect(theta, item) {
    const s = sigmoid(item.a * (theta - item.b));
    return item.c + (1 - item.c) * s;
  }

  /**
   * Fisher information for one 3PL item at θ:
   *   I(θ) = a² · (1 − P) · (P − c)² / ((1 − c)² · P)
   */
  function itemInformation(theta, item) {
    const P = probabilityCorrect(theta, item);
    if (P <= 1e-9 || P >= 1 - 1e-9) return 0;
    const Q = 1 - P;
    const numerator = item.a * item.a * Q * Math.pow(P - item.c, 2);
    const denominator = Math.pow(1 - item.c, 2) * P;
    if (denominator <= 1e-12) return 0;
    return numerator / denominator;
  }

  /**
   * First derivative of the log-posterior:
   *   Σ a·(u − P)·(P − c) / (P·(1 − c))  +  (−θ / σ²)
   *   ^^^ 3PL likelihood term ^^^           ^^ prior ^^
   */
  function scoreFunction(theta, items, responses) {
    let sum = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const u = responses[i];
      const P = probabilityCorrect(theta, item);
      if (P <= 1e-9 || P >= 1 - 1e-9) continue;
      sum += (item.a * (u - P) * (P - item.c)) / (P * (1 - item.c));
    }
    sum -= theta / PRIOR_VARIANCE;
    return sum;
  }

  /** Observed Fisher information + prior information (never zero). */
  function totalInformation(theta, items) {
    let total = 1 / PRIOR_VARIANCE;
    for (const item of items) total += itemInformation(theta, item);
    return total;
  }

  /** MAP estimate of θ via Newton-Raphson on the log-posterior. */
  function estimateTheta(items, responses, options) {
    options = options || {};
    if (items.length !== responses.length) {
      throw new Error('items and responses must have the same length');
    }
    if (items.length === 0) {
      // No data → prior only: θ = 0, SE = σ.
      return { theta: 0, standardError: Math.sqrt(PRIOR_VARIANCE) };
    }

    const maxIter = options.maxIterations || 30;
    const tolerance = 1e-4;
    let theta = typeof options.startingTheta === 'number' ? options.startingTheta : 0;

    for (let iter = 0; iter < maxIter; iter++) {
      const score = scoreFunction(theta, items, responses);
      const info = totalInformation(theta, items);
      let delta = score / info;
      if (delta > MAX_NEWTON_STEP) delta = MAX_NEWTON_STEP;
      if (delta < -MAX_NEWTON_STEP) delta = -MAX_NEWTON_STEP;
      theta += delta;
      if (theta < CAT_CONFIG.thetaMin) theta = CAT_CONFIG.thetaMin;
      if (theta > CAT_CONFIG.thetaMax) theta = CAT_CONFIG.thetaMax;
      if (Math.abs(delta) < tolerance) break;
    }

    return { theta: theta, standardError: 1 / Math.sqrt(totalInformation(theta, items)) };
  }

  /**
   * Re-estimate θ from the whole response history.
   *
   * `getItem` is the caller's job because session responses only store
   * question ids — this module stays decoupled from the bank.
   */
  function estimateThetaFromSession(responses, getItem, options) {
    const items = [];
    const scores = [];
    for (const r of responses) {
      if (!r.answered) continue;
      const item = getItem(r.questionId);
      if (!item) continue;
      items.push(item);
      scores.push(r.score);
    }
    return estimateTheta(items, scores, options || {});
  }

  /** Self-assessment → a sensible starting θ so item 1 isn't always "medium". */
  function startingThetaFromSelfLevel(selfLevel) {
    switch (selfLevel) {
      case 'yeu':
        return -1.0;
      case 'tb':
        return -0.3;
      case 'kha':
        return 0.5;
      case 'gioi':
        return 1.2;
      default:
        return 0;
    }
  }

  AM.irt = {
    probabilityCorrect: probabilityCorrect,
    itemInformation: itemInformation,
    estimateTheta: estimateTheta,
    estimateThetaFromSession: estimateThetaFromSession,
    startingThetaFromSelfLevel: startingThetaFromSelfLevel,
    PRIOR_VARIANCE: PRIOR_VARIANCE,
  };
})(window.AM);
