import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  getRedirectResult,
  getIdToken,
  inMemoryPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Firebase "signInWithRedirect" best practice (Option 1) for web.app / custom
// domains: the auth helper (authDomain) MUST live on the SAME origin as the
// app. Otherwise Safari (ITP) blocks the cross-origin storage the redirect
// flow depends on and the user ends up signed in at Google but NOT in the app.
// Using the real page host keeps production and the Image Sync preview channel
// each same-origin. Non-hosting origins (localhost) keep the default domain.
const AUTH_DOMAIN = /\.(web\.app|firebaseapp\.com)$/i.test(location.hostname)
  ? location.hostname
  : "wishlist-787d2.web.app";

const firebaseConfig = {
  apiKey: "AIzaSyB7NJKRMf1aDCmPtyurPiNkT4qayEZvERQ",
  authDomain: AUTH_DOMAIN,
  projectId: "wishlist-787d2",
  storageBucket: "wishlist-787d2.firebasestorage.app",
  appId: "1:444123301601:web:627db751e201ac50a619a0",
  messagingSenderId: "444123301601",
  measurementId: "G-TKCTWXMNMF"
};

const isConfigured = Object.values(firebaseConfig).every(value =>
  value && !value.startsWith("PASTE_")
);

/* =====================================================================
   TEMPORARY AUTH DIAGNOSTICS (Phase 2A — iOS sign-in investigation)
   Enable with  ?authdebug=1  (or localStorage.dreamVaultAuthDebug = "1").
   Records NON-SENSITIVE auth metadata only: event names, Firebase error
   codes, the resolved authDomain and the active persistence kind.
   It NEVER records ID tokens, e-mail addresses, UIDs or wishlist data.
   Remove this block once iPhone sign-in is confirmed working.
   ===================================================================== */
const AUTH_DEBUG = (() => {
  try {
    return new URLSearchParams(location.search).get("authdebug") === "1" ||
           localStorage.getItem("dreamVaultAuthDebug") === "1";
  } catch (error) {
    return false;
  }
})();
const authLogBuffer = [];
try { window.__dvAuthLog = authLogBuffer; } catch (error) { /* ignore */ }
function authLog(event, detail = "") {
  authLogBuffer.push({
    t: new Date().toISOString(),
    event,
    detail: String(detail).slice(0, 160),
    host: location.hostname
  });
  if (authLogBuffer.length > 200) authLogBuffer.shift();
  if (AUTH_DEBUG) console.info("[dv-auth] " + event + (detail ? " :: " + detail : ""));
}

export async function initializeWishlistCloud({ onStatus, onRemoteItems, onError, onUserChanged }) {
  if(!isConfigured){
    onStatus("unconfigured");
    return {
      user: null,
      signIn: async () => { throw new Error("Hãy điền Firebase Web App config theo hướng dẫn trong FIREBASE_SETUP.md."); },
      signOut: async () => {},
      syncItems: async () => { throw new Error("Firebase chưa được cấu hình."); }
    };
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const provider = new GoogleAuthProvider();
  let user = null;
  let stopListening = null;
  let isFirstSnapshot = true;
  let remoteDocumentIds = new Set();
  let writeQueue = Promise.resolve();
  // V16 — "thế hệ" của phiên đăng nhập. Mỗi lần user đổi thì tăng lên, để mọi
  // callback còn treo của phiên cũ (snapshot, lỗi) tự động bị bỏ qua.
  let sessionGeneration = 0;

  authLog("init", "authDomain=" + firebaseConfig.authDomain);

  // Safari (notably non-private tabs with restricted storage)
  // may reject local persistence with auth/internal-error.
  // Fall back gracefully so sign-in still works for the session.
  for (const [kind, persistence] of [
    ["local", browserLocalPersistence],
    ["session", browserSessionPersistence],
    ["memory", inMemoryPersistence]
  ]) {
    try {
      await setPersistence(auth, persistence);
      authLog("persistence", kind);
      break;
    } catch (persistenceError) {
      authLog("persistence-error", kind + ":" + (persistenceError.code || persistenceError.message));
      if (persistence === inMemoryPersistence) throw persistenceError;
    }
  }

  // The state listener is attached BEFORE the redirect result is consumed so a
  // restored session is applied even when getRedirectResult later rejects.
  onAuthStateChanged(auth, nextUser => {
    authLog("state", nextUser ? "signed-in" : "signed-out");
    user = nextUser;
    if(stopListening){
      stopListening();
      stopListening = null;
    }
    remoteDocumentIds = new Set();
    isFirstSnapshot = true;

    // Phiên mới: tăng thế hệ để snapshot/lỗi của phiên cũ không còn hiệu lực.
    const generation = ++sessionGeneration;

    // Báo cho UI biết danh tính vừa đổi TRƯỚC khi áp dụng bất kỳ dữ liệu nào,
    // để UI đổi danh sách hiển thị (khách hoặc tài khoản) trước.
    if(onUserChanged) onUserChanged(user ? user.uid : null);

    if(!user){
      onStatus("local");
      return;
    }

    const itemsRef = collection(db, "users", user.uid, "items");
    onStatus("syncing", user.email || "");
    stopListening = onSnapshot(
      itemsRef,
      { includeMetadataChanges: true },

      snapshot => {
        if(generation !== sessionGeneration) return;

        remoteDocumentIds = new Set(
          snapshot.docs.map(itemDoc => itemDoc.id)
        );

        const remoteItems = snapshot.docs.map(
          itemDoc => itemDoc.data()
        );

        // Không coi dữ liệu cache là xác nhận đã đồng bộ.
        const fromCache = snapshot.metadata.fromCache;
        const pending = snapshot.metadata.hasPendingWrites;

        // Chỉ xử lý dữ liệu khi thực sự có thay đổi tài liệu
        // hoặc khi đây là snapshot đầu tiên.
        if (
          isFirstSnapshot ||
          snapshot.docChanges().length > 0
        ) {
          onRemoteItems(remoteItems, isFirstSnapshot);
        }

        isFirstSnapshot = false;

        if (pending) {
          onStatus("syncing", user.email || "");
        } else if (fromCache) {
          onStatus("offline", user.email || "");
        } else {
          onStatus("synced", user.email || "");
        }
      },

      error => {
        if(generation !== sessionGeneration) return;

        onError(
          "Không đọc được dữ liệu Firebase: " +
          error.message
        );

        onStatus(
          "error",
          user?.email || ""
        );
      }
    );
  }, error => {
    authLog("state-error", error.code || error.message);
    onError("Lỗi xác thực Firebase: " + error.message);
  });

  // Consume the redirect (mobile/Safari) result. A failure here must NOT abort
  // sync init — the state listener above already reflects the real session.
  try {
    const redirectResult = await getRedirectResult(auth);
    authLog("redirect-result", redirectResult && redirectResult.user ? "user-restored" : "empty");
  } catch (redirectError) {
    authLog("redirect-error", redirectError.code || redirectError.message);
    onError(
      "Không khôi phục được phiên đăng nhập sau khi Google chuyển hướng: " +
      (redirectError.code || redirectError.message)
    );
  }

  async function writeItems(items, expectedUid) {
    if(!user || user.uid !== expectedUid) return;
    const activeUser = user;
    const itemsRef = collection(db, "users", activeUser.uid, "items");
    const desiredIds = new Set();

    for(const item of items){
      const documentId = encodeURIComponent(String(item.id));
      desiredIds.add(documentId);
      const image = /^data:image\//i.test(item.image || "") ? "" : item.image || "";
      await setDoc(doc(itemsRef, documentId), { ...item, id: String(item.id), image });
    }

    if(!user || user.uid !== expectedUid) return;
    for(const documentId of remoteDocumentIds){
      if(!desiredIds.has(documentId)){
        await deleteDoc(doc(itemsRef, documentId));
      }
    }
  }

  return {
    get user(){ return user; },
    // Mobile keeps signInWithRedirect (Firebase's recommended flow for Safari),
    // which is now safe because authDomain is same-origin (see AUTH_DOMAIN).
    // Desktop keeps signInWithPopup to preserve the existing behaviour.
    signIn: () => {
      const mobile = matchMedia("(max-width: 700px)").matches;
      authLog("sign-in", "mode=" + (mobile ? "redirect" : "popup"));
      return mobile
        ? signInWithRedirect(auth, provider)
        : signInWithPopup(auth, provider);
    },
    signOut: () => signOut(auth),
    async uploadImage(dataUrl){
      if(!user) throw new Error("Hãy đăng nhập Google để đồng bộ ảnh.");
      if(!/^data:image\/jpeg;base64,/i.test(dataUrl)) throw new Error("Ảnh tải lên phải là JPEG đã nén.");
      const expectedUid = user.uid;
      const binary = await fetch(dataUrl).then(response => response.blob());
      if(binary.size > 1.5 * 1024 * 1024) throw new Error("Ảnh vượt giới hạn 1.5 MB.");
      const token = await getIdToken(user);
      const signedResponse = await fetch("https://wishlist-images.ducbao147258.workers.dev/sign", {
        method: "POST",
        headers: {"Authorization": "Bearer " + token}
      });
      if(!signedResponse.ok) throw new Error("Không thể xác thực upload ảnh (" + signedResponse.status + ").");
      const signed = await signedResponse.json();
      if(signed.cloud_name !== "herun6yp" || !signed.signature || !signed.api_key || !signed.folder ||
         !signed.folder.startsWith("dream-vault/") || !signed.timestamp ||
         signed.allowed_formats !== "jpg") throw new Error("Phản hồi ký upload không hợp lệ.");
      const body = new FormData();
      body.append("file", binary, "wishlist.jpg");
      body.append("api_key", signed.api_key);
      body.append("timestamp", String(signed.timestamp));
      body.append("folder", signed.folder);
      body.append("allowed_formats", signed.allowed_formats);
      body.append("signature", signed.signature);
      const response = await fetch("https://api.cloudinary.com/v1_1/herun6yp/image/upload", {method: "POST", body});
      if(!response.ok) throw new Error("Cloudinary từ chối ảnh (" + response.status + ").");
      const result = await response.json();
      if(!user || user.uid !== expectedUid) throw new Error("Tài khoản đã thay đổi trong lúc upload.");
      let url;
      try { url = new URL(result.secure_url); } catch { throw new Error("Cloudinary không trả về URL ảnh hợp lệ."); }
      if(url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" ||
         !url.pathname.startsWith("/herun6yp/image/upload/")) throw new Error("Cloudinary trả về URL không hợp lệ.");
      return url.href;
    },
    syncItems(items){
      if(!user) return Promise.resolve();
      const expectedUid = user.uid;
      const snapshot = items.map(item => ({ ...item }));
      const operation = writeQueue.then(() => writeItems(snapshot, expectedUid));
      writeQueue = operation.catch(() => {});
      return operation;
    }
  };
}
