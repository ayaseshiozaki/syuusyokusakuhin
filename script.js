import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// 自分の Firebase プロジェクト情報に置き換える
const firebaseConfig = {
apiKey: "AIzaSyA6SrMiN07ayxh4HDx6cG_YM0Q2mIdZ07U",
    authDomain: "syuusyokusakuhin.firebaseapp.com",
    projectId: "syuusyokusakuhin",
    storageBucket: "syuusyokusakuhin.firebasestorage.app",
    messagingSenderId: "317507460420",
    appId: "1:317507460420:web:9c85808af034a1133d8b11"};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 投稿ボタン
document.getElementById("postBtn").addEventListener("click", async () => {
  const username = document.getElementById("username").value;
  const text = document.getElementById("text").value;
  if (!username || !text) return;

  await addDoc(collection(db, "posts"), {
    username,
    text,
    createdAt: new Date()
  });

  document.getElementById("username").value = "";
  document.getElementById("text").value = "";
});

// 投稿をリアルタイム表示
const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
onSnapshot(q, (snapshot) => {
  const list = document.getElementById("postList");
  list.innerHTML = "";
  snapshot.forEach(doc => {
    const p = doc.data();
    list.innerHTML += `
      <div class="post">
        <h3>${p.username}</h3>
        <p>${p.text}</p>
        <hr>
      </div>
    `;
  });
});
