// loginScript.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

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
const auth = getAuth(app);

// フォームを取得
const form = document.querySelector(".login-form");

form.addEventListener("submit", async (e) => {
  e.preventDefault(); // フォームの通常送信を止める

  const email = form.userid.value.trim();     // ユーザーID欄
  const password = form.password.value.trim(); // パスワード欄

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    alert("ログイン成功！");
    // ログイン成功したらホームページへ遷移
    window.location.href = "index.html";
  } catch (error) {
    console.error(error);
    alert("ログイン失敗: " + error.message);
  }
});
