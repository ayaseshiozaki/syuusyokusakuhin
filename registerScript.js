// registerScript.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// ===== Firebase 設定 =====
const firebaseConfig = {
  apiKey: "AIzaSyA6SrMiN07ayxh4HDx6cG_YM0Q2mIdZ07U",
  authDomain: "syuusyokusakuhin.firebaseapp.com",
  projectId: "syuusyokusakuhin",
  storageBucket: "syuusyokusakuhin.firebasestorage.app",
  messagingSenderId: "317507460420",
  appId: "1:317507460420:web:9c85808af034a1133d8b11"
};

// ===== Firebase 初期化 =====
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

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

    // ===== Firestore に users/{uid} を作成（初期アイコンも設定） =====
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      email: email,
      userName: "",                     // 初期ユーザー名
      profileImage: "https://res.cloudinary.com/dr9giho8r/image/upload/v1699999999/default.png", // 初期アイコンURL
      followers: [],
      following: [],
      createdAt: new Date()
    });

    alert("登録が完了しました！");

    // ===== 新規登録後にホーム画面へ遷移 =====
    window.location.href = "index.html"; // ホーム画面URLに変更

  } catch (err) {
    console.error("登録エラー:", err);
    alert("登録に失敗しました: " + err.message);
  }
});
