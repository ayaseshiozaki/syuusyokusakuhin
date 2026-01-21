// postScript.js（投稿詳細：home仕様）
// - /post.html?postId=xxx
// - 1件の投稿をhomeと同じ見た目で表示
// - スライダー(画像/動画)・モーダル・いいね・お気に入り・フォロー・コメント・AI判定(任意)対応

import { db, auth } from "./firebaseInit.js";
import {
  doc, getDoc, onSnapshot, updateDoc,
  collection, query, orderBy, addDoc, deleteDoc,
  arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { createNotification } from "./notificationUtils.js";

// ==============================
// DOM
// ==============================
const postContainer = document.getElementById("postContainer");
const backBtn = document.getElementById("backBtn");

// モーダル（HTMLで定義済み）
const imageModalEl = document.getElementById("imageModal");
const imageModalImgEl = document.getElementById("modalImg");
const imageModalCaptionEl = document.getElementById("caption");
const imageModalCloseEl = imageModalEl ? imageModalEl.querySelector(".close") : null;

const params = new URLSearchParams(location.search);
const postId = params.get("postId");

if (!postId) {
  alert("投稿が見つかりません");
  location.href = "index.html";
}

if (backBtn) {
  backBtn.addEventListener("click", () => history.back());
}

// ==============================
// util: createdAt 混在OK
// ==============================
function toMillis(createdAt) {
  if (!createdAt) return 0;
  if (typeof createdAt?.toDate === "function") return createdAt.toDate().getTime(); // Timestamp
  if (createdAt instanceof Date) return createdAt.getTime();
  if (typeof createdAt === "number") return createdAt;
  const t = new Date(createdAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

// ==============================
// モーダル初期化（安全版）
// ==============================
let modalBound = false;
function setupImageModalSafe() {
  if (modalBound) return;
  if (!imageModalEl || !imageModalImgEl) return;

  modalBound = true;

  if (imageModalCloseEl) {
    imageModalCloseEl.addEventListener("click", () => {
      imageModalEl.style.display = "none";
    });
  }

  imageModalEl.addEventListener("click", (e) => {
    if (e.target === imageModalEl) imageModalEl.style.display = "none";
  });
}

function openImageModal(src, caption = "") {
  if (!imageModalEl || !imageModalImgEl) return;
  imageModalImgEl.src = src;
  if (imageModalCaptionEl) imageModalCaptionEl.textContent = caption || "";
  imageModalEl.style.display = "block";
}

// 投稿内クリックでモーダル（イベント委譲）
function bindPostImageClick(containerEl) {
  containerEl.addEventListener("click", (e) => {
    const target = e.target;
    if (!target) return;

    // スライダー内画像は home-postImage を付けてる
    if (target.classList.contains("home-postImage")) {
      openImageModal(target.src, target.alt || "");
    }
  });
}

// ==============================
// メディアスライダーHTML（homeと同じ）
// imageUrlのみの古い投稿も救済
// ==============================
function renderMediaSlider(media = [], imageUrl = "") {
  const list = Array.isArray(media) ? media.slice() : [];

  // 古い投稿救済：mediaが空で imageUrl がある場合は画像として追加
  if (list.length === 0 && imageUrl) {
    list.push({ type: "image", url: imageUrl });
  }

  if (!Array.isArray(list) || list.length === 0) return "";

  const slides = list.map(m => {
    if (m.type === "image") {
      return `<img src="${m.url}" class="home-slide-media home-postImage" alt="">`;
    }
    if (m.type === "video") {
      return `<video src="${m.url}" class="home-slide-media" controls muted></video>`;
    }
    return "";
  }).join("");

  return `
    <div class="media-slider">
      <button type="button" class="slide-btn prev">‹</button>
      <div class="media-track">
        ${slides}
      </div>
      <button type="button" class="slide-btn next">›</button>
    </div>
  `;
}

function setupSliders(rootEl) {
  const sliders = rootEl.querySelectorAll(".media-slider");
  sliders.forEach(slider => {
    const track = slider.querySelector(".media-track");
    if (!track) return;

    const items = track.children;
    let index = 0;

    const update = () => {
      track.style.transform = `translateX(-${index * 100}%)`;
    };

    const prev = slider.querySelector(".prev");
    const next = slider.querySelector(".next");

    if (prev) {
      prev.addEventListener("click", (e) => {
        e.stopPropagation();
        index = Math.max(index - 1, 0);
        update();
      });
    }

    if (next) {
      next.addEventListener("click", (e) => {
        e.stopPropagation();
        index = Math.min(index + 1, items.length - 1);
        update();
      });
    }

    // 初期位置
    update();
  });
}

// ==============================
// 1件表示（購買ボタン/評価/タグ/各機能付き）
// ==============================
async function renderPost(p) {
  if (!postContainer) return;
  postContainer.innerHTML = "";

  // 投稿者情報
  let userIcon = "default.png";
  let userName = "名無し";

  if (p.uid) {
    try {
      const userSnap = await getDoc(doc(db, "users", p.uid));
      if (userSnap.exists()) {
        const u = userSnap.data();
        userIcon = u.profileImage || "default.png";
        userName = u.userName || "名無し";
      }
    } catch (err) {
      console.error("ユーザー情報取得エラー:", err);
    }
  }

  // createdAt
  const ms = toMillis(p.createdAt);
  const createdAt = ms ? new Date(ms).toLocaleString() : "";

  // 評価
  const ratingsHTML = p.rate ? `
    <div class="home-rating">
      <p>使いやすさ：★${p.rate.usability}</p>
      <p>金額：★${p.rate.price}</p>
      <p>性能：★${p.rate.performance}</p>
      <p>見た目：★${p.rate.design}</p>
      <p>買ってよかった：★${p.rate.satisfaction}</p>
      <p><b>総合評価：★${(p.rate.average ?? 0).toFixed(1)}</b></p>
    </div>` : "";

  // ハッシュタグ
  const hashtagsHTML = p.hashtags?.length ? `
    <div class="home-hashtags">
      ${p.hashtags.map(tag => `<span class="home-hashtag">${tag.startsWith("#") ? tag : `#${tag}`}</span>`).join(" ")}
    </div>` : "";

  // 商品情報
  const productInfoHTML = `
    ${p.productPrice ? `<div class="home-price">価格: ¥${p.productPrice}</div>` : ""}
    ${p.productURL ? `<button type="button" class="home-buy-btn">🛒購入ページへ</button>` : ""}
  `;

  const postDiv = document.createElement("div");
  postDiv.classList.add("home-post");
  postDiv.innerHTML = `
    <div class="home-post-header">
      <img src="${userIcon}" class="home-post-icon user-link" data-uid="${p.uid || ""}">
      <span class="home-username user-link" data-uid="${p.uid || ""}">${userName}</span>
    </div>

    ${p.itemName ? `<div class="home-itemName">アイテム名: ${p.itemName}</div>` : ""}
    <p class="home-text">${p.text || ""}</p>

    ${productInfoHTML}

    ${renderMediaSlider(p.media, p.imageUrl)}

    ${hashtagsHTML}
    ${ratingsHTML}

    <div class="home-postDate">${createdAt}</div>

    <button type="button" class="btn-like">♥ いいね (${p.likes ?? 0})</button>
    <button type="button" class="btn-favorite">☆ お気に入り</button>

    <!-- AI判定（不要ならHTMLごと消してOK） -->
    <button type="button" class="btn-ai-check">サクラ判定</button>
    <div class="ai-check-result">${p.aiChecked ? `⚠ 可能性: ${Math.round((p.aiProbability || 0) * 100)}%` : ""}</div>

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

  postContainer.appendChild(postDiv);

  // スライダー
  setupSliders(postDiv);

  // 購入ボタン
  if (p.productURL) {
    const buyBtn = postDiv.querySelector(".home-buy-btn");
    if (buyBtn) buyBtn.addEventListener("click", () => window.open(p.productURL, "_blank"));
  }

  // ユーザーリンク
  postDiv.querySelectorAll(".user-link").forEach(el => {
    const uid = el.dataset.uid;
    if (!uid) return;
    el.style.cursor = "pointer";
    el.addEventListener("click", () => {
      location.href = `user.html?uid=${uid}`;
    });
  });

  // ハッシュタグ → 検索へ（#付きで渡す）
  postDiv.querySelectorAll(".home-hashtag").forEach(el => {
    el.style.cursor = "pointer";
    el.addEventListener("click", () => {
      const tag = el.textContent || "";
      location.href = `kensaku.html?tag=${encodeURIComponent(tag)}`;
    });
  });

  // 機能セット
  // ★ 修正点：setupLikeButton に postId を渡す
  await setupLikeButton(postDiv, postId, p);
  await setupFavoriteButton(postDiv, postId);
  await setupFollowButton(postDiv, p.uid);
  setupCommentSection(postDiv, p);
  setupAIButton(postDiv, p);

  // 画像クリック→モーダル（イベント委譲）
  bindPostImageClick(postDiv);
}

// ==============================
// いいね（通知付き / 1人1回・2回目で解除）
// ==============================
async function setupLikeButton(postDiv, postId, p) {
  const likeBtn = postDiv.querySelector(".btn-like");
  if (!likeBtn) return;

  const myUid = auth.currentUser?.uid;
  if (!myUid) return;

  let likes = p.likes ?? 0;
  let likedBy = Array.isArray(p.likedBy) ? p.likedBy : [];
  let isLiked = likedBy.includes(myUid);

  let isProcessing = false;

  // 初期表示
  render();

  // 押した瞬間のポン演出（micro.cssの .liked を使う）
  likeBtn.addEventListener("pointerdown", () => {
    likeBtn.classList.remove("liked");
    void likeBtn.offsetWidth;
    likeBtn.classList.add("liked");
    setTimeout(() => likeBtn.classList.remove("liked"), 220);
  });

  likeBtn.addEventListener("click", async () => {
    if (isProcessing) return;
    isProcessing = true;

    try {
      const postRef = doc(db, "posts", postId);

      if (!isLiked) {
        // 👍 いいね
        likes = likes + 1;
        isLiked = true;
        render();

        await updateDoc(postRef, {
          likes,
          likedBy: arrayUnion(myUid),
        });

        // 🔔 通知（自分以外 & いいね時だけ）
        if (p.uid && p.uid !== myUid) {
          await createNotification({
            toUid: p.uid,
            fromUid: myUid,
            type: "like",
            postId,
            message: "あなたの投稿にいいねされました",
          });
        }
      } else {
        // 👎 いいね解除
        likes = Math.max(likes - 1, 0);
        isLiked = false;
        render();

        await updateDoc(postRef, {
          likes,
          likedBy: arrayRemove(myUid),
        });
      }
    } catch (err) {
      console.error("いいねエラー:", err);
    }

    isProcessing = false;
  });

  function render() {
    likeBtn.textContent = `♥ いいね (${likes})`;
    likeBtn.classList.toggle("liked-on", isLiked);
  }
}

// ==============================
// お気に入り（users/{uid}.favorites）
// ==============================
async function setupFavoriteButton(postDiv, postId) {
  const favBtn = postDiv.querySelector(".btn-favorite");
  if (!favBtn) return;

  const userRef = doc(db, "users", auth.currentUser.uid);
  let isProcessing = false;

  const userSnap = await getDoc(userRef);
  let favorites = userSnap.exists() ? (userSnap.data().favorites ?? []) : [];
  let isFav = favorites.includes(postId);

  const render = () => {
    favBtn.textContent = isFav ? "★ お気に入り解除" : "☆ お気に入り";
    favBtn.classList.toggle("favorited", isFav);
  };
  render();

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
      render();
    } catch (err) {
      console.error("お気に入りエラー:", err);
    }

    isProcessing = false;
  });
}

// ==============================
// フォロー（投稿者をフォロー）
// ==============================
async function setupFollowButton(postDiv, targetUid) {
  if (!targetUid || targetUid === auth.currentUser.uid) return;

  const followContainer = postDiv.querySelector(".follow-container");
  if (!followContainer) return;

  const currentRef = doc(db, "users", auth.currentUser.uid);
  const targetRef = doc(db, "users", targetUid);

  let isFollowing = false;
  const targetSnap = await getDoc(targetRef);
  if (targetSnap.exists()) {
    isFollowing = targetSnap.data().followers?.includes(auth.currentUser.uid) ?? false;
  }

  const btn = document.createElement("button");
  btn.className = "btn-follow";
  btn.textContent = isFollowing ? "フォロー中" : "フォロー";
  if (isFollowing) btn.classList.add("following");
  followContainer.appendChild(btn);

  btn.addEventListener("click", async () => {
    try {
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

        await createNotification({
          toUid: targetUid,
          fromUid: auth.currentUser.uid,
          type: "follow",
          postId: "",
          message: "あなたがフォローされました"
        });
      }
    } catch (err) {
      console.error("フォロー処理エラー:", err);
    }
  });
}

// ==============================
// コメント（表示/送信/削除）
// ==============================
async function setupCommentSection(postDiv, p) {
  const btnShowComment = postDiv.querySelector(".btn-show-comment");
  const commentBox = postDiv.querySelector(".comment-box");
  const commentList = postDiv.querySelector(".comment-list");
  const btnSendComment = postDiv.querySelector(".btn-send-comment");
  const inputComment = postDiv.querySelector(".commentInputBox input");

  if (!btnShowComment || !commentBox || !commentList || !btnSendComment || !inputComment) return;

  const commentsRef = collection(db, "posts", postId, "comments");

  // 表示切替
  btnShowComment.addEventListener("click", () => {
    commentBox.style.display = commentBox.style.display === "none" ? "block" : "none";
  });

  // 監視して表示
  onSnapshot(query(commentsRef, orderBy("createdAt", "asc")), async (snapshot) => {
    commentList.innerHTML = "";

    for (const cdoc of snapshot.docs) {
      const c = cdoc.data();

      let cUserIcon = "default.png";
      let cUserName = "名無し";
      if (c.uid) {
        try {
          const cUserSnap = await getDoc(doc(db, "users", c.uid));
          if (cUserSnap.exists()) {
            const cu = cUserSnap.data();
            cUserIcon = cu.profileImage || "default.png";
            cUserName = cu.userName || "名無し";
          }
        } catch (err) {
          console.error("コメントユーザー取得エラー:", err);
        }
      }

      const cDiv = document.createElement("div");
      cDiv.classList.add("comment-item");
      cDiv.innerHTML = `
        <span class="comment-user">
          <img src="${cUserIcon}" style="width:24px;height:24px;margin-right:4px;border-radius:50%;">
          ${cUserName}
        </span>
        <span class="comment-text">${c.text || ""}</span>
        ${c.uid === auth.currentUser.uid ? `<button type="button" class="btn-delete-comment" style="font-size:12px;margin-left:5px;">削除</button>` : ""}
      `;
      commentList.appendChild(cDiv);

      // 削除
      const delBtn = cDiv.querySelector(".btn-delete-comment");
      if (delBtn) {
        delBtn.addEventListener("click", async () => {
          if (!confirm("コメントを削除しますか？")) return;
          try {
            await deleteDoc(doc(db, "posts", postId, "comments", cdoc.id));
          } catch (err) {
            console.error("コメント削除エラー:", err);
          }
        });
      }
    }
  });

  // 送信
  btnSendComment.addEventListener("click", async () => {
    const text = inputComment.value.trim();
    if (!text) return;

    try {
      await addDoc(commentsRef, {
        uid: auth.currentUser.uid,
        text,
        createdAt: new Date()
      });
      inputComment.value = "";

      // 投稿者に通知（自分以外）
      if (p.uid && auth.currentUser.uid !== p.uid) {
        await createNotification({
          toUid: p.uid,
          fromUid: auth.currentUser.uid,
          type: "comment",
          postId,
          message: "あなたの投稿にコメントが付きました"
        });
      }
    } catch (err) {
      console.error("コメント送信エラー:", err);
    }
  });
}

// ==============================
// AI判定（homeと同じ）
// ==============================
function setupAIButton(postDiv, p) {
  const aiBtn = postDiv.querySelector(".btn-ai-check");
  const aiResultDiv = postDiv.querySelector(".ai-check-result");
  if (!aiBtn || !aiResultDiv) return;

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
      aiResultDiv.style.color =
        probability >= 0.7 ? "#ff5050" :
        probability >= 0.4 ? "#ffa640" : "#55aaff";

      aiResultDiv.textContent = `AI生成の可能性: ${Math.round(probability * 100)}%`;

      await updateDoc(doc(db, "posts", postId), {
        aiChecked: true,
        aiProbability: probability
      });
    } catch (err) {
      clearInterval(loader);
      aiResultDiv.style.color = "#ff5050";
      aiResultDiv.textContent = "エラーが発生しました";
      console.error("AIチェックエラー:", err);
    }

    aiBtn.disabled = false;
  });
}

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
// 起動
// ==============================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("ログインしてください");
    location.href = "index.html";
    return;
  }

  setupImageModalSafe();

  // 投稿を監視して1件表示（更新も追従）
  const postRef = doc(db, "posts", postId);
  onSnapshot(postRef, async (snap) => {
    if (!snap.exists()) {
      postContainer.innerHTML = "<p>この投稿は削除されました。</p>";
      return;
    }
    const p = { id: snap.id, ...snap.data() };
    await renderPost(p);
  });
});
