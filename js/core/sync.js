/**
 * Cloud sync — mirrors the four localStorage blobs into Firestore.
 *
 *   learners/{uid}/data/profile      ┐  each stored as { json, updatedAt }
 *   learners/{uid}/data/diagnostic   │
 *   learners/{uid}/data/learner      │  JSON string, not a nested object:
 *   learners/{uid}/data/path         ┘  Firestore rejects `undefined` and
 *                                       forbids arrays inside arrays, and a
 *                                       string sidesteps both entirely.
 *
 * One document per key rather than one big document, so the 1 MB per-document
 * limit applies per blob and a practice session only rewrites `learner`.
 *
 * Conflict resolution is last-write-wins on a millisecond timestamp, compared
 * per key. That is not a merge — two devices editing the same key in parallel
 * means the later save wins outright. For a single student moving between
 * their own phone and laptop that is the honest, predictable behaviour; real
 * merging would need operation logs, which is far beyond what this needs.
 */
(function (AM) {
  'use strict';

  const fb = AM.fb;
  const KEYS = ['profile', 'diagnostic', 'learner', 'path'];

  /** Which account the local data belongs to — guards against user mix-ups. */
  const OWNER_KEY = 'kntt.sync.owner';

  const PUSH_DELAY_MS = 1500;

  const state = {
    uid: null,
    pending: new Set(),
    timer: null,
    lastError: null,
    /**
     * True once a pull for `uid` has succeeded. Until then nothing is pushed:
     * a device that could not download the account's data has no idea whether
     * its local copy is newer or a blank slate, and pushing a blank slate would
     * overwrite real progress in the cloud.
     */
    reconciled: false,
    pullPromise: null,
    flushPromise: null,
  };

  /**
   * Sync needs APIs that were added to store.js at the same time as this file.
   * A browser holding an older cached store.js would otherwise throw at load
   * time and take the entire app down — which is exactly what happened once.
   * Check up front, and degrade to "no cloud sync" instead of dying.
   */
  const STORE_OK =
    !!AM.store &&
    typeof AM.store.onChange === 'function' &&
    typeof AM.store.getTimestamps === 'function' &&
    typeof AM.store.getRaw === 'function' &&
    typeof AM.store.applyRemote === 'function';

  if (!STORE_OK) {
    state.lastError =
      'Trình duyệt đang dùng bản js/core/store.js cũ trong bộ nhớ đệm. ' +
      'Nhấn Ctrl+Shift+R (hoặc Cmd+Shift+R) để tải lại toàn bộ.';
    console.error('[sync] ' + state.lastError);
  }

  /** How long to wait for the initial download before carrying on offline. */
  const PULL_TIMEOUT_MS = 12000;

  /**
   * Race a promise against the clock.
   *
   * Firestore retries a failed read for a long time instead of rejecting, so
   * without this a flaky connection would leave the app stuck on its loading
   * screen. Timing out lets the student keep working from local data.
   */
  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      const timer = window.setTimeout(function () {
        reject(new Error(label + ' quá thời gian chờ (' + Math.round(ms / 1000) + 's).'));
      }, ms);
      promise.then(
        function (value) {
          window.clearTimeout(timer);
          resolve(value);
        },
        function (err) {
          window.clearTimeout(timer);
          reject(err);
        },
      );
    });
  }

  function dataDoc(uid, key) {
    return fb
      .db()
      .collection(fb.PATHS.learners)
      .doc(uid)
      .collection(fb.PATHS.data)
      .doc(key);
  }

  function localOwner() {
    try {
      return window.localStorage.getItem(OWNER_KEY);
    } catch (err) {
      return null;
    }
  }

  function setLocalOwner(uid) {
    try {
      window.localStorage.setItem(OWNER_KEY, uid);
    } catch (err) {
      /* ignore */
    }
  }

  function forgetLocalOwner() {
    try {
      window.localStorage.removeItem(OWNER_KEY);
    } catch (err) {
      /* ignore */
    }
  }

  // -------------------------------------------------------------------------
  // Pull
  // -------------------------------------------------------------------------

  /**
   * Fetch the account's data and reconcile it with what is on this device.
   *
   * If the local data belongs to a *different* account it is discarded first:
   * two students sharing one browser must never inherit each other's progress.
   * Otherwise each key is compared by timestamp and the newer side wins; a
   * local key that is newer gets queued for push instead of being overwritten,
   * which is what makes "study offline, sign in later" work.
   */
  function pull(uid) {
    if (!fb.isReady()) return Promise.resolve({ ok: false, error: fb.initError() });
    if (!STORE_OK) return Promise.resolve({ ok: false, error: state.lastError });
    // Two callers (boot + a retry) must share one download, not race each other.
    if (state.pullPromise) return state.pullPromise;
    state.pullPromise = doPull(uid).finally(function () {
      state.pullPromise = null;
    });
    return state.pullPromise;
  }

  async function doPull(uid) {
    const previousOwner = localOwner();
    if (previousOwner && previousOwner !== uid) {
      AM.store.clearAll(true);
    }
    setLocalOwner(uid);
    if (state.uid !== uid) state.reconciled = false;
    state.uid = uid;

    const localTs = AM.store.getTimestamps();
    let adopted = 0;
    let queued = 0;

    try {
      const snaps = await withTimeout(
        Promise.all(KEYS.map((key) => dataDoc(uid, key).get())),
        PULL_TIMEOUT_MS,
        'Tải dữ liệu học tập',
      );

      for (let i = 0; i < KEYS.length; i++) {
        const key = KEYS[i];
        const snap = snaps[i];
        const mine = localTs[key] || 0;

        if (!snap.exists) {
          // Nothing in the cloud yet — upload whatever is here.
          if (AM.store.getRaw(key) !== null) {
            state.pending.add(key);
            queued++;
          }
          continue;
        }

        const remote = snap.data() || {};
        const remoteTs = typeof remote.updatedAt === 'number' ? remote.updatedAt : 0;

        if (remoteTs > mine) {
          let value = null;
          try {
            value = remote.json ? JSON.parse(remote.json) : null;
          } catch (err) {
            console.warn('[sync] Dữ liệu "' + key + '" trên máy chủ bị hỏng, bỏ qua.');
            continue;
          }
          AM.store.applyRemote(key, value, remoteTs);
          adopted++;
        } else if (mine > remoteTs && AM.store.getRaw(key) !== null) {
          state.pending.add(key);
          queued++;
        }
      }

      state.reconciled = true;
      if (state.pending.size > 0) schedulePush();

      state.lastError = null;
      return { ok: true, adopted: adopted, queued: queued };
    } catch (err) {
      state.lastError = fb.describeError(err);
      console.error('[sync] Không tải được dữ liệu:', state.lastError);
      return { ok: false, error: state.lastError };
    }
  }

  // -------------------------------------------------------------------------
  // Push
  // -------------------------------------------------------------------------

  function schedulePush() {
    if (state.timer !== null) window.clearTimeout(state.timer);
    state.timer = window.setTimeout(function () {
      state.timer = null;
      void flush();
    }, PUSH_DELAY_MS);
  }

  /**
   * Write every queued key now. Safe to call at any time.
   *
   * Resolves only when the queue is empty (or a write failed), so a caller
   * such as sign-out can trust `ok: true` to mean "everything is in the cloud".
   * Concurrent calls share one in-flight write and keys queued meanwhile are
   * picked up by the next lap of the loop rather than dropped.
   */
  async function flush() {
    if (state.timer !== null) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }
    if (!state.uid || !fb.isReady()) return { ok: true };

    // Never push before this device knows what the cloud holds (see `reconciled`).
    if (!state.reconciled && state.pending.size > 0) {
      const pulled = await pull(state.uid);
      if (!pulled.ok || !state.reconciled) {
        state.lastError =
          pulled.error || 'Chưa tải được dữ liệu từ máy chủ nên chưa thể đồng bộ.';
        return { ok: false, error: state.lastError };
      }
    }

    while (state.pending.size > 0) {
      if (!state.flushPromise) {
        state.flushPromise = flushOnce().finally(function () {
          state.flushPromise = null;
        });
      }
      const result = await state.flushPromise;
      if (!result.ok) return result;
    }
    return { ok: true };
  }

  async function flushOnce() {
    const uid = state.uid;
    const keys = Array.from(state.pending);
    state.pending.clear();

    const timestamps = AM.store.getTimestamps();

    try {
      await Promise.all(
        keys.map(function (key) {
          const value = AM.store.getRaw(key);
          const ref = dataDoc(uid, key);
          if (value === null) return ref.delete();
          return ref.set({
            json: JSON.stringify(value),
            updatedAt: timestamps[key] || Date.now(),
          });
        }),
      );
      // The account may have signed out while the writes were in flight; its
      // summary must then not be rebuilt from an emptied local store.
      if (state.uid === uid) await pushSummary();
      state.lastError = null;
      return { ok: true };
    } catch (err) {
      // Put them back so the next change retries instead of losing the write.
      if (state.uid === uid) for (const key of keys) state.pending.add(key);
      state.lastError = fb.describeError(err);
      console.error('[sync] Không lưu được lên máy chủ:', state.lastError);
      return { ok: false, error: state.lastError };
    }
  }

  /**
   * Refresh the denormalised progress summary on `users/{uid}` — and, for a
   * student who has joined a class, on their roster row too (auth.js fans it
   * out; see `updateSummary`).
   *
   * Readers only ever touch these summaries — one query for a whole class
   * instead of opening every student's learner blob.
   *
   * Exported as well as called from `flush()`, because joining a class needs to
   * publish current progress right then. Going through `flush()` would not do
   * it: that returns early when no local key is dirty, which is the normal case
   * for a student who joins between practice sessions, and the teacher would
   * see an empty row until the next answer was submitted.
   */
  async function pushSummary() {
    const profile = AM.store.loadProfile();
    const learner = AM.store.loadLearnerState();
    const diagnostic = AM.store.loadDiagnostic();

    const mastered = Object.keys(learner.bkt).filter(
      (id) => learner.bkt[id].pL >= 0.85,
    ).length;

    await AM.auth.updateSummary({
      grade: profile ? profile.grade : null,
      goal: profile ? profile.goal : null,
      dailyMinutes: profile ? profile.dailyMinutes : null,
      hasDiagnostic: diagnostic !== null && diagnostic.finished === true,
      xp: learner.gamification.xp,
      level: AM.const.xpToLevel(learner.gamification.xp),
      currentStreak: learner.gamification.currentStreak,
      longestStreak: learner.gamification.longestStreak,
      masteredTopics: mastered,
      totalQuestions: learner.gamification.totalQuestionsAttempted,
      totalSessions: learner.gamification.totalSessions,
      unresolvedErrors: learner.errors.filter((e) => !e.resolved).length,
    });
  }

  // -------------------------------------------------------------------------
  // Wiring
  // -------------------------------------------------------------------------

  /** Start listening for local changes. Called once, after sign-in. */
  function start(uid) {
    state.uid = uid;
  }

  function stop() {
    if (state.timer !== null) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }
    state.uid = null;
    state.reconciled = false;
    state.pending.clear();
  }

  if (STORE_OK) {
    AM.store.onChange(function (key) {
      if (!state.uid) return;
      state.pending.add(key);
      schedulePush();
    });
  }

  // A tab being closed mid-session should not lose the last few answers.
  window.addEventListener('beforeunload', function () {
    if (state.uid && state.pending.size > 0) void flush();
  });

  AM.sync = {
    pull: pull,
    flush: flush,
    pushSummary: pushSummary,
    start: start,
    stop: stop,
    forgetLocalOwner: forgetLocalOwner,
    withTimeout: withTimeout,
    isReconciled: function () {
      return state.reconciled;
    },
    lastError: function () {
      return state.lastError;
    },
    pendingCount: function () {
      return state.pending.size;
    },
  };
})(window.AM);
