import { db } from "./firebaseInit.js";
import { collection, addDoc, serverTimestamp } 
  from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

export async function createNotification({
  toUid,
  fromUid,
  type,
  postId = null,
  message
}) {
  if (!toUid || !fromUid || toUid === fromUid) return;

  try {
    await addDoc(collection(db, "notifications"), {
      toUid,
      fromUid,
      type,
      postId,
      message,
      isRead: false,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.error("通知作成エラー:", err);
  }
}
