/**
 * Ladder-based CAT selector. Ported from src/lib/cat.ts.
 *
 * A pure Fisher-information selector picked items by information at the
 * current θ, which meant low-level (N) items with b ≈ −1.5 lost to mid-level
 * (H) items with b ≈ −0.5 whenever a student started near θ = 0 — students saw
 * "Thông hiểu" questions before ever seeing "Nhận biết". This selector instead
 * enforces four invariants:
 *
 *   1. Per-topic ladder progression N → H → V → T, starting at the lowest
 *      level present in that topic's pool.
 *   2. Verification retry on a wrong answer: one more item at the same level
 *      before marking the topic 'done' as confirmed weak.
 *   3. Topic coverage: round-robin prefers topics with the fewest attempts, so
 *      every topic is visited before any topic is revisited.
 *   4. Randomisation: a seeded RNG breaks ties. Deterministic within a
 *      session, varied across sessions.
 *
 * θ is still estimated on every response, but it feeds the profile pipeline
 * only — not the selector.
 */
(function (AM) {
  'use strict';

  const U = AM.util;
  const CAT_CONFIG = AM.const.CAT_CONFIG;
  const LADDER_ORDER = AM.const.LADDER_ORDER;

  // -------------------------------------------------------------------------
  // Level helpers
  // -------------------------------------------------------------------------

  /** Next ladder level up, or 'done' when already at the top. */
  function nextLadderLevel(l) {
    const idx = LADDER_ORDER.indexOf(l);
    if (idx === -1 || idx === LADDER_ORDER.length - 1) return 'done';
    return LADDER_ORDER[idx + 1];
  }

  /**
   * Can question `q` be shown while the ladder sits at `target`?
   * `unknown`-level items count as 'H': many corpus blocks carry no pedagogy
   * tag, and treating them as medium difficulty keeps them usable.
   */
  function ladderEquals(q, target) {
    if (target === 'done') return false;
    if (q.level === target) return true;
    if (q.level === 'unknown' && target === 'H') return true;
    return false;
  }

  /** Which ladder levels are actually represented in this topic's pool. */
  function ladderLevelsForTopic(pool, topicId) {
    const set = new Set();
    for (const q of pool) {
      if (q.topicId !== topicId) continue;
      if (q.level === 'N' || q.level === 'H' || q.level === 'V' || q.level === 'T') {
        set.add(q.level);
      } else if (q.level === 'unknown') {
        set.add('H');
      }
    }
    return set;
  }

  /**
   * Seed the ladder for every topic in a grade. Topics with no pool items
   * collapse straight to 'done'; otherwise start at the lowest level present.
   */
  function initTopicStates(pool, topics, grade) {
    const states = {};
    for (const topic of topics) {
      if (topic.grade !== grade) continue;

      const levels = ladderLevelsForTopic(pool, topic.id);
      if (levels.size === 0) {
        states[topic.id] = { level: 'done', wrongsAtLevel: 0, ceilingLevel: 'none' };
        continue;
      }

      let startLevel = 'N';
      for (const l of LADDER_ORDER) {
        if (levels.has(l)) {
          startLevel = l;
          break;
        }
      }
      states[topic.id] = { level: startLevel, wrongsAtLevel: 0, ceilingLevel: 'none' };
    }
    return states;
  }

  /**
   * Apply a response to a topic's ladder state. Pure — returns the new state.
   *
   *   Correct at L                    → ceiling = L, advance, reset counter
   *   Wrong at L, wrongsAtLevel === 0 → stay for verification if another item
   *                                     at L exists, else 'done'
   *   Wrong at L, wrongsAtLevel === 1 → confirmed weak at L → 'done'
   */
  function transitionTopicState(current, question, correct, pool, shownIds) {
    if (current.level === 'done') return current;

    if (correct) {
      const levels = ladderLevelsForTopic(pool, question.topicId);
      let next = nextLadderLevel(current.level);
      while (next !== 'done' && !levels.has(next)) {
        next = nextLadderLevel(next);
      }
      return {
        level: next,
        wrongsAtLevel: 0,
        ceilingLevel: current.level, // the level just passed
      };
    }

    if (current.wrongsAtLevel === 0) {
      const hasMoreAtLevel = pool.some(
        (q) =>
          q.topicId === question.topicId &&
          ladderEquals(q, current.level) &&
          !shownIds.has(q.id),
      );
      if (hasMoreAtLevel) {
        return {
          level: current.level,
          wrongsAtLevel: 1,
          ceilingLevel: current.ceilingLevel,
        };
      }
    }
    return { level: 'done', wrongsAtLevel: 0, ceilingLevel: current.ceilingLevel };
  }

  // -------------------------------------------------------------------------
  // Selector
  // -------------------------------------------------------------------------

  /** Seed = FNV(sessionId) XOR step, so successive picks are uncorrelated. */
  function makeSessionRng(state) {
    const stepSeed = Math.imul(state.responses.length + 1, 2654435761) >>> 0;
    return U.mulberry32((U.hashStringToU32(state.sessionId) ^ stepSeed) >>> 0);
  }

  /**
   * Pick the next question.
   *
   *   Coverage phase — any topic with 0 attempts wins, so every topic gets a
   *                    first look before anything gets a second.
   *   Climb phase    — once every active topic has been seen, pick the one
   *                    with the fewest attempts so it can climb its ladder.
   *
   * Within the chosen topic, candidates are filtered by (ladder level, unseen).
   * With no match at the target level we fall back to any unseen item for the
   * topic — the ladder advances on the next response anyway.
   */
  function selectNextQuestionWithDebug(pool, state) {
    const rng = makeSessionRng(state);
    const shownSet = new Set(state.shownIds);

    const poolById = new Map(pool.map((q) => [q.id, q]));
    const attemptsByTopic = new Map();
    for (const r of state.responses) {
      const q = poolById.get(r.questionId);
      if (!q) continue;
      attemptsByTopic.set(q.topicId, (attemptsByTopic.get(q.topicId) || 0) + 1);
    }

    const active = [];
    for (const topicId of Object.keys(state.topicStates)) {
      const ts = state.topicStates[topicId];
      if (ts.level === 'done') continue;
      active.push({
        topicId: topicId,
        state: ts,
        attempts: attemptsByTopic.get(topicId) || 0,
      });
    }
    if (active.length === 0) return null;

    // Shuffle for a random tiebreak, then stable-sort by attempts ascending.
    const ranked = U.shuffled(active, rng);
    ranked.sort((a, b) => a.attempts - b.attempts);

    const phase = ranked[0].attempts === 0 ? 'coverage' : 'climb';

    for (const entry of ranked) {
      const topicId = entry.topicId;
      const ts = entry.state;

      let candidates = pool.filter(
        (q) => q.topicId === topicId && ladderEquals(q, ts.level) && !shownSet.has(q.id),
      );
      if (candidates.length === 0) {
        candidates = pool.filter((q) => q.topicId === topicId && !shownSet.has(q.id));
      }
      if (candidates.length === 0) continue;

      const chosen = candidates[Math.floor(rng() * candidates.length)];
      return {
        chosen: chosen,
        debug: {
          phase: phase,
          chosen: chosen,
          topicRanking: ranked.slice(0, 6).map((t) => ({
            topicId: t.topicId,
            attempts: t.attempts,
            level: t.state.level,
            wrongsAtLevel: t.state.wrongsAtLevel,
          })),
        },
      };
    }

    return null;
  }

  function selectNextQuestion(pool, state) {
    const result = selectNextQuestionWithDebug(pool, state);
    return result ? result.chosen : null;
  }

  // -------------------------------------------------------------------------
  // Stop rules
  // -------------------------------------------------------------------------

  /**
   * Stop when time runs out, the item cap is hit, or every topic has been
   * fully evaluated. There is deliberately no SE-based precision stop — the
   * whole point of the ladder is exhaustive coverage.
   */
  function shouldStop(state) {
    const count = state.responses.length;
    const elapsedMs = Date.now() - state.sessionStartedAt;

    if (elapsedMs >= CAT_CONFIG.sessionTimeLimitMs) return 'time-expired';
    if (count >= CAT_CONFIG.maxItems) return 'max-items';

    const entries = Object.keys(state.topicStates).map((k) => state.topicStates[k]);
    if (entries.length > 0 && entries.every((ts) => ts.level === 'done')) {
      return 'coverage-complete';
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Per-question metadata
  // -------------------------------------------------------------------------

  /** Harder items get more time, linearly between the configured bounds. */
  function timeLimitForItem(item) {
    const min = CAT_CONFIG.minPerQuestionSeconds;
    const max = CAT_CONFIG.maxPerQuestionSeconds;
    const clamped = Math.max(-1.5, Math.min(1.5, item.irt.b));
    const t = (clamped + 1.5) / 3.0;
    return Math.round(min + t * (max - min));
  }

  function normalizeShortAns(raw) {
    return String(raw)
      .trim()
      .replace(/\s+/g, '')
      .replace(/[\u2212\u2013\u2014]/g, '-') // unicode minus / dashes → '-'
      .replace(/,/g, '.')
      .replace(/^0+(\d)/, '$1');
  }

  /**
   * Parse "0.5", "-1", "1/2", "-3/4", "2." as a number; NaN when not numeric.
   * Lets "0.50", "1/2" and "0,5" all match a key of "0,5".
   */
  function shortAnsNumber(normalized) {
    const frac = /^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/.exec(normalized);
    if (frac) {
      const den = Number(frac[2]);
      return den === 0 ? NaN : Number(frac[1]) / den;
    }
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(normalized)) return NaN;
    return Number(normalized);
  }

  function shortAnsMatches(given, expected) {
    const a = normalizeShortAns(given);
    const b = normalizeShortAns(expected);
    if (a === b) return true;
    const x = shortAnsNumber(a);
    const y = shortAnsNumber(b);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    return Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(y));
  }

  /** Grade an answer: 0..1. TF questions score the fraction of correct rows. */
  function gradeAnswer(question, answer) {
    if (question.type === 'mcq') {
      if (typeof answer !== 'string') return 0;
      const opt = question.options.find((o) => o.label === answer);
      return opt && opt.isCorrect ? 1 : 0;
    }
    if (question.type === 'tf') {
      if (!Array.isArray(answer)) return 0;
      if (answer.length !== question.statements.length) return 0;
      let correct = 0;
      for (let i = 0; i < question.statements.length; i++) {
        if (answer[i] === question.statements[i].isTrue) correct++;
      }
      return correct / question.statements.length;
    }
    if (question.type === 'shortans') {
      if (typeof answer !== 'string') return 0;
      return shortAnsMatches(answer, question.correctAnswer) ? 1 : 0;
    }
    return 0;
  }

  AM.cat = {
    nextLadderLevel: nextLadderLevel,
    ladderEquals: ladderEquals,
    initTopicStates: initTopicStates,
    transitionTopicState: transitionTopicState,
    selectNextQuestion: selectNextQuestion,
    selectNextQuestionWithDebug: selectNextQuestionWithDebug,
    shouldStop: shouldStop,
    timeLimitForItem: timeLimitForItem,
    gradeAnswer: gradeAnswer,
  };
})(window.AM);
