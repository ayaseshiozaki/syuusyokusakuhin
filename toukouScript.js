// ========= Firebase import =========
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, query, orderBy,
  onSnapshot, updateDoc, deleteDoc, doc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// ========= Firebase 初期化 =========
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

// ========= Cloudinary 設定 =========
const cloudName = "dr9giho8r";
const uploadPreset = "syusyokusakuhin";

// ========= 投稿処理 =========
document.getElementById("toukouSubmitBtn").addEventListener("click", async () => {
  const username = document.getElementById("toukouUsername").value.trim();
  const text = document.getElementById("toukouText").value.trim();
  const hashtagsInput = document.getElementById("toukouHashtags")?.value.trim() || "";
  const file = document.getElementById("toukouImageInput").files[0];

  if (!username && !text && !file) return;

  // ハッシュタグを配列に変換（#は付いてても付いてなくてもOK）
  const hashtags = hashtagsInput
    .split(/\s+/)
    .filter(tag => tag !== "")
    .map(tag => tag.startsWith("#") ? tag : `#${tag}`);

  let imageUrl = "";

  if (file) {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", uploadPreset);

      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        body: formData
      });

      const data = await res.json();
      imageUrl = data.secure_url;
    } catch (err) {
      console.error("Cloudinary upload error:", err);
      alert("画像のアップロードに失敗しました");
      return;
    }
  }

  // Firestore へ投稿
  try {
    await addDoc(collection(db, "posts"), {
      username,
      text,
      hashtags, // ← ハッシュタグ保存
      imageUrl,
      likes: 0,
      createdAt: new Date()
    });
  } catch (err) {
    console.error("Firestore addDoc error:", err);
    alert("投稿に失敗しました");
    return;
  }

  // フォームリセット
  document.getElementById("toukouUsername").value = "";
  document.getElementById("toukouText").value = "";
  document.getElementById("toukouHashtags").value = "";
  document.getElementById("toukouImageInput").value = "";
});

// ========= 投稿リアルタイム表示 =========
const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
onSnapshot(q, (snapshot) => {
  const list = document.getElementById("toukouList");
  list.innerHTML = "";

  snapshot.forEach(docSnap => {
    const p = docSnap.data();
    const postId = docSnap.id;

    const postDiv = document.createElement("div");
    postDiv.classList.add("toukou-post");

    const hashtagsHTML = p.hashtags
      ? `<div class="toukou-hashtags">${p.hashtags.map(tag => `<span class="tag">${tag}</span>`).join(" ")}</div>`
      : "";

    postDiv.innerHTML = `
      <h3>${p.username}</h3>
      <p>${p.text}</p>
      ${hashtagsHTML}
      ${p.imageUrl ? `<img src="${p.imageUrl}" class="toukou-postImage">` : ""}
      <div>
        <button class="toukou-likeBtn">♥ いいね</button>
        <span class="toukou-likeCount">${p.likes}</span>
        <button class="toukou-deleteBtn">削除</button>
      </div>
      <div class="toukou-postDate">
        ${p.createdAt.toDate ? p.createdAt.toDate().toLocaleString() : new Date(p.createdAt).toLocaleString()}
      </div>
      <hr>
    `;
    list.appendChild(postDiv);

    // いいね
    const likeBtn = postDiv.querySelector(".toukou-likeBtn");
    likeBtn.addEventListener("click", async () => {
      await updateDoc(doc(db, "posts", postId), {
        likes: p.likes + 1
      });
    });

    // 削除
    const deleteBtn = postDiv.querySelector(".toukou-deleteBtn");
    deleteBtn.addEventListener("click", async () => {
      if (confirm("この投稿を削除しますか？")) {
        await deleteDoc(doc(db, "posts", postId));
      }
    });
  });
});
