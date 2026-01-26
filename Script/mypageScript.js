// mypageScript.js（ホーム仕様：media複数画像/動画＋スライダー統合 & フル機能維持）
import { db, auth } from "./firebaseInit.js";
import {
  collection, query, where, getDoc, setDoc, updateDoc, deleteDoc, addDoc,
  onSnapshot, orderBy, arrayUnion, arrayRemove, doc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { createNotification } from "./notificationUtils.js";

// ===========================
// HTML 要素
// ===========================
const profileImgEl = document.getElementById("mypage-profileImage");
const nameEl = document.getElementById("mypage-userName");
const followerEl = document.getElementById("mypage-followerCount");
const followingEl = document.getElementById("mypage-followingCount");
const postListEl = document.getElementById("mypage-postList");
const favoriteListEl = document.getElementById("mypage-favoriteList");
const imageInput = document.getElementById("mypage-imageInput");

const editNameBtn = document.getElementById("editNameBtn");
const editNameBox = document.getElementById("editNameBox");
const nameInput = document.getElementById("nameInput");
const saveNameBtn = document.getElementById("saveNameBtn");

const introEl = document.getElementById("mypage-intro");
const editIntroBtn = document.getElementById("editIntroBtn");
const editIntroBox = document.getElementById("editIntroBox");
const introInput = document.getElementById("introInput");
const saveIntroBtn = document.getElementById("saveIntroBtn");

const toggleFavoritesBtn = document.getElementById("toggleFavoritesBtn");

// AIおすすめ（マイページ用）
const recommendBtn = document.getElementById("loadRecommendBtn");
const recommendList = document.getElementById("recommendList");

let currentUserData = null;


// ==============================
// media配列をスライダーHTMLに変換（home同等）
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

// 旧投稿（imageUrlのみ）も壊さないために正規化
function normalizeMedia(p) {
  if (Array.isArray(p.media) && p.media.length) return p.media;
  if (p.imageUrl) return [{ type: "image", url: p.imageUrl }];
  return [];
}

// DOM内スライダー初期化（home同等 prev/next）
function initMediaSliders(container) {
  const sliders = container.querySelectorAll(".media-slider");
  sliders.forEach(slider => {
    const track = slider.querySelector(".media-track");
    if (!track) return;
    const items = track.children;
    if (!items || items.length <= 1) return;

    let index = 0;
    const update = () => {
      track.style.transform = `translateX(-${index * 100}%)`;
    };

    const prevBtn = slider.querySelector(".prev");
    const nextBtn = slider.querySelector(".next");

    prevBtn?.addEventListener("click", () => {
      index = Math.max(index - 1, 0);
      update();
    });

    nextBtn?.addEventListener("click", () => {
      index = Math.min(index + 1, items.length - 1);
      update();
    });

    update();
  });
}

// ==============================
// 画像モーダル（home同等 / 閉じる×が確実に動く）
// ※ クリック委譲で .home-postImage を拾う
// ※ dataset を使わず、安全なフラグで重複防止
// ==============================
function setupImageModalGlobal(rootEl) {
  if (!rootEl) return;

  let modal = document.getElementById("imageModal");

  // 既存の #imageModal が「想定と違う構造」なら作り直す
  const isBroken =
    modal &&
    (!modal.querySelector(".close") || !modal.querySelector("#modalImg") || !modal.querySelector("#caption"));

  if (!modal || isBroken) {
    if (modal) modal.remove(); // 壊れてる既存を削除
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

  // モーダル側イベントは1回だけ
  if (!modal.__bound) {
    // closeBtn が null になることは基本なくなるが、念のためガード
    closeBtn?.addEventListener("click", () => { modal.style.display = "none"; });
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.style.display = "none";
    });
    modal.__bound = true;
  }

  // root側も1回だけ
  if (rootEl.__modalDelegationBound) return;
  rootEl.__modalDelegationBound = true;

  rootEl.addEventListener("click", (e) => {
    const img = e.target.closest(".home-postImage");
    if (!img) return;

    modal.style.display = "block";
    modalImg.src = img.src;
    captionText.textContent = img.alt || "";
  });
}

// ===========================
// 投稿読み込み（自分の投稿）
// ===========================
async function loadMyPosts(uid) {
  const postsRef = collection(db, "posts");
  const q = query(
    postsRef,
    where("uid", "==", uid),
    orderBy("createdAt", "desc")
  );

  onSnapshot(q, (snapshot) => {
    if (!postListEl) return;

    postListEl.innerHTML = "";
    snapshot.forEach((docSnap) => {
      const p = docSnap.data();
      renderPostItem(p, docSnap.id, uid);
    });
  });
}

// ===========================
// 投稿描画（media複数画像/動画＋スライダー対応）
// ===========================
async function renderPostItem(p, postId, uid) {
  const media = normalizeMedia(p);
  const createdAt = p.createdAt?.toDate
    ? p.createdAt.toDate().toLocaleString()
    : "";

  const productInfoHTML = `
    ${p.productPrice ? `<div class="home-price">価格: ¥${p.productPrice}</div>` : ""}
    ${p.productURL ? `<button type="button" class="home-buy-btn">🛒 購入ページへ</button>` : ""}
  `;

  const item = document.createElement("div");
  item.className = "mypage-post-item";
  item.innerHTML = `
    ${renderMediaSlider(media)}

    <div class="mypage-post-details">
      ${p.itemName ? `<div class="mypage-post-itemName">アイテム名: ${p.itemName}</div>` : ""}

      ${p.text ? `<div class="mypage-post-text">${p.text}</div>` : ""}

      <!-- ✅ 良い点 -->
      ${p.goodPoint ? `
        <div class="home-good-point">
          <span class="point-label good">良い点：</span>${p.goodPoint}
        </div>
      ` : ""}

      <!-- ✅ 悪い点 -->
      ${p.badPoint ? `
        <div class="home-bad-point">
          <span class="point-label bad">悪い点：</span>${p.badPoint}
        </div>
      ` : ""}

      ${productInfoHTML}

      ${Array.isArray(p.hashtags) && p.hashtags.length ? `
        <div class="mypage-hashtags">
          ${p.hashtags
            .map(tag => `<span class="mypage-hashtag">${tag.startsWith('#') ? tag : `#${tag}`}</span>`)
            .join(" ")}
        </div>
      ` : ""}

      ${p.rate ? `
        <div class="mypage-rating">
          <p>使いやすさ：★${p.rate.usability}</p>
          <p>金額：★${p.rate.price}</p>
          <p>性能：★${p.rate.performance}</p>
          <p>見た目：★${p.rate.design}</p>
          <p>買ってよかった：★${p.rate.satisfaction}</p>
          <p><b>総合評価：★${p.rate.average?.toFixed(1) || "-"}</b></p>
        </div>
      ` : ""}

      <div class="mypage-postDate">${createdAt}</div>

      <button type="button" class="post-btn like">♥ いいね (${p.likes ?? 0})</button>
      <button type="button" class="post-btn delete">削除</button>

      <div class="follow-container"></div>

      <div class="comment-box">
        <div class="comment-list" id="comment-list-${postId}"></div>
        <div class="commentInputBox">
          <input type="text" placeholder="コメントを追加" id="input-${postId}">
          <button type="button" id="send-${postId}">送信</button>
        </div>
      </div>
    </div>
  `;

  postListEl.appendChild(item);

  // スライダー初期化
  initMediaSliders(item);

  // 購入ボタン
  if (p.productURL) {
    const buyBtn = item.querySelector(".home-buy-btn");
    buyBtn?.addEventListener("click", () => {
      window.open(p.productURL, "_blank");
    });
  }

  setupLike(item, postId, p);
  setupDelete(item, postId);
  setupCommentSend(item, postId, uid);
  loadComments(postId);

  // フォローボタン（元の仕様維持）
  setupFollowButton(item, p.uid);

  setupHashtagClick(item);
}

// ===========================
// いいね（通知付き / 1人1回・2回目で解除）
// ===========================
function setupLike(item, postId, p) {
  const likeBtn = item.querySelector(".post-btn.like");
  if (!likeBtn) return;

  const myUid = auth.currentUser?.uid;
  if (!myUid) return;

  let likes = p.likes ?? 0;
  let likedBy = Array.isArray(p.likedBy) ? p.likedBy : [];
  let isLiked = likedBy.includes(myUid);

  let isProcessing = false;

  // 初期表示
  render();

  // ✅ 押した瞬間にアニメ（DOM再描画が来る前に見える）
  likeBtn.addEventListener("pointerdown", () => {
    likeBtn.classList.remove("liked");
    void likeBtn.offsetWidth; // reflowでアニメを確実に再発火
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
    } catch (e) {
      console.error("いいね処理失敗:", e);
    }

    isProcessing = false;
  });

  function render() {
    likeBtn.textContent = `♥ いいね (${likes})`;
    likeBtn.classList.toggle("liked-on", isLiked);
  }
}

// ===========================
// 削除
// ===========================
function setupDelete(item, postId) {
  const delBtn = item.querySelector(".post-btn.delete");
  if (!delBtn) return;
  delBtn.addEventListener("click", async () => {
    if (!confirm("この投稿を削除しますか？")) return;
    try { await deleteDoc(doc(db, "posts", postId)); } catch (e) { console.error(e); }
  });
}

// ===========================
// コメント送信（通知付き）
// ===========================
function setupCommentSend(item, postId, uid) {
  const input = item.querySelector(`#input-${postId}`);
  const btn = item.querySelector(`#send-${postId}`);
  if (!input || !btn) return;

  btn.addEventListener("click", async () => {
    const text = input.value.trim();
    if (!text) return;

    try {
      const uSnap = await getDoc(doc(db, "users", uid));
      const u = uSnap.data();

      await addDoc(collection(db, "posts", postId, "comments"), {
        uid,
        text,
        userName: u.userName || u.email,
        profileImage: u.profileImage || "default.png",
        createdAt: new Date()
      });

      input.value = "";

      // 投稿者が自分以外なら通知
      const postSnap = await getDoc(doc(db, "posts", postId));
      if (postSnap.exists()) {
        const postData = postSnap.data();
        if (postData.uid && postData.uid !== auth.currentUser.uid) {
          await createNotification({
            toUid: postData.uid,
            fromUid: auth.currentUser.uid,
            type: "comment",
            postId: postId,
            message: `${u.userName || "誰か"}があなたの投稿にコメントしました`
          });
        }
      }

    } catch (e) {
      console.error("コメント送信エラー:", e);
    }
  });
}

// ===========================
// コメント読み込み
// ===========================
function loadComments(postId) {
  const listEl = document.getElementById(`comment-list-${postId}`);
  if (!listEl) return;

  const commentsRef = collection(db, "posts", postId, "comments");
  const q = query(commentsRef, orderBy("createdAt", "asc"));

  onSnapshot(q, async snapshot => {
    listEl.innerHTML = "";

    for (const cdoc of snapshot.docs) {
      const c = cdoc.data();
      let icon = "default.png";
      let name = c.userName || "名無しさん";

      if (c.uid) {
        try {
          const cuSnap = await getDoc(doc(db, "users", c.uid));
          if (cuSnap.exists()) {
            const cu = cuSnap.data();
            icon = cu.profileImage || icon;
            name = cu.userName || name;
          }
        } catch (e) { console.error(e); }
      }

      const wrap = document.createElement("div");
      wrap.className = "comment-item";
      wrap.innerHTML = `
        <img src="${icon}" class="comment-icon" style="width:28px;height:28px;border-radius:50%;margin-right:6px;">
        <div class="comment-body">
          <div class="comment-name">${name}</div>
          <div class="comment-text">${c.text}</div>
        </div>
      `;
      listEl.appendChild(wrap);
    }
  });
}

// ===========================
// フォロー（投稿カード用：維持）
// ===========================
async function setupFollowButton(item, targetUid) {
  if (!targetUid || targetUid === auth.currentUser.uid) return;
  const container = item.querySelector(".follow-container");
  if (!container) return;

  const targetRef = doc(db, "users", targetUid);
  const meRef = doc(db, "users", auth.currentUser.uid);

  let isFollowing = false;
  const targetSnap = await getDoc(targetRef);
  if (targetSnap.exists()) {
    isFollowing = targetSnap.data().followers?.includes(auth.currentUser.uid) || false;
  }

  const btn = document.createElement("button");
  btn.className = "post-btn followBtn";
  btn.textContent = isFollowing ? "フォロー中" : "フォロー";
  if (isFollowing) btn.classList.add("following");
  container.appendChild(btn);

  btn.addEventListener("click", async () => {
    try {
      if (isFollowing) {
        await updateDoc(meRef, { following: arrayRemove(targetUid) });
        await updateDoc(targetRef, { followers: arrayRemove(auth.currentUser.uid) });
        btn.textContent = "フォロー";
        btn.classList.remove("following");
        isFollowing = false;
      } else {
        await updateDoc(meRef, { following: arrayUnion(targetUid) });
        await updateDoc(targetRef, { followers: arrayUnion(auth.currentUser.uid) });
        btn.textContent = "フォロー中";
        btn.classList.add("following");
        isFollowing = true;
      }

      // カウント更新（※元コードはfollowersを見ていたので、そのまま維持）
      const meSnap = await getDoc(meRef);
      const data = meSnap.data();
      if (followerEl) followerEl.textContent = data.followers?.length || 0;
      if (followingEl) followingEl.textContent = data.following?.length || 0;

    } catch (e) {
      console.error(e);
    }
  });
}

// ===========================
// ハッシュタグクリック
// ===========================
function setupHashtagClick(item) {
  item.querySelectorAll(".mypage-hashtag").forEach(el => {
    el.style.cursor = "pointer";
    el.addEventListener("click", () => alert(`ハッシュタグ検索: ${el.textContent}`));
  });
}

// ===========================
// お気に入り（ユーザーdocのfavorites配列を読む）
// ===========================
async function loadFavorites(uid) {
  if (!favoriteListEl) return;

  try {
    const uSnap = await getDoc(doc(db, "users", uid));
    const favorites = uSnap.data()?.favorites || [];
    favoriteListEl.innerHTML = "";

    if (!favorites.length) {
      favoriteListEl.innerHTML = "<p>お気に入りはまだありません</p>";
      return;
    }

    for (const postId of favorites) {
      const pSnap = await getDoc(doc(db, "posts", postId));
      if (!pSnap.exists()) continue;
      renderFavoriteItem(pSnap.data(), postId);
    }
  } catch (e) {
    console.error(e);
  }
}

// ===========================
// お気に入り投稿描画
// ===========================
async function renderFavoriteItem(p, postId) {
  if (!favoriteListEl) return;

  const media = normalizeMedia(p);

  let icon = "default.png", uname = "名無し";
  if (p.uid) {
    try {
      const uSnap = await getDoc(doc(db, "users", p.uid));
      if (uSnap.exists()) {
        const u = uSnap.data();
        icon = u.profileImage || icon;
        uname = u.userName || uname;
      }
    } catch (e) { console.error(e); }
  }

  const createdAt = p.createdAt?.toDate
    ? p.createdAt.toDate().toLocaleString()
    : "";

  const item = document.createElement("div");
  item.className = "mypage-post-item";
  item.innerHTML = `
    <div class="mypage-post-header">
      <img src="${icon}" class="mypage-userIcon"
        style="width:30px;height:30px;border-radius:50%;margin-right:6px;">
      <span class="mypage-username">${uname}</span>
    </div>

    ${p.itemName ? `<div class="mypage-post-itemName">アイテム名: ${p.itemName}</div>` : ""}

    <p class="mypage-post-text">${p.text || ""}</p>

    <!-- ✅ 良い点 -->
    ${p.goodPoint ? `
      <div class="home-good-point">
        <span class="point-label good">良い点：</span>${p.goodPoint}
      </div>
    ` : ""}

    <!-- ✅ 悪い点 -->
    ${p.badPoint ? `
      <div class="home-bad-point">
        <span class="point-label bad">悪い点：</span>${p.badPoint}
      </div>
    ` : ""}

    ${renderMediaSlider(media)}

    ${Array.isArray(p.hashtags) && p.hashtags.length ? `
      <div class="mypage-hashtags">
        ${p.hashtags
          .map(tag => `<span class="mypage-hashtag">${tag.startsWith('#') ? tag : `#${tag}`}</span>`)
          .join(" ")}
      </div>
    ` : ""}

    ${p.rate ? `
      <div class="mypage-rating">
        <p>使いやすさ：★${p.rate.usability}</p>
        <p>金額：★${p.rate.price}</p>
        <p>性能：★${p.rate.performance}</p>
        <p>見た目：★${p.rate.design}</p>
        <p>買ってよかった：★${p.rate.satisfaction}</p>
        <p><b>総合評価：★${p.rate.average?.toFixed(1) || "-"}</b></p>
      </div>
    ` : ""}

    <div class="mypage-postDate">${createdAt}</div>
  `;

  favoriteListEl.appendChild(item);

  initMediaSliders(item);
  setupHashtagClick(item);
}


// ===========================
// ログインチェック & 初期化
// ===========================
onAuthStateChanged(auth, async user => {
  if (!user) {
    alert("ログインしてください");
    window.location.href = "loginpage.html";
    return;
  }

  const uid = user.uid;
  const userRef = doc(db, "users", uid);
  let snap = await getDoc(userRef);

  if (!snap.exists()) {
    await setDoc(userRef, {
      uid,
      email: user.email || "",
      userName: "",
      intro: "",
      profileImage: "",
      followers: [],
      following: [],
      favorites: [],
      createdAt: new Date()
    });
    snap = await getDoc(userRef);
  }

  const data = snap.data();
  currentUserData = data;

  if (profileImgEl) profileImgEl.src = data.profileImage || "default.png";
  if (nameEl) nameEl.textContent = data.userName || data.email;
  if (introEl) introEl.textContent = data.intro || "自己紹介なし";
  if (followerEl) followerEl.textContent = data.followers?.length || 0;
  if (followingEl) followingEl.textContent = data.following?.length || 0;

  localStorage.setItem("photoFeedUserName", data.userName || data.email);

  // ★ 重要：モーダルは委譲で1回だけ設定（閉じる×問題も解消）
  setupImageModalGlobal(postListEl);
  setupImageModalGlobal(favoriteListEl);

  await loadMyPosts(uid);

  if (favoriteListEl) {
    favoriteListEl.style.display = "none";
    onSnapshot(userRef, () => loadFavorites(uid));
  }
});

// ===========================
// 名前変更
// ===========================
if (editNameBtn && editNameBox && saveNameBtn && nameInput) {
  editNameBtn.addEventListener("click", () => editNameBox.classList.toggle("hidden"));

  saveNameBtn.addEventListener("click", async () => {
    const newName = nameInput.value.trim();
    if (!newName) return alert("名前を入力してください");

    try {
      await updateDoc(doc(db, "users", auth.currentUser.uid), { userName: newName });
      if (nameEl) nameEl.textContent = newName;
      editNameBox.classList.add("hidden");
      localStorage.setItem("photoFeedUserName", newName);
    } catch (e) { console.error(e); }
  });
}

// ===========================
// 自己紹介変更
// ===========================
if (editIntroBtn && editIntroBox && saveIntroBtn && introInput) {
  editIntroBtn.addEventListener("click", () => editIntroBox.classList.toggle("hidden"));

  saveIntroBtn.addEventListener("click", async () => {
    try {
      const newIntro = introInput.value.trim();
      const userRef = doc(db, "users", auth.currentUser.uid);
      await updateDoc(userRef, { intro: newIntro });
      if (introEl) introEl.textContent = newIntro || "自己紹介なし";
      editIntroBox.classList.add("hidden");
    } catch (err) {
      console.error("自己紹介保存エラー:", err);
    }
  });
}

// ===========================
// プロフィール画像変更（Cloudinary）
// ===========================
if (profileImgEl && imageInput) {
  const CLOUD_NAME = "dr9giho8r";
  const UPLOAD_PRESET = "syusyokusakuhin";

  profileImgEl.addEventListener("click", () => imageInput.click());

  imageInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", UPLOAD_PRESET);

      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: "POST",
        body: formData
      });

      const uploadData = await uploadRes.json();
      if (!uploadData.secure_url) {
        alert("画像アップロードに失敗しました");
        console.error(uploadData);
        return;
      }

      const imageUrl = uploadData.secure_url;
      const userRef = doc(db, "users", auth.currentUser.uid);
      await updateDoc(userRef, { profileImage: imageUrl });
      profileImgEl.src = imageUrl;
      alert("プロフィール画像を更新しました！");
    } catch (err) {
      console.error("画像アップロードエラー:", err);
      alert("画像のアップロードに失敗しました");
    }
  });
}

// ===========================
// お気に入りリストの開閉
// ===========================
if (toggleFavoritesBtn && favoriteListEl) {
  toggleFavoritesBtn.addEventListener("click", () => {
    if (favoriteListEl.style.display === "none" || favoriteListEl.style.display === "") {
      favoriteListEl.style.display = "block";
      toggleFavoritesBtn.textContent = "お気に入りを閉じる";
    } else {
      favoriteListEl.style.display = "none";
      toggleFavoritesBtn.textContent = "お気に入りを見る";
    }
  });
}

// ===========================
// Step2：自分の投稿内容を取得（AI用）
// ===========================
function getMyPostTexts() {
  const textElements = document.querySelectorAll(".mypage-post-text");
  const texts = [];
  textElements.forEach(el => {
    const text = el.textContent.trim();
    if (text) texts.push(text);
  });
  return texts;
}

function buildAiInputText() {
  const texts = getMyPostTexts();
  if (texts.length === 0) return "";
  return texts.join("。");
}

// ===========================
// Step1：フロント → サーバーへ送信（AIおすすめ）
// ===========================
if (recommendBtn && recommendList) {
  recommendBtn.addEventListener("click", async () => {
    recommendList.innerHTML = "分析中…";

    const aiText = buildAiInputText();
    if (!aiText) {
      recommendList.innerHTML = "投稿がまだありません";
      return;
    }

    try {
      const res = await fetch("http://localhost:3000/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: aiText })
      });

      if (!res.ok) throw new Error("サーバーエラー");
      const data = await res.json();

      recommendList.innerHTML = `
        <div class="mypage-recommend-item">
          <div class="recommend-title">あなたへのおすすめ</div>
          <div class="recommend-text">
            ${data.result}
          </div>
        </div>
      `;
    } catch (err) {
      console.error("AIおすすめ取得エラー:", err);
      recommendList.innerHTML = "分析に失敗しました";
    }
  });
}

// ===========================
// フォロワー / フォロー一覧（相互・フォロー対応 完全版）
// ===========================
document.addEventListener("DOMContentLoaded", () => {
  const followerEl2  = document.getElementById("mypage-followerCount");
  const followingEl2 = document.getElementById("mypage-followingCount");
  const modal       = document.getElementById("followModal");
  const titleEl     = document.getElementById("followModalTitle");
  const listEl      = document.getElementById("followUserList");
  const closeBtn    = document.getElementById("closeFollowModal");

  if (!followerEl2 || !followingEl2) {
    console.error("フォロー要素が見つかりません");
    return;
  }

  async function showFollowList(uids, title, isFollowingList) {
    titleEl.textContent = title;
    listEl.innerHTML = "";

    const myUid = auth.currentUser.uid;
    const mySnap = await getDoc(doc(db, "users", myUid));
    const myFollowing = mySnap.data().following || [];

    if (!uids || uids.length === 0) {
      listEl.innerHTML = "<p>ユーザーがいません</p>";
      modal.classList.remove("hidden");
      return;
    }

    for (const uid of uids) {
      const snap = await getDoc(doc(db, "users", uid));
      if (!snap.exists()) continue;

      const u = snap.data();
      const isFollowing = myFollowing.includes(uid);
      const isMutual = isFollowing && title === "フォロワー";

      const div = document.createElement("div");
      div.className = "follow-user";

      div.innerHTML = `
        <img src="${u.profileImage || "default.png"}"
             class="follow-user-icon user-link"
             data-uid="${uid}">

        <span class="follow-user-name user-link"
              data-uid="${uid}">
          ${u.userName || u.email}
        </span>

        ${isMutual ? `<span class="mutual-badge">👥 相互</span>` : ""}

        ${
          !isFollowing && title === "フォロワー"
            ? `<button class="btn-follow" data-uid="${uid}">フォローする</button>`
            : isFollowingList
            ? `<button class="btn-unfollow" data-uid="${uid}">解除</button>`
            : ""
        }
      `;
      listEl.appendChild(div);
    }

    modal.classList.remove("hidden");
  }

  followerEl2.addEventListener("click", async () => {
    const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
    showFollowList(snap.data().followers || [], "フォロワー", false);
  });

  followingEl2.addEventListener("click", async () => {
    const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
    showFollowList(snap.data().following || [], "フォロー中", true);
  });

  closeBtn?.addEventListener("click", () => {
    modal.classList.add("hidden");
  });
});

// ===========================
// プロフィール遷移（フォローモーダル内）
// ===========================
document.addEventListener("click", (e) => {
  const link = e.target.closest(".user-link");
  if (!link) return;

  const uid = link.dataset.uid;
  if (uid) location.href = `user.html?uid=${uid}`;
});

// ===========================
// フォローする（モーダル内）
// ===========================
document.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("btn-follow")) return;

  const targetUid = e.target.dataset.uid;
  const myUid = auth.currentUser.uid;

  try {
    await updateDoc(doc(db, "users", myUid), {
      following: arrayUnion(targetUid)
    });

    await updateDoc(doc(db, "users", targetUid), {
      followers: arrayUnion(myUid)
    });

    // UI即反映
    e.target.outerHTML = `<span class="mutual-badge">👥 相互</span>`;
    updateFollowingCount(1);

  } catch (err) {
    console.error("フォロー失敗", err);
    alert("フォローに失敗しました");
  }
});

// ===========================
// フォロー解除（モーダル内）
// ===========================
document.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("btn-unfollow")) return;

  const targetUid = e.target.dataset.uid;
  const myUid = auth.currentUser.uid;

  if (!confirm("フォローを解除しますか？")) return;

  try {
    await updateDoc(doc(db, "users", myUid), {
      following: arrayRemove(targetUid)
    });

    await updateDoc(doc(db, "users", targetUid), {
      followers: arrayRemove(myUid)
    });

    e.target.closest(".follow-user")?.remove();
    updateFollowingCount(-1);

  } catch (err) {
    console.error("フォロー解除失敗", err);
    alert("解除に失敗しました");
  }
});

// ===========================
// フォロー数 即時更新
// ===========================
function updateFollowingCount(delta) {
  const followingEl3 = document.getElementById("mypage-followingCount");
  if (!followingEl3) return;

  const current = parseInt(followingEl3.textContent, 10) || 0;
  followingEl3.textContent = Math.max(0, current + delta);
}
