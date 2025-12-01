// homeScript.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getFirestore, collection, query, orderBy, onSnapshot, updateDoc, doc, getDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

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

// 投稿一覧リアルタイム表示
const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));

onSnapshot(q, async (snapshot) => {
  const list = document.getElementById("homePostList");
  list.innerHTML = "";

  for (const docSnap of snapshot.docs) {
    const p = docSnap.data();
    const postId = docSnap.id;

    // 作成日時
    let createdAt = "";
    if (p.createdAt?.toDate) createdAt = p.createdAt.toDate().toLocaleString();
    else if (p.createdAt) createdAt = new Date(p.createdAt).toLocaleString();

    // ハッシュタグ
    const hashtagsHTML =
      p.hashtags && Array.isArray(p.hashtags)
        ? `<div class="home-hashtags">
            ${p.hashtags.map(tag => `<span class="home-hashtag">${tag}</span>`).join("")}
          </div>`
        : "";

    // 評価
    let ratingHTML = "";
    if (p.rate) {
      ratingHTML = `
        <div class="home-rating">
          <p>使いやすさ：★${p.rate.usability}</p>
          <p>金額：★${p.rate.price}</p>
          <p>性能：★${p.rate.performance}</p>
          <p>見た目：★${p.rate.design}</p>
          <p>買ってよかった：★${p.rate.satisfaction}</p>
          <p><b>総合評価：★${p.rate.average.toFixed(1)}</b></p>
        </div>
      `;
    }

    // --- ユーザーアイコン取得 ---
    let userIconUrl = "default.png"; // デフォルトアイコン
    try {
      const userSnap = await getDoc(doc(db, "users", p.uid));
      if (userSnap.exists()) {
        userIconUrl = userSnap.data().profileImage || "default.png";
      }
    } catch (err) {
      console.error("ユーザーアイコン取得エラー:", err);
    }

    // 投稿カード作成
    const postDiv = document.createElement("div");
    postDiv.classList.add("home-post");
    postDiv.innerHTML = `
      <div class="home-post-header">
        <img src="${userIconUrl}" class="home-post-icon">
        <h3 class="home-username">${p.username ?? "名無し"}</h3>
      </div>

      <p class="home-text">${p.text ?? ""}</p>

      ${hashtagsHTML}
      ${ratingHTML}

      ${p.imageUrl ? `<img src="${p.imageUrl}" class="home-postImage">` : ""}

      <div class="home-likeArea">
        <button class="home-likeBtn">♥ いいね</button>
        <span class="home-likeCount">${p.likes ?? 0}</span>
      </div>

      <div class="home-postDate">${createdAt}</div>
    `;

    list.appendChild(postDiv);

    // いいね処理
    const likeBtn = postDiv.querySelector(".home-likeBtn");
    likeBtn.addEventListener("click", async () => {
      await updateDoc(doc(db, "posts", postId), {
        likes: (p.likes ?? 0) + 1
      });
    });
  }
});
