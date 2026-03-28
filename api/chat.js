/**
 * Mubra AI 8.v1 — Vercel Serverless Function
 * File: api/chat.js
 * Runtime: Node.js 18.x (Vercel)
 * API: Google Gemini 2.0 Flash
 * 
 * ENV: Set GEMINI_API_KEY in Vercel Dashboard → Settings → Environment Variables
 */

const GEMINI_MODEL    = 'gemini-2.0-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const SYSTEM_INSTRUCTION = `
ඔබ "Mubra AI 8.v1" — ශ්‍රී ලංකාවේ G.C.E. A/L රසායනාස්ත්‍ර විෂය සඳහා නිපුණ, ලෙජන්ඩ් ගුරුවරයෙකි.

## ඔබේ අනන්‍යතාවය:
- නම: Mubra AI 8.v1
- Powered by: Mubra Webworks
- Main Sponsor: Mubra Trading
- ශ්‍රී ලංකාවේ A/L රසායනාස්ත්‍ර ශිෂ්‍යයන් සඳහා විශේෂිතයි

## භාෂා රීතිය (CRITICAL):
- සෑම පිළිතුරක්ම සිංහල භාෂාවෙන් ලිවිය යුතුය
- රසායනික සූත්‍ර (H₂SO₄, CH₄, KMnO₄ etc.) ඉංග්‍රීසියෙන් ලිවිය හැකිය
- KaTeX math notation භාවිත කරන්න: $H_2SO_4$, $K_p$, $\\Delta G$ ආදිය
- ශිෂ්‍යයෙකු ඉංග්‍රීසියෙන් ඇසුවද, සිංහලෙන්ම පිළිතුරු දෙන්න

## ඥාන ක්ෂේත්‍රය:
Organic, Inorganic, Physical Chemistry — G.C.E. A/L මට්ටමින්.
Past papers 1985–2025 marking scheme logic සමඟ පැහැදිළි කරන්න.

## ගුරු ශෛලිය:
- Step-by-step, Memory tricks, Real-life examples
- "ශාබාශ්!", "හොඳ ප්‍රශ්නයකි!" ආදිය
- Exam tips සහ marking scheme hints
`;

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
}

function buildHistoryContents(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(function(h) { return h.role && h.parts; })
    .map(function(h) {
      return {
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: h.parts.map(function(p) {
          if (p.type === 'text') return { text: p.text };
          if (p.type === 'image') {
            return { inline_data: { mime_type: p.mimeType || 'image/jpeg', data: p.data } };
          }
          return { text: String(p) };
        })
      };
    });
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  var GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    console.error('[Mubra AI] GEMINI_API_KEY not set');
    return res.status(500).json({ error: 'Server config error: API key missing.' });
  }

  try {
    // Vercel auto-parses JSON body; fallback for safety
    var body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) { body = {}; }
    }
    if (!body) body = {};
    var message = body.message || '';
    var history = body.history || [];
    var topic   = body.topic   || 'general';
    var image   = body.image   || null;

    if (!message && !image) {
      return res.status(400).json({ error: 'Message or image required.' });
    }

    var topicMap = {
      organic:   'ජෛව රසායනය (Organic Chemistry)',
      inorganic: 'අජෛව රසායනය (Inorganic Chemistry)',
      physical:  'භෞතික රසායනය (Physical Chemistry)'
    };
    var topicLabel = topicMap[topic] || 'රසායනාස්ත්‍ර (Chemistry)';

    var currentParts = [];

    if (image && image.data && image.mimeType) {
      currentParts.push({
        inline_data: { mime_type: image.mimeType, data: image.data }
      });
    }

    var userText = message
      ? '[විෂය: ' + topicLabel + ']\n\n' + message
      : '[විෂය: ' + topicLabel + ']\n\nඉහත රූපය A/L Chemistry දෘෂ්ටිකෝණයෙන් විශ්ලේෂණය කරන්න.';

    currentParts.push({ text: userText });

    var historyContents = buildHistoryContents(history);

    var requestBody = {
      system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: historyContents.concat([{ role: 'user', parts: currentParts }]),
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
        candidateCount: 1
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
      ]
    };

    var apiUrl = GEMINI_API_BASE + '/' + GEMINI_MODEL + ':generateContent?key=' + GEMINI_API_KEY;

    var geminiRes = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!geminiRes.ok) {
      var errText = await geminiRes.text();
      console.error('[Mubra AI] Gemini error:', geminiRes.status, errText);
      var errMsg = 'Gemini API error (' + geminiRes.status + ')';
      try {
        var parsed = JSON.parse(errText);
        if (parsed.error && parsed.error.message) errMsg = parsed.error.message;
      } catch(e) {}
      return res.status(502).json({ error: errMsg });
    }

    var geminiData = await geminiRes.json();
    var candidate  = geminiData && geminiData.candidates && geminiData.candidates[0];

    if (!candidate) {
      console.error('[Mubra AI] No candidates:', JSON.stringify(geminiData));
      return res.status(502).json({ error: 'Gemini returned no response.' });
    }

    if (candidate.finishReason === 'SAFETY') {
      return res.status(200).json({
        reply: 'ක්ෂමා වන්න, ඔබේ ප්‍රශ්නය safety filters මගින් block වී ඇත. ප්‍රශ්නය නැවත සකස් කරන්න.'
      });
    }

    var replyText = '';
    if (candidate.content && candidate.content.parts) {
      replyText = candidate.content.parts
        .filter(function(p) { return p.text; })
        .map(function(p) { return p.text; })
        .join('\n');
    }

    if (!replyText) replyText = 'කරගත නොහැකිය. නැවත උත්සාහ කරන්න.';

    return res.status(200).json({ reply: replyText });

  } catch(err) {
    console.error('[Mubra AI] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
};
