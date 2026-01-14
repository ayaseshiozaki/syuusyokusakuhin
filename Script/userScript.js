// userPageScript.js

// ===== Firebase 読み込み =====
import { auth, db } from "./firebaseInit.js"; // Firebase 初期化を共通化
import { doc, getDoc, collection, query, where, updateDoc, onSnapshot, orderBy, arrayUnion, arrayRemove, addDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { createNotification } from "./notificationUtils.js";

// ===== HTML 要素取得 =====
const userInfoEl = document.querySelector(".user-container");
const postListEl = document.querySelector(".user-post-list");

// ===== URLからuid取得 =====
const params = new URLSearchParams(window.location.search);
const targetUid = params.get("uid");

if (!targetUid) {
  alert("ユーザーが見つかりません");
  window.location.href = "homepage.html";
}

// ===== ユーザー情報読み込み =====
async function loadUserInfo(currentUid) {
  const userRef = doc(db, "users", targetUid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    alert("ユーザーが存在しません");
    return;
  }

  const data = snap.data();

  // --- HTML書き換え ---
  userInfoEl.querySelector(".user-profile-img").src = data.profileImage || "default.png";
  userInfoEl.querySelector(".user-username").textContent = data.userName || data.email;
  userInfoEl.querySelector(".user-intro").textContent = data.intro || "自己紹介なし";
  userInfoEl.querySelector(".count-follow").textContent = data.following?.length || 0;
  userInfoEl.querySelector(".count-follower").textContent = data.followers?.length || 0;

  // フォローボタン設定
  const followBtn = userInfoEl.querySelector(".followBtn");

  if (targetUid === currentUid) {
    followBtn.style.display = "none"; // 自分のページは非表示
    return;
  }

  let isFollowing = data.followers?.includes(currentUid);
  followBtn.textContent = isFollowing ? "フォロー中" : "フォロー";

  followBtn.addEventListener("click", async () => {
    const currentRef = doc(db, "users", currentUid);

    if (isFollowing) {
      await updateDoc(currentRef, { following: arrayRemove(targetUid) });
      await updateDoc(userRef, { followers: arrayRemove(currentUid) });
      followBtn.textContent = "フォロー";
      isFollowing = false;
    } else {
      await updateDoc(currentRef, { following: arrayUnion(targetUid) });
      await updateDoc(userRef, { followers: arrayUnion(currentUid) });
      followBtn.textContent = "フォロー中";
      isFollowing = true;
    }

    // フォローカウント更新
    const snap2 = await getDoc(userRef);
    const data2 = snap2.data();
    userInfoEl.querySelector(".count-follower").textContent = data2.followers?.length || 0;
  });
}

// ===== 投稿読み込み =====
function loadUserPosts(currentUid) {
  const postsRef = collection(db, "posts");
  const q = query(postsRef, where("uid", "==", targetUid), orderBy("createdAt", "desc"));

  onSnapshot(q, (snapshot) => {
    postListEl.innerHTML = "";

    snapshot.forEach((docSnap) => {
      const p = docSnap.data();
      const postId = docSnap.id;
      renderPostItem(p, postId, currentUid);
    });
  });
}

// ===== 投稿表示（ホームデザイン統一 + モーダル機能付き） =====
function renderPostItem(p, postId, currentUid) {
  const imgURL = p.imageUrl || "default-post.png";
  const createdAt = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleString() : "";

  const item = document.createElement("div");
  item.className = "user-post-item";

  item.innerHTML = `
    <img src="${imgURL}" class="user-post-img" style="cursor:pointer">
    <div class="user-post-details">
      ${p.itemName ? `<div class="user-post-itemName">アイテム名: ${p.itemName}</div>` : ""}
      ${p.text ? `<div class="user-post-text">${p.text}</div>` : ""}
      ${Array.isArray(p.hashtags) && p.hashtags.length ? `
        <div class="user-hashtags">
          ${p.hashtags.map(tag => `<span class="user-hashtag">${tag.startsWith("#") ? tag : `#${tag}`}</span>`).join(" ")}
        </div>
      ` : ""}
      ${p.rate ? `
        <div class="user-rating">
          <p>使いやすさ：★${p.rate.usability}</p>
          <p>金額：★${p.rate.price}</p>
          <p>性能：★${p.rate.performance}</p>
          <p>見た目：★${p.rate.design}</p>
          <p>買ってよかった：★${p.rate.satisfaction}</p>
          <p><b>総合評価：★${p.rate.average.toFixed(1)}</b></p>
        </div>
      ` : ""}
      <div class="user-postDate">${createdAt}</div>
      <button class="post-btn like">♥ いいね (${p.likes ?? 0})</button>
      <div class="follow-container"></div>
      <div class="comment-box">
        <div class="comment-list" id="comment-list-${postId}"></div>
        <div class="commentInputBox">
          <input type="text" placeholder="コメントを追加" id="input-${postId}">
          <button id="send-${postId}">送信</button>
        </div>
      </div>
    </div>
  `;

  postListEl.appendChild(item);

  setupLike(item, postId, p);
  setupCommentSend(item, postId, currentUid);
  loadComments(postId);
  setupFollowButton(item, p.uid, currentUid);

  // ===== モーダル機能追加 =====
  const imgEl = item.querySelector(".user-post-img");
  imgEl.addEventListener("click", () => {
    openImageModal(imgURL);
  });
}

// ===== 画像モーダル作成（×ボタン付き） =====
function openImageModal(imgURL) {
  let existingModal = document.getElementById("image-modal");
  if (existingModal) existingModal.remove();

  const modal = document.createElement("div");
  modal.id = "image-modal";
  modal.style.position = "fixed";
  modal.style.top = "0";
  modal.style.left = "0";
  modal.style.width = "100vw";
  modal.style.height = "100vh";
  modal.style.backgroundColor = "rgba(0,0,0,0.8)";
  modal.style.display = "flex";
  modal.style.justifyContent = "center";
  modal.style.alignItems = "center";
  modal.style.zIndex = "1000";

  // 画像
  const img = document.createElement("img");
  img.src = imgURL;
  img.style.maxWidth = "90%";
  img.style.maxHeight = "90%";
  img.style.borderRadius = "12px";
  img.style.boxShadow = "0 4px 20px rgba(0,0,0,0.5)";
  img.style.cursor = "default";

  // ×ボタン
  const closeBtn = document.createElement("span");
  closeBtn.innerHTML = "&times;";
  closeBtn.style.position = "fixed";
  closeBtn.style.top = "20px";
  closeBtn.style.right = "30px";
  closeBtn.style.color = "#fff";
  closeBtn.style.fontSize = "40px";
  closeBtn.style.fontWeight = "bold";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.zIndex = "1100";

  closeBtn.addEventListener("click", () => {
    modal.remove();
  });

  modal.appendChild(img);
  modal.appendChild(closeBtn);

  // 背景クリックで閉じる
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });

  document.body.appendChild(modal);
}

// ===== いいね =====
function setupLike(item, postId, p) {
  const btn = item.querySelector(".post-btn.like");

  btn.addEventListener("click", async () => {
    try {
      const newLike = (p.likes ?? 0) + 1;

      await updateDoc(doc(db, "posts", postId), { likes: newLike });
      p.likes = newLike;
      btn.textContent = `♥ いいね (${newLike})`;

      await createNotification({
        toUid: p.uid,
        fromUid: auth.currentUser.uid,
        type: "like",
        postId,
        message: "あなたの投稿にいいねされました"
      });

    } catch (err) {
      console.error("いいねエラー:", err);
    }
  });
}

// ===========================
// コメント送信（通知付き）
// ===========================
function setupCommentSend(item, postId, uid) {
  const input = item.querySelector(`#input-${postId}`);
  const btn = item.querySelector(`#send-${postId}`);
  if (!input || !btn) return;

  btn.addEventListener("click", async () => {
    const text = input.value.trim();
    if (!text) return;

    try {
      const userSnap = await getDoc(doc(db, "users", uid));
      const u = userSnap.data();

      await addDoc(collection(db, "posts", postId, "comments"), {
        uid,
        text,
        userName: u.userName || u.email,
        profileImage: u.profileImage || "default.png",
        createdAt: new Date()
      });

      input.value = "";

      const postSnap = await getDoc(doc(db, "posts", postId));
      if (postSnap.exists()) {
        const postData = postSnap.data();
        if (postData.uid && postData.uid !== auth.currentUser.uid) {
          await createNotification({
            toUid: postData.uid,
            fromUid: auth.currentUser.uid,
            type: "comment",
            postId: postId,
            message: `${u.userName || "誰か"}があなたの投稿にコメントしました`
          });
        }
      }
    } catch (err) {
      console.error("コメント送信エラー:", err);
    }
  });
}

// ===========================
// コメント読み込み
// ===========================
function loadComments(postId) {
  const listEl = document.getElementById(`comment-list-${postId}`);
  if (!listEl) return;

  const commentsRef = collection(db, "posts", postId, "comments");
  const q = query(commentsRef, orderBy("createdAt", "asc"));

  onSnapshot(q, async (snapshot) => {
    listEl.innerHTML = "";

    const commentPromises = snapshot.docs.map(async (cdoc) => {
      const c = cdoc.data();

      let cUserIcon = "default.png";
      let cUserName = c.userName || "名無しさん";

      if (c.uid) {
        try {
          const cUserSnap = await getDoc(doc(db, "users", c.uid));
          if (cUserSnap.exists()) {
            const cu = cUserSnap.data();
            cUserIcon = cu.profileImage || cUserIcon;
            cUserName = cu.userName || cUserName;
          }
        } catch (err) {
          console.error("コメントユーザー取得エラー:", err);
        }
      }

      const wrap = document.createElement("div");
      wrap.className = "comment-item";
      wrap.innerHTML = `
        <img src="${cUserIcon}" class="comment-icon" style="width:28px;height:28px;border-radius:50%;margin-right:6px;">
        <div class="comment-body">
          <div class="comment-name">${cUserName}</div>
          <div class="comment-text">${c.text}</div>
        </div>
      `;
      return wrap;
    });

    const commentElements = await Promise.all(commentPromises);
    commentElements.forEach(el => listEl.appendChild(el));
  });
}

// ===== 投稿内フォローボタン =====
async function setupFollowButton(item, postedUid, currentUid) {
  if (postedUid === currentUid) return;

  const container = item.querySelector(".follow-container");
  const userRef = doc(db, "users", postedUid);
  const currentRef = doc(db, "users", currentUid);

  let isFollowing = false;
  const snap = await getDoc(userRef);
  if (snap.exists()) {
    const u = snap.data();
    isFollowing = u.followers?.includes(currentUid);
  }

  const btn = document.createElement("button");
  btn.className = "post-btn followBtn";
  btn.textContent = isFollowing ? "フォロー中" : "フォロー";
  container.appendChild(btn);

  btn.addEventListener("click", async () => {
    if (isFollowing) {
      await updateDoc(currentRef, { following: arrayRemove(postedUid) });
      await updateDoc(userRef, { followers: arrayRemove(currentUid) });
      btn.textContent = "フォロー";
      isFollowing = false;
    } else {
      await updateDoc(currentRef, { following: arrayUnion(postedUid) });
      await updateDoc(userRef, { followers: arrayUnion(currentUid) });
      btn.textContent = "フォロー中";
      isFollowing = true;
    }
  });
}

// ===== ログインチェック =====
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("ログインしてください");
    window.location.href = "loginpage.html";
    return;
  }

  const currentUid = user.uid;
  await loadUserInfo(currentUid);
  loadUserPosts(currentUid);
});
