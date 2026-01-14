import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());
// ===== CORS 許可 =====
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*"); // ブラウザからのアクセスを許可
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.post("/api/ai-check", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "text is required" });

  try {
    const prompt = `
以下の文章がAI生成か人間生成か判定してください。
返答は「0〜100の数字」のみで、100がAI生成の可能性100％、0が人間生成の可能性100％です。

文章:
"${text}"
`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 5
      })
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    const probability = parseFloat(content);

    if (isNaN(probability)) return res.status(500).json({ error: "AI判定失敗" });

    res.json({ probability });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AIチェック失敗" });
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));

// ===========================
// AIおすすめ分析 API
// ===========================
app.post("/api/recommend", async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: "text is required" });
  }

  try {
const prompt = `
以下はあるユーザーのSNS投稿内容です。

【タスク】
投稿内容の傾向を分析し、
「分析コメント」＋「おすすめアイテム」を出力してください。

【必須ルール】
・最初に【分析コメント】を2~3文で書く
・分析コメントには投稿の特徴（重視している点・傾向）を含めること
・次に【おすすめアイテム】として、具体的なアイテム名を「必ず3つ」出す
・アイテム名は商品カテゴリ名にする
・全体で2〜3文以内
・日本語で回答する
・おすすめアイテムは番号付きリスト（1. 2. 3.）で出力する

【出力フォーマット（厳守）】
分析コメント：
〇〇な投稿が多く、〇〇を重視する傾向があります。

おすすめアイテム：
1. ○○
2. ○○
3. ○○

投稿内容:
"${text}"
`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 150
      })
    });

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content?.trim();

    res.json({ result });

  } catch (err) {
    console.error("recommend error:", err);
    res.status(500).json({ error: "recommend failed" });
  }
});
