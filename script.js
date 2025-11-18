// ========= Cloudinary 設定 =========
const cloudName = "dr9giho8r";
const uploadPreset = "syusyokusakuhin";

// ========= 投稿処理 =========
document.getElementById("postBtn").addEventListener("click", async () => {
  const username = document.getElementById("username").value;
  const text = document.getElementById("text").value;
  const file = document.getElementById("imageInput").files[0];

  if (!username && !text && !file) return;

  let imageUrl = "";

  if (file) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", uploadPreset);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body: formData
    });

    const data = await res.json();
    imageUrl = data.secure_url;
  }

  // Firestore POST
  await addDoc(collection(db, "posts"), {
    username,
    text,
    imageUrl,
    createdAt: new Date()
  });

  document.getElementById("username").value = "";
  document.getElementById("text").value = "";
  document.getElementById("imageInput").value = "";
});


// ========= 投稿リアルタイム表示 =========
const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
onSnapshot(q, (snapshot) => {
  const list = document.getElementById("postList");
  list.innerHTML = "";

  snapshot.forEach(doc => {
    const p = doc.data();
    list.innerHTML += `
      <div class="post">
        <h3>${p.username}</h3>
        <p>${p.text}</p>
        ${p.imageUrl ? `<img src="${p.imageUrl}" class="postImage">` : ""}
        <hr>
      </div>
    `;
  });
});
