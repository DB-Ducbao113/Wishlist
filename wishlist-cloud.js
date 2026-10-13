import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
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
  authDomain: "wishlist-787d2.firebaseapp.com",
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
    onStatus("Chưa cấu hình Firebase");
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

  await setPersistence(auth, browserLocalPersistence);
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
      onStatus("Đang lưu trên thiết bị này");
      return;
    }

    const itemsRef = collection(db, "users", user.uid, "items");
    onStatus("Đang tải danh sách đồng bộ…", user.email || "");
    stopListening = onSnapshot(itemsRef, snapshot => {
      remoteDocumentIds = new Set(snapshot.docs.map(itemDoc => itemDoc.id));
      const remoteItems = snapshot.docs.map(itemDoc => itemDoc.data());
      onRemoteItems(remoteItems, isFirstSnapshot);
      isFirstSnapshot = false;
      onStatus("Đã đồng bộ", user.email || "");
    }, error => {
      onError("Không đọc được dữ liệu Firebase: " + error.message);
      onStatus("Đồng bộ bị gián đoạn", user.email || "");
    });
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
    signIn: () => matchMedia("(max-width: 700px)").matches
      ? signInWithRedirect(auth, provider)
      : signInWithPopup(auth, provider),
    signOut: () => signOut(auth),
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
