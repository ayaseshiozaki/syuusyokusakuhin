import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getFirestore, collection, query, onSnapshot, orderBy } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// Firebase 初期化（ホーム・投稿ページと同じ）
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

const kensakuBtn = document.getElementById("kensakuBtn");
const kensakuInput = document.getElementById("kensakuInput");
const kensakuList = document.getElementById("kensakuList");

kensakuBtn.addEventListener("click", async () => {
  const keyword = kensakuInput.value.trim().toLowerCase();
  if (!keyword) return;

  kensakuList.innerHTML = "";

  // Firestore の投稿を全件取得してフィルター
  const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snapshot) => {
    kensakuList.innerHTML = "";

    snapshot.forEach(docSnap => {
      const p = docSnap.data();
      const textLower = p.text.toLowerCase();
      const hashtagsLower = p.hashtags ? p.hashtags.toLowerCase() : "";

      if (textLower.includes(keyword) || hashtagsLower.includes(keyword)) {
        const postDiv = document.createElement("div");
        postDiv.classList.add("toukou-post");
        postDiv.innerHTML = `
          <h3>${p.username}</h3>
          <p>${p.text}</p>
          ${p.imageUrl ? `<img src="${p.imageUrl}" class="toukou-postImage">` : ""}
          ${p.hashtags ? `<p class="hashtags">${p.hashtags}</p>` : ""}
          <div class="toukou-postDate">${p.createdAt.toDate ? p.createdAt.toDate().toLocaleString() : new Date(p.createdAt).toLocaleString()}</div>
          <hr>
        `;
        kensakuList.appendChild(postDiv);
      }
    });
  });
});
