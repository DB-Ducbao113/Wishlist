// V15 — Firestore Security Rules test (chạy bởi chủ dự án, cần Java + emulator).
//
// Vì sao không chạy trong sprint này: máy CI/agent không có JVM nên Firestore
// emulator không khởi động được. Sprint V15 đánh dấu phần này UNVERIFIED và cung
// cấp sẵn kịch bản dưới đây để chủ dự án tự xác minh cục bộ (không chạm production).
//
// Chuẩn bị (một lần, $0):
//   npm i -D @firebase/rules-unit-testing firebase
//   (cần Java 11+ để chạy emulator)
//
// Chạy:
//   firebase emulators:exec --only firestore --project wishlist-787d2 \
//     "node scripts/test-firestore-rules.mjs"
//
// Kỳ vọng: in ra "RULES: ALL PASS".

import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

const env = await initializeTestEnvironment({
  projectId: 'wishlist-787d2',
  firestore: { rules, host: '127.0.0.1', port: 8080 },
});

const alice = env.authenticatedContext('alice').firestore();
const bob = env.authenticatedContext('bob').firestore();
const anon = env.unauthenticatedContext().firestore();

let pass = 0, fail = 0;
const ok = async (name, p) => { try { await p; console.log('PASS | ' + name); pass++; } catch (e) { console.log('FAIL | ' + name + ' :: ' + e.message); fail++; } };
const no = async (name, p) => { try { await p; console.log('FAIL | ' + name + ' (đáng lẽ bị từ chối)'); fail++; } catch (e) { console.log('PASS | ' + name); pass++; } };

const item = (uid, id) => doc(env.authenticatedContext(uid).firestore(), 'users', uid, 'items', id);

// 1. Chủ sở hữu đọc/ghi dữ liệu của chính mình
await ok('alice ghi item của mình', assertSucceeds(setDoc(item('alice', 'a1'), { name: 'A' })));
await ok('alice đọc item của mình', assertSucceeds(getDoc(doc(alice, 'users/alice/items/a1'))));
await ok('alice list items của mình', assertSucceeds(getDocs(collection(alice, 'users/alice/items'))));

// 2. Cách ly theo UID
await no('bob đọc item của alice -> TỪ CHỐI', assertSucceeds(getDoc(doc(bob, 'users/alice/items/a1'))));
await no('bob ghi vào items của alice -> TỪ CHỐI', assertSucceeds(setDoc(doc(bob, 'users/alice/items/x'), { name: 'X' })));
await no('alice ghi vào items của bob -> TỪ CHỐI', assertSucceeds(setDoc(doc(alice, 'users/bob/items/y'), { name: 'Y' })));

// 3. Chưa đăng nhập -> TỪ CHỐI
await no('ẩn danh đọc items -> TỪ CHỐI', assertSucceeds(getDoc(doc(anon, 'users/alice/items/a1'))));
await no('ẩn danh ghi items -> TỪ CHỐI', assertSucceeds(setDoc(doc(anon, 'users/alice/items/z'), { name: 'Z' })));

// 4. Collection khác (không khớp rule) -> default deny
await no('ẩn danh đọc collection lạ -> TỪ CHỐI', assertSucceeds(getDoc(doc(anon, 'public/x'))));

await env.cleanup();
console.log(`\nRULES: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
