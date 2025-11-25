import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getFirestore, collection, query, orderBy, onSnapshot, updateDoc, doc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

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
onSnapshot(q, (snapshot) => {
  const list = document.getElementById("homePostList");
  list.innerHTML = "";

  snapshot.forEach(docSnap => {
    const p = docSnap.data();
    const postId = docSnap.id;

    const postDiv = document.createElement("div");
    postDiv.classList.add("toukou-post"); // 投稿ページと同じスタイル使える
    postDiv.innerHTML = `
      <h3>${p.username}</h3>
      <p>${p.text}</p>
      ${p.imageUrl ? `<img src="${p.imageUrl}" class="toukou-postImage">` : ""}
      ${p.hashtags ? `<p class="hashtags">${p.hashtags}</p>` : ""}
      <div>
        <button class="toukou-likeBtn">♥ いいね</button>
        <span class="toukou-likeCount">${p.likes}</span>
      </div>
      <div class="toukou-postDate">${p.createdAt.toDate ? p.createdAt.toDate().toLocaleString() : new Date(p.createdAt).toLocaleString()}</div>
      <hr>
    `;
    list.appendChild(postDiv);

    // いいねボタン
    const likeBtn = postDiv.querySelector(".toukou-likeBtn");
    likeBtn.addEventListener("click", async () => {
      await updateDoc(doc(db, "posts", postId), {
        likes: p.likes + 1
      });
    });
  });
});
