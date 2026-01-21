// Script/settings.js
// 設定ページ用：ログイン状態表示 + ログアウト + Version / Build 表示

import { auth } from "./firebaseInit.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// ===========================
// HTML要素
// ===========================
const userLine = document.getElementById("userLine");
const logoutBtn = document.getElementById("logoutBtn");
const vEl = document.getElementById("appVersion");
const bEl = document.getElementById("buildInfo");

// ===========================
// Version / Build 表示
// ===========================
if (vEl) vEl.textContent = "0.9.0";
if (bEl) bEl.textContent = new Date().toISOString().slice(0, 10);

// ===========================
// ログイン状態表示
// ===========================
onAuthStateChanged(auth, (user) => {
  // 要素が無い場合でも落ちないように
  if (!userLine) return;

  if (!user) {
    userLine.textContent = "未ログイン（ログイン画面へ移動します）";
    setTimeout(() => {
      window.location.href = "loginpage.html";
    }, 500);
    return;
  }

  const name = user.displayName?.trim() || "";
  const email = user.email?.trim() || "";

  // 表示優先：displayName → email → uidの一部
  if (name) {
    userLine.textContent = `ログイン中：${name}${email ? `（${email}）` : ""}`;
  } else if (email) {
    userLine.textContent = `ログイン中：${email}`;
  } else {
    userLine.textContent = `ログイン中：${user.uid.slice(0, 8)}…`;
  }
});

// ===========================
// ログアウト
// ===========================
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    if (!confirm("ログアウトしますか？")) return;

    try {
      await signOut(auth);
      window.location.href = "loginpage.html";
    } catch (err) {
      console.error("ログアウト失敗:", err);
      alert("ログアウトに失敗しました");
    }
  });
}
