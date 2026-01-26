// toukouScript.js

// ===== Firebase 読み込み =====
import { auth, db } from "./firebaseInit.js";
import {
  collection, addDoc, query, orderBy, onSnapshot,
  updateDoc, deleteDoc, doc, where
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// ===== Cloudinary設定 =====
const cloudName = "dr9giho8r";
const uploadPreset = "syusyokusakuhin";

// ===========================
// 文字数カウンター（60文字）
// ===========================
function setupCharCounter(textareaId, counterId, max = 60) {
  const ta = document.getElementById(textareaId);
  const counter = document.getElementById(counterId);
  if (!ta || !counter) return;

  ta.addEventListener("input", () => {
    if (ta.value.length > max) {
      ta.value = ta.value.slice(0, max);
    }
    counter.textContent = ta.value.length;
  });
}

setupCharCounter("goodPoint", "goodPointCount");
setupCharCounter("badPoint", "badPointCount");

// ===========================
// メディアアップロード処理
// ===========================
async function uploadMedia(files) {
  const results = [];

  for (const file of files) {
    if (file.type.startsWith("video") && file.size > 10 * 1024 * 1024) {
      alert("動画は10MBまでです");
      return [];
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", uploadPreset);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
      { method: "POST", body: formData }
    );

    const data = await res.json();

    results.push({
      type: file.type.startsWith("video") ? "video" : "image",
      url: data.secure_url
    });
  }

  return results;
}

// ===========================
// メディア表示（共通）
// ===========================
function renderMedia(mediaList) {
  if (!Array.isArray(mediaList) || mediaList.length === 0) return "";

  return `
    <div class="media-wrapper">
      ${mediaList.map(m => {
        if (m.type === "image") {
          return `<img src="${m.url}" class="post-media">`;
        }
        if (m.type === "video") {
          return `<video src="${m.url}" class="post-media" controls muted></video>`;
        }
        return "";
      }).join("")}
    </div>
  `;
}

// ===========================
// 投稿ボタン
// ===========================
const submitBtn = document.getElementById("toukouSubmitBtn");

submitBtn.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) { alert("ログインしてください"); return; }

  const itemName = document.getElementById("toukouItemName").value.trim();
  const text = document.getElementById("toukouText").value.trim();
  const hashtagsInput = document.getElementById("toukouHashtags").value.trim();
  const files = document.getElementById("toukouImageInput").files;
  const productPrice = document.getElementById("toukouPrice").value.trim();
  const productURL = document.getElementById("toukouURL").value.trim();

  const goodPoint = document.getElementById("goodPoint").value.trim();
  const badPoint = document.getElementById("badPoint").value.trim();

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

  if (!itemName && !text && files.length === 0) return;

  let media = [];
  if (files.length > 0) {
    media = await uploadMedia(files);
  }

  const hashtags = hashtagsInput
    .split(/\s+/)
    .map(tag => tag.startsWith('#') ? tag : `#${tag}`)
    .filter(Boolean);

  await addDoc(collection(db, "posts"), {
    uid: user.uid,
    itemName,
    text,
    hashtags,
    media,
    productPrice: productPrice || null,
    productURL: productURL || null,
    likes: 0,
    createdAt: new Date(),

    // ★ 追加
    goodPoint: goodPoint || null,
    badPoint: badPoint || null,

    rate: {
      usability,
      price,
      performance,
      design,
      satisfaction,
      average: totalAverage
    }
  });

  // フォームリセット
  document.querySelectorAll("input, textarea, select").forEach(el => el.value = "");
  document.getElementById("goodPointCount").textContent = "0";
  document.getElementById("badPointCount").textContent = "0";
});

// ===========================
// 投稿表示（自分の投稿のみ）
// ===========================
onAuthStateChanged(auth, (user) => {
  if (!user) {
    alert("ログインしてください");
    window.location.href = "loginpage.html";
    return;
  }

  const postsRef = collection(db, "posts");
  const q = query(postsRef, where("uid", "==", user.uid), orderBy("createdAt", "desc"));

  onSnapshot(q, (snapshot) => {
    const list = document.getElementById("toukouList");
    if (!list) return;

    list.innerHTML = "";

    snapshot.forEach((docSnap) => {
      const p = docSnap.data();
      const postId = docSnap.id;

      const hashtagsHTML = p.hashtags?.length
        ? `<div class="toukou-hashtags">${p.hashtags.map(tag => `<span class="toukou-hashtag">${tag}</span>`).join(" ")}</div>`
        : "";

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

      const pointHTML = `
        ${p.goodPoint ? `<p class="good-point">👍 ${p.goodPoint}</p>` : ""}
        ${p.badPoint ? `<p class="bad-point">⚠ ${p.badPoint}</p>` : ""}
      `;

      const productInfoHTML = `
        ${p.productPrice ? `<p>金額: ¥${p.productPrice}</p>` : ""}
        ${p.productURL ? `<p>購入リンク: <a href="${p.productURL}" target="_blank">${p.productURL}</a></p>` : ""}
      `;

      const mediaHTML = renderMedia(p.media);

      const postDiv = document.createElement("div");
      postDiv.classList.add("toukou-post");
      postDiv.innerHTML = `
        ${p.itemName ? `<h3>アイテム名: ${p.itemName}</h3>` : ""}
        <p>${p.text}</p>
        ${productInfoHTML}
        ${hashtagsHTML}
        ${ratingsHTML}
        ${pointHTML}
        ${mediaHTML}

        <div>
          <button class="toukou-likeBtn">♥ いいね</button>
          <span class="toukou-likeCount">${p.likes ?? 0}</span>
          <button class="toukou-deleteBtn">削除</button>
        </div>

        <div class="toukou-postDate">
          ${p.createdAt?.toDate ? p.createdAt.toDate().toLocaleString() : new Date(p.createdAt).toLocaleString()}
        </div>
        <hr>
      `;

      list.appendChild(postDiv);

      postDiv.querySelector(".toukou-likeBtn").addEventListener("click", async () => {
        await updateDoc(doc(db, "posts", postId), { likes: (p.likes ?? 0) + 1 });
      });

      postDiv.querySelector(".toukou-deleteBtn").addEventListener("click", async () => {
        if (confirm("この投稿を削除しますか？")) {
          await deleteDoc(doc(db, "posts", postId));
        }
      });
    });
  });
});
