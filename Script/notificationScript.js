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
  const q = query(
    collection(db, "notifications"),
    where("toUid", "==", uid),
    orderBy("createdAt", "desc")
  );

  onSnapshot(q, async (snapshot) => {
    listEl.innerHTML = "";

    if (snapshot.empty) {
      listEl.innerHTML = "<p>通知はありません</p>";
      return;
    }

    for (const docSnap of snapshot.docs) {
      const n = docSnap.data();
      const item = await createNotificationItem(docSnap.id, n);
      listEl.appendChild(item);
    }
  });
}

async function createNotificationItem(notificationId, n) {
  let avatar = "default.png";

  try {
    const userSnap = await getDoc(doc(db, "users", n.fromUid));
    if (userSnap.exists()) {
      avatar = userSnap.data().profileImage || avatar;
    }
  } catch {}

  const div = document.createElement("div");
  div.className = "notification-item";
  if (!n.isRead) div.classList.add("unread");

  div.innerHTML = `
    <img src="${avatar}" class="notification-avatar">
    <div class="notification-body">
      <div class="notification-message">${n.message}</div>
      <div class="notification-date">
        ${n.createdAt?.toDate?.().toLocaleString() || ""}
      </div>
    </div>
    ${!n.isRead ? `<span class="unread-badge">未読</span>` : ""}
  `;

  div.addEventListener("click", async () => {
    if (!n.isRead) {
      await updateDoc(doc(db, "notifications", notificationId), {
        isRead: true
      });
    }

    if (n.postId) {
      location.href = `index.html#post-${n.postId}`;
    }
  });

  return div;
}
