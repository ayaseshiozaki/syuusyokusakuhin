// Firebase モジュール import
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// ===== Firebase 設定（必ず自分の Firebase プロジェクト情報に置き換える） =====
const firebaseConfig = {
 apiKey: "AIzaSyA6SrMiN07ayxh4HDx6cG_YM0Q2mIdZ07U",
  authDomain: "syuusyokusakuhin.firebaseapp.com",
  projectId: "syuusyokusakuhin",
  storageBucket: "syuusyokusakuhin.firebasestorage.app",
  messagingSenderId: "317507460420",
  appId: "1:317507460420:web:9c85808af034a1133d8b11"
};

// Firebase 初期化
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Cloudinary 設定（自分のものに置き換える）
const cloudName = "dr9giho8r";
const uploadPreset = "syusyokusakuhin";

// フォーム取得
const registerForm = document.querySelector(".register-form");

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = registerForm.userid.value.trim();
  const password = registerForm.password.value.trim();
  const passwordConfirm = registerForm.passwordConfirm.value.trim();
  const file = registerForm.profileImage.files[0];

  // 入力チェック
  if (!email || !password || !passwordConfirm) {
    alert("メールとパスワードを入力してください");
    return;
  }

  if (password !== passwordConfirm) {
    alert("パスワードと確認用パスワードが一致しません");
    return;
  }

  let imageUrl = "";
  if (file) {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", uploadPreset);

      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        body: formData
      });

      if (!res.ok) throw new Error("Cloudinary アップロードに失敗");

      const data = await res.json();
      imageUrl = data.secure_url;

    } catch (err) {
      console.error(err);
      alert("画像のアップロードに失敗しました：" + err.message);
      return;
    }
  }

  try {
    // Firebase Authentication に登録
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Firestore にユーザー情報保存
    await addDoc(collection(db, "users"), {
      uid: user.uid,
      email,
      profileImage: imageUrl,
      createdAt: new Date()
    });

    alert("登録成功！ホームページに移動します");
    window.location.href = "index.html";

  } catch (err) {
    console.error(err);
    alert("登録に失敗しました：" + err.message);
  }
});
