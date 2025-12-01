// kensakuScript.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { 
  getFirestore, collection, query, orderBy, onSnapshot, doc, getDoc 
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
    const textMatch = post.text?.toLowerCase().includes(keyword);
    return usernameMatch || hashtagsMatch || textMatch;
  });

  renderResults(filtered);
}

// 投稿をレンダリングする関数
async function renderResults(posts) {
  searchResults.innerHTML = "";

  if (posts.length === 0) {
    searchResults.innerHTML = "<p>該当する投稿はありません。</p>";
    return;
  }

  for (const p of posts) {
    // ユーザー情報取得
    let userIcon = "default.png";
    try {
      const userSnap = await getDoc(doc(db, "users", p.uid));
      if (userSnap.exists()) {
        const userData = userSnap.data();
        userIcon = userData.profileImage || "default.png";
      }
    } catch (err) {
      console.error("ユーザー情報取得エラー:", err);
    }

    // 評価表示
    const ratings = p.rate ? `
      <div class="kensaku-rating">
        <p>使いやすさ：★${p.rate.usability}</p>
        <p>金額：★${p.rate.price}</p>
        <p>性能：★${p.rate.performance}</p>
        <p>見た目：★${p.rate.design}</p>
        <p>買ってよかった：★${p.rate.satisfaction}</p>
        <p><b>総合評価：★${p.rate.average.toFixed(1)}</b></p>
      </div>
    ` : "";

    // ハッシュタグ
    const hashtagsHTML = p.hashtags?.length
      ? `<div class="kensaku-hashtags">
          ${p.hashtags.map(tag => `<span class="kensaku-hashtag" data-tag="${tag}">${tag}</span>`).join(" ")}
        </div>`
      : "";

    const postDiv = document.createElement("div");
    postDiv.classList.add("kensaku-post");

    let createdAt = "";
    if (p.createdAt?.toDate) createdAt = p.createdAt.toDate().toLocaleString();
    else if (p.createdAt) createdAt = new Date(p.createdAt).toLocaleString();

    postDiv.innerHTML = `
      <div class="home-post-header">
        <img src="${userIcon}" class="home-post-icon" alt="ユーザーアイコン">
        <span class="home-username">${p.username || "名無し"}</span>
      </div>
      <p>${p.text || ""}</p>
      ${p.imageUrl ? `<img src="${p.imageUrl}" class="kensaku-postImage">` : ""}
      ${hashtagsHTML}
      ${ratings}
      <div class="home-postDate">${createdAt}</div>
      <hr>
    `;

    searchResults.appendChild(postDiv);
  }

  // ハッシュタグクリックで再検索
  document.querySelectorAll(".kensaku-hashtag").forEach(tagEl => {
    tagEl.addEventListener("click", () => {
      const tag = tagEl.dataset.tag;
      searchInput.value = tag;
      searchPosts(tag.toLowerCase());
    });
  });
}
