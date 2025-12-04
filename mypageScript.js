import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, query, where,
  updateDoc, deleteDoc, onSnapshot, addDoc, orderBy
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// Firebase 初期化
const firebaseConfig = {
  apiKey: "AIzaSyA6SrMiN07ayxh4HDx6cG_YM0Q2mIdZ07U",
  authDomain: "syuusyokusakuhin.firebaseapp.com",
  projectId: "syuusyokusakuhin",
  storageBucket: "syuusyokusakuhin.firebasestorage.app",
  messagingSenderId: "317507460420",
  appId: "1:317507460420:web:9c85808af034a1133d8b11"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// HTML 要素
const profileImgEl = document.getElementById("mypage-profileImage");
const nameEl = document.getElementById("mypage-userName");
const followerEl = document.getElementById("mypage-followerCount");
const followingEl = document.getElementById("mypage-followingCount");
const postListEl = document.getElementById("mypage-postList");
const imageInput = document.getElementById("mypage-imageInput");

const editNameBtn = document.getElementById("editNameBtn");
const editNameBox = document.getElementById("editNameBox");
const nameInput = document.getElementById("nameInput");
const saveNameBtn = document.getElementById("saveNameBtn");

// 投稿読み込み（リアルタイム）
async function loadMyPosts(uid) {
  const postsRef = collection(db, "posts");
  const q = query(postsRef, where("uid", "==", uid));

  onSnapshot(q, (snapshot) => {
    postListEl.innerHTML = "";

    snapshot.forEach((docSnap) => {
      const p = docSnap.data();
      const postId = docSnap.id;
      renderPostItem(p, postId, uid);
    });
  });
}

// 1投稿描画
function renderPostItem(p, postId, uid) {
  const imgURL = p.imageUrl || "default-post.png";
  const createdAt = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleString() : "";

  const item = document.createElement("div");
  item.className = "mypage-post-item";
  item.innerHTML = `
    <img src="${imgURL}" class="mypage-post-img">

    <div class="mypage-post-details">
      ${p.itemName ? `<div class="mypage-post-itemName">アイテム名: ${p.itemName}</div>` : ""}
      ${p.text ? `<div class="mypage-post-text">${p.text}</div>` : ""}
      ${Array.isArray(p.hashtags) && p.hashtags.length ? `<div class="mypage-hashtags">${p.hashtags.map(tag => `<span class="mypage-hashtag">${tag.startsWith('#') ? tag : `#${tag}`}</span>`).join(" ")}</div>` : ""}
      ${p.rate ? `<div class="mypage-rating">
        <p>使いやすさ：★${p.rate.usability}</p>
        <p>金額：★${p.rate.price}</p>
        <p>性能：★${p.rate.performance}</p>
        <p>見た目：★${p.rate.design}</p>
        <p>買ってよかった：★${p.rate.satisfaction}</p>
        <p><b>総合評価：★${p.rate.average.toFixed(1)}</b></p>
      </div>` : ""}
      <div class="mypage-postDate">${createdAt}</div>
      <button class="post-btn like">♥ いいね (${p.likes ?? 0})</button>
      <button class="post-btn delete">削除</button>

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
  setupDelete(item, postId, uid);
  setupCommentSend(item, postId, uid);
  loadComments(postId);
}

// いいね処理
function setupLike(item, postId, p) {
  const likeBtn = item.querySelector(".post-btn.like");

  likeBtn.addEventListener("click", async () => {
    const newLike = (p.likes ?? 0) + 1;
    await updateDoc(doc(db, "posts", postId), { likes: newLike });
    p.likes = newLike;
    likeBtn.textContent = `♥ いいね (${newLike})`;
  });
}

// 削除処理
function setupDelete(item, postId) {
  const deleteBtn = item.querySelector(".post-btn.delete");

  deleteBtn.addEventListener("click", async () => {
    if (!confirm("この投稿を削除しますか？")) return;
    await deleteDoc(doc(db, "posts", postId));
  });
}

// コメント送信
function setupCommentSend(item, postId, uid) {
  const input = item.querySelector(`#input-${postId}`);
  const btn = item.querySelector(`#send-${postId}`);

  btn.addEventListener("click", async () => {
    const text = input.value.trim();
    if (!text) return;

    const userSnap = await getDoc(doc(db, "users", uid));
    const u = userSnap.data();

    await addDoc(collection(db, "posts", postId, "comments"), {
      uid,
      text,
      userName: u.userName || u.email,
      createdAt: new Date()
    });

    input.value = "";
  });
}

// コメント読み込み（名前だけ表示）
function loadComments(postId) {
  const listEl = document.getElementById(`comment-list-${postId}`);
  const commentsRef = collection(db, "posts", postId, "comments");
  const q = query(commentsRef, orderBy("createdAt", "asc"));

  onSnapshot(q, (snapshot) => {
    listEl.innerHTML = "";

    snapshot.forEach((cdoc) => {
      const c = cdoc.data();

      const wrap = document.createElement("div");
      wrap.className = "comment-item";

      wrap.innerHTML = `
        <div class="comment-body">
          <div class="comment-name">${c.userName || "名無しさん"}</div>
          <div class="comment-text">${c.text}</div>
        </div>
      `;
      listEl.appendChild(wrap);
    });
  });
}

// ログインチェック
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("ログインしてください");
    window.location.href = "loginpage.html";
    return;
  }

  const uid = user.uid;
  const userRef = doc(db, "users", uid);
  let snap = await getDoc(userRef);

  if (!snap.exists()) {
    await setDoc(userRef, {
      uid,
      email: user.email || "",
      userName: "",
      profileImage: "",
      followers: [],
      following: [],
      createdAt: new Date()
    });
    snap = await getDoc(userRef);
  }

  const data = snap.data();

  profileImgEl.src = data.profileImage || "default.png";
  nameEl.textContent = data.userName || data.email;
  followerEl.textContent = data.followers?.length || 0;
  followingEl.textContent = data.following?.length || 0;

  localStorage.setItem("photoFeedUserName", data.userName || data.email);

  await loadMyPosts(uid);
});

// 名前変更
editNameBtn.addEventListener("click", () => editNameBox.classList.toggle("hidden"));

saveNameBtn.addEventListener("click", async () => {
  const newName = nameInput.value.trim();
  if (!newName) {
    alert("名前を入力してください");
    return;
  }

  const user = auth.currentUser;
  const userRef = doc(db, "users", user.uid);

  await updateDoc(userRef, { userName: newName });
  nameEl.textContent = newName;
  editNameBox.classList.add("hidden");
  localStorage.setItem("photoFeedUserName", newName);
});

// プロフィール画像変更
profileImgEl.addEventListener("click", () => imageInput.click());

imageInput.addEventListener("change", async () => {
  const file = imageInput.files[0];
  if (!file) return;

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "syusyokusakuhin");

    const res = await fetch(`https://api.cloudinary.com/v1_1/dr9giho8r/image/upload`, {
      method: "POST",
      body: formData
    });

    if (!res.ok) throw new Error("アップロード失敗");

    const data = await res.json();
    const imageUrl = data.secure_url;

    const user = auth.currentUser;
    const userRef = doc(db, "users", user.uid);

    await updateDoc(userRef, { profileImage: imageUrl });
    profileImgEl.src = imageUrl;

  } catch (err) {
    console.error(err);
    alert("プロフィール画像更新失敗：" + err.message);
  }
});
