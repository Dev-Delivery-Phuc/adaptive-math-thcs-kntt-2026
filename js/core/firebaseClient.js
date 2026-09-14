/**
 * Firebase bootstrap.
 *
 * Uses the **compat** SDK (`firebase-*-compat.js`) rather than the modular v9+
 * API: compat ships as classic scripts that load with a plain `<script src>`,
 * while the modular API is ESM-only and would force a bundler onto a project
 * that deliberately has no build step.
 *
 * These config values are **not secrets**. Firebase web config is designed to
 * be public and is visible in the bundle of every deployed Firebase app; what
 * protects the data is `firestore.rules`, not hiding this object.
 * https://firebase.google.com/docs/projects/api-keys
 *
 * Initialisation never throws. If the CDN was blocked or the project is
 * misconfigured, `isReady()` returns false and the UI shows an explanation
 * instead of a blank page.
 */
(function (AM) {
  'use strict';

  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyDRnPMzWOboBIMvMK0nQu6OVc--6c8b2Rs',
    authDomain: 'adaptivemath-36726.firebaseapp.com',
    projectId: 'adaptivemath-36726',
    storageBucket: 'adaptivemath-36726.firebasestorage.app',
    messagingSenderId: '726415919784',
    appId: '1:726415919784:web:d1798259e74eb1edcfd09d',
    measurementId: 'G-9YVKBYYM45',
  };

  /** Firestore collection / document names, in one place. */
  const PATHS = {
    users: 'users',
    learners: 'learners',
    /** Sub-collection under learners/{uid} holding one doc per storage key. */
    data: 'data',
    /** One doc per class. The document id IS the join code — see classroom.js. */
    classes: 'classes',
    /** Sub-collection under classes/{code}: one roster row per student. */
    members: 'members',
  };

  let app = null;
  let authInstance = null;
  let dbInstance = null;
  let initError = null;

  function sdkLoaded() {
    return typeof window.firebase !== 'undefined' && !!window.firebase.initializeApp;
  }

  function init() {
    if (app || initError) return;
    if (!sdkLoaded()) {
      initError = 'Không tải được Firebase SDK. Kiểm tra kết nối mạng.';
      console.error('[firebase] ' + initError);
      return;
    }
    try {
      app = window.firebase.apps.length
        ? window.firebase.app()
        : window.firebase.initializeApp(FIREBASE_CONFIG);
      authInstance = window.firebase.auth();
      dbInstance = window.firebase.firestore();
    } catch (err) {
      initError = (err && err.message) || String(err);
      console.error('[firebase] Khởi tạo thất bại:', err);
    }
  }

  init();

  function isReady() {
    return app !== null && authInstance !== null && dbInstance !== null;
  }

  function auth() {
    return authInstance;
  }

  function db() {
    return dbInstance;
  }

  function serverTimestamp() {
    return window.firebase.firestore.FieldValue.serverTimestamp();
  }

  /**
   * Turn a Firebase error into something a Vietnamese-speaking student can act
   * on. Anything unmapped falls through to the raw message, which is still
   * better than a silent failure.
   */
  function describeError(err) {
    const code = (err && err.code) || '';
    switch (code) {
      case 'auth/invalid-email':
        return 'Địa chỉ email không hợp lệ.';
      case 'auth/missing-password':
        return 'Bạn chưa nhập mật khẩu.';
      case 'auth/weak-password':
        return 'Mật khẩu quá ngắn — cần ít nhất 6 ký tự.';
      case 'auth/email-already-in-use':
        return 'Email này đã được đăng ký. Hãy đăng nhập thay vì tạo mới.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Email hoặc mật khẩu không đúng.';
      case 'auth/too-many-requests':
        return 'Bạn thử sai quá nhiều lần. Đợi vài phút rồi thử lại.';
      case 'auth/network-request-failed':
        return 'Mất kết nối mạng. Kiểm tra internet rồi thử lại.';
      case 'auth/user-disabled':
        return 'Tài khoản này đã bị vô hiệu hoá.';
      case 'auth/unauthorized-domain':
        return (
          'Tên miền hiện tại chưa được Firebase cho phép. Nếu bạn đang mở file ' +
          'trực tiếp từ ổ đĩa, hãy chạy qua web server hoặc bản đã deploy. ' +
          'Nếu đang chạy trên tên miền thật, thêm nó vào Firebase Console → ' +
          'Authentication → Settings → Authorized domains.'
        );
      case 'auth/operation-not-allowed':
        return (
          'Chưa bật đăng nhập bằng Email/Password. Vào Firebase Console → ' +
          'Authentication → Sign-in method để bật.'
        );
      case 'permission-denied':
        return 'Không có quyền truy cập dữ liệu. Kiểm tra firestore.rules đã deploy chưa.';
      case 'unavailable':
        return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
      case 'failed-precondition':
        return (
          'Firestore chưa được bật cho project này (Firebase Console → ' +
          'Firestore Database → Create database).'
        );
      default:
        break;
    }
    if (err && err.message) return err.message;
    return 'Đã có lỗi xảy ra.';
  }

  AM.fb = {
    PATHS: PATHS,
    config: FIREBASE_CONFIG,
    isReady: isReady,
    initError: function () {
      return initError;
    },
    auth: auth,
    db: db,
    serverTimestamp: serverTimestamp,
    describeError: describeError,
  };
})(window.AM);
