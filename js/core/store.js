/**
 * localStorage persistence — profile, diagnostic session, learner state,
 * learning path.
 *
 * Each loader validates the shape it reads back: anything corrupt falls back
 * to a clean default rather than letting a bad blob crash a page.
 *
 * Since sign-in was added, this module is also the change feed that drives
 * cloud sync. Every successful save stamps a per-key timestamp in
 * `kntt.sync.v1` and notifies listeners; `core/sync.js` subscribes and pushes
 * the changed key to Firestore. Writes coming back *from* Firestore go through
 * `applyRemote`, which updates storage without firing the listeners — that is
 * what stops a pull from immediately queueing a push of what we just pulled.
 */
(function (AM) {
  'use strict';

  const KEYS = {
    profile: 'kntt.profile.v1',
    diagnostic: 'kntt.diagnostic.v1',
    learner: 'kntt.learner.v1',
    path: 'kntt.learningPath.v1',
  };

  /** Per-key "last modified locally" timestamps, used to resolve sync conflicts. */
  const META_KEY = 'kntt.sync.v1';

  const GOALS = ['giua-ky', 'cuoi-ky', 'vao-10', 'nang-cao'];
  const LEVELS = ['yeu', 'tb', 'kha', 'gioi'];

  function read(key) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn('[store] Không đọc được', key, err);
      return null;
    }
  }

  function write(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn('[store] Không ghi được', key, err);
      return false;
    }
  }

  function remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      /* ignore */
    }
  }

  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const num = (v, fb) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
  const strArr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

  // -------------------------------------------------------------------------
  // Change feed + timestamps
  // -------------------------------------------------------------------------

  const listeners = [];

  /** Subscribe to local data changes. `fn(key)` with key = 'profile' | … */
  function onChange(fn) {
    listeners.push(fn);
    return function () {
      const i = listeners.indexOf(fn);
      if (i !== -1) listeners.splice(i, 1);
    };
  }

  function emit(key) {
    for (const fn of listeners.slice()) {
      try {
        fn(key);
      } catch (err) {
        console.error('[store] listener lỗi:', err);
      }
    }
  }

  function getTimestamps() {
    const meta = read(META_KEY);
    return isObj(meta) ? meta : {};
  }

  function setTimestamp(key, ts) {
    const meta = getTimestamps();
    meta[key] = ts;
    write(META_KEY, meta);
  }

  /** Record a local edit and let the sync layer know about it. */
  function touch(key) {
    setTimestamp(key, Date.now());
    emit(key);
  }

  // -------------------------------------------------------------------------
  // UserProfile
  // -------------------------------------------------------------------------

  function loadProfile() {
    const p = read(KEYS.profile);
    if (!isObj(p)) return null;
    const ok =
      [6, 7, 8, 9].indexOf(p.grade) !== -1 &&
      GOALS.indexOf(p.goal) !== -1 &&
      [30, 45, 60, 90].indexOf(p.dailyMinutes) !== -1 &&
      (p.deadline === null || typeof p.deadline === 'string') &&
      LEVELS.indexOf(p.selfLevel) !== -1 &&
      Array.isArray(p.weakTopicIds);
    if (!ok) {
      // Corrupt or stale shape — discard so the user gets a clean start.
      remove(KEYS.profile);
      return null;
    }
    return {
      grade: p.grade,
      goal: p.goal,
      dailyMinutes: p.dailyMinutes,
      deadline: p.deadline || null,
      selfLevel: p.selfLevel,
      weakTopicIds: strArr(p.weakTopicIds),
      createdAt: typeof p.createdAt === 'string' ? p.createdAt : new Date().toISOString(),
      updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : new Date().toISOString(),
    };
  }

  function saveProfile(profile) {
    const ok = write(KEYS.profile, profile);
    if (ok) touch('profile');
    return ok;
  }

  function clearProfile() {
    remove(KEYS.profile);
    touch('profile');
  }

  // -------------------------------------------------------------------------
  // Diagnostic session (the CAT run)
  // -------------------------------------------------------------------------

  function loadDiagnostic() {
    const s = read(KEYS.diagnostic);
    if (!isObj(s)) return null;
    if (!Array.isArray(s.responses) || [6, 7, 8, 9].indexOf(s.grade) === -1) return null;
    return {
      sessionId: typeof s.sessionId === 'string' ? s.sessionId : 'unknown',
      grade: s.grade,
      selfLevel: LEVELS.indexOf(s.selfLevel) !== -1 ? s.selfLevel : 'tb',
      theta: num(s.theta, 0),
      standardError: num(s.standardError, 2),
      responses: s.responses.filter(isObj),
      shownIds: strArr(s.shownIds),
      sessionStartedAt: num(s.sessionStartedAt, Date.now()),
      finished: s.finished === true,
      stopReason: typeof s.stopReason === 'string' ? s.stopReason : null,
      topicStates: isObj(s.topicStates) ? s.topicStates : {},
    };
  }

  function saveDiagnostic(session) {
    const ok = write(KEYS.diagnostic, session);
    if (ok) touch('diagnostic');
    return ok;
  }

  function clearDiagnostic() {
    remove(KEYS.diagnostic);
    touch('diagnostic');
  }

  // -------------------------------------------------------------------------
  // LearnerState — the living practice/mastery data
  // -------------------------------------------------------------------------

  function emptyLearnerState() {
    return {
      version: 1,
      bkt: {},
      srs: {},
      errors: [],
      gamification: {
        xp: 0,
        level: 0,
        currentStreak: 0,
        longestStreak: 0,
        lastPracticeDate: null,
        badges: [],
        totalQuestionsAttempted: 0,
        totalReviewsCompleted: 0,
        totalSessions: 0,
      },
      sessions: [],
      usedQuestionIds: [],
      completedActivities: [],
    };
  }

  function loadLearnerState() {
    const s = read(KEYS.learner);
    if (!isObj(s)) return emptyLearnerState();
    const base = emptyLearnerState();
    const g = isObj(s.gamification) ? s.gamification : {};
    return {
      version: 1,
      bkt: isObj(s.bkt) ? s.bkt : base.bkt,
      srs: isObj(s.srs) ? s.srs : base.srs,
      errors: Array.isArray(s.errors) ? s.errors.filter(isObj) : [],
      gamification: {
        xp: num(g.xp, 0),
        level: num(g.level, 0),
        currentStreak: num(g.currentStreak, 0),
        longestStreak: num(g.longestStreak, 0),
        lastPracticeDate: typeof g.lastPracticeDate === 'string' ? g.lastPracticeDate : null,
        badges: strArr(g.badges),
        totalQuestionsAttempted: num(g.totalQuestionsAttempted, 0),
        totalReviewsCompleted: num(g.totalReviewsCompleted, 0),
        // Older saves have no counter; the (pruned) session list is a floor.
        totalSessions: Math.max(
          num(g.totalSessions, 0),
          Array.isArray(s.sessions) ? s.sessions.length : 0,
        ),
      },
      sessions: Array.isArray(s.sessions) ? s.sessions.filter(isObj) : [],
      usedQuestionIds: strArr(s.usedQuestionIds),
      completedActivities: strArr(s.completedActivities),
    };
  }

  /**
   * Save learner state, pruning history so the blob can't grow without bound.
   * The caps also keep the Firestore mirror inside the 1 MB document limit.
   */
  function saveLearnerState(state) {
    const pruned = Object.assign({}, state, {
      sessions: state.sessions.slice(-50),
      errors: state.errors.slice(-500),
      usedQuestionIds: state.usedQuestionIds.slice(-2000),
    });
    if (write(KEYS.learner, pruned)) {
      touch('learner');
      return true;
    }

    // Quota exceeded — retry with harsher pruning before giving up.
    const aggressive = Object.assign({}, pruned, {
      sessions: pruned.sessions.slice(-20),
      errors: pruned.errors.slice(-200),
      usedQuestionIds: pruned.usedQuestionIds.slice(-500),
    });
    const ok = write(KEYS.learner, aggressive);
    if (ok) touch('learner');
    return ok;
  }

  function clearLearnerState() {
    remove(KEYS.learner);
    touch('learner');
  }

  // -------------------------------------------------------------------------
  // Learning path
  // -------------------------------------------------------------------------

  function loadPath() {
    const p = read(KEYS.path);
    if (!isObj(p) || !Array.isArray(p.sprints)) return null;
    return p;
  }

  function savePath(path) {
    const ok = write(KEYS.path, path);
    if (ok) touch('path');
    return ok;
  }

  function clearPath() {
    remove(KEYS.path);
    touch('path');
  }

  // -------------------------------------------------------------------------
  // Sync support
  // -------------------------------------------------------------------------

  /** Raw parsed value for a logical key, with no validation applied. */
  function getRaw(key) {
    return KEYS[key] ? read(KEYS[key]) : null;
  }

  /**
   * Write a value that came from the server.
   *
   * Deliberately silent: it adopts the remote timestamp and skips the
   * listeners, so a pull does not immediately queue a push of the very data
   * we just received.
   */
  function applyRemote(key, value, remoteTs) {
    if (!KEYS[key]) return false;
    if (value === null || value === undefined) {
      remove(KEYS[key]);
    } else if (!write(KEYS[key], value)) {
      return false;
    }
    setTimestamp(key, remoteTs || Date.now());
    return true;
  }

  /**
   * Wipe every trace of learning data on this device.
   *
   * `silent` matters a great deal. The default (loud) is what the "reset my
   * data" button wants: the deletion propagates to Firestore too. Sign-out
   * must pass `true` — otherwise logging out would push empty documents and
   * destroy the very progress the account exists to preserve.
   */
  function clearAll(silent) {
    remove(KEYS.profile);
    remove(KEYS.diagnostic);
    remove(KEYS.learner);
    remove(KEYS.path);
    remove(META_KEY);
    if (!silent) {
      for (const key of Object.keys(KEYS)) emit(key);
    }
  }

  AM.store = {
    KEYS: KEYS,
    LOGICAL_KEYS: ['profile', 'diagnostic', 'learner', 'path'],
    onChange: onChange,
    getTimestamps: getTimestamps,
    getRaw: getRaw,
    applyRemote: applyRemote,
    loadProfile: loadProfile,
    saveProfile: saveProfile,
    clearProfile: clearProfile,
    loadDiagnostic: loadDiagnostic,
    saveDiagnostic: saveDiagnostic,
    clearDiagnostic: clearDiagnostic,
    emptyLearnerState: emptyLearnerState,
    loadLearnerState: loadLearnerState,
    saveLearnerState: saveLearnerState,
    clearLearnerState: clearLearnerState,
    loadPath: loadPath,
    savePath: savePath,
    clearPath: clearPath,
    clearAll: clearAll,
  };
})(window.AM);
