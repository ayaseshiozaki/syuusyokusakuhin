// Script/unreadBadge.js
import { db, auth } from "./firebaseInit.js";
import {
  collection, query, where, onSnapshot
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

const badgeEl = document.getElementById("notifBadge");

// ここを true にすると「●」表示、false で「数字」表示
const DOT_MODE = false;

function setBadge(count) {
  if (!badgeEl) return;

  if (!count || count <= 0) {
    badgeEl.classList.add("hidden");
    badgeEl.textContent = "";
    badgeEl.classList.remove("dot");
    return;
  }

  badgeEl.classList.remove("hidden");

  if (DOT_MODE) {
    badgeEl.classList.add("dot");
    badgeEl.textContent = "";
    return;
  }

  badgeEl.classList.remove("dot");
  // 99+ 表示
  badgeEl.textContent = count > 99 ? "99+" : String(count);
}

function subscribeUnreadSafe(uid) {
  const ref = collection(db, "notifications");

  // メイン：isRead == false の未読だけを取る（軽い）
  const qUnread = query(
    ref,
    where("toUid", "==", uid),
    where("isRead", "==", false)
  );

  // フォールバック：もし「isReadが無い通知が混ざってる」等で数が合わない場合の救済
  const qAllMine = query(
    ref,
    where("toUid", "==", uid)
  );

  let usingFallback = false;

  const startFallback = () => {
    if (usingFallback) return;
    usingFallback = true;

    onSnapshot(qAllMine, (snap) => {
      // isRead が true 以外は「未読扱い」にして救済
      const unreadCount = snap.docs.reduce((acc, d) => {
        const n = d.data();
        return acc + (n.isRead === true ? 0 : 1);
      }, 0);
      setBadge(unreadCount);
    }, (err) => {
      console.error("unread badge fallback error:", err);
    });
  };

  onSnapshot(qUnread, (snap) => {
    // 正常に取れてればこれでOK（リアルタイム）
    setBadge(snap.size);
  }, (err) => {
    console.error("unread badge main error:", err);
    startFallback();
  });
}

onAuthStateChanged(auth, (user) => {
  if (!badgeEl) return; // このページにバッジが無いなら何もしない
  if (!user) {
    setBadge(0);
    return;
  }
  subscribeUnreadSafe(user.uid);
});
