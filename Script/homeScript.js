import { db, auth } from "./firebaseInit.js";
import {
  collection, query, orderBy, onSnapshot,
  doc, getDoc, updateDoc, arrayUnion, arrayRemove, addDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { createNotification } from "./notificationUtils.js";

import {
  extractPostSignals,
  applyHeuristics,
  buildAICheckHTML,
  judgeLevel
} from "./aiTrustUtils.js";

const homeFeed = document.querySelector(".home-feed");

// ==============================
// ✅ 購読解除ハンドル（ここが超重要）
// ==============================
let unsubPosts = null;        // posts購読（main or fallback のどっちか1つ）
let currentMode = "main";     // "main" or "fallback"

// ==============================
// ログイン確認
// ==============================
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  setupImageModalSafe(); // モーダル初期セット
  loadPostsSafe();       // 投稿購読（1本化）
});

// ==============================
// 投稿読み込み（安全版・購読1本化）
// ==============================
function loadPostsSafe() {
  const postsRef = collection(db, "posts");
  const qMain = query(postsRef, orderBy("createdAt", "desc"));
  const qFallback = query(postsRef);

  // まず main を試す
  subscribePosts(qMain, "main", async (snapshot) => {
    const posts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    await renderPosts(posts);
  }, (error) => {
    console.error("posts(main) の取得に失敗:", error);
    // mainが死んだら fallback に切替
    subscribePosts(qFallback, "fallback", async (snapshot) => {
      const posts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      posts.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      await renderPosts(posts);
    }, (err) => {
      console.error("posts(fallback) の取得に失敗:", err);
    });
  });
}

// ✅ onSnapshot を必ず1本にする関数
function subscribePosts(q, mode, onNext, onError) {
  if (currentMode === mode && unsubPosts) return;

  // 既存購読を必ず解除
  if (unsubPosts) {
    try { unsubPosts(); } catch (_) {}
    unsubPosts = null;
  }

  currentMode = mode;
  unsubPosts = onSnapshot(q, onNext, onError);
}

// createdAt を millis に変換
function toMillis(createdAt) {
  if (!createdAt) return 0;
  if (typeof createdAt?.toDate === "function") return createdAt.toDate().getTime();
  if (createdAt instanceof Date) return createdAt.getTime();
  if (typeof createdAt === "number") return createdAt;
  const t = new Date(createdAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

// ==============================
// ⭐ 星表示（最大5個）+ 横に数値（3.5など）
// ※ 半星はCSSで「黒の幅」を%で重ねて表現
// ==============================
function renderStars(value, max = 5) {
  const v = Number(value);
  const rate = Number.isFinite(v) ? Math.min(Math.max(v, 0), max) : 0;
  const percent = (rate / max) * 100;
  const text = Number.isFinite(rate) ? rate.toFixed(1) : "0.0";

  return `
    <span class="star-wrap" aria-label="${text}/${max}">
      <span class="star-back">★★★★★</span>
      <span class="star-front" style="width:${percent}%">★★★★★</span>
    </span>
    <span class="star-num">${text}</span>
  `;
}

// ==============================
// 投稿描画（点滅を減らす）
// ==============================
async function renderPosts(posts) {
  if (!homeFeed) return;

  // まとめて差し替え（innerHTML=""連発より安定）
  const frag = document.createDocumentFragment();

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

    // ✅ 評価：星（5個上限）+ 数値
    const ratingsHTML = p.rate ? (() => {
      const avg = Number(p.rate?.average);
      const avgText = Number.isFinite(avg) ? avg.toFixed(1) : "-";

      return `
        <div class="home-rating">
          <p>使いやすさ：${renderStars(p.rate.usability)}</p>
          <p>金額：${renderStars(p.rate.price)}</p>
          <p>性能：${renderStars(p.rate.performance)}</p>
          <p>見た目：${renderStars(p.rate.design)}</p>
          <p>買ってよかった：${renderStars(p.rate.satisfaction)}</p>
          <p><b>総合評価：${renderStars(avg)}</b></p>
        </div>`;
    })() : "";

    const hashtagsHTML = p.hashtags?.length ? `
      <div class="home-hashtags">
        ${p.hashtags.map(tag => `<span class="home-hashtag">${tag.startsWith('#') ? tag : `#${tag}`}</span>`).join(" ")}
      </div>` : "";

    const productInfoHTML = `
      ${p.productPrice ? `<div class="home-price">価格: ¥${p.productPrice}</div>` : ""}
      ${p.productURL ? `<button type="button" class="home-buy-btn">🛒購入ページへ</button>` : ""}
    `;

    let createdAtStr = "";
    const ms = toMillis(p.createdAt);
    if (ms) createdAtStr = new Date(ms).toLocaleString();

    const postDiv = document.createElement("div");
    postDiv.classList.add("home-post");
    postDiv.dataset.postId = p.id; // ✅ ここにIDを持たせる（コメント購読に使う）

    postDiv.innerHTML = `
      <div class="home-post-header">
        <img src="${userIcon}" class="home-post-icon user-link" data-uid="${p.uid || ""}">
        <span class="home-username user-link" data-uid="${p.uid || ""}">${userName}</span>
      </div>

      ${p.itemName ? `<div class="home-itemName">アイテム名: ${p.itemName}</div>` : ""}
      <p class="home-text">${p.text || ""}</p>

      <!-- ✅ 追加：良い点 / 気になった点 -->
      ${p.goodPoint ? `
        <div class="home-good-point good">
          良い点：${p.goodPoint}
        </div>
      ` : ""}

      ${p.badPoint ? `
        <div class="home-bad-point bad">
          悪い点：${p.badPoint}
        </div>
      ` : ""}

      ${productInfoHTML}
      ${renderMediaSlider(normalizeMedia(p))}
      ${hashtagsHTML}
      ${ratingsHTML}

      <div class="home-postDate">${createdAtStr}</div>

      <button type="button" class="btn-like">♥ いいね (${p.likes ?? 0})</button>
      <button type="button" class="btn-favorite">☆ お気に入り</button>
      <button type="button" class="btn-ai-check">サクラ判定</button>

      <div class="ai-check-result"></div>

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

    frag.appendChild(postDiv);

    initMediaSliders(postDiv);

    if (p.productURL) {
      const buyBtn = postDiv.querySelector(".home-buy-btn");
      buyBtn?.addEventListener("click", () => window.open(p.productURL, "_blank"));
    }

    postDiv.querySelectorAll(".user-link").forEach(el => {
      const uid = el.dataset.uid;
      if (!uid || uid === auth.currentUser.uid) return;
      el.style.cursor = "pointer";
      el.addEventListener("click", () => window.location.href = `user.html?uid=${uid}`);
    });

    setupLikeButton(postDiv, p);
    setupFavoriteButton(postDiv, p.id);
    setupFollowButton(postDiv, p.uid);

    // ✅ コメント：購読を「開いた時だけ」に変える（増殖防止）
    setupCommentSectionLazy(postDiv, p);

    setupAIButton(postDiv, p, p.id);
  }

  homeFeed.replaceChildren(frag);
}

// ==============================
// media 正規化
// ==============================
function normalizeMedia(p) {
  if (Array.isArray(p.media) && p.media.length) return p.media;
  if (p.imageUrl) return [{ type: "image", url: p.imageUrl }];
  return [];
}

// ==============================
// スライダー初期化
// ==============================
function initMediaSliders(container) {
  const sliders = container.querySelectorAll(".media-slider");
  sliders.forEach(slider => {
    const track = slider.querySelector(".media-track");
    if (!track) return;

    const items = track.children;
    if (!items || items.length <= 1) return;

    let index = 0;
    const update = () => { track.style.transform = `translateX(-${index * 100}%)`; };

    slider.querySelector(".prev")?.addEventListener("click", (e) => {
      e.stopPropagation();
      index = Math.max(index - 1, 0);
      update();
    });

    slider.querySelector(".next")?.addEventListener("click", (e) => {
      e.stopPropagation();
      index = Math.min(index + 1, items.length - 1);
      update();
    });

    update();
  });
}

// ==============================
// いいね（通知付き / トグル）
// ==============================
async function setupLikeButton(postDiv, p) {
  const likeBtn = postDiv.querySelector(".btn-like");
  if (!likeBtn) return;

  const myUid = auth.currentUser?.uid;
  if (!myUid) return;

  let likes = p.likes ?? 0;
  let likedBy = Array.isArray(p.likedBy) ? p.likedBy : [];
  let isLiked = likedBy.includes(myUid);
  let isProcessing = false;

  render();

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
      const postRef = doc(db, "posts", p.id);

      if (!isLiked) {
        likes = likes + 1;
        isLiked = true;
        render();

        await updateDoc(postRef, {
          likes,
          likedBy: arrayUnion(myUid),
        });

        if (p.uid !== myUid) {
          await createNotification({
            toUid: p.uid,
            fromUid: myUid,
            type: "like",
            postId: p.id,
            message: "あなたの投稿にいいねされました",
          });
        }
      } else {
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
// ✅ コメント（遅延購読：開いた時だけ / 1投稿1購読）
// ==============================
function setupCommentSectionLazy(postDiv, p) {
  const btnShowComment = postDiv.querySelector(".btn-show-comment");
  const commentBox = postDiv.querySelector(".comment-box");
  const commentList = postDiv.querySelector(".comment-list");
  const btnSendComment = postDiv.querySelector(".btn-send-comment");
  const inputComment = postDiv.querySelector(".commentInputBox input");

  if (!btnShowComment || !commentBox || !commentList || !btnSendComment || !inputComment) return;

  const postId = p.id;
  let unsubComments = null; // ✅ その投稿のコメント購読を保持
  let loadedOnce = false;

  btnShowComment.addEventListener("click", () => {
    const isOpen = commentBox.style.display !== "none";
    commentBox.style.display = isOpen ? "none" : "block";

    // 初めて開いた時だけ購読開始（増殖防止）
    if (!loadedOnce) {
      loadedOnce = true;
      startCommentsSubscription();
    }
  });

  function startCommentsSubscription() {
    const commentsRef = collection(db, "posts", postId, "comments");
    const q = query(commentsRef, orderBy("createdAt", "asc"));

    if (unsubComments) return; // 二重防止

    unsubComments = onSnapshot(q, async (snapshot) => {
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
          } catch (e) {
            console.error("コメントユーザー取得エラー:", e);
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
  }

  btnSendComment.addEventListener("click", async () => {
    const text = inputComment.value.trim();
    if (!text) return;

    try {
      await addDoc(collection(db, "posts", postId, "comments"), {
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
          postId,
          message: "あなたの投稿にコメントが付きました"
        });
      }
    } catch (err) {
      console.error("コメント送信エラー:", err);
    }
  });

  // ページ遷移/破棄時の掃除（保険）
  if (!postDiv.__cleanupBound) {
    postDiv.__cleanupBound = true;
    window.addEventListener("beforeunload", () => {
      if (unsubComments) {
        try { unsubComments(); } catch (_) {}
        unsubComments = null;
      }
    });
  }
}

// ==============================
// AI判定（あなたのロジックそのまま）
// ==============================
function setupAIButton(postDiv, p, postId) {
  const aiBtn = postDiv.querySelector(".btn-ai-check");
  const aiResultDiv = postDiv.querySelector(".ai-check-result");
  if (!aiBtn || !aiResultDiv) return;

  aiResultDiv.innerHTML = "";
  aiResultDiv.classList.remove("ai-low", "ai-mid", "ai-high");

  aiBtn.addEventListener("click", async (event) => {
    event.preventDefault();
    if (aiBtn.disabled) return;
    aiBtn.disabled = true;

    if (p.aiChecked && typeof p.aiProbability === "number") {
      const prob01 = Number(p.aiProbability ?? 0);
      const reasons = Array.isArray(p.aiReasons) ? p.aiReasons : [];
      const lvl = p.aiLevel || judgeLevel(prob01).level;

      aiResultDiv.classList.remove("ai-low", "ai-mid", "ai-high");
      aiResultDiv.classList.add(
        lvl === "high" ? "ai-high" :
        lvl === "mid"  ? "ai-mid"  : "ai-low"
      );

      aiResultDiv.innerHTML = buildAICheckHTML(prob01, reasons);
      aiBtn.disabled = false;
      return;
    }

    let dot = 0;
    aiResultDiv.classList.remove("ai-low", "ai-mid", "ai-high");
    aiResultDiv.textContent = "判定中";

    const loader = setInterval(() => {
      dot = (dot + 1) % 4;
      aiResultDiv.textContent = "判定中" + ".".repeat(dot);
    }, 300);

    try {
      const text = p.text || "";
      const base01 = await realAICheckProbability(text);

      const signals = extractPostSignals(p);
      const { adjusted01, reasons } = applyHeuristics(base01, signals);

      clearInterval(loader);

      const lvl = judgeLevel(adjusted01).level;

      aiResultDiv.classList.add(
        lvl === "high" ? "ai-high" :
        lvl === "mid"  ? "ai-mid"  : "ai-low"
      );

      aiResultDiv.innerHTML = buildAICheckHTML(adjusted01, reasons);

      const id = postId || p.id;
      if (id) {
        await updateDoc(doc(db, "posts", id), {
          aiChecked: true,
          aiProbability: adjusted01,
          aiProbabilityBase: base01,
          aiReasons: reasons,
          aiLevel: lvl
        });
      }

      p.aiChecked = true;
      p.aiProbability = adjusted01;
      p.aiProbabilityBase = base01;
      p.aiReasons = reasons;
      p.aiLevel = lvl;

    } catch (err) {
      clearInterval(loader);
      aiResultDiv.classList.remove("ai-low", "ai-mid", "ai-high");
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
// フォロー
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
    const targetData = targetSnap.data();
    isFollowing = targetData.followers?.includes(auth.currentUser.uid) ?? false;
  }

  const btn = document.createElement("button");
  btn.className = "btn-follow";
  if (isFollowing) btn.classList.add("following");
  btn.textContent = isFollowing ? "フォロー中" : "フォロー";
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
      }
    } catch (e) {
      console.error("フォロー失敗:", e);
    }
  });
}

// ==============================
// お気に入り
// ==============================
async function setupFavoriteButton(postDiv, postId) {
  const favBtn = postDiv.querySelector(".btn-favorite");
  if (!favBtn) return;

  const userRef = doc(db, "users", auth.currentUser.uid);

  let isProcessing = false;
  const userSnap = await getDoc(userRef);
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
// モーダル（壊れてても修復する安全版）
// ==============================
function setupImageModalSafe() {
  let modal = document.getElementById("imageModal");

  const isBroken =
    modal &&
    (!modal.querySelector(".close") || !modal.querySelector("#modalImg") || !modal.querySelector("#caption"));

  if (!modal || isBroken) {
    if (modal) modal.remove();
    modal = document.createElement("div");
    modal.id = "imageModal";
    modal.innerHTML = `
      <span class="close">&times;</span>
      <img class="modal-content" id="modalImg">
      <div id="caption"></div>
    `;
    document.body.appendChild(modal);
  }

  const modalImg = modal.querySelector("#modalImg");
  const captionText = modal.querySelector("#caption");
  const closeBtn = modal.querySelector(".close");

  if (!modal.__bound) {
    closeBtn?.addEventListener("click", () => { modal.style.display = "none"; });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });
    modal.__bound = true;
  }

  if (!homeFeed.__modalDelegationBound) {
    homeFeed.__modalDelegationBound = true;
    homeFeed.addEventListener("click", (e) => {
      const img = e.target.closest(".home-postImage");
      if (!img) return;
      modal.style.display = "block";
      modalImg.src = img.src;
      captionText.textContent = img.alt || "";
    });
  }
}

// ==============================
// メディア横スライダー生成
// ==============================
function renderMediaSlider(media = []) {
  if (!Array.isArray(media) || media.length === 0) return "";

  const slides = media.map(m => {
    if (m?.type === "image") {
      return `<img src="${m.url}" class="home-slide-media home-postImage">`;
    }
    if (m?.type === "video") {
      return `<video src="${m.url}" class="home-slide-media" controls muted playsinline></video>`;
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
