// notificationScript.js（既読/未読 + 種類別 + 押したら遷移：投稿/ユーザー）
// ※ createNotification 側は「isRead: false」を保存しておく想定（無い場合は未読扱いにします）

import { db, auth } from "./firebaseInit.js";
import {
  collection, query, where, orderBy,
  onSnapshot, doc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

const listEl = document.getElementById("notificationList");

onAuthStateChanged(auth, (user) => {
  if (!user) {
    alert("ログインしてください");
    location.href = "loginpage.html";
    return;
  }
  loadNotifications(user.uid);
});

function loadNotifications(uid) {
  // createdAt の orderBy が落ちる可能性があるので try-safe + fallback
  const baseRef = collection(db, "notifications");
  const qMain = query(
    baseRef,
    where("toUid", "==", uid),
    orderBy("createdAt", "desc")
  );

  // fallback: orderByなしで取り、フロントで並び替える
  const qFallback = query(
    baseRef,
    where("toUid", "==", uid)
  );

  let usingFallback = false;

  const subscribeFallback = () => {
    if (usingFallback) return;
    usingFallback = true;

    onSnapshot(
      qFallback,
      async (snapshot) => {
        listEl.innerHTML = "";

        if (snapshot.empty) {
          listEl.innerHTML = `<div class="notification-empty">通知はありません</div>`;
          return;
        }

        const notifs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        notifs.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

        for (const n of notifs) {
          const item = await createNotificationItem(n.id, n);
          listEl.appendChild(item);
        }
      },
      (error) => {
        console.error("notifications fallback snapshot error:", error);
        listEl.innerHTML = `<div class="notification-empty">通知の取得に失敗しました</div>`;
      }
    );
  };

  onSnapshot(
    qMain,
    async (snapshot) => {
      listEl.innerHTML = "";

      if (snapshot.empty) {
        listEl.innerHTML = `<div class="notification-empty">通知はありません</div>`;
        return;
      }

      for (const docSnap of snapshot.docs) {
        const n = docSnap.data();
        const item = await createNotificationItem(docSnap.id, n);
        listEl.appendChild(item);
      }
    },
    (error) => {
      console.error("notifications main snapshot error:", error);
      subscribeFallback();
    }
  );
}

async function createNotificationItem(notificationId, n) {
  let avatar = "default.png";
  let fromName = "誰か";

  // fromUid のユーザー情報
  if (n.fromUid) {
    try {
      const userSnap = await getDoc(doc(db, "users", n.fromUid));
      if (userSnap.exists()) {
        const u = userSnap.data();
        avatar = u.profileImage || avatar;
        fromName = u.userName || u.email || fromName;
      }
    } catch (e) {
      console.error("通知のユーザー取得失敗:", e);
    }
  }

  // createdAt（混在OK）
  const ms = toMillis(n.createdAt);
  const createdAtStr = ms ? new Date(ms).toLocaleString() : "";

  // 既読/未読（isRead が無い古い通知は未読扱いにしておく）
  const isRead = (typeof n.isRead === "boolean") ? n.isRead : false;

  // 種類（like/comment/follow）
  const type = n.type || "other";
  const typeLabel = typeToLabel(type);

  // 表示メッセージ（messageが無い通知も崩れないように）
  const message = n.message || defaultMessage(type, fromName);

  const div = document.createElement("div");
  div.className = "notification-item";
  if (!isRead) div.classList.add("unread");
  div.dataset.type = type; // タブ実装時のフィルタ用

  div.innerHTML = `
    <img src="${avatar}" class="notification-avatar" alt="avatar">
    <div class="notification-body">
      <div class="notification-type">${typeLabel}${!isRead ? `<span class="unread-badge">未読</span>` : ""}</div>
      <div class="notification-message">${escapeHTML(message)}</div>
      <div class="notification-date">${createdAtStr}</div>
    </div>
    <div class="notification-right">
      <span class="notification-arrow">›</span>
    </div>
  `;

  div.addEventListener("click", async () => {
    // ① 既読化（未読なら）
    if (!isRead) {
      try {
        await updateDoc(doc(db, "notifications", notificationId), { isRead: true });
      } catch (e) {
        console.error("既読更新失敗:", e);
      }
    }

    // ② 遷移
    // - like/comment: postId があれば投稿詳細へ
    // - follow: user.html?uid=fromUid に飛ばすのが自然
    if ((type === "like" || type === "comment") && n.postId) {
      // 投稿詳細ページを作る前提（推奨）
      location.href = `post.html?postId=${encodeURIComponent(n.postId)}`;
      return;
    }

    if (type === "follow" && n.fromUid) {
      location.href = `user.html?uid=${encodeURIComponent(n.fromUid)}`;
      return;
    }

    // fallback: postIdがあるなら投稿へ、それも無いなら何もしない
    if (n.postId) {
      location.href = `post.html?postId=${encodeURIComponent(n.postId)}`;
    }
  });

  return div;
}

/* =========================
   Utils
========================= */
function toMillis(createdAt) {
  if (!createdAt) return 0;
  if (typeof createdAt?.toDate === "function") return createdAt.toDate().getTime(); // Timestamp
  if (createdAt instanceof Date) return createdAt.getTime(); // Date
  if (typeof createdAt === "number") return createdAt; // number
  const t = new Date(createdAt).getTime(); // string
  return Number.isFinite(t) ? t : 0;
}

function typeToLabel(type) {
  if (type === "like") return "♥ いいね";
  if (type === "comment") return "💬 コメント";
  if (type === "follow") return "➕ フォロー";
  return "🔔 通知";
}

function defaultMessage(type, fromName) {
  if (type === "like") return `${fromName} があなたの投稿にいいねしました`;
  if (type === "comment") return `${fromName} があなたの投稿にコメントしました`;
  if (type === "follow") return `${fromName} があなたをフォローしました`;
  return `${fromName} から通知があります`;
}

// XSS対策（通知メッセージがHTML混入しても崩れない）
function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
