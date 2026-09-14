/**
 * Classes — teachers create them, students join them with a code.
 *
 * Data model:
 *
 *   classes/{CODE}                 name, teacherId, teacherName, createdAt
 *   classes/{CODE}/members/{uid}   uid, displayName, email, joinedAt,
 *                                  + a mirror of that student's progress
 *                                  + an optional help request
 *
 * The join code IS the document id. That is the whole trick: a student joining
 * does `get(classes/K7M2QX)` — one direct read of a path they already know —
 * instead of `where('code','==',…)`, which would have required letting clients
 * list the classes collection and thereby handing out every code in the
 * database. See the matching note in firestore.rules.
 *
 * Progress reaches the teacher by being mirrored onto the member row whenever
 * `core/sync.js` pushes a summary. Firestore has no joins, so the alternative
 * would be granting teachers read access to every user document — far more
 * access than "watch my own class" needs.
 */
(function (AM) {
  'use strict';

  const fb = AM.fb;
  const toDate = AM.util.toDate;

  /**
   * Alphabet for join codes.
   *
   * 0/O and 1/I/L are left out on purpose. Codes get read off a whiteboard and
   * typed by a room full of teenagers; the pairs that look alike cause far more
   * failed joins than the smaller keyspace costs. 30 characters over 6 places
   * is still ~729 million combinations.
   */
  const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const CODE_LENGTH = 6;

  /** Give up generating a unique code after this many collisions. */
  const MAX_CODE_ATTEMPTS = 8;

  function randomCode() {
    const bytes = new Uint32Array(CODE_LENGTH);
    window.crypto.getRandomValues(bytes);
    let out = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      out += CODE_ALPHABET.charAt(bytes[i] % CODE_ALPHABET.length);
    }
    return out;
  }

  /**
   * Accept what a student actually types.
   *
   * Lowercase, stray spaces and the hyphen people insert mid-code are all
   * normalised away rather than rejected with "mã không đúng".
   */
  function normaliseCode(raw) {
    return String(raw || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }

  function classDoc(code) {
    return fb.db().collection(fb.PATHS.classes).doc(code);
  }

  function membersCol(code) {
    return classDoc(code).collection(fb.PATHS.members);
  }

  function memberDoc(code, uid) {
    return membersCol(code).doc(uid);
  }

  function requireReady() {
    if (!fb.isReady()) throw new Error(fb.initError() || 'Firebase chưa sẵn sàng.');
  }

  // ---------------------------------------------------------------------------
  // Teacher side
  // ---------------------------------------------------------------------------

  /**
   * Create a class and return it.
   *
   * Uniqueness of the generated code is checked with a read before the write.
   * That is a race in theory — two teachers could generate the same code in the
   * same instant — but at this scale the collision probability is negligible,
   * and losing it would mean one teacher's class landing on another's code,
   * which the `create` rule already refuses because the existing document has a
   * different teacherId.
   */
  async function createClass(name) {
    requireReady();
    const user = AM.auth.currentUser();
    if (!user) throw new Error('Bạn cần đăng nhập.');
    if (!AM.auth.isTeacher()) throw new Error('Chỉ tài khoản giáo viên mới tạo được lớp.');

    const trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('Bạn chưa đặt tên lớp.');

    let code = null;
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const candidate = randomCode();
      const snap = await classDoc(candidate).get();
      if (!snap.exists) {
        code = candidate;
        break;
      }
    }
    if (!code) throw new Error('Không tạo được mã lớp. Thử lại lần nữa.');

    const payload = {
      name: trimmed,
      teacherId: user.uid,
      teacherName: AM.auth.displayName(),
      createdAt: fb.serverTimestamp(),
    };
    await classDoc(code).set(payload);

    return Object.assign({ code: code }, payload, { createdAt: null });
  }

  /**
   * Every class this teacher owns.
   *
   * The `where` is not optional decoration: firestore.rules allows this list
   * only because the filter guarantees every matched document belongs to the
   * caller. Drop it and Firestore rejects the whole query.
   */
  async function listMyClasses() {
    requireReady();
    const user = AM.auth.currentUser();
    if (!user) return [];

    const snap = await fb
      .db()
      .collection(fb.PATHS.classes)
      .where('teacherId', '==', user.uid)
      .get();

    return snap.docs
      .map(function (doc) {
        const d = doc.data() || {};
        return {
          code: doc.id,
          name: d.name || '(chưa đặt tên)',
          teacherId: d.teacherId,
          teacherName: d.teacherName || '',
          createdAt: toDate(d.createdAt),
        };
      })
      .sort(function (a, b) {
        return (b.createdAt ? b.createdAt.getTime() : 0) - (a.createdAt ? a.createdAt.getTime() : 0);
      });
  }

  async function renameClass(code, name) {
    requireReady();
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('Tên lớp không được để trống.');
    await classDoc(code).update({ name: trimmed });
  }

  /**
   * Delete a class.
   *
   * The roster is removed first. If deleting the parent came first the member
   * documents would survive as orphans that nothing can reach — Firestore does
   * not cascade, and `ownsClass()` in the rules needs the parent to exist in
   * order to authorise touching them.
   */
  async function deleteClass(code) {
    requireReady();
    const members = await membersCol(code).get();
    await Promise.all(members.docs.map((d) => d.ref.delete()));
    await classDoc(code).delete();
  }

  /** The roster, with each student's mirrored progress. */
  async function listMembers(code) {
    requireReady();
    const snap = await membersCol(code).get();
    return snap.docs.map(function (doc) {
      const d = doc.data() || {};
      return {
        uid: doc.id,
        displayName: d.displayName || '',
        email: d.email || '',
        grade: d.grade || null,
        joinedAt: toDate(d.joinedAt),
        lastActiveAt: toDate(d.lastActiveAt),
        hasDiagnostic: d.hasDiagnostic === true,
        xp: d.xp || 0,
        level: d.level || 0,
        currentStreak: d.currentStreak || 0,
        masteredTopics: d.masteredTopics || 0,
        totalQuestions: d.totalQuestions || 0,
        unresolvedErrors: d.unresolvedErrors || 0,
        help: d.help || null,
      };
    });
  }

  /** Remove a student from a class the caller teaches. */
  async function removeMember(code, uid) {
    requireReady();
    await memberDoc(code, uid).delete();
  }

  /** Teacher's reply to a help request; clears the pending flag. */
  async function answerHelp(code, uid, reply) {
    requireReady();
    // The student may have withdrawn the question meanwhile; a dotted update
    // would then recreate `help` with a reply and no message.
    const snap = await memberDoc(code, uid).get();
    const current = snap.exists ? (snap.data() || {}).help : null;
    if (!current || !current.message) {
      throw new Error('Học sinh đã rút lại yêu cầu này. Tải lại danh sách để cập nhật.');
    }
    await memberDoc(code, uid).update({
      'help.reply': String(reply || '').trim(),
      'help.status': 'answered',
      'help.answeredAt': Date.now(),
    });
  }

  // ---------------------------------------------------------------------------
  // Student side
  // ---------------------------------------------------------------------------

  /** Look up a class by code without joining it, so the UI can confirm first. */
  async function findClass(rawCode) {
    requireReady();
    const code = normaliseCode(rawCode);
    if (code.length !== CODE_LENGTH) return null;

    const snap = await classDoc(code).get();
    if (!snap.exists) return null;

    const d = snap.data() || {};
    return {
      code: code,
      name: d.name || '(chưa đặt tên)',
      teacherId: d.teacherId,
      teacherName: d.teacherName || 'Giáo viên',
    };
  }

  /**
   * Join a class.
   *
   * A student belongs to at most one class, so joining a second one leaves the
   * first. Doing that here rather than asking the UI to remember means the
   * membership rows cannot drift out of step with `users/{uid}.classCode`.
   */
  async function joinClass(rawCode) {
    requireReady();
    const user = AM.auth.currentUser();
    if (!user) throw new Error('Bạn cần đăng nhập.');
    if (AM.auth.isTeacher()) throw new Error('Tài khoản giáo viên không tham gia lớp với vai trò học sinh.');

    const found = await findClass(rawCode);
    if (!found) throw new Error('Không tìm thấy lớp với mã này. Kiểm tra lại mã với giáo viên.');

    const previous = AM.auth.classCode();
    if (previous && previous !== found.code) {
      try {
        await memberDoc(previous, user.uid).delete();
      } catch (err) {
        // Already gone, or the class was deleted — either way, carry on.
      }
    }

    await memberDoc(found.code, user.uid).set({
      uid: user.uid,
      displayName: AM.auth.displayName(),
      email: user.email || '',
      joinedAt: fb.serverTimestamp(),
    }, { merge: true });

    await AM.auth.setClassCode(found.code, found.name);

    // Publish current progress immediately, so the teacher sees a real row
    // rather than a blank one. `pushSummary()` rather than `flush()`: flush
    // returns early when no local key is dirty, which is exactly the case for
    // a student joining between practice sessions.
    try {
      await AM.sync.pushSummary();
    } catch (err) {
      /* the mirror will catch up on the next push */
    }

    return found;
  }

  async function leaveClass() {
    requireReady();
    const user = AM.auth.currentUser();
    const code = AM.auth.classCode();
    if (!user || !code) return;

    try {
      await memberDoc(code, user.uid).delete();
    } catch (err) {
      // The teacher may have removed the row (or the class) already.
    }
    await AM.auth.setClassCode(null, null);
  }

  /**
   * The class this student is in, or null.
   *
   * Also detects the two ways a membership ends without this client knowing:
   * the teacher deleted the class, or the teacher removed this student from
   * the roster. Both clear `users/{uid}.classCode`, which the teacher's account
   * is not allowed to touch (see firestore.rules) — so the student's own client
   * has to notice and do it.
   */
  async function myClass() {
    requireReady();
    const user = AM.auth.currentUser();
    const code = AM.auth.classCode();
    if (!user || !code) return null;

    const found = await findClass(code);
    if (found) {
      const row = await memberDoc(code, user.uid).get();
      if (row.exists) return found;
    }
    // Class gone or removed from the roster: stop pointing at a dead code.
    await AM.auth.setClassCode(null, null);
    return null;
  }

  /** This student's own roster row — includes any reply from the teacher. */
  async function myMembership() {
    requireReady();
    const user = AM.auth.currentUser();
    const code = AM.auth.classCode();
    if (!user || !code) return null;

    const snap = await memberDoc(code, user.uid).get();
    if (!snap.exists) return null;
    const d = snap.data() || {};
    return { uid: snap.id, help: d.help || null, joinedAt: toDate(d.joinedAt) };
  }

  /** Ask the teacher for help. One open request at a time, overwritten. */
  async function requestHelp(message) {
    requireReady();
    const user = AM.auth.currentUser();
    const code = AM.auth.classCode();
    if (!user || !code) throw new Error('Bạn chưa tham gia lớp nào.');

    const text = String(message || '').trim();
    if (!text) throw new Error('Bạn chưa nhập nội dung cần hỗ trợ.');

    // `update`, not `set(merge)`: a merge on a missing row would silently
    // re-enrol a student the teacher has removed from the class.
    try {
      await memberDoc(code, user.uid).update({
        help: {
          message: text,
          status: 'pending',
          // Date.now() rather than serverTimestamp(): this is nested inside a
          // map and a sentinel there would be written as-is instead of resolved.
          askedAt: Date.now(),
          reply: '',
        },
      });
    } catch (err) {
      if (isNotFound(err)) {
        await AM.auth.setClassCode(null, null);
        throw new Error('Bạn không còn trong lớp này. Hãy vào lại lớp bằng mã lớp.');
      }
      throw err;
    }
  }

  /** Firestore's "document does not exist" error from `update()`. */
  function isNotFound(err) {
    return !!err && (err.code === 'not-found' || err.code === 'firestore/not-found');
  }

  /** Withdraw an open request, or dismiss an answered one. */
  async function clearHelp() {
    requireReady();
    const user = AM.auth.currentUser();
    const code = AM.auth.classCode();
    if (!user || !code) return;
    await memberDoc(code, user.uid).update({
      help: window.firebase.firestore.FieldValue.delete(),
    });
  }

  // ---------------------------------------------------------------------------
  // Shared
  // ---------------------------------------------------------------------------

  /**
   * Copy a progress summary onto this student's roster row.
   *
   * Called by `auth.updateSummary()` on every sync push. Failures are the
   * caller's to swallow: a student whose class was deleted underneath them must
   * still be able to save their own progress.
   */
  async function mirrorProgress(code, summary) {
    if (!fb.isReady()) return;
    const user = AM.auth.currentUser();
    if (!user || !code) return;

    // `update`, not `set(merge)`. A merge creates the row when it is missing,
    // which put students the teacher had removed straight back on the roster
    // at their next practice session. `update` fails instead, and the failure
    // is the signal that this device should forget the class.
    try {
      await memberDoc(code, user.uid).update(
        Object.assign({}, summary, {
          displayName: AM.auth.displayName(),
          email: user.email || '',
          lastActiveAt: fb.serverTimestamp(),
        }),
      );
    } catch (err) {
      if (isNotFound(err)) {
        await AM.auth.setClassCode(null, null);
        return;
      }
      throw err;
    }
  }

  AM.classroom = {
    CODE_LENGTH: CODE_LENGTH,
    normaliseCode: normaliseCode,

    // teacher
    createClass: createClass,
    listMyClasses: listMyClasses,
    renameClass: renameClass,
    deleteClass: deleteClass,
    listMembers: listMembers,
    removeMember: removeMember,
    answerHelp: answerHelp,

    // student
    findClass: findClass,
    joinClass: joinClass,
    leaveClass: leaveClass,
    myClass: myClass,
    myMembership: myMembership,
    requestHelp: requestHelp,
    clearHelp: clearHelp,

    // shared
    mirrorProgress: mirrorProgress,
  };
})(window.AM);
