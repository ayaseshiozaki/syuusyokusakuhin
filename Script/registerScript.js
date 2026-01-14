// registerScript.js

// ===== Firebase 読み込み =====
import { auth, db } from "./firebaseInit.js"; // Firebase 初期化を共通化
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// ===== 登録フォーム取得 =====
const registerForm = document.querySelector(".register-form");

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = registerForm.querySelector('input[name="userid"]').value.trim();
  const password = registerForm.querySelector('input[name="password"]').value.trim();
  const passwordConfirm = registerForm.querySelector('input[name="passwordConfirm"]').value.trim();

  if (!email || !password || !passwordConfirm) {
    alert("すべての項目を入力してください");
    return;
  }

  if (password !== passwordConfirm) {
    alert("パスワードが一致しません");
    return;
  }

  try {
    // ===== Firebase Auth で新規登録 =====
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // ===== Firestore に users/{uid} を作成 =====
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      email: email,
      userName: "",           // 初期ユーザー名
      intro: "",              // 自己紹介初期値
      profileImage: "image/gazou1.jpg", // 初期アイコン
      followers: [],
      following: [],
      posts: [],       // 投稿参照用
      favorites: [],   // お気に入り参照用
      createdAt: new Date()
    });

    alert("登録が完了しました！");

    // ===== 新規登録後にホーム画面へ遷移 =====
    window.location.href = "index.html";

  } catch (err) {
    console.error("登録エラー:", err);
    alert("登録に失敗しました: " + err.message);
  }
});
