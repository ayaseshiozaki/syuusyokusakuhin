import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getFirestore, collection, query, orderBy, onSnapshot,
  doc, getDoc, addDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

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
const auth = getAuth(app);

const homeFeed = document.querySelector(".home-feed");

// ログイン監視
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  loadPosts();
});

// 投稿読み込み
function loadPosts() {
  const postsRef = collection(db, "posts");
  const q = query(postsRef, orderBy("createdAt", "desc"));

  onSnapshot(q, async (snapshot) => {
    const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderPosts(posts);
  });
}

// 投稿描画
async function renderPosts(posts) {
  homeFeed.innerHTML = "";

  for (const p of posts) {
    // 投稿者情報取得
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

    // 評価HTML
    const ratingsHTML = p.rate ? `
      <div class="home-rating">
        <p>使いやすさ：★${p.rate.usability}</p>
        <p>金額：★${p.rate.price}</p>
        <p>性能：★${p.rate.performance}</p>
        <p>見た目：★${p.rate.design}</p>
        <p>買ってよかった：★${p.rate.satisfaction}</p>
        <p><b>総合評価：★${p.rate.average.toFixed(1)}</b></p>
      </div>
    ` : "";

    // ハッシュタグHTML（必ず # が付くように修正）
    const hashtagsHTML = p.hashtags?.length ? `
      <div class="home-hashtags">
        ${p.hashtags.map(tag => `<span class="home-hashtag">${tag.startsWith('#') ? tag : `#${tag}`}</span>`).join(" ")}
      </div>
    ` : "";

    // 投稿日時
    let createdAt = "";
    if (p.createdAt?.toDate) createdAt = p.createdAt.toDate().toLocaleString();
    else if (p.createdAt) createdAt = new Date(p.createdAt).toLocaleString();

    const postDiv = document.createElement("div");
    postDiv.classList.add("home-post");
    postDiv.innerHTML = `
      <div class="home-post-header">
        <img src="${userIcon}" class="home-post-icon" alt="user icon">
        <span class="home-username">${userName}</span>
      </div>

      ${p.itemName ? `<div class="home-itemName">アイテム名: ${p.itemName}</div>` : ""}
      <p class="home-text">${p.text || ""}</p>
      ${p.imageUrl ? `<img src="${p.imageUrl}" class="home-postImage">` : ""}
      ${hashtagsHTML}
      ${ratingsHTML}
      <div class="home-postDate">${createdAt}</div>

      <button class="btn-show-comment">コメント</button>
      <div class="comment-box" style="display:none;">
        <div class="comment-list"></div>
        <div class="commentInputBox">
          <input type="text" placeholder="コメントを入力">
          <button class="btn-send-comment">送信</button>
        </div>
      </div>
    `;
    homeFeed.appendChild(postDiv);

    // コメント表示切替
    const btnShowComment = postDiv.querySelector(".btn-show-comment");
    const commentBox = postDiv.querySelector(".comment-box");
    btnShowComment.addEventListener("click", () => {
      commentBox.style.display = commentBox.style.display === "none" ? "block" : "none";
    });

    const commentList = postDiv.querySelector(".comment-list");
    const commentsRef = collection(db, "posts", p.id, "comments");

    // コメントリアルタイム読み込み
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
          <span class="comment-user"><img src="${cUserIcon}" class="home-post-icon" style="width:24px;height:24px;margin-right:4px;border-radius:50%;">${cUserName}</span>
          <span class="comment-text">${c.text}</span>
          ${c.uid === auth.currentUser.uid ? `<button class="btn-delete-comment" style="font-size:12px;margin-left:5px;">削除</button>` : ""}
          <button class="btn-reply" style="font-size:12px;margin-left:5px;">返信</button>
          <div class="reply-box" style="margin-left:20px;display:none;">
            <div class="reply-list"></div>
            <div class="replyInputBox">
              <input type="text" placeholder="返信を入力">
              <button class="btn-send-reply">送信</button>
            </div>
          </div>
        `;
        commentList.appendChild(cDiv);

        // コメント削除
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

        // 返信表示切替
        const btnReply = cDiv.querySelector(".btn-reply");
        const replyBox = cDiv.querySelector(".reply-box");
        btnReply.addEventListener("click", () => {
          replyBox.style.display = replyBox.style.display === "none" ? "block" : "none";
        });

        const btnSendReply = cDiv.querySelector(".btn-send-reply");
        const inputReply = cDiv.querySelector(".replyInputBox input");
        const replyList = cDiv.querySelector(".reply-list");
        const repliesRef = collection(db, "posts", p.id, "comments", cdoc.id, "replies");

        btnSendReply.addEventListener("click", async () => {
          const text = inputReply.value.trim();
          if (!text) return;
          try {
            await addDoc(repliesRef, {
              uid: auth.currentUser.uid,
              text,
              createdAt: new Date()
            });
            inputReply.value = "";
          } catch (err) {
            console.error("返信送信エラー:", err);
          }
        });

        // 返信一覧
        onSnapshot(query(repliesRef, orderBy("createdAt", "asc")), async (snapshot) => {
          replyList.innerHTML = "";
          for (const rdoc of snapshot.docs) {
            const r = rdoc.data();
            let rUserIcon = "default.png";
            let rUserName = "名無し";
            if (r.uid) {
              const rUserSnap = await getDoc(doc(db, "users", r.uid));
              if (rUserSnap.exists()) {
                const ru = rUserSnap.data();
                rUserIcon = ru.profileImage || "default.png";
                rUserName = ru.userName || "名無し";
              }
            }
            const rDiv = document.createElement("div");
            rDiv.classList.add("comment-item");
            rDiv.innerHTML = `
              <span class="comment-user"><img src="${rUserIcon}" class="home-post-icon" style="width:20px;height:20px;margin-right:4px;border-radius:50%;">${rUserName}</span>
              <span class="comment-text">${r.text}</span>
              ${r.uid === auth.currentUser.uid ? `<button class="btn-delete-reply" style="font-size:12px;margin-left:5px;">削除</button>` : ""}
            `;
            replyList.appendChild(rDiv);

            // 返信削除
            const btnDeleteReply = rDiv.querySelector(".btn-delete-reply");
            if (btnDeleteReply) {
              btnDeleteReply.addEventListener("click", async () => {
                if (!confirm("返信を削除しますか？")) return;
                try {
                  await deleteDoc(doc(db, "posts", p.id, "comments", cdoc.id, "replies", rdoc.id));
                } catch (err) {
                  console.error("返信削除エラー:", err);
                }
              });
            }
          }
        });
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
      } catch (err) {
        console.error("コメント送信エラー:", err);
      }
    });
  }
}
