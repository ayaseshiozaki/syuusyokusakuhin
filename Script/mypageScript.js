// mypageScript.js（共通化＆フル機能版）
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
const logoutBtn = document.getElementById("logoutBtn");

let currentUserData = null;

// ===========================
// ログアウト
// ===========================
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
      window.location.href = "loginpage.html";
    } catch (err) {
      console.error("ログアウト失敗:", err);
      alert("ログアウトに失敗しました");
    }
  });
}

// ===========================
// 投稿読み込み
// ===========================
async function loadMyPosts(uid) {
  const postsRef = collection(db, "posts");
  const q = query(postsRef, where("uid", "==", uid), orderBy("createdAt", "desc"));
  onSnapshot(q, snapshot => {
    postListEl.innerHTML = "";
    snapshot.forEach(docSnap => {
      const p = docSnap.data();
      renderPostItem(p, docSnap.id, uid);
    });
  });
}

// ===========================
// 投稿描画
// ===========================
async function renderPostItem(p, postId, uid) {
  const imgURL = p.imageUrl || "default-post.png";
  const createdAt = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleString() : "";

  // ★追加：商品情報（ホームと同じ仕様）
  const productInfoHTML = `
    ${p.productPrice ? `<div class="home-price">価格: ¥${p.productPrice}</div>` : ""}
    ${p.productURL ? `<button class="home-buy-btn">🛒 購入ページへ</button>` : ""}
  `;

  const item = document.createElement("div");
  item.className = "mypage-post-item";
  item.innerHTML = `
    <img src="${imgURL}" class="mypage-post-img">

    <div class="mypage-post-details">
      ${p.itemName ? `<div class="mypage-post-itemName">アイテム名: ${p.itemName}</div>` : ""}

      ${p.text ? `<div class="mypage-post-text">${p.text}</div>` : ""}

      ${productInfoHTML} <!-- ★追加：価格・購入URL -->

      ${Array.isArray(p.hashtags) && p.hashtags.length ? `
        <div class="mypage-hashtags">
          ${p.hashtags.map(tag => `<span class="mypage-hashtag">${tag.startsWith('#') ? tag : `#${tag}`}</span>`).join(" ")}
        </div>` : ""}

      ${p.rate ? `
        <div class="mypage-rating">
          <p>使いやすさ：★${p.rate.usability}</p>
          <p>金額：★${p.rate.price}</p>
          <p>性能：★${p.rate.performance}</p>
          <p>見た目：★${p.rate.design}</p>
          <p>買ってよかった：★${p.rate.satisfaction}</p>
          <p><b>総合評価：★${p.rate.average?.toFixed(1) || "-"}</b></p>
        </div>` : ""}

      <div class="mypage-postDate">${createdAt}</div>

      <button class="post-btn like">♥ いいね (${p.likes ?? 0})</button>
      <button class="post-btn delete">削除</button>

      <div class="follow-container"></div>

      <div class="comment-box">
        <div class="comment-list" id="comment-list-${postId}"></div>
        <div class="commentInputBox">
          <input type="text" placeholder="コメントを追加" id="input-${postId}">
          <button id="send-${postId}">送信</button>
        </div>
      </div>
    </div>
  `;
  postListEl.appendChild(item);

  // ★追加：購入ボタンの挙動
  if (p.productURL) {
    const buyBtn = item.querySelector(".home-buy-btn");
    if (buyBtn) {
      buyBtn.addEventListener("click", () => {
        window.open(p.productURL, "_blank");
      });
    }
  }

  setupLike(item, postId, p);
  setupDelete(item, postId);
  setupCommentSend(item, postId, uid);
  loadComments(postId);
  setupFollowButton(item, p.uid);
  setupAIButton(item, postId, p.text);
  setupImageModal(item);
  setupHashtagClick(item);
}

// ===========================
// いいね
// ===========================
function setupLike(item, postId, p) {
  const likeBtn = item.querySelector(".post-btn.like");
  if (!likeBtn) return;

  likeBtn.addEventListener("click", async () => {
    try {
      const newLike = (p.likes ?? 0) + 1;

      // ① いいね数更新
      await updateDoc(doc(db, "posts", postId), { likes: newLike });
      p.likes = newLike;
      likeBtn.textContent = `♥ いいね (${newLike})`;

      // ② 🔔 いいね通知を追加
      await createNotification({
        toUid: p.uid,                  // 投稿者
        fromUid: auth.currentUser.uid, // いいねした人
        type: "like",
        postId,
        message: "あなたの投稿にいいねされました"
      });

    } catch (e) {
      console.error(e);
    }
  });
}

// ===========================
// 削除
// ===========================
function setupDelete(item, postId){
  const delBtn = item.querySelector(".post-btn.delete");
  if(!delBtn) return;
  delBtn.addEventListener("click", async ()=>{
    if(!confirm("この投稿を削除しますか？")) return;
    try { await deleteDoc(doc(db,"posts",postId)); } catch(e){console.error(e);}
  });
}

// ===========================
// コメント送信（通知付き）
// ===========================
function setupCommentSend(item, postId, uid){
  const input = item.querySelector(`#input-${postId}`);
  const btn = item.querySelector(`#send-${postId}`);
  if(!input || !btn) return;

  btn.addEventListener("click", async ()=>{
    const text = input.value.trim();
    if(!text) return;

    try {
      const uSnap = await getDoc(doc(db,"users",uid));
      const u = uSnap.data();

      // コメント追加
      await addDoc(collection(db,"posts",postId,"comments"), {
        uid,
        text,
        userName: u.userName || u.email,
        profileImage: u.profileImage || "default.png",
        createdAt: new Date()
      });

      input.value = "";

      // 投稿者が自分以外なら通知作成
      const postSnap = await getDoc(doc(db,"posts",postId));
      if(postSnap.exists()){
        const postData = postSnap.data();
        if(postData.uid && postData.uid !== auth.currentUser.uid){
          await createNotification({
            toUid: postData.uid,                 // 投稿者
            fromUid: auth.currentUser.uid,       // コメントしたユーザー
            type: "comment",
            postId: postId,
            message: `${u.userName || "誰か"}があなたの投稿にコメントしました`
          });
        }
      }

    } catch(e){
      console.error("コメント送信エラー:", e);
    }
  });
}

// ===========================
// コメント読み込み
// ===========================
function loadComments(postId){
  const listEl = document.getElementById(`comment-list-${postId}`);
  if(!listEl) return;

  const commentsRef = collection(db,"posts",postId,"comments");
  const q = query(commentsRef, orderBy("createdAt","asc"));

  onSnapshot(q, async snapshot=>{
    listEl.innerHTML = "";

    for(const cdoc of snapshot.docs){
      const c = cdoc.data();
      let icon = "default.png";
      let name = c.userName || "名無しさん";

      if(c.uid){
        try{
          const cuSnap = await getDoc(doc(db,"users",c.uid));
          if(cuSnap.exists()){
            const cu = cuSnap.data();
            icon = cu.profileImage || icon;
            name = cu.userName || name;
          }
        }catch(e){ console.error(e); }
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
// フォロー
// ===========================
async function setupFollowButton(item, targetUid){
  if(!targetUid||targetUid===auth.currentUser.uid) return;
  const container = item.querySelector(".follow-container");
  if(!container) return;
  const targetRef=doc(db,"users",targetUid);
  const meRef=doc(db,"users",auth.currentUser.uid);
  let isFollowing=false;
  const targetSnap = await getDoc(targetRef);
  if(targetSnap.exists()){isFollowing=targetSnap.data().followers?.includes(auth.currentUser.uid)||false;}
  const btn=document.createElement("button");
  btn.className="post-btn followBtn";
  btn.textContent=isFollowing?"フォロー中":"フォロー";
  if(isFollowing) btn.classList.add("following");
  container.appendChild(btn);

  btn.addEventListener("click", async ()=>{
    try{
      if(isFollowing){
        await updateDoc(meRef,{following:arrayRemove(targetUid)});
        await updateDoc(targetRef,{followers:arrayRemove(auth.currentUser.uid)});
        btn.textContent="フォロー"; btn.classList.remove("following"); isFollowing=false;
      }else{
        await updateDoc(meRef,{following:arrayUnion(targetUid)});
        await updateDoc(targetRef,{followers:arrayUnion(auth.currentUser.uid)});
        btn.textContent="フォロー中"; btn.classList.add("following"); isFollowing=true;
      }
      const meSnap = await getDoc(meRef); const data = meSnap.data();
      if(followerEl) followerEl.textContent=data.followers?.length||0;
      if(followingEl) followingEl.textContent=data.following?.length||0;
    }catch(e){console.error(e);}
  });
}


// ===========================
// 画像モーダル
// ===========================
// ===========================
// 画像モーダル
// ===========================
function setupImageModal(item){

  // ===== 追加：共通モーダル（HTMLで定義済み）を使う =====
  const img = item.querySelector(".mypage-post-img, .mypage-postImage");
  if (!img) return;

  img.style.cursor = "pointer";

  img.addEventListener("click", () => {
    if (imageModalEl && imageModalImgEl) {
      imageModalImgEl.src = img.src;
      imageModalEl.classList.remove("hidden");
      return;
    }

    // ===== 既存処理（フォールバック用：削除しない） =====
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

      modal.querySelector(".close").addEventListener("click", () => {
        modal.style.display = "none";
      });

      modal.addEventListener("click", e => {
        if (e.target === modal) modal.style.display = "none";
      });
    }

    document.getElementById("modalImg").src = img.src;
    document.getElementById("caption").textContent = img.alt || "";
    modal.style.display = "block";
  });
}

// ===========================
// ハッシュタグクリック
// ===========================
function setupHashtagClick(item){
  item.querySelectorAll(".mypage-hashtag").forEach(el=>{
    el.style.cursor="pointer";
    el.addEventListener("click", ()=> alert(`ハッシュタグ検索: ${el.textContent}`));
  });
}

// ===========================
// お気に入り
// ===========================
async function loadFavorites(uid){
  if(!favoriteListEl) return;
  try{
    const uSnap = await getDoc(doc(db,"users",uid));
    const favorites = uSnap.data()?.favorites||[];
    favoriteListEl.innerHTML="";
    if(!favorites.length){favoriteListEl.innerHTML="<p>お気に入りはまだありません</p>"; return;}
    for(const postId of favorites){
      const pSnap=await getDoc(doc(db,"posts",postId));
      if(!pSnap.exists()) continue;
      renderFavoriteItem(pSnap.data(), postId);
    }
  }catch(e){console.error(e);}
}

async function renderFavoriteItem(p, postId){
  if(!favoriteListEl) return;
  let icon="default.png", uname="名無し";
  if(p.uid){
    try{ const uSnap=await getDoc(doc(db,"users",p.uid)); if(uSnap.exists()){const u=uSnap.data(); icon=u.profileImage||icon; uname=u.userName||uname;} }catch(e){console.error(e);}
  }
  const createdAt=p.createdAt?.toDate?p.createdAt.toDate().toLocaleString():"";
  const item=document.createElement("div"); item.className="mypage-post-item";
  item.innerHTML=`
    <div class="mypage-post-header">
      <img src="${icon}" class="mypage-userIcon" style="width:30px;height:30px;border-radius:50%;margin-right:6px;">
      <span class="mypage-username">${uname}</span>
    </div>
    ${p.itemName?`<div class="mypage-post-itemName">アイテム名: ${p.itemName}</div>`:""}
    <p class="mypage-post-text">${p.text||""}</p>
    ${p.imageUrl?`<img src="${p.imageUrl}" class="mypage-postImage">`:""}
    ${Array.isArray(p.hashtags)&&p.hashtags.length?`<div class="mypage-hashtags">${p.hashtags.map(tag=>`<span class="mypage-hashtag">${tag.startsWith('#')?tag:`#${tag}`}</span>`).join(" ")}</div>`:""}
    ${p.rate?`<div class="mypage-rating">
      <p>使いやすさ：★${p.rate.usability}</p>
      <p>金額：★${p.rate.price}</p>
      <p>性能：★${p.rate.performance}</p>
      <p>見た目：★${p.rate.design}</p>
      <p>買ってよかった：★${p.rate.satisfaction}</p>
      <p><b>総合評価：★${p.rate.average?.toFixed(1)||"-"}</b></p>
    </div>`:""}
    <div class="mypage-postDate">${createdAt}</div>
  `;
  favoriteListEl.appendChild(item);
  setupImageModal(item);
  setupHashtagClick(item);
}

// ===========================
// ログインチェック & 初期化
// ===========================
onAuthStateChanged(auth, async user=>{
  if(!user){ alert("ログインしてください"); window.location.href="loginpage.html"; return;}
  const uid=user.uid;
  const userRef=doc(db,"users",uid);
  let snap=await getDoc(userRef);
  if(!snap.exists()){
    await setDoc(userRef,{uid,email:user.email||"",userName:"",intro:"",profileImage:"",followers:[],following:[],favorites:[],createdAt:new Date()});
    snap=await getDoc(userRef);
  }
  const data=snap.data(); currentUserData=data;
  if(profileImgEl) profileImgEl.src=data.profileImage||"default.png";
  if(nameEl) nameEl.textContent=data.userName||data.email;
  if(introEl) introEl.textContent=data.intro||"自己紹介なし";
  if(followerEl) followerEl.textContent=data.followers?.length||0;
  if(followingEl) followingEl.textContent=data.following?.length||0;
  localStorage.setItem("photoFeedUserName",data.userName||data.email);

  await loadMyPosts(uid);
  if(favoriteListEl){favoriteListEl.style.display="none"; onSnapshot(userRef, ()=>loadFavorites(uid));}
});

// ===========================
// 名前変更
// ===========================
if(editNameBtn && editNameBox && saveNameBtn && nameInput){
  editNameBtn.addEventListener("click", ()=>editNameBox.classList.toggle("hidden"));
  saveNameBtn.addEventListener("click", async ()=>{
    const newName=nameInput.value.trim();
    if(!newName) return alert("名前を入力してください");
    try{
      await updateDoc(doc(db,"users",auth.currentUser.uid),{userName:newName});
      if(nameEl) nameEl.textContent=newName;
      editNameBox.classList.add("hidden");
      localStorage.setItem("photoFeedUserName",newName);
    }catch(e){console.error(e);}
  });
}

// ===========================
// 自己紹介変更
// ===========================
if(editIntroBtn && editIntroBox && saveIntroBtn && introInput){
  editIntroBtn.addEventListener("click", ()=>editIntroBox.classList.toggle("hidden"));
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
// プロフィール画像変更
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

// マイページに表示されている自分の投稿本文を取得
function getMyPostTexts() {
  const textElements = document.querySelectorAll(".mypage-post-text");
  const texts = [];

  textElements.forEach(el => {
    const text = el.textContent.trim();
    if (text) {
      texts.push(text);
    }
  });

  return texts;
}

// AIに渡す1つの文章にまとめる
function buildAiInputText() {
  const texts = getMyPostTexts();
  if (texts.length === 0) return "";
  return texts.join("。");
}

// ===========================
// Step1：フロント → サーバーへ送信（本命）
// ===========================
const recommendBtn = document.getElementById("loadRecommendBtn");
const recommendList = document.getElementById("recommendList");

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
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: aiText
        })
      });

      if (!res.ok) {
        throw new Error("サーバーエラー");
      }

      const data = await res.json();

      // ===========================
      // AIの返答を表示（デザイン用HTML構造）
      // ===========================
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
