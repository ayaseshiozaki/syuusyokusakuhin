// Script/aiTrustUtils.js
// 投稿全体（テキスト/タグ/URL/メディア/評価/ポイント欄）でAI確率を補正し、理由と段階を返す

// 0〜1の範囲に丸める
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

// 文字列を正規化（ざっくり）
function normText(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

// 抽象語っぽいもの（短文に多いとテンプレ寄りに見える）
const ABSTRACT_WORDS = ["最高", "神", "やばい", "微妙", "いい", "すごい", "おすすめ", "オススメ", "最強"];

// 投稿の特徴量をざっくり計算
export function extractPostSignals(p = {}) {
  const text = normText(p.text);
  const textLen = text.length;

  const hashtags = Array.isArray(p.hashtags) ? p.hashtags : [];
  const tagCount = hashtags.length;

  const hasURL = !!p.productURL;

  // media がある投稿（画像/動画）を実体験寄りに扱う
  const media = Array.isArray(p.media) ? p.media : [];
  const hasMedia = media.length > 0 || !!p.imageUrl;

  // レートがあるとレビュー構造がある
  const hasRate = !!p.rate;

  // 雑なテンプレっぽさ（同じ記号や絵文字の連発など）
  const repeatedPunct = /([!！\?？。．,.、])\1{2,}/.test(text);

  // “おすすめ/最高/神/必須”系の強い断定語（多いと広告っぽくなる）
  const hypeWords = ["最高", "神", "必須", "買うべき", "絶対", "おすすめ", "オススメ", "最強"];
  const hypeCount = hypeWords.reduce((acc, w) => acc + (text.includes(w) ? 1 : 0), 0);

  // ✅ 追加：良い点 / 気になった点（任意）
  const goodPoint = normText(p.goodPoint);
  const badPoint = normText(p.badPoint);

  const goodPointLen = goodPoint.length;
  const badPointLen = badPoint.length;

  const hasGoodPoint = goodPointLen > 0;
  const hasBadPoint = badPointLen > 0;
  const hasBothPoints = hasGoodPoint && hasBadPoint;

  // 短文＋抽象語だけっぽいか（ポイント欄）
  const goodHasAbstract = ABSTRACT_WORDS.some(w => goodPoint.includes(w));
  const badHasAbstract = ABSTRACT_WORDS.some(w => badPoint.includes(w));

  return {
    textLen,
    tagCount,
    hasURL,
    hasMedia,
    hasRate,
    repeatedPunct,
    hypeCount,

    // ✅ 追加 signals
    hasGoodPoint,
    hasBadPoint,
    hasBothPoints,
    goodPointLen,
    badPointLen,
    goodHasAbstract,
    badHasAbstract,
  };
}

// ルールで補正（±%）して理由も生成
export function applyHeuristics(baseProbability01, signals) {
  let p = clamp01(baseProbability01);
  const reasons = [];

  // ここから「補正」：軽いスコアリング（作品向けに説明しやすい設計）
  // ※あくまで“可能性”で、断定しないUIとセットで使う

  // 短すぎる文章はテンプレ・誘導投稿が多い（+）
  if (signals.textLen > 0 && signals.textLen < 25) {
    p = clamp01(p + 0.10);
    reasons.push("文章が短く、定型文の可能性があります");
  } else if (signals.textLen >= 25 && signals.textLen < 60) {
    p = clamp01(p + 0.05);
    reasons.push("文章が短めのため、定型的に見える場合があります");
  }

  // ハッシュタグ過多（+）
  if (signals.tagCount >= 8) {
    p = clamp01(p + 0.10);
    reasons.push("ハッシュタグが多く、宣伝投稿の傾向があります");
  } else if (signals.tagCount >= 5) {
    p = clamp01(p + 0.05);
    reasons.push("ハッシュタグが多めのため、誘導目的の可能性があります");
  }

  // URLあり（+）ただしメディアや評価があるなら相殺
  if (signals.hasURL) {
    p = clamp01(p + 0.08);
    reasons.push("外部リンクが含まれているため、誘導投稿の可能性があります");
  }

  // 実体験要素（メディア/評価）があると信頼寄り（-）
  if (signals.hasMedia) {
    p = clamp01(p - 0.06);
    reasons.push("画像/動画があるため、実体験ベースの可能性が上がります");
  }
  if (signals.hasRate) {
    p = clamp01(p - 0.06);
    reasons.push("評価項目があるため、レビュー構造が整っています");
  }

  // ✅ 追加：良い点/気になった点（任意）を補正に反映
  // 両方ある → 比較的具体的なレビューになりやすい（-）
  if (signals.hasBothPoints) {
    p = clamp01(p - 0.08);
    reasons.push("良い点と気になった点が両方書かれており、具体性があります");
  } else {
    // 片方だけでも書かれていれば、少しだけ信頼寄り（-）
    if (signals.hasGoodPoint || signals.hasBadPoint) {
      p = clamp01(p - 0.03);
      reasons.push("ポイント欄が記載されているため、内容の補足があります");
    }
  }

  // ポイント欄が短すぎる（+）
  // ※60文字制限なので、ここでは「8文字未満」を“短すぎ”扱い
  if ((signals.hasGoodPoint && signals.goodPointLen > 0 && signals.goodPointLen < 8) ||
      (signals.hasBadPoint && signals.badPointLen > 0 && signals.badPointLen < 8)) {
    p = clamp01(p + 0.04);
    reasons.push("ポイント欄が短く、内容が具体化されていない可能性があります");
  }

  // 抽象語が多い短文（+）
  // ※短いのに「最高」「おすすめ」系だけだと広告っぽく見えることがある
  if ((signals.hasGoodPoint && signals.goodHasAbstract && signals.goodPointLen < 20) ||
      (signals.hasBadPoint && signals.badHasAbstract && signals.badPointLen < 20)) {
    p = clamp01(p + 0.04);
    reasons.push("抽象的な表現が多く、宣伝文調に見える場合があります");
  }

  // 連続記号（+）
  if (signals.repeatedPunct) {
    p = clamp01(p + 0.05);
    reasons.push("記号の連続が多く、感情的・広告的に見える場合があります");
  }

  // 煽り語（+）
  if (signals.hypeCount >= 2) {
    p = clamp01(p + 0.06);
    reasons.push("強い断定語が多く、広告文調に見える場合があります");
  } else if (signals.hypeCount === 1) {
    p = clamp01(p + 0.03);
    reasons.push("断定的な表現が含まれています");
  }

  // 理由が多すぎると読みにくいので最大4つに絞る
  const trimmed = reasons.slice(0, 4);

  return { adjusted01: p, reasons: trimmed };
}

// 段階（色やラベル）を決める
export function judgeLevel(prob01) {
  if (prob01 >= 0.70) return { level: "high", label: "🚨 高め" };
  if (prob01 >= 0.40) return { level: "mid", label: "⚠ 可能性あり" };
  return { level: "low", label: "✅ 自然" };
}

// 結果HTML（理由付き）
export function buildAICheckHTML(prob01, reasons = []) {
  const percent = Math.round(prob01 * 100);
  const { label } = judgeLevel(prob01);

  const reasonHTML = reasons.length
    ? `<ul class="ai-reasons">${reasons.map(r => `<li>${r}</li>`).join("")}</ul>`
    : `<div class="ai-reasons-empty">補足情報はありません</div>`;

  return `
    <div class="ai-summary">
      <span class="ai-level">${label}</span>
      <span class="ai-percent">レビュー不審度: ${percent}%</span>
    </div>
    ${reasonHTML}
  `;
}
