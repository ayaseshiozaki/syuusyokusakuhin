// loginScript.js

// ===== Firebase 読み込み =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// ===== Firebase 初期化 =====
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

// ===== ログインフォーム取得 =====
const form = document.querySelector(".login-form");

// ===== ログイン処理 =====
form.addEventListener("submit", async (e) => {
  e.preventDefault(); // フォームの通常送信を止める

  const email = form.userid.value.trim();       // ユーザーID（＝メール）
  const password = form.password.value.trim();  // パスワード

  if (!email || !password) {
    alert("ユーザーID（メール）とパスワードを入力してください。");
    return;
  }
  console.log(email, password);


  try {
    // Firebase Authentication でログイン
    await signInWithEmailAndPassword(auth, email, password);

    alert("ログイン成功！");
    window.location.href = "index.html";  // ← ログイン後の遷移先
  } catch (error) {
    console.error(error);
    alert("ログイン失敗: " + error.message);
  }
});
