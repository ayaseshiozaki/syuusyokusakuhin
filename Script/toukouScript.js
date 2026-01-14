// toukouScript.js

// ===== Firebase 読み込み =====
import { auth, db } from "./firebaseInit.js"; // Firebase 初期化を共通化
import { collection, addDoc, query, orderBy, onSnapshot, updateDoc, deleteDoc, doc, where } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// ===== Cloudinary設定 =====
const cloudName = "dr9giho8r";
const uploadPreset = "syusyokusakuhin";

// ===== 投稿ボタン =====
const submitBtn = document.getElementById("toukouSubmitBtn");
submitBtn.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) { alert("ログインしてください"); return; }

  const itemName = document.getElementById("toukouItemName").value.trim();
  const text = document.getElementById("toukouText").value.trim();
  const hashtagsInput = document.getElementById("toukouHashtags").value.trim();
  const file = document.getElementById("toukouImageInput").files[0];
  const productPrice = document.getElementById("toukouPrice").value.trim();
  const productURL = document.getElementById("toukouURL").value.trim();

  const usabilityInput = document.getElementById("rateUsability").value;
  const priceInput = document.getElementById("ratePrice").value;
  const performanceInput = document.getElementById("ratePerformance").value;
  const designInput = document.getElementById("rateDesign").value;
  const satisfactionInput = document.getElementById("rateSatisfaction").value;

  if (!usabilityInput || !priceInput || !performanceInput || !designInput || !satisfactionInput) {
    alert("評価項目をすべて選択してください");
    return;
  }

  const usability = parseInt(usabilityInput);
  const price = parseInt(priceInput);
  const performance = parseInt(performanceInput);
  const design = parseInt(designInput);
  const satisfaction = parseInt(satisfactionInput);
  const totalAverage = (usability + price + performance + design + satisfaction) / 5;

  if (!itemName && !text && !file) return;

  // 画像アップロード
  let imageUrl = "";
  if (file) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", uploadPreset);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body: formData
    });
    const data = await res.json();
    imageUrl = data.secure_url;
  }

  // ハッシュタグ配列
  const hashtags = hashtagsInput.split(/\s+/).map(tag => tag.startsWith('#') ? tag : `#${tag}`).filter(Boolean);

  // Firestore 投稿
  await addDoc(collection(db, "posts"), {
    uid: user.uid,
    itemName,
    text,
    hashtags,
    imageUrl,
    productPrice: productPrice || null,
    productURL: productURL || null,
    likes: 0,
    createdAt: new Date(),
    rate: { usability, price, performance, design, satisfaction, average: totalAverage }
  });

  // フォームリセット
  document.getElementById("toukouItemName").value = "";
  document.getElementById("toukouText").value = "";
  document.getElementById("toukouHashtags").value = "";
  document.getElementById("toukouImageInput").value = "";
  document.getElementById("toukouPrice").value = "";
  document.getElementById("toukouURL").value = "";
  document.getElementById("rateUsability").value = "";
  document.getElementById("ratePrice").value = "";
  document.getElementById("ratePerformance").value = "";
  document.getElementById("rateDesign").value = "";
  document.getElementById("rateSatisfaction").value = "";
});

// ===== 投稿表示（自分の投稿のみ） =====
onAuthStateChanged(auth, (user) => {
  if (!user) { alert("ログインしてください"); window.location.href = "loginpage.html"; return; }
  const uid = user.uid;

  const postsRef = collection(db, "posts");
  const q = query(postsRef, where("uid", "==", uid), orderBy("createdAt", "desc"));

  onSnapshot(q, (snapshot) => {
    const list = document.getElementById("toukouList");
    list.innerHTML = "";

    snapshot.forEach((docSnap) => {
      const p = docSnap.data();
      const postId = docSnap.id;

      const hashtagsHTML = p.hashtags?.length ? `<div class="toukou-hashtags">${p.hashtags.map(tag => `<span class="toukou-hashtag">${tag}</span>`).join(" ")}</div>` : "";
      const ratingsHTML = p.rate ? `
        <div class="toukou-rating">
          <p>使いやすさ：★${p.rate.usability}</p>
          <p>金額：★${p.rate.price}</p>
          <p>性能：★${p.rate.performance}</p>
          <p>見た目：★${p.rate.design}</p>
          <p>買ってよかった：★${p.rate.satisfaction}</p>
          <p><b>総合評価：★${p.rate.average.toFixed(1)}</b></p>
        </div>
      ` : "";

      const productInfoHTML = `
        ${p.productPrice ? `<p>金額: ¥${p.productPrice}</p>` : ""}
        ${p.productURL ? `<p>購入リンク: <a href="${p.productURL}" target="_blank">${p.productURL}</a></p>` : ""}
      `;

      const postDiv = document.createElement("div");
      postDiv.classList.add("toukou-post");
      postDiv.innerHTML = `
        ${p.itemName ? `<h3>アイテム名: ${p.itemName}</h3>` : ""}
        <p>${p.text}</p>
        ${productInfoHTML}
        ${hashtagsHTML}
        ${ratingsHTML}
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
      postDiv.querySelector(".toukou-likeBtn").addEventListener("click", async () => {
        await updateDoc(doc(db, "posts", postId), { likes: (p.likes ?? 0) + 1 });
        p.likes = (p.likes ?? 0) + 1;
        postDiv.querySelector(".toukou-likeCount").textContent = p.likes;
      });

      // 削除
      postDiv.querySelector(".toukou-deleteBtn").addEventListener("click", async () => {
        if (confirm("この投稿を削除しますか？")) {
          await deleteDoc(doc(db, "posts", postId));
        }
      });
    });
  });
});
