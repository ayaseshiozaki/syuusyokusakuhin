// kensakuScript.js（過去投稿が出ない問題修正版 + AI強化版・全文コピペOK）

import { db, auth } from "./firebaseInit.js";
import {
  collection, query, orderBy, onSnapshot,
  doc, getDoc, addDoc, deleteDoc, updateDoc,
  arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { createNotification } from "./notificationUtils.js";

// ★追加：サクラ判定強化（補正・理由・段階表示）
import {
  extractPostSignals,
  applyHeuristics,
  buildAICheckHTML,
  judgeLevel
} from "./aiTrustUtils.js";

// ==============================
// DOM
// ==============================
const searchInput = document.getElementById("kensakuInput");
const searchBtn = document.getElementById("kensakuBtn");
const searchResults = document.getElementById("kensakuResults");

let allPosts = [];
let loginUser = null;

// ==============================
// ログイン確認
// ==============================
auth.onAuthStateChanged(user => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    loginUser = user;
    init();
  }
});

// ==============================
// 初期処理
// ==============================
function init() {
  const postsRef = collection(db, "posts");

  // 画像モーダル（壊れてても修復する安全版）
  setupImageModalSafe();

  // 投稿購読（createdAt混在/欠落でも止まらない：購読1本化+fallback）
  subscribePostsSafe(postsRef);

  // 検索ボタン
  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      const keyword = (searchInput?.value || "").trim().toLowerCase();
      searchPosts(keyword);
    });
  }
}

// ==============================
// 投稿購読（安全版・購読1本化）
// createdAtが無い/型が混在しても「過去投稿が取れない」を防ぐ
// ==============================
function subscribePostsSafe(postsRef) {
  const qMain = query(postsRef, orderBy("createdAt", "desc")); // 通常
  const qFallback = query(postsRef);                           // 救済（全件）

  let usingFallback = false;

  const startFallback = () => {
    if (usingFallback) return;
    usingFallback = true;

    onSnapshot(
      qFallback,
      (snapshot) => {
        allPosts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        allPosts.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        renderResults(allPosts);
      },
      (error) => {
        console.error("kensaku fallback snapshot error:", error);
      }
    );
  };

  onSnapshot(
    qMain,
    (snapshot) => {
      allPosts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderResults(allPosts);
    },
    (error) => {
      console.error("kensaku main snapshot error:", error);
      startFallback();
    }
  );
}

// createdAt を millis に変換（Timestamp/Date/文字列/数値に対応）
function toMillis(createdAt) {
  if (!createdAt) return 0;
  if (typeof createdAt?.toDate === "function") return createdAt.toDate().getTime(); // Timestamp
  if (createdAt instanceof Date) return createdAt.getTime();
  if (typeof createdAt === "number") return createdAt;
  const t = new Date(createdAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

// ==============================
// 検索処理（ローカルフィルタ）
// ==============================
function searchPosts(keyword) {
  if (!keyword) {
    renderResults(allPosts);
    return;
  }

  const filtered = allPosts.filter(p => {
    const text = (p.text || "").toLowerCase();
    const item = (p.itemName || "").toLowerCase();
    const tags = (Array.isArray(p.hashtags) ? p.hashtags.join(" ") : "").toLowerCase();
    const name = (p.userName || "").toLowerCase(); // postsにuserNameがある場合のみ

    return (
      text.includes(keyword) ||
      item.includes(keyword) ||
      tags.includes(keyword) ||
      name.includes(keyword)
    );
  });

  renderResults(filtered);
}

// ==============================
// 投稿レンダリング
// ==============================
async function renderResults(posts) {
  if (!searchResults) return;

  searchResults.innerHTML = "";

  if (!posts.length) {
    searchResults.innerHTML = "<p>該当する投稿はありません。</p>";
    return;
  }

  for (const p of posts) {
    let userIcon = "default.png";
    let username = "名無し";

    if (p.uid) {
      try {
        const userSnap = await getDoc(doc(db, "users", p.uid));
        if (userSnap.exists()) {
          const u = userSnap.data();
          userIcon = u.profileImage || userIcon;
          username = u.userName || username;
        }
      } catch (e) {
        console.error("ユーザー取得失敗", e);
      }
    }

    // createdAt 表示（混在OK）
    const ms = toMillis(p.createdAt);
    const createdAt = ms ? new Date(ms).toLocaleString() : "";

    // ===== 評価HTML（homeと同じ・安全版）=====
    const ratingsHTML = p.rate ? (() => {
      const avg = Number(p.rate?.average);
      const avgText = Number.isFinite(avg) ? avg.toFixed(1) : "-";
      return `
        <div class="home-rating">
          <p>使いやすさ：★${p.rate.usability}</p>
          <p>金額：★${p.rate.price}</p>
          <p>性能：★${p.rate.performance}</p>
          <p>見た目：★${p.rate.design}</p>
          <p>買ってよかった：★${p.rate.satisfaction}</p>
          <p><b>総合評価：★${avgText}</b></p>
        </div>
      `;
    })() : "";

    const postDiv = document.createElement("div");
    postDiv.className = "home-post";

    // ★重要：AI結果は「押すまで表示しない」ので初期は空にする
postDiv.innerHTML = `
  <div class="home-post-header">
    <img src="${userIcon}" class="home-post-icon user-link" data-uid="${p.uid || ""}">
    <span class="home-username user-link" data-uid="${p.uid || ""}">${username}</span>
  </div>

  ${p.itemName ? `<div class="home-itemName">${p.itemName}</div>` : ""}

  <p class="home-text">${p.text || ""}</p>

  <!-- ✅ 追加：良い点 / 悪い点 -->
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

  ${p.productPrice ? `<div class="home-price">価格: ¥${p.productPrice}</div>` : ""}
  ${p.productURL ? `
    <div class="home-purchaseUrl">
      <button type="button" class="home-buy-btn" data-url="${p.productURL}">🛒購入ページへ</button>
    </div>` : ""}

  ${renderMediaSlider(p.media, p.imageUrl)}

  ${p.hashtags?.length ? `
    <div class="home-hashtags">
      ${p.hashtags.map(t => `<span class="home-hashtag">${t.startsWith("#") ? t : "#" + t}</span>`).join("")}
    </div>` : ""}

  ${ratingsHTML}

  <div class="home-postDate">${createdAt}</div>

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

    searchResults.appendChild(postDiv);

    // ===== 購入ボタン =====
    const buyBtn = postDiv.querySelector(".home-buy-btn");
    if (buyBtn) {
      buyBtn.addEventListener("click", () => {
        window.open(buyBtn.dataset.url, "_blank");
      });
    }

    // ===== ユーザーリンク =====
    postDiv.querySelectorAll(".user-link").forEach(el => {
      const uid = el.dataset.uid;
      if (uid && uid !== loginUser.uid) {
        el.style.cursor = "pointer";
        el.onclick = () => location.href = `user.html?uid=${uid}`;
      }
    });

    // スライダー
    setupSlider(postDiv);

    // いいね
    setupLikeButton(postDiv, p);

    // お気に入り
    setupFavoriteButton(postDiv, p.id);

    // フォロー
    setupFollowButton(postDiv, p.uid);

    // コメント
    setupComments(postDiv, p);

    // ★AI判定（強化版）
    setupAICheck(postDiv, p);
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
      <div class="media-track">${slides}</div>
      <button type="button" class="slide-btn next">›</button>
    </div>
  `;
}

// ==============================
// スライダー制御
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

  slider.querySelector(".prev")?.addEventListener("click", () => {
    index = Math.max(index - 1, 0);
    update();
  });

  slider.querySelector(".next")?.addEventListener("click", () => {
    index = Math.min(index + 1, items.length - 1);
    update();
  });

  update();
}

// ==============================
// いいね（通知付き / 1人1回・2回目で解除）
// ==============================
async function setupLikeButton(postDiv, postData) {
  const btn = postDiv.querySelector(".btn-like");
  if (!btn) return;

  const myUid = loginUser?.uid;
  if (!myUid) return;

  let likes = postData.likes ?? 0;
  let likedBy = Array.isArray(postData.likedBy) ? postData.likedBy : [];
  let isLiked = likedBy.includes(myUid);
  let busy = false;

  // 初期表示
  render();

  // 押した瞬間のマイクロインタラクション（ポン）
  btn.addEventListener("pointerdown", () => {
    btn.classList.remove("liked");
    void btn.offsetWidth; // reflow
    btn.classList.add("liked");
    setTimeout(() => btn.classList.remove("liked"), 220);
  });

  btn.onclick = async () => {
    if (busy) return;
    busy = true;

    try {
      const postRef = doc(db, "posts", postData.id);

      if (!isLiked) {
        // 👍 いいね
        likes += 1;
        isLiked = true;
        render();

        await updateDoc(postRef, {
          likes,
          likedBy: arrayUnion(myUid)
        });

        // 🔔 通知（自分以外）
        if (postData.uid !== myUid) {
          await createNotification({
            toUid: postData.uid,
            fromUid: myUid,
            type: "like",
            postId: postData.id,
            message: "あなたの投稿にいいねされました"
          });
        }
      } else {
        // 👎 いいね解除
        likes = Math.max(likes - 1, 0);
        isLiked = false;
        render();

        await updateDoc(postRef, {
          likes,
          likedBy: arrayRemove(myUid)
        });
      }
    } catch (e) {
      console.error("いいね失敗", e);
    }

    busy = false;
  };

  function render() {
    btn.textContent = `♥ いいね (${likes})`;
    btn.classList.toggle("liked-on", isLiked);
  }
}

// ==============================
// お気に入り
// ==============================
async function setupFavoriteButton(postDiv, postId) {
  const btn = postDiv.querySelector(".btn-favorite");
  const userRef = doc(db, "users", loginUser.uid);

  const snap = await getDoc(userRef);
  let favs = snap.data()?.favorites ?? [];
  let isFav = favs.includes(postId);

  const render = () => {
    btn.textContent = isFav ? "★ お気に入り解除" : "☆ お気に入り";
    btn.classList.toggle("favorited", isFav);
  };
  render();

  btn.onclick = async () => {
    if (isFav) {
      await updateDoc(userRef, { favorites: arrayRemove(postId) });
      isFav = false;
    } else {
      await updateDoc(userRef, { favorites: arrayUnion(postId) });
      isFav = true;
    }
    render();
  };
}

// ==============================
// フォロー
// ==============================
async function setupFollowButton(postDiv, targetUid) {
  if (!targetUid || targetUid === loginUser.uid) return;

  const container = postDiv.querySelector(".follow-container");
  if (!container) return;

  const meRef = doc(db, "users", loginUser.uid);
  const targetRef = doc(db, "users", targetUid);

  const targetSnap = await getDoc(targetRef);
  let isFollowing = targetSnap.data()?.followers?.includes(loginUser.uid);

  const btn = document.createElement("button");
  btn.className = "btn-follow";
  btn.textContent = isFollowing ? "フォロー中" : "フォロー";
  container.appendChild(btn);

  btn.onclick = async () => {
    if (isFollowing) {
      await updateDoc(meRef, { following: arrayRemove(targetUid) });
      await updateDoc(targetRef, { followers: arrayRemove(loginUser.uid) });
      btn.textContent = "フォロー";
      isFollowing = false;
    } else {
      await updateDoc(meRef, { following: arrayUnion(targetUid) });
      await updateDoc(targetRef, { followers: arrayUnion(loginUser.uid) });
      btn.textContent = "フォロー中";
      isFollowing = true;
    }
  };
}

// ==============================
// コメント
// ==============================
function setupComments(postDiv, postData) {
  const btnToggle = postDiv.querySelector(".btn-show-comment");
  const box = postDiv.querySelector(".comment-box");
  const list = postDiv.querySelector(".comment-list");
  const input = postDiv.querySelector(".commentInputBox input");
  const send = postDiv.querySelector(".btn-send-comment");

  btnToggle.onclick = () => {
    box.style.display = box.style.display === "none" ? "block" : "none";
  };

  const ref = collection(db, "posts", postData.id, "comments");

  onSnapshot(query(ref, orderBy("createdAt", "asc")), async snap => {
    list.innerHTML = "";
    for (const d of snap.docs) {
      const c = d.data();
      const div = document.createElement("div");
      div.className = "comment-item";
      div.innerHTML = `
        <span>${c.text}</span>
        ${c.uid === loginUser.uid ? `<button type="button">削除</button>` : ""}
      `;
      list.appendChild(div);

      const del = div.querySelector("button");
      if (del) {
        del.onclick = async () => {
          await deleteDoc(doc(ref, d.id));
        };
      }
    }
  });

  send.onclick = async () => {
    const text = (input.value || "").trim();
    if (!text) return;

    await addDoc(ref, {
      uid: loginUser.uid,
      text,
      createdAt: new Date()
    });
    input.value = "";

    if (postData.uid !== loginUser.uid) {
      await createNotification({
        toUid: postData.uid,
        fromUid: loginUser.uid,
        type: "comment",
        postId: postData.id,
        message: "あなたの投稿にコメントしました"
      });
    }
  };
}

// ==============================
// AI判定（強化版）
// 押すまで表示しない / 判定済みはクリックで即表示 / 補正+理由+段階表示
// ==============================
function setupAICheck(postDiv, p) {
  const aiBtn = postDiv.querySelector(".btn-ai-check");
  const result = postDiv.querySelector(".ai-check-result");
  if (!aiBtn || !result) return;

  // 初期は空（押すまで表示しない）
  result.innerHTML = "";
  result.classList.remove("ai-low", "ai-mid", "ai-high");

  aiBtn.addEventListener("click", async (event) => {
    event.preventDefault();
    if (aiBtn.disabled) return;
    aiBtn.disabled = true;

    // 保存済みがあるなら、API叩かず即表示（押すまで表示しない）
    if (p.aiChecked && typeof p.aiProbability === "number") {
      const prob01 = Number(p.aiProbability ?? 0);
      const savedReasons = Array.isArray(p.aiReasons) ? p.aiReasons : [];
      const lvl = (p.aiLevel || judgeLevel(prob01).level);

      result.classList.remove("ai-low", "ai-mid", "ai-high");
      result.classList.add(
        lvl === "high" ? "ai-high" :
        lvl === "mid" ? "ai-mid" :
        "ai-low"
      );

      result.innerHTML = buildAICheckHTML(prob01, savedReasons);
      aiBtn.disabled = false;
      return;
    }

    let dot = 0;
    result.classList.remove("ai-low", "ai-mid", "ai-high");
    result.textContent = "判定中";
    const loader = setInterval(() => {
      dot = (dot + 1) % 4;
      result.textContent = "判定中" + ".".repeat(dot);
    }, 300);

    try {
      const text = p.text || "";
      const base01 = await realAICheckProbability(text); // 0〜1

      const signals = extractPostSignals(p);
      const { adjusted01, reasons } = applyHeuristics(base01, signals);

      clearInterval(loader);

      const lvl = judgeLevel(adjusted01).level;
      result.classList.add(
        lvl === "high" ? "ai-high" :
        lvl === "mid" ? "ai-mid" :
        "ai-low"
      );

      result.innerHTML = buildAICheckHTML(adjusted01, reasons);

      // 保存
      await updateDoc(doc(db, "posts", p.id), {
        aiChecked: true,
        aiProbability: adjusted01,
        aiProbabilityBase: base01,
        aiReasons: reasons,
        aiLevel: lvl
      });

      // 次回クリックで即表示できるようにローカルも更新
      p.aiChecked = true;
      p.aiProbability = adjusted01;
      p.aiProbabilityBase = base01;
      p.aiReasons = reasons;
      p.aiLevel = lvl;

    } catch (e) {
      clearInterval(loader);
      console.error("AI判定エラー", e);
      result.classList.remove("ai-low", "ai-mid", "ai-high");
      result.textContent = "エラー";
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
// 画像モーダル（安全版：増殖しない/壊れてても修復）
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

  // 検索結果内の画像クリックを拾う（クリック委譲）
  if (!document.body.__kensakuModalDelegationBound) {
    document.body.__kensakuModalDelegationBound = true;
    document.body.addEventListener("click", (e) => {
      const img = e.target.closest(".home-postImage");
      if (!img) return;
      modal.style.display = "block";
      modalImg.src = img.src;
      captionText.textContent = img.alt || "";
    });
  }
}
