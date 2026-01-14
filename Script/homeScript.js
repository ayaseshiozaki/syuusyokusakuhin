// homeScript.js
import { db, auth } from "./firebaseInit.js"; // Firebase初期化済み
import {
  collection, query, orderBy, onSnapshot,
  doc, getDoc, updateDoc, arrayUnion, arrayRemove, addDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { createNotification } from "./notificationUtils.js";

const homeFeed = document.querySelector(".home-feed");

// ==============================
// ログイン確認
// ==============================
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  loadPosts();
  setupImageModal(); // モーダル初期セット
});

// ==============================
// 投稿読み込み
// ==============================
function loadPosts() {
  const postsRef = collection(db, "posts");
  const q = query(postsRef, orderBy("createdAt", "desc"));
  onSnapshot(q, async (snapshot) => {
    const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderPosts(posts);
    setupStaticAICheckButtons();
  });
}

// ==============================
// 投稿描画
// ==============================
async function renderPosts(posts) {
  homeFeed.innerHTML = "";

  for (const p of posts) {
    let userIcon = "default.png";
    let userName = "名無し";

    try {
      if (p.uid) {
        const userSnap = await getDoc(doc(db, "users", p.uid));
        if (userSnap.exists()) {
          const u = userSnap.data();
          userIcon = u.profileImage || "default.png";
          userName = u.userName || "名無し";
        }
      }
    } catch (err) {
      console.error("ユーザー情報取得エラー:", err);
    }

    const ratingsHTML = p.rate ? `
      <div class="home-rating">
        <p>使いやすさ：★${p.rate.usability}</p>
        <p>金額：★${p.rate.price}</p>
        <p>性能：★${p.rate.performance}</p>
        <p>見た目：★${p.rate.design}</p>
        <p>買ってよかった：★${p.rate.satisfaction}</p>
        <p><b>総合評価：★${p.rate.average.toFixed(1)}</b></p>
      </div>` : "";

    const hashtagsHTML = p.hashtags?.length ? `
      <div class="home-hashtags">
        ${p.hashtags.map(tag => `<span class="home-hashtag">${tag.startsWith('#') ? tag : `#${tag}`}</span>`).join(" ")}
      </div>` : "";

// 商品情報（価格・購入URL）
const productInfoHTML = `
  ${p.productPrice ? `<div class="home-price">価格: ¥${p.productPrice}</div>` : ""}
  ${p.productURL ? `<button class="home-buy-btn">🛒購入ページへ</button>` : ""}
`;

let createdAt = "";
if (p.createdAt?.toDate) createdAt = p.createdAt.toDate().toLocaleString();
else if (p.createdAt) createdAt = new Date(p.createdAt).toLocaleString();

const postDiv = document.createElement("div");
postDiv.classList.add("home-post");
postDiv.innerHTML = `
  <div class="home-post-header">
    <img src="${userIcon}" class="home-post-icon user-link" data-uid="${p.uid}">
    <span class="home-username user-link" data-uid="${p.uid}">${userName}</span>
  </div>

  ${p.itemName ? `<div class="home-itemName">アイテム名: ${p.itemName}</div>` : ""}
  <p class="home-text">${p.text || ""}</p>
  ${productInfoHTML} <!-- 商品情報 -->
  ${p.imageUrl ? `<img src="${p.imageUrl}" class="home-postImage">` : ""}
  ${hashtagsHTML}
  ${ratingsHTML}

  <div class="home-postDate">${createdAt}</div>

  <button type="button" class="btn-like">♥ いいね (${p.likes ?? 0})</button>
  <button type="button" class="btn-favorite">☆ お気に入り</button>
  <button type="button" class="btn-ai-check">サクラ判定</button>
  <div class="ai-check-result">${p.aiChecked ? `⚠ 可能性: ${Math.round((p.aiProbability||0)*100)}%` : ""}</div>

  <button type="button" class="btn-show-comment">コメント</button>
  <div class="follow-container"></div>

  <div class="comment-box" style="display:none;">
    <div class="comment-list"></div>
    <div class="commentInputBox">
      <input type="text" placeholder="コメントを入力">
      <button type="button" class="btn-send-comment">送信</button>
    </div>
  </div>
`;
homeFeed.appendChild(postDiv);

// 購入ページボタンにクリックイベントを追加
if (p.productURL) {
  const buyBtn = postDiv.querySelector(".home-buy-btn");
  buyBtn.addEventListener("click", () => {
    window.open(p.productURL, "_blank");
  });
}

    // ユーザーリンク
    postDiv.querySelectorAll(".user-link").forEach(el => {
      const uid = el.dataset.uid;
      if (!uid || uid === auth.currentUser.uid) return;
      el.style.cursor = "pointer";
      el.addEventListener("click", () => window.location.href = `user.html?uid=${uid}`);
    });

    // いいね（通知付き）
    setupLikeButton(postDiv, p);

    // お気に入り
    setupFavoriteButton(postDiv, p.id);

    // フォロー
    setupFollowButton(postDiv, p.uid);

    // コメント機能
    setupCommentSection(postDiv, p);

    // AI判定
    setupAIButton(postDiv, p);
  } // for posts
}
// ==============================
// いいねボタン処理（通知付き）
// ==============================
async function setupLikeButton(postDiv, p) {
  const likeBtn = postDiv.querySelector(".btn-like");
  let likes = p.likes ?? 0;
  let isProcessing = false;

  likeBtn.addEventListener("click", async () => {
    if (isProcessing) return;
    isProcessing = true;
    try {
      likes++;
      likeBtn.textContent = `♥ いいね (${likes})`;
      await updateDoc(doc(db, "posts", p.id), { likes });
      if (p.uid !== auth.currentUser.uid) {
        await createNotification({
          toUid: p.uid,
          fromUid: auth.currentUser.uid,
          type: "like",
          postId: p.id,
          message: "あなたの投稿にいいねされました"
        });
      }
    } catch (err) {
      console.error("いいねエラー:", err);
    }
    isProcessing = false;
  });
}

// ==============================
// コメント処理
// ==============================
async function setupCommentSection(postDiv, p) {
  const btnShowComment = postDiv.querySelector(".btn-show-comment");
  const commentBox = postDiv.querySelector(".comment-box");
  const commentList = postDiv.querySelector(".comment-list");
  const commentsRef = collection(db, "posts", p.id, "comments");

  // コメント表示切替
  btnShowComment.addEventListener("click", () => {
    commentBox.style.display = commentBox.style.display === "none" ? "block" : "none";
  });

  // コメント読み込み
  onSnapshot(query(commentsRef, orderBy("createdAt", "asc")), async (snapshot) => {
    commentList.innerHTML = "";
    for (const cdoc of snapshot.docs) {
      const c = cdoc.data();
      let cUserIcon = "default.png";
      let cUserName = "名無し";
      if (c.uid) {
        const cUserSnap = await getDoc(doc(db, "users", c.uid));
        if (cUserSnap.exists()) {
          const cu = cUserSnap.data();
          cUserIcon = cu.profileImage || "default.png";
          cUserName = cu.userName || "名無し";
        }
      }
      const cDiv = document.createElement("div");
      cDiv.classList.add("comment-item");
      cDiv.innerHTML = `
        <span class="comment-user">
          <img src="${cUserIcon}" style="width:24px;height:24px;margin-right:4px;border-radius:50%;">
          ${cUserName}
        </span>
        <span class="comment-text">${c.text}</span>
        ${c.uid === auth.currentUser.uid ? `<button type="button" class="btn-delete-comment" style="font-size:12px;margin-left:5px;">削除</button>` : ""}
      `;
      commentList.appendChild(cDiv);

      const btnDeleteComment = cDiv.querySelector(".btn-delete-comment");
      if (btnDeleteComment) {
        btnDeleteComment.addEventListener("click", async () => {
          if (!confirm("コメントを削除しますか？")) return;
          try {
            await deleteDoc(doc(db, "posts", p.id, "comments", cdoc.id));
          } catch (err) {
            console.error("コメント削除エラー:", err);
          }
        });
      }
    }
  });

  // コメント送信
  const btnSendComment = postDiv.querySelector(".btn-send-comment");
  const inputComment = postDiv.querySelector(".commentInputBox input");
  btnSendComment.addEventListener("click", async () => {
    const text = inputComment.value.trim();
    if (!text) return;
    try {
      await addDoc(collection(db, "posts", p.id, "comments"), {
        uid: auth.currentUser.uid,
        text,
        createdAt: new Date()
      });
      inputComment.value = "";
      if (auth.currentUser.uid !== p.uid) {
        await createNotification({
          toUid: p.uid,
          fromUid: auth.currentUser.uid,
          type: "comment",
          postId: p.id,
          message: "あなたの投稿にコメントが付きました"
        });
      }
    } catch (err) {
      console.error("コメント送信エラー:", err);
    }
  });
}

// ==============================
// AI判定ボタン
// ==============================
function setupAIButton(postDiv, p) {
  const aiBtn = postDiv.querySelector(".btn-ai-check");
  const aiResultDiv = postDiv.querySelector(".ai-check-result");

  aiBtn.addEventListener("click", async (event) => {
    event.preventDefault();
    aiBtn.disabled = true;
    let dot = 0;
    aiResultDiv.style.color = "#333";
    aiResultDiv.textContent = "判定中";
    const loader = setInterval(() => {
      dot = (dot + 1) % 4;
      aiResultDiv.textContent = "判定中" + ".".repeat(dot);
    }, 300);

    try {
      const text = p.text || "";
      const probability = await realAICheckProbability(text);
      clearInterval(loader);
      aiResultDiv.style.color = probability >= 0.7 ? "#ff5050" : probability >= 0.4 ? "#ffa640" : "#55aaff";
      aiResultDiv.textContent = `AI生成の可能性: ${Math.round(probability * 100)}%`;
      await updateDoc(doc(db, "posts", p.id), { aiChecked: true, aiProbability: probability });
    } catch (err) {
      clearInterval(loader);
      aiResultDiv.style.color = "#ff5050";
      aiResultDiv.textContent = "エラーが発生しました";
      console.error("AIチェックエラー:", err);
    }
    aiBtn.disabled = false;
  });
}

// ==============================
// AIチェック API
// ==============================
async function realAICheckProbability(text) {
  if (!text) return 0;
  try {
    const res = await fetch("http://localhost:3000/api/ai-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    return data?.probability ? data.probability / 100 : 0;
  } catch (err) {
    console.error("AIチェックAPI通信エラー:", err);
    return 0;
  }
}

// ==============================
// フォロー処理
// ==============================
async function setupFollowButton(postDiv, targetUid) {
  if (!targetUid || targetUid === auth.currentUser.uid) return;
  const followContainer = postDiv.querySelector(".follow-container");
  const currentRef = doc(db, "users", auth.currentUser.uid);
  const targetRef = doc(db, "users", targetUid);
  let isFollowing = false;

  const targetSnap = await getDoc(targetRef);
  if (targetSnap.exists()) {
    const targetData = targetSnap.data();
    isFollowing = targetData.followers?.includes(auth.currentUser.uid) ?? false;
  }

  const btn = document.createElement("button");
  btn.className = "btn-follow";
  if (isFollowing) btn.classList.add("following");
  btn.textContent = isFollowing ? "フォロー中" : "フォロー";
  followContainer.appendChild(btn);

  btn.addEventListener("click", async () => {
    if (isFollowing) {
      await updateDoc(currentRef, { following: arrayRemove(targetUid) });
      await updateDoc(targetRef, { followers: arrayRemove(auth.currentUser.uid) });
      btn.textContent = "フォロー";
      btn.classList.remove("following");
      isFollowing = false;
    } else {
      await updateDoc(currentRef, { following: arrayUnion(targetUid) });
      await updateDoc(targetRef, { followers: arrayUnion(auth.currentUser.uid) });
      btn.textContent = "フォロー中";
      btn.classList.add("following");
      isFollowing = true;
    }
  });
}

// ==============================
// お気に入り処理
// ==============================
async function setupFavoriteButton(postDiv, postId) {
  const favBtn = postDiv.querySelector(".btn-favorite");
  const userRef = doc(db, "users", auth.currentUser.uid);
  let isProcessing = false;

  let userSnap = await getDoc(userRef);
  let favorites = userSnap.exists() ? (userSnap.data().favorites ?? []) : [];
  let isFav = favorites.includes(postId);

  function renderFavBtn() {
    favBtn.textContent = isFav ? "★ お気に入り解除" : "☆ お気に入り";
    favBtn.classList.toggle("favorited", isFav);
  }
  renderFavBtn();

  favBtn.addEventListener("click", async () => {
    if (isProcessing) return;
    isProcessing = true;
    try {
      if (isFav) {
        await updateDoc(userRef, { favorites: arrayRemove(postId) });
        isFav = false;
      } else {
        await updateDoc(userRef, { favorites: arrayUnion(postId) });
        isFav = true;
      }
      renderFavBtn();
    } catch (err) {
      console.error("お気に入りエラー:", err);
    }
    isProcessing = false;
  });
}

// ==============================
// 画像クリックでモーダル表示
// ==============================
function setupImageModal() {
  let modal = document.getElementById("imageModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "imageModal";
    modal.innerHTML = `
      <span class="close">&times;</span>
      <img class="modal-content" id="modalImg">
      <div id="caption"></div>
    `;
    document.body.appendChild(modal);
  }

  const modalImg = document.getElementById("modalImg");
  const captionText = modal.querySelector("#caption");
  const closeBtn = modal.querySelector(".close");

  closeBtn.addEventListener("click", () => { modal.style.display = "none"; });
  modal.addEventListener("click", e => { if (e.target === modal) modal.style.display = "none"; });

  homeFeed.addEventListener("click", (e) => {
    const target = e.target;
    if (target.classList.contains("home-postImage")) {
      modal.style.display = "block";
      modalImg.src = target.src;
      captionText.textContent = target.alt || "";
    }
  });
}
