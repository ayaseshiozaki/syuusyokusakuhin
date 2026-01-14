// loginScript.js

// ===== Firebase 読み込み =====
import { auth } from "./firebaseInit.js"; // Firebase 初期化を共通化
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

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
