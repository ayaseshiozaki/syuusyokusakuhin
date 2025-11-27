// Firebase import
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs, query, where } 
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA6SrMiN07ayxh4HDx6cG_YM0Q2mIdZ07U",
  authDomain: "syuusyokusakuhin.firebaseapp.com",
  projectId: "syuusyokusakuhin",
  storageBucket: "syuusyokusakuhin.firebasestorage.app",
  messagingSenderId: "317507460420",
  appId: "1:317507460420:web:9c85808af034a1133d8b11"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("ログインしてください");
    window.location.href = "login.html";
    return;
  }

  const uid = user.uid;

  // --- ユーザープロフィール ---
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    const data = userSnap.data();

    document.getElementById("mypage-profileImage").src = data.profileImage || "default-icon.png";
    document.getElementById("mypage-userName").textContent = data.userName || "ユーザー名";
    document.getElementById("mypage-followerCount").textContent = data.followers?.length || 0;
    document.getElementById("mypage-followCount").textContent = data.following?.length || 0;
  }

  // --- 自分の投稿を取得 ---
  const postsRef = collection(db, "posts");
  const q = query(postsRef, where("uid", "==", uid));
  const querySnap = await getDocs(q);

  const postsContainer = document.getElementById("mypage-myPosts");
  postsContainer.innerHTML = "";

  querySnap.forEach((doc) => {
    const post = doc.data();

    const div = document.createElement("div");
    div.classList.add("mypage-post-card");

    div.innerHTML = `
      <p>${post.text || ""}</p>
      ${post.imageUrl ? `<img src="${post.imageUrl}" style="width:100%; border-radius:8px;">` : ""}
    `;

    postsContainer.appendChild(div);
  });
});
