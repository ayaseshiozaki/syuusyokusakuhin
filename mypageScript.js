// mypageScript.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc,
  collection, query, where, getDocs, updateDoc, deleteDoc
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

// Cloudinary 設定
const cloudName = "dr9giho8r";
const uploadPreset = "syusyokusakuhin";

// モーダル作成
const modal = document.createElement("div");
modal.className = "mypage-post-modal";
modal.innerHTML = `
  <div class="mypage-post-modal-content">
    <span class="mypage-post-modal-close">&times;</span>
    <div id="modal-post-content"></div>
  </div>
`;
document.body.appendChild(modal);
const modalContentEl = document.getElementById("modal-post-content");
const modalCloseBtn = modal.querySelector(".mypage-post-modal-close");
modalCloseBtn.addEventListener("click", () => {
  modal.style.display = "none";
  modalContentEl.innerHTML = "";
});

// 投稿一覧読み込み
async function loadMyPosts(uid) {
  const postsRef = collection(db, "posts");
  const postQuery = query(postsRef, where("uid", "==", uid));
  const postSnap = await getDocs(postQuery);

  postListEl.innerHTML = "";

  postSnap.forEach(docSnap => {
    const p = docSnap.data();
    const postId = docSnap.id;
    const item = document.createElement("div");
    item.className = "mypage-post-item";

    let createdAt = "";
    if (p.createdAt?.toDate) createdAt = p.createdAt.toDate().toLocaleString();
    else if (p.createdAt) createdAt = new Date(p.createdAt).toLocaleString();

    const hashtagsHTML = p.hashtags && Array.isArray(p.hashtags)
      ? `<div class="mypage-hashtags">${p.hashtags.map(tag => `<span class="mypage-hashtag">${tag}</span>`).join("")}</div>`
      : "";

    const ratings = p.rate ? `
      <div class="mypage-rating">
        <p>使いやすさ：★${p.rate.usability}</p>
        <p>金額：★${p.rate.price}</p>
        <p>性能：★${p.rate.performance}</p>
        <p>見た目：★${p.rate.design}</p>
        <p>買ってよかった：★${p.rate.satisfaction}</p>
        <p><b>総合評価：★${p.rate.average.toFixed(1)}</b></p>
      </div>
    ` : "";

    // 画像が無ければデフォルト画像を使用
    const imgURL = p.imageUrl ? p.imageUrl : "default-post.png";
    const imgHTML = `<img src="${imgURL}" class="mypage-post-img">`;
    const textHTML = p.text ? `<div class="mypage-post-text">${p.text}</div>` : "";

    item.innerHTML = `
      ${imgHTML}
      <div class="mypage-post-details">
        ${textHTML}
        ${hashtagsHTML}
        ${ratings}
        <div class="mypage-postDate">${createdAt}</div>
      </div>
    `;

    postListEl.appendChild(item);

    // クリックでモーダル展開
    const imgEl = item.querySelector(".mypage-post-img");
    if (imgEl) {
      imgEl.addEventListener("click", () => {
        modalContentEl.innerHTML = `
          <img src="${imgURL}">
          ${textHTML}
          ${hashtagsHTML}
          ${ratings}
          <div>
            <button id="modal-like-btn">♥ いいね</button>
            <span id="modal-like-count">${p.likes ?? 0}</span>
            <button id="modal-delete-btn">削除</button>
          </div>
          <div class="mypage-postDate">${createdAt}</div>
        `;
        modal.style.display = "flex";

        // いいね
        const likeBtn = document.getElementById("modal-like-btn");
        const likeCount = document.getElementById("modal-like-count");
        likeBtn.addEventListener("click", async () => {
          await updateDoc(doc(db, "posts", postId), { likes: (p.likes ?? 0) + 1 });
          likeCount.textContent = (p.likes ?? 0) + 1;
          p.likes = (p.likes ?? 0) + 1;
        });

        // 削除
        const deleteBtn = document.getElementById("modal-delete-btn");
        deleteBtn.addEventListener("click", async () => {
          if (confirm("この投稿を削除しますか？")) {
            await deleteDoc(doc(db, "posts", postId));
            modal.style.display = "none";
            await loadMyPosts(uid);
          }
        });
      });
    }
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

  // プロフィール画像表示（無ければ default.png）
  profileImgEl.src = data.profileImage || "default.png";
  nameEl.textContent = data.userName || data.email;
  followerEl.textContent = data.followers?.length || 0;
  followingEl.textContent = data.following?.length || 0;

  await loadMyPosts(uid);
});

// プロフィール画像変更
profileImgEl.addEventListener("click", () => {
  imageInput.click();
});

imageInput.addEventListener("change", async () => {
  const file = imageInput.files[0];
  if (!file) return;

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", uploadPreset);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body: formData
    });

    if (!res.ok) throw new Error("画像アップロード失敗");

    const data = await res.json();
    const imageUrl = data.secure_url;

    const user = auth.currentUser;
    const userRef = doc(db, "users", user.uid);
    await updateDoc(userRef, { profileImage: imageUrl });

    profileImgEl.src = imageUrl;

  } catch (err) {
    console.error(err);
    alert("プロフィール画像の更新に失敗しました：" + err.message);
  }
});
