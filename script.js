// 投稿データを用意
const posts = [
  {
    user: "mikan_cat",
    avatar: "user1.jpg",
    image: "post1.jpg",
    likes: 87,
    caption: "お散歩中🐾"
  },
  {
    user: "coffee_life",
    avatar: "user2.jpg",
    image: "post2.jpg",
    likes: 120,
    caption: "週末のカフェ☕️"
  },
  {
    user: "skylover",
    avatar: "user3.jpg",
    image: "post3.jpg",
    likes: 203,
    caption: "夕焼けがきれいだった🌇"
  }
];

// フィードの要素を取得
const feed = document.getElementById("feed");

// 投稿を順に表示
posts.forEach(post => {
  const article = document.createElement("article");
  article.classList.add("post");
  article.innerHTML = `
    <div class="post-header">
      <img src="${post.avatar}" alt="${post.user}" class="avatar">
      <span class="username">${post.user}</span>
    </div>
    <img src="${post.image}" alt="投稿画像" class="post-image">
    <div class="post-footer">
      <p class="likes">♥ ${post.likes}件のいいね</p>
      <p class="caption"><strong>${post.user}</strong> ${post.caption}</p>
    </div>
  `;
  feed.appendChild(article);
});
