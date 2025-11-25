import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, sendPasswordResetEmail, updatePassword } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

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
const auth = getAuth(app);

// フォーム取得
const form = document.querySelector(".passwasure-form");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = form.email.value.trim();
  const password = form.password.value.trim();
  const passwordConfirm = form.passwordConfirm.value.trim();

  if (!email || !password) {
    alert("メールと新しいパスワードを入力してください");
    return;
  }

  if (password !== passwordConfirm) {
    alert("パスワードが一致しません");
    return;
  }

  try {
    // Firebase では直接パスワード更新はログイン後でしかできないため
    // ここではメールリンクによるリセット送信を使用
    await sendPasswordResetEmail(auth, email);
    alert("パスワード再設定用のメールを送信しました。\nメール内のリンクから新しいパスワードを設定してください");
    form.reset();
  } catch (err) {
    console.error(err);
    alert("再設定に失敗しました：" + err.message);
  }
});
