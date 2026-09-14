#!/usr/bin/env node
/**
 * Wipe every account and all learning data from the Firebase project.
 *
 * Run this once before opening registration with the new student/teacher
 * roles. Accounts created under the old build have no `role` field the new
 * rules understand and no way to pick one, so they would sign in to a
 * half-broken app — clearing them is simpler than migrating them.
 *
 * WHAT IT DELETES, permanently and with no undo:
 *   - every user in Firebase Authentication
 *   - the whole `users` collection
 *   - the whole `learners` collection (every student's profile, diagnostic
 *     results, learning path and error notebook)
 *   - the whole `classes` collection, including every roster
 *
 * ------------------------------------------------------------------------
 * SETUP
 *
 *   1. Firebase Console → Project settings → Service accounts
 *      → "Generate new private key". Save the JSON next to this file as
 *        tools/service-account.json
 *
 *      Treat that file like a password: it bypasses every security rule.
 *      It is already covered by .gitignore — do not commit it, and delete it
 *      when you are done.
 *
 *   2. From the project root:
 *
 *        cd tools
 *        npm install firebase-admin
 *
 *   3. Dry run first — lists what would go, changes nothing:
 *
 *        node reset-accounts.js
 *
 *   4. When the list looks right:
 *
 *        node reset-accounts.js --yes-delete-everything
 * ------------------------------------------------------------------------
 */

'use strict';

const path = require('path');

let admin;
try {
  admin = require('firebase-admin');
} catch (err) {
  console.error('Chưa cài firebase-admin. Chạy:  cd tools && npm install firebase-admin');
  process.exit(1);
}

const KEY_PATH = path.join(__dirname, 'service-account.json');

let serviceAccount;
try {
  serviceAccount = require(KEY_PATH);
} catch (err) {
  console.error('Không đọc được ' + KEY_PATH);
  console.error('Tải khoá từ Firebase Console → Project settings → Service accounts.');
  process.exit(1);
}

// Deleting everything is opt-in through an argument that is tedious to type by
// accident. Without it this script only reports.
const CONFIRMED = process.argv.indexOf('--yes-delete-everything') !== -1;

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const auth = admin.auth();
const db = admin.firestore();

/** Firestore caps batched writes at 500 operations. */
const BATCH_LIMIT = 450;

/**
 * Delete a collection and everything beneath it.
 *
 * `recursiveDelete` handles subcollections too, which matters for
 * `learners/{uid}/data/{key}` and `classes/{code}/members/{uid}` — deleting
 * only the parent would leave those documents unreachable but still billed.
 */
async function deleteCollection(name) {
  const snap = await db.collection(name).get();
  if (snap.empty) {
    console.log('  ' + name + ': trống, bỏ qua');
    return 0;
  }
  if (!CONFIRMED) {
    console.log('  ' + name + ': ' + snap.size + ' document sẽ bị xoá');
    return snap.size;
  }
  await db.recursiveDelete(db.collection(name));
  console.log('  ' + name + ': đã xoá ' + snap.size + ' document (kèm sub-collection)');
  return snap.size;
}

async function listAllUsers() {
  const users = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

async function deleteAuthUsers(users) {
  if (users.length === 0) return;
  for (let i = 0; i < users.length; i += BATCH_LIMIT) {
    const chunk = users.slice(i, i + BATCH_LIMIT).map((u) => u.uid);
    const result = await auth.deleteUsers(chunk);
    console.log(
      '  đã xoá ' + result.successCount + ', lỗi ' + result.failureCount +
        ' (' + Math.min(i + BATCH_LIMIT, users.length) + '/' + users.length + ')',
    );
    for (const e of result.errors) {
      console.error('    lỗi uid ' + chunk[e.index] + ': ' + e.error.message);
    }
  }
}

async function main() {
  console.log('Project: ' + serviceAccount.project_id);
  console.log(
    CONFIRMED
      ? '\n*** CHẾ ĐỘ XOÁ THẬT — không thể hoàn tác ***\n'
      : '\n--- CHẾ ĐỘ THỬ (dry run). Thêm --yes-delete-everything để xoá thật. ---\n',
  );

  const users = await listAllUsers();
  console.log('Authentication: ' + users.length + ' tài khoản');
  for (const u of users.slice(0, 20)) {
    console.log('  - ' + (u.email || '(không email)') + '  ' + u.uid);
  }
  if (users.length > 20) console.log('  … và ' + (users.length - 20) + ' tài khoản nữa');

  console.log('\nFirestore:');
  await deleteCollection('users');
  await deleteCollection('learners');
  await deleteCollection('classes');

  if (CONFIRMED) {
    console.log('\nĐang xoá tài khoản Authentication…');
    await deleteAuthUsers(users);
    console.log('\nXong. Mọi tài khoản và dữ liệu học tập đã được xoá.');
    console.log('Nhớ xoá tools/service-account.json khi không dùng nữa.');
  } else {
    console.log('\nChưa xoá gì cả. Chạy lại với --yes-delete-everything nếu danh sách trên là đúng.');
  }
}

main().catch(function (err) {
  console.error('\nThất bại:', err);
  process.exit(1);
});
