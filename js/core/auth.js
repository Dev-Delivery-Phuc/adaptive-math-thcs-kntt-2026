/**
 * Authentication + roles.
 *
 * Three roles:
 *   student  chooses at registration — learns, joins one class by code
 *   teacher  chooses at registration — creates classes, watches their roster
 *   admin    granted by hand in the Firebase console — sees every account
 *
 * A role is a field on `users/{uid}` in Firestore, not something the browser
 * decides after the fact. The client reads it to know which menu items to draw,
 * but the real enforcement lives in `firestore.rules`: nobody can change their
 * own role once the account exists, and only an admin can list the users
 * collection. That split matters — anything checked only in JavaScript is a
 * suggestion, not a permission.
 *
 * Registration accepts student or teacher and nothing else; the rules reject
 * any other value on create, so a hand-edited client cannot register itself as
 * an admin. Bootstrapping the first admin is deliberately manual, because any
 * secret shipped to the browser is readable by pressing F12.
 */
(function (AM) {
  'use strict';

  const fb = AM.fb;

  /** Roles a registration form is allowed to ask for. */
  const SELECTABLE_ROLES = ['student', 'teacher'];

  /** Every role the app understands, including the hand-granted one. */
  const ALL_ROLES = ['student', 'teacher', 'admin'];

  const ROLE_LABELS = {
    student: 'Học sinh',
    teacher: 'Giáo viên',
    admin: 'Quản trị',
  };

  /** Coerce whatever is stored to a role we recognise. Unknown → student. */
  function normaliseRole(value) {
    return ALL_ROLES.indexOf(value) !== -1 ? value : 'student';
  }

  const state = {
    /** Firebase user object, or null when signed out. */
    user: null,
    /** The `users/{uid}` document, or null. */
    profile: null,
    /** True once the first onAuthStateChanged has fired. */
    resolved: false,
  };

  const listeners = [];

  /**
   * What the registration form asked for, held across the auth-state callback.
   *
   * `createUserWithEmailAndPassword()` signs the new account in immediately,
   * so `onAuthStateChanged` fires while `register()` is still awaiting its own
   * writes. Without this, that callback reaches `loadOrCreateProfile()` first,
   * finds no document, and creates one with a hardcoded `role: 'student'` —
   * and because the document then exists, `register()`'s write becomes an
   * *update that changes the role*, which firestore.rules refuses outright.
   * Every teacher registration silently came out a student.
   *
   * Holding the intent here means whichever path writes first writes the same
   * role, so the loser's write is a no-op rather than a rejected escalation.
   */
  let pendingRegistration = null;

  function notify() {
    for (const fn of listeners.slice()) {
      try {
        fn(state);
      } catch (err) {
        console.error('[auth] listener lỗi:', err);
      }
    }
  }

  /** Subscribe to sign-in / sign-out / role changes. Returns an unsubscribe. */
  function onChange(fn) {
    listeners.push(fn);
    return function () {
      const i = listeners.indexOf(fn);
      if (i !== -1) listeners.splice(i, 1);
    };
  }

  function currentUser() {
    return state.user;
  }

  function currentProfile() {
    return state.profile;
  }

  function isSignedIn() {
    return state.user !== null;
  }

  /** The signed-in account's role, or null when signed out. */
  function role() {
    return state.profile ? normaliseRole(state.profile.role) : null;
  }

  function isAdmin() {
    return role() === 'admin';
  }

  function isTeacher() {
    return role() === 'teacher';
  }

  /**
   * True for the learner role only.
   *
   * Admins are deliberately excluded: an admin account has no learning data of
   * its own, and treating one as a student would offer it a diagnostic test.
   */
  function isStudent() {
    return role() === 'student';
  }

  function roleLabel() {
    return ROLE_LABELS[role()] || 'Học sinh';
  }

  function displayName() {
    if (state.profile && state.profile.displayName) return state.profile.displayName;
    if (state.user && state.user.displayName) return state.user.displayName;
    if (state.user && state.user.email) return state.user.email.split('@')[0];
    return roleLabel();
  }

  /** The class the signed-in student has joined, or null. */
  function classCode() {
    return (state.profile && state.profile.classCode) || null;
  }

  /**
   * Record which class this student belongs to.
   *
   * Kept on the user document rather than only on the membership row so the
   * app knows where to look on the next sign-in without scanning every class.
   */
  async function setClassCode(code, className) {
    if (!state.user || !fb.isReady()) return;
    await userDoc(state.user.uid).update({
      classCode: code,
      className: className || null,
    });
    state.profile = Object.assign({}, state.profile, {
      classCode: code,
      className: className || null,
    });
    notify();
  }

  // -------------------------------------------------------------------------
  // users/{uid}
  // -------------------------------------------------------------------------

  function userDoc(uid) {
    return fb.db().collection(fb.PATHS.users).doc(uid);
  }

  /**
   * Read the profile document, creating it on first sign-in.
   *
   * When this runs during registration it uses the role the form asked for
   * (see `pendingRegistration`). Otherwise — an account created before this
   * collection existed, say — it falls back to `student`. Either way the rules
   * reject anything outside student/teacher on create.
   */
  async function loadOrCreateProfile(user) {
    const ref = userDoc(user.uid);
    const snap = await ref.get();

    if (snap.exists) {
      const data = snap.data() || {};
      // Best-effort activity stamp; failing this must not block sign-in.
      ref.update({ lastLoginAt: fb.serverTimestamp() }).catch(function () {});
      return {
        uid: user.uid,
        email: data.email || user.email || '',
        displayName: data.displayName || user.displayName || '',
        role: normaliseRole(data.role),
        classCode: data.classCode || null,
        className: data.className || null,
        grade: data.grade || null,
        goal: data.goal || null,
        xp: data.xp || 0,
        level: data.level || 0,
        currentStreak: data.currentStreak || 0,
        masteredTopics: data.masteredTopics || 0,
        totalQuestions: data.totalQuestions || 0,
        hasDiagnostic: data.hasDiagnostic === true,
      };
    }

    // Only honour the pending registration for the account it was started for.
    // A null uid means `register()` has not resumed yet, and the only account
    // being created is this one; a mismatched uid is stale and ignored.
    const intent =
      pendingRegistration &&
      (pendingRegistration.uid === null || pendingRegistration.uid === user.uid)
        ? pendingRegistration
        : null;

    const fresh = {
      email: user.email || '',
      // `updateProfile()` may not have landed yet, so prefer the typed name.
      displayName: (intent && intent.displayName) || user.displayName || '',
      role: intent ? intent.role : 'student',
      classCode: null,
      className: null,
      grade: null,
      goal: null,
      xp: 0,
      level: 0,
      currentStreak: 0,
      masteredTopics: 0,
      totalQuestions: 0,
      hasDiagnostic: false,
      createdAt: fb.serverTimestamp(),
      lastLoginAt: fb.serverTimestamp(),
    };
    await ref.set(fresh);
    return Object.assign({ uid: user.uid }, fresh, {
      createdAt: null,
      lastLoginAt: null,
    });
  }

  /**
   * Push the denormalised progress summary onto `users/{uid}`, and onto the
   * class roster row when this student belongs to a class.
   *
   * Readers only ever touch these summaries — never a student's full learner
   * blob — so the admin roster and a teacher's class list each cost one query
   * instead of N document reads, and neither needs permission to open anyone's
   * raw answers.
   *
   * The class mirror is a second write of the same numbers rather than a join,
   * because Firestore has no joins and the alternative (letting a teacher read
   * every user document) is exactly the access this design avoids.
   */
  async function updateSummary(summary) {
    if (!state.user || !fb.isReady()) return;
    try {
      await userDoc(state.user.uid).update(
        Object.assign({}, summary, { lastActiveAt: fb.serverTimestamp() }),
      );
      state.profile = Object.assign({}, state.profile, summary);
    } catch (err) {
      console.warn('[auth] Không cập nhật được tóm tắt tiến độ:', fb.describeError(err));
    }

    // Best-effort and deliberately separate: a student who has left their class
    // (or never joined one) must still get their own summary saved above.
    if (AM.classroom && classCode()) {
      try {
        await AM.classroom.mirrorProgress(classCode(), summary);
      } catch (err) {
        console.warn('[auth] Không đồng bộ được tiến độ vào lớp:', fb.describeError(err));
      }
    }
  }

  // -------------------------------------------------------------------------
  // Sign in / up / out
  // -------------------------------------------------------------------------

  /**
   * Create an account.
   *
   * `wantedRole` comes from the registration form and is clamped to
   * student/teacher here as well as in the rules. Belt and braces: the rules
   * are what actually enforce it, but failing early gives a clear error rather
   * than an opaque permission-denied after the auth user already exists.
   */
  async function register(email, password, name, wantedRole) {
    if (!fb.isReady()) throw new Error(fb.initError() || 'Firebase chưa sẵn sàng.');

    const chosenRole =
      SELECTABLE_ROLES.indexOf(wantedRole) !== -1 ? wantedRole : 'student';

    // Published before the account exists, not after: creating it fires the
    // auth-state listener, and that listener must find this intent even if it
    // reaches loadOrCreateProfile() before this function resumes. `uid` starts
    // null and is filled in below — only one account is ever being created on
    // a page, so a null uid still identifies it unambiguously.
    pendingRegistration = {
      uid: null,
      role: chosenRole,
      displayName: (name || '').trim(),
    };

    let cred;
    try {
      cred = await fb.auth().createUserWithEmailAndPassword(email.trim(), password);
    } catch (err) {
      // Nothing was created, so leaving the intent behind would let it colour
      // whichever account is registered next on this page.
      pendingRegistration = null;
      throw err;
    }
    pendingRegistration.uid = cred.user.uid;

    if (name && name.trim()) {
      try {
        await cred.user.updateProfile({ displayName: name.trim() });
      } catch (err) {
        /* cosmetic only */
      }
    }
    // The document must exist before the first sync, so create it eagerly
    // rather than waiting for the auth-state listener to get there. If that
    // listener already won the race this is a no-op update: it now writes the
    // same role, instead of a role change the rules would reject.
    await userDoc(cred.user.uid).set({
      email: cred.user.email || email.trim(),
      displayName: (name || '').trim(),
      role: chosenRole,
      classCode: null,
      className: null,
      grade: null,
      goal: null,
      xp: 0,
      level: 0,
      currentStreak: 0,
      masteredTopics: 0,
      totalQuestions: 0,
      hasDiagnostic: false,
      createdAt: fb.serverTimestamp(),
      lastLoginAt: fb.serverTimestamp(),
    });

    pendingRegistration = null;
    return cred.user;
  }

  async function signIn(email, password) {
    if (!fb.isReady()) throw new Error(fb.initError() || 'Firebase chưa sẵn sàng.');
    const cred = await fb.auth().signInWithEmailAndPassword(email.trim(), password);
    return cred.user;
  }

  async function resetPassword(email) {
    if (!fb.isReady()) throw new Error(fb.initError() || 'Firebase chưa sẵn sàng.');
    await fb.auth().sendPasswordResetEmail(email.trim());
  }

  /**
   * Sign out and wipe local learning data.
   *
   * The wipe is not optional: this app keeps a full copy of the signed-in
   * student's progress in localStorage, so leaving it behind would show the
   * next person to use this browser someone else's diagnostic results.
   */
  async function signOut(options) {
    const force = !!(options && options.force);
    // Belt and braces: a registration that errored after the account existed
    // could otherwise leave its role behind for the next sign-in on this page.
    pendingRegistration = null;

    // The local copy is about to be wiped, so everything in it must be in the
    // cloud first. If that fails the caller decides (ask the user) rather than
    // this function silently deleting a day's worth of answers.
    let flushed;
    try {
      flushed = await AM.sync.flush();
    } catch (err) {
      flushed = { ok: false, error: fb.describeError(err) };
    }
    const unsynced = !flushed.ok || AM.sync.pendingCount() > 0;
    if (unsynced && !force) {
      const why = flushed.error || 'còn dữ liệu chưa được đẩy lên máy chủ';
      const e = new Error('Chưa đồng bộ xong dữ liệu học tập (' + why + ').');
      e.code = 'unsynced';
      throw e;
    }
    if (unsynced) {
      console.warn('[auth] Đăng xuất dù còn dữ liệu chưa đồng bộ:', flushed.error);
    }

    // `true` = silent: clear locally without propagating deletions to
    // Firestore, which is exactly the opposite of what sign-out should do.
    AM.store.clearAll(true);
    AM.sync.forgetLocalOwner();
    if (fb.isReady()) await fb.auth().signOut();
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------

  /**
   * Wire the auth-state listener and resolve once Firebase has told us whether
   * anybody is signed in. Callers await this before starting the router, so no
   * page ever renders in an "unknown user" state.
   */
  /** If Firebase never answers, give up after this and render signed-out. */
  const INIT_TIMEOUT_MS = 10000;

  /**
   * `loadOrCreateProfile` with a few retries. A single flaky read used to
   * demote a teacher to the student UI until the next reload; a permission
   * error is not retried (it will not change) and surfaces immediately.
   */
  async function loadProfileWithRetry(user) {
    const delays = [0, 800, 2000];
    let lastErr = null;
    for (let i = 0; i < delays.length; i++) {
      if (delays[i]) await new Promise((r) => window.setTimeout(r, delays[i]));
      try {
        return await loadOrCreateProfile(user);
      } catch (err) {
        lastErr = err;
        if (err && err.code === 'permission-denied') break;
      }
    }
    throw lastErr;
  }

  function init() {
    return new Promise(function (resolve) {
      if (!fb.isReady()) {
        state.resolved = true;
        resolve(state);
        return;
      }

      let first = true;

      /**
       * Safety net. `onAuthStateChanged` normally fires within a few hundred
       * milliseconds, but if the network swallows the request the promise
       * would never settle and the whole app would sit on its loading screen
       * forever. Resolving as "signed out" at least gets the login form on
       * screen, where the user can retry.
       */
      const timer = window.setTimeout(function () {
        if (!first) return;
        first = false;
        console.warn('[auth] Firebase không phản hồi sau ' + INIT_TIMEOUT_MS + 'ms.');
        state.resolved = true;
        resolve(state);
      }, INIT_TIMEOUT_MS);

      fb.auth().onAuthStateChanged(async function (user) {
        window.clearTimeout(timer);
        state.user = user || null;
        state.profile = null;

        if (user) {
          try {
            state.profile = await loadProfileWithRetry(user);
          } catch (err) {
            console.error('[auth] Không đọc được hồ sơ tài khoản:', fb.describeError(err));
            // Fall back to a student-shaped profile so the app still works;
            // rules will still refuse anything a student may not do. `degraded`
            // lets the UI say so instead of quietly showing a teacher the
            // student screens.
            state.profile = {
              uid: user.uid,
              email: user.email || '',
              displayName: user.displayName || '',
              role: 'student',
              degraded: true,
            };
          }
        }

        state.resolved = true;
        notify();
        if (first) {
          first = false;
          resolve(state);
        }
      });
    });
  }

  AM.auth = {
    state: state,
    SELECTABLE_ROLES: SELECTABLE_ROLES,
    ROLE_LABELS: ROLE_LABELS,
    init: init,
    onChange: onChange,
    currentUser: currentUser,
    currentProfile: currentProfile,
    isSignedIn: isSignedIn,
    role: role,
    roleLabel: roleLabel,
    isAdmin: isAdmin,
    isTeacher: isTeacher,
    isStudent: isStudent,
    classCode: classCode,
    setClassCode: setClassCode,
    displayName: displayName,
    register: register,
    signIn: signIn,
    signOut: signOut,
    resetPassword: resetPassword,
    updateSummary: updateSummary,
    userDoc: userDoc,
  };
})(window.AM);
