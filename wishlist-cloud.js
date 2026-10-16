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

const firebaseConfig = {
  apiKey: "AIzaSyB7NJKRMf1aDCmPtyurPiNkT4qayEZvERQ",
  authDomain: "wishlist-787d2.web.app",
  projectId: "wishlist-787d2",
  storageBucket: "wishlist-787d2.firebasestorage.app",
  appId: "1:444123301601:web:627db751e201ac50a619a0",
  messagingSenderId: "444123301601",
  measurementId: "G-TKCTWXMNMF"
};

const isConfigured = Object.values(firebaseConfig).every(value =>
  value && !value.startsWith("PASTE_")
);

export async function initializeWishlistCloud({ onStatus, onRemoteItems, onError }) {
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

  // Safari (notably non-private tabs with restricted storage)
  // may reject local persistence with auth/internal-error.
  // Fall back gracefully so sign-in still works for the session.
  for (const persistence of [browserLocalPersistence, browserSessionPersistence, inMemoryPersistence]) {
    try {
      await setPersistence(auth, persistence);
      break;
    } catch (persistenceError) {
      if (persistence === inMemoryPersistence) throw persistenceError;
    }
  }
  await getRedirectResult(auth);

  onAuthStateChanged(auth, nextUser => {
    user = nextUser;
    if(stopListening){
      stopListening();
      stopListening = null;
    }
    remoteDocumentIds = new Set();
    isFirstSnapshot = true;

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
    onError("Lỗi xác thực Firebase: " + error.message);
  });

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
    // Preview authDomain differs from its page origin; redirect can lose the
    // auth result on iOS Safari due to cross-origin storage restrictions.
    // Experiment: initiate popup directly from the user click on all devices.
    signIn: () => signInWithPopup(auth, provider),
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
