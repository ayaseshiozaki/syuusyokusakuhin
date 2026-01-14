// passwasureScript.js

// ===== Firebase 読み込み =====
import { auth } from "./firebaseInit.js"; // Firebase 初期化を共通化
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// ===== フォーム取得 =====
const form = document.querySelector(".passwasure-form");

// ===== パスワード再設定処理 =====
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
    // ログインしていない場合はメールリンクでの再設定
    await sendPasswordResetEmail(auth, email);

    alert(
      "パスワード再設定用のメールを送信しました。\n" +
      "メール内のリンクから新しいパスワードを設定してください"
    );
    form.reset();
  } catch (err) {
    console.error("パスワード再設定エラー:", err);
    alert("再設定に失敗しました：" + err.message);
  }
});
