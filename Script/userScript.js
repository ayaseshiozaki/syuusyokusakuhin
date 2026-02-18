// userScript.js（複数画像/動画スライダー対応・createdAt混在/欠落に強い・モーダル安全版 + AI判定強化）
// ※そのままコピペで置き換えOK

import { auth, db } from "./firebaseInit.js";
import {
  doc, getDoc, updateDoc,
  collection, query, where, orderBy, onSnapshot,
  arrayUnion, arrayRemove, addDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { createNotification } from "./notificationUtils.js";

// ★追加：サクラ判定強化（補正・理由・段階表示）
import {
  extractPostSignals,
  applyHeuristics,
  buildAICheckHTML,
  judgeLevel
} from "./aiTrustUtils.js";

// ===== HTML 要素取得 =====
const userInfoEl = document.querySelector(".user-container");
const postListEl = document.querySelector(".user-post-list");

// ===== URLからuid取得 =====
const params = new URLSearchParams(window.location.search);
const targetUid = params.get("uid");

if (!targetUid) {
  alert("ユーザーが見つかりません");
  window.location.href = "index.html";
}

// ==============================
// createdAt を millis に変換（Timestamp/Date/文字列/数値に対応）
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
// ⭐ 星表示（最大5個）+ 横に数値（3.5など）
// ※ 半星はCSSで「黒の幅」を%で重ねて表現
// ==============================
function renderStars(value, max = 5) {
  const v = Number(value);
  const rate = Number.isFinite(v) ? Math.min(Math.max(v, 0), max) : 0;
  const percent = (rate / max) * 100;
  const text = rate.toFixed(1);

  return `
    <span class="star-wrap" aria-label="${text}/${max}">
      <span class="star-back">★★★★★</span>
      <span class="star-front" style="width:${percent}%">★★★★★</span>
    </span>
    <span class="star-num">${text}</span>
  `;
}

// ==============================
// 画像モーダル（HTMLにある #imageModal を使う / 壊れてても修復）
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
    modal.className = "image-modal";
    modal.innerHTML = `
      <span class="close">&times;</span>
      <img class="modal-content" id="modalImg" alt="">
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

  // userページの投稿画像クリックを拾う（クリック委譲）
  if (!document.body.__userModalDelegationBound) {
    document.body.__userModalDelegationBound = true;
    document.body.addEventListener("click", (e) => {
      const img = e.target.closest(".home-postImage, .home-slide-media.home-postImage");
      if (!img) return;
      modal.style.display = "block";
      modalImg.src = img.src;
      captionText.textContent = img.alt || "";
    });
  }
}

// ==============================
// メディアスライダーHTML（古い投稿 imageUrl のみでも表示）
// ==============================
function renderMediaSlider(media = [], imageUrl = "") {
  const normalized = Array.isArray(media) && media.length
    ? media
    : (imageUrl ? [{ type: "image", url: imageUrl }] : []);

  if (!normalized.length) return "";

  const slides = normalized.map(m => {
    if (m?.type === "image") {
      return `<img src="${m.url}" class="home-slide-media home-postImage" alt="">`;
    }
    if (m?.type === "video") {
      return `<video src="${m.url}" class="home-slide-media" controls muted playsinline></video>`;
    }
    return "";
  }).join("");

  return `
    <div class="media-slider">
      <button type="button" class="slide-btn prev">‹</button>
      <div class="media-track">${slides}</div>
      <button type="button" class="slide-btn next">›</button>
    </div>
  `;
}

// ==============================
// スライダー制御（投稿ごと）
// ==============================
function setupSlider(postDiv) {
  const slider = postDiv.querySelector(".media-slider");
  if (!slider) return;

  const track = slider.querySelector(".media-track");
  if (!track) return;

  const items = track.children;
  if (!items || items.length <= 1) return;

  let index = 0;
  const update = () => {
    track.style.transform = `translateX(-${index * 100}%)`;
  };

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
}

// ==============================
// ユーザー情報読み込み
// ==============================
async function loadUserInfo(currentUid) {
  const userRef = doc(db, "users", targetUid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    alert("ユーザーが存在しません");
    return;
  }

  const data = snap.data();

  userInfoEl.querySelector(".user-profile-img").src = data.profileImage || "default.png";
  userInfoEl.querySelector(".user-username").textContent = data.userName || data.email;
  userInfoEl.querySelector(".user-intro").textContent = data.intro || "自己紹介なし";
  userInfoEl.querySelector(".count-follow").textContent = data.following?.length || 0;
  userInfoEl.querySelector(".count-follower").textContent = data.followers?.length || 0;

  const followBtn = userInfoEl.querySelector(".followBtn");
  if (!followBtn) return;

  if (targetUid === currentUid) {
    followBtn.style.display = "none";
    return;
  }

  let isFollowing = data.followers?.includes(currentUid);
  followBtn.textContent = isFollowing ? "フォロー中" : "フォロー";

  // 二重バインド防止
  if (!followBtn.__bound) {
    followBtn.__bound = true;

    followBtn.addEventListener("click", async () => {
      try {
        const currentRef = doc(db, "users", currentUid);

        const wasFollowing = isFollowing;

        if (isFollowing) {
          await updateDoc(currentRef, { following: arrayRemove(targetUid) });
          await updateDoc(userRef, { followers: arrayRemove(currentUid) });
          isFollowing = false;
          followBtn.textContent = "フォロー";
        } else {
          await updateDoc(currentRef, { following: arrayUnion(targetUid) });
          await updateDoc(userRef, { followers: arrayUnion(currentUid) });
          isFollowing = true;
          followBtn.textContent = "フォロー中";
        }

        // フォロワー数更新
        const snap2 = await getDoc(userRef);
        const data2 = snap2.exists() ? snap2.data() : {};
        userInfoEl.querySelector(".count-follower").textContent = data2.followers?.length || 0;

        // ✅ 通知（「フォローした時だけ」）
        if (!wasFollowing && isFollowing) {
          await createNotification({
            toUid: targetUid,
            fromUid: currentUid,
            type: "follow",
            postId: "",
            message: "あなたがフォローされました"
          });
        }
      } catch (e) {
        console.error("フォロー処理失敗:", e);
      }
    });
  }
}

// ==============================
// 投稿読み込み（購読1本化：main失敗時のみfallback）
// ==============================
let unsubUserPosts = null;
let userPostsMode = "main";

function subscribeUserPosts(q, mode, onNext, onError) {
  if (userPostsMode === mode && unsubUserPosts) return;

  // 既存購読を解除
  if (unsubUserPosts) {
    try { unsubUserPosts(); } catch (_) {}
    unsubUserPosts = null;
  }

  userPostsMode = mode;
  unsubUserPosts = onSnapshot(q, onNext, onError);
}

function loadUserPostsSafe(currentUid) {
  const postsRef = collection(db, "posts");

  const qMain = query(
    postsRef,
    where("uid", "==", targetUid),
    orderBy("createdAt", "desc")
  );

  const qFallback = query(
    postsRef,
    where("uid", "==", targetUid)
  );

  // main
  subscribeUserPosts(
    qMain,
    "main",
    (snapshot) => {
      const posts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderPosts(posts, currentUid);
    },
    (error) => {
      console.error("user posts main snapshot error:", error);

      // fallback
      subscribeUserPosts(
        qFallback,
        "fallback",
        (snapshot) => {
          const posts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          posts.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
          renderPosts(posts, currentUid);
        },
        (err) => console.error("user posts fallback snapshot error:", err)
      );
    }
  );
}

// ==============================
// 投稿描画（home系クラスに寄せて複数メディア対応）
// ==============================
function renderPosts(posts, currentUid) {
  if (!postListEl) return;
  postListEl.innerHTML = "";
  for (const p of posts) renderPostItem(p, p.id, currentUid);
}

// ==============================
// 投稿1件描画（複数画像/動画/スライダー + 商品情報 + 評価 + コメント + AI判定）
// ==============================
function renderPostItem(p, postId, currentUid) {
  const ms = toMillis(p.createdAt);
  const createdAt = ms ? new Date(ms).toLocaleString() : "";

  const productInfoHTML = `
    ${p.productPrice ? `<div class="home-price">価格: ¥${p.productPrice}</div>` : ""}
    ${p.productURL ? `<button type="button" class="home-buy-btn" data-url="${p.productURL}">🛒購入ページへ</button>` : ""}
  `;

  const hashtagsHTML = Array.isArray(p.hashtags) && p.hashtags.length ? `
    <div class="home-hashtags">
      ${p.hashtags.map(tag => {
        const t = (tag || "").startsWith("#") ? tag : `#${tag}`;
        return `<span class="home-hashtag">${t}</span>`;
      }).join(" ")}
    </div>
  ` : "";

  // ✅ 評価：星（5個上限）+ 数値（小数OK）
  const ratingsHTML = p.rate ? (() => {
    const avg = Number(p.rate?.average);
    return `
      <div class="home-rating">
        <p>使いやすさ：${renderStars(p.rate.usability)}</p>
        <p>金額：${renderStars(p.rate.price)}</p>
        <p>性能：${renderStars(p.rate.performance)}</p>
        <p>見た目：${renderStars(p.rate.design)}</p>
        <p>買ってよかった：${renderStars(p.rate.satisfaction)}</p>
        <p><b>総合評価：${renderStars(avg)}</b></p>
      </div>
    `;
  })() : "";

  const item = document.createElement("div");
  item.className = "home-post";
  item.dataset.postId = postId;

  item.innerHTML = `
    ${p.itemName ? `<div class="home-itemName">${p.itemName}</div>` : ""}
    ${p.text ? `<p class="home-text">${p.text}</p>` : ""}

    <!-- ✅ 良い点 / 悪い点 -->
    ${p.goodPoint ? `
      <div class="home-good-point">
        <span class="point-label good">良い点：</span>${p.goodPoint}
      </div>
    ` : ""}

    ${p.badPoint ? `
      <div class="home-bad-point">
        <span class="point-label bad">悪い点：</span>${p.badPoint}
      </div>
    ` : ""}

    ${productInfoHTML}

    ${renderMediaSlider(p.media, p.imageUrl)}

    ${hashtagsHTML}
    ${ratingsHTML}

    <div class="home-postDate">${createdAt}</div>

    <button type="button" class="btn-like">♥ いいね (${p.likes ?? 0})</button>

    <button type="button" class="btn-ai-check">サクラ判定</button>
    <div class="ai-check-result"></div>

    <div class="comment-box">
      <div class="comment-list" id="comment-list-${postId}"></div>
      <div class="commentInputBox">
        <input type="text" placeholder="コメントを追加" id="input-${postId}">
        <button type="button" class="btn-send-comment" id="send-${postId}">送信</button>
      </div>
    </div>
  `;

  postListEl.appendChild(item);

  // スライダー制御
  setupSlider(item);

  // 購入ボタン
  const buyBtn = item.querySelector(".home-buy-btn");
  if (buyBtn) {
    buyBtn.addEventListener("click", () => {
      const url = buyBtn.dataset.url;
      if (url) window.open(url, "_blank");
    });
  }

  // ハッシュタグ → 検索へ
  item.querySelectorAll(".home-hashtag").forEach(el => {
    el.style.cursor = "pointer";
    el.addEventListener("click", () => {
      const tag = el.textContent || "";
      window.location.href = `kensaku.html?tag=${encodeURIComponent(tag)}`;
    });
  });

  // いいね
  setupLike(item, postId, p);

  // コメント
  setupCommentSend(item, postId, currentUid);
  loadComments(postId);

  // AI判定（強化版）
  setupAIButton(item, p, postId);
}
// ✅ パート2 / 2（いいね〜最後まで）
// ※パート1の続きとして、このまま下に貼り付けてOK

// ==============================
// いいね（通知付き / 1人1回・2回目で解除）
// ==============================
function setupLike(item, postId, p) {
  const btn = item.querySelector(".btn-like");
  if (!btn) return;

  const myUid = auth.currentUser?.uid;
  if (!myUid) return;

  let likes = p.likes ?? 0;
  let likedBy = Array.isArray(p.likedBy) ? p.likedBy : [];
  let isLiked = likedBy.includes(myUid);

  let isProcessing = false;

  render();

  btn.addEventListener("pointerdown", () => {
    btn.classList.remove("liked");
    void btn.offsetWidth;
    btn.classList.add("liked");
    setTimeout(() => btn.classList.remove("liked"), 220);
  });

  btn.addEventListener("click", async () => {
    if (isProcessing) return;
    isProcessing = true;

    try {
      const postRef = doc(db, "posts", postId);

      if (!isLiked) {
        likes = likes + 1;
        isLiked = true;
        render();

        await updateDoc(postRef, { likes, likedBy: arrayUnion(myUid) });

        if (p.uid && p.uid !== myUid) {
          await createNotification({
            toUid: p.uid,
            fromUid: myUid,
            type: "like",
            postId,
            message: "あなたの投稿にいいねされました"
          });
        }
      } else {
        likes = Math.max(likes - 1, 0);
        isLiked = false;
        render();

        await updateDoc(postRef, { likes, likedBy: arrayRemove(myUid) });
      }
    } catch (err) {
      console.error("いいねエラー:", err);
    }

    isProcessing = false;
  });

  function render() {
    btn.textContent = `♥ いいね (${likes})`;
    btn.classList.toggle("liked-on", isLiked);
  }
}

// ===========================
// コメント送信（通知付き）
// ===========================
function setupCommentSend(item, postId, uid) {
  const input = item.querySelector(`#input-${postId}`);
  const btn = item.querySelector(`#send-${postId}`);
  if (!input || !btn) return;

  // 二重バインド防止
  if (btn.__bound) return;
  btn.__bound = true;

  btn.addEventListener("click", async () => {
    const text = input.value.trim();
    if (!text) return;

    try {
      const userSnap = await getDoc(doc(db, "users", uid));
      const u = userSnap.exists() ? userSnap.data() : {};

      await addDoc(collection(db, "posts", postId, "comments"), {
        uid,
        text,
        userName: u.userName || u.email || "名無しさん",
        profileImage: u.profileImage || "default.png",
        createdAt: new Date()
      });

      input.value = "";

      const postSnap = await getDoc(doc(db, "posts", postId));
      if (postSnap.exists()) {
        const postData = postSnap.data();
        if (postData.uid && auth.currentUser?.uid && postData.uid !== auth.currentUser.uid) {
          await createNotification({
            toUid: postData.uid,
            fromUid: auth.currentUser.uid,
            type: "comment",
            postId,
            message: `${u.userName || "誰か"}があなたの投稿にコメントしました`
          });
        }
      }
    } catch (err) {
      console.error("コメント送信エラー:", err);
    }
  });
}

// ===========================
// コメント読み込み（投稿ごと購読を1本化）
// ===========================
const _commentUnsubs = new Map(); // postId -> unsubscribe

function loadComments(postId) {
  const listEl = document.getElementById(`comment-list-${postId}`);
  if (!listEl) return;

  // ✅ 既に購読してるなら張らない（増殖防止）
  if (_commentUnsubs.has(postId)) return;

  const commentsRef = collection(db, "posts", postId, "comments");
  const q = query(commentsRef, orderBy("createdAt", "asc"));

  const unsub = onSnapshot(q, async (snapshot) => {
    listEl.innerHTML = "";

    const elements = await Promise.all(snapshot.docs.map(async (cdoc) => {
      const c = cdoc.data();

      let icon = c.profileImage || "default.png";
      let name = c.userName || "名無しさん";

      if (c.uid) {
        try {
          const cUserSnap = await getDoc(doc(db, "users", c.uid));
          if (cUserSnap.exists()) {
            const cu = cUserSnap.data();
            icon = cu.profileImage || icon;
            name = cu.userName || name;
          }
        } catch (err) {
          console.error("コメントユーザー取得エラー:", err);
        }
      }

      const wrap = document.createElement("div");
      wrap.className = "comment-item";
      wrap.innerHTML = `
        <span class="comment-user">
          <img src="${icon}" style="width:24px;height:24px;margin-right:4px;border-radius:50%;">
          ${name}
        </span>
        <span class="comment-text">${c.text || ""}</span>
        ${c.uid === auth.currentUser?.uid ? `<button type="button" class="btn-delete-comment" style="font-size:12px;margin-left:5px;">削除</button>` : ""}
      `;

      const delBtn = wrap.querySelector(".btn-delete-comment");
      if (delBtn) {
        delBtn.addEventListener("click", async () => {
          if (!confirm("コメントを削除しますか？")) return;
          try {
            await deleteDoc(doc(db, "posts", postId, "comments", cdoc.id));
          } catch (e) {
            console.error("コメント削除エラー:", e);
          }
        });
      }

      return wrap;
    }));

    elements.forEach(el => listEl.appendChild(el));
  });

  _commentUnsubs.set(postId, unsub);
}

// ページ離脱時にコメント購読を掃除（保険）
window.addEventListener("beforeunload", () => {
  for (const unsub of _commentUnsubs.values()) {
    try { unsub(); } catch (_) {}
  }
  _commentUnsubs.clear();
});

// ==============================
// ★AI判定（強化版）
// 押すまで表示しない / 判定済みはクリックで即表示 / 補正+理由+段階表示 + 保存
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

    // 保存済みがあるなら API 叩かず即表示
    if (p.aiChecked && typeof p.aiProbability === "number") {
      const prob01 = Number(p.aiProbability ?? 0);
      const savedReasons = Array.isArray(p.aiReasons) ? p.aiReasons : [];
      const lvl = (p.aiLevel || judgeLevel(prob01).level);

      aiResultDiv.classList.remove("ai-low", "ai-mid", "ai-high");
      aiResultDiv.classList.add(
        lvl === "high" ? "ai-high" :
        lvl === "mid"  ? "ai-mid"  : "ai-low"
      );

      aiResultDiv.innerHTML = buildAICheckHTML(prob01, savedReasons);
      aiBtn.disabled = false;
      return;
    }

    let dot = 0;
    aiResultDiv.textContent = "判定中";
    const loader = setInterval(() => {
      dot = (dot + 1) % 4;
      aiResultDiv.textContent = "判定中" + ".".repeat(dot);
    }, 300);

    try {
      const text = p.text || "";
      const base01 = await realAICheckProbability(text); // 0〜1

      const signals = extractPostSignals(p);
      const { adjusted01, reasons } = applyHeuristics(base01, signals);

      clearInterval(loader);

      const lvl = judgeLevel(adjusted01).level;
      aiResultDiv.classList.remove("ai-low", "ai-mid", "ai-high");
      aiResultDiv.classList.add(
        lvl === "high" ? "ai-high" :
        lvl === "mid"  ? "ai-mid"  : "ai-low"
      );

      aiResultDiv.innerHTML = buildAICheckHTML(adjusted01, reasons);

      await updateDoc(doc(db, "posts", postId), {
        aiChecked: true,
        aiProbability: adjusted01,
        aiProbabilityBase: base01,
        aiReasons: reasons,
        aiLevel: lvl
      });

      p.aiChecked = true;
      p.aiProbability = adjusted01;
      p.aiProbabilityBase = base01;
      p.aiReasons = reasons;
      p.aiLevel = lvl;

    } catch (err) {
      clearInterval(loader);
      console.error("AIチェックエラー:", err);
      aiResultDiv.classList.remove("ai-low", "ai-mid", "ai-high");
      aiResultDiv.textContent = "エラー";
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
// ログインチェック
// ==============================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("ログインしてください");
    window.location.href = "loginpage.html";
    return;
  }

  setupImageModalSafe();

  const currentUid = user.uid;
  await loadUserInfo(currentUid);
  loadUserPostsSafe(currentUid);
});
