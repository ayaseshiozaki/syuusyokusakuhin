// registerScript.js

// ===== Firebase 読み込み =====
import { auth, db } from "./firebaseInit.js";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// ===== 登録フォーム取得（null対策） =====
const registerForm = document.querySelector(".register-form");
if (!registerForm) {
  console.error("register-form が見つかりません。HTMLの class を確認してください。");
} else {
  // すでにログインしているなら登録画面に居続けない（任意）
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // すでにログイン済みならホームへ
      window.location.replace("index.html");
    }
  });

  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = registerForm.querySelector('input[name="userid"]')?.value.trim();
    const password = registerForm.querySelector('input[name="password"]')?.value.trim();
    const passwordConfirm = registerForm.querySelector('input[name="passwordConfirm"]')?.value.trim();

    if (!email || !password || !passwordConfirm) {
      alert("すべての項目を入力してください");
      return;
    }

    // かんたんバリデーション
    if (password.length < 6) {
      alert("パスワードは6文字以上にしてください");
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
      // 注意：profileImage は先頭に "/" を付けるとパス事故が減る
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: email,
        userName: "",
        intro: "",
        profileImage: "/image/gazou1.jpg",
        followers: [],
        following: [],
        posts: [],
        favorites: [],
        createdAt: serverTimestamp()
      });

      alert("登録が完了しました！");

      // ===== 新規登録後にホームへ =====
      // historyに登録画面を残さない（戻るで登録画面に戻らない）
      window.location.replace("index.html");

    } catch (err) {
      console.error("登録エラー:", err);

      // よくあるエラーは日本語に寄せる（任意）
      const code = err?.code || "";
      if (code === "auth/email-already-in-use") {
        alert("このメールアドレスは既に登録されています");
      } else if (code === "auth/invalid-email") {
        alert("メールアドレスの形式が正しくありません");
      } else if (code === "auth/weak-password") {
        alert("パスワードが弱すぎます（6文字以上推奨）");
      } else {
        alert("登録に失敗しました: " + (err?.message || "不明なエラー"));
      }
    }
  });
}
