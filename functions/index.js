// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

// Firebase Admin 初期化
admin.initializeApp();

// Express アプリ作成
const app = express();
app.use(cors({origin: true}));
app.use(express.json());

// サクラ判定 API
app.post("/checkSakura", async (req, res) => {
  try {
    const text = req.body.text;
    if (!text) {
      return res.status(400).json({error: "text is required"});
    }

    // Secret は関数内で process.env から読み込む
    const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `
以下の文章がサクラ（業者レビュー）である確率を0〜1で返してください。
JSONのみ出力してください。

{
  "score": number,
  "reason": "理由"
}

文章:
${text}
          `,
        },
      ],
    });

    // content を安全に取得
    let content = null;
    if (
      response &&
      response.choices &&
      response.choices.length > 0 &&
      response.choices[0].message &&
      response.choices[0].message.content
    ) {
      content = response.choices[0].message.content;
    }

    if (!content) {
      return res.status(500).json({
        error: "Failed to parse OpenAI response",
        details: null,
      });
    }

    let result;
    try {
      result = JSON.parse(content);
    } catch (err) {
      return res.status(500).json({
        error: "Failed to parse OpenAI response",
        details: content,
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error("Sakura check failed:", err);
    return res.status(500).json({
      error: "Failed to check Sakura",
      details: err.message,
    });
  }
});

// Cloud Function にエクスポート（v2 Secret 対応）
// Cloud Function にエクスポート（v1）
exports.api = functions
    .runWith({
      secrets: ["OPENAI_API_KEY"],
    })
    .https.onRequest(app);
