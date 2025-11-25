import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getFirestore, collection, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

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

const searchInput = document.getElementById("kensakuInput");
const searchBtn = document.getElementById("kensakuBtn");
const searchResults = document.getElementById("kensakuResults");

// Firestore から全投稿を取得してローカルでフィルター
const postsRef = collection(db, "posts");
let allPosts = [];

onSnapshot(query(postsRef, orderBy("createdAt", "desc")), snapshot => {
  allPosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  renderResults(allPosts);
});

// 検索ボタン
searchBtn.addEventListener("click", () => {
  searchPosts(searchInput.value.trim().toLowerCase());
});

// 投稿検索関数
function searchPosts(keyword) {
  if (!keyword) {
    renderResults(allPosts);
    return;
  }

  const filtered = allPosts.filter(post => {
    const usernameMatch = post.username.toLowerCase().includes(keyword);
    const hashtagsMatch = post.hashtags?.some(tag => tag.toLowerCase().includes(keyword));
    return usernameMatch || hashtagsMatch;
  });

  renderResults(filtered);
}

// 投稿をレンダリングする関数
function renderResults(posts) {
  searchResults.innerHTML = "";

  if (posts.length === 0) {
    searchResults.innerHTML = "<p>該当する投稿はありません。</p>";
    return;
  }

  posts.forEach(p => {
    const hashtagsHTML = p.hashtags
      ? `<div class="kensaku-hashtags">
          ${p.hashtags.map(tag => `<span class="kensaku-hashtag" data-tag="${tag}">${tag}</span>`).join(" ")}
        </div>`
      : "";

    const postDiv = document.createElement("div");
    postDiv.classList.add("kensaku-post");
    postDiv.innerHTML = `
      <h3>${p.username}</h3>
      <p>${p.text}</p>
      ${hashtagsHTML}
      ${p.imageUrl ? `<img src="${p.imageUrl}" class="kensaku-postImage">` : ""}
      <div class="kensaku-postDate">${p.createdAt.toDate ? p.createdAt.toDate().toLocaleString() : new Date(p.createdAt).toLocaleString()}</div>
      <hr>
    `;
    searchResults.appendChild(postDiv);
  });

  // ハッシュタグクリックで再検索
  document.querySelectorAll(".kensaku-hashtag").forEach(tagEl => {
    tagEl.addEventListener("click", () => {
      const tag = tagEl.dataset.tag;
      searchInput.value = tag;
      searchPosts(tag.toLowerCase());
    });
  });
}
