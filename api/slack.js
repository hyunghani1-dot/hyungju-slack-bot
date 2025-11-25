// api/slack.js
const { GoogleGenAI } = require("@google/genai");
const { WebClient } = require("@slack/web-api");
const { buildNotionContext } = require("./notion"); // ⬅️ ./notion.js 파일 불러오기

// 클라이언트 초기화
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(200).send("OK");
    const body = req.body || {};

    // Slack URL Verification (검증)
    if (body.type === "url_verification") return res.status(200).send(body.challenge);

    const event = body.event || {};
    if (event.bot_id || event.subtype === 'bot_message') return res.status(200).send("ignored");

    // 멘션 제거 및 텍스트 정리
    const rawText = event.text || "";
    const text = rawText.replace(/<@[^>]+>/g, "").trim(); 
    if (!text) return res.status(200).send("no text");

    // 1) Notion 검색 및 컨텍스트 만들기
    const notionContext = await buildNotionContext(text);

    // 시스템 프롬프트 통합
    const systemInstruction = `
      너는 형주한의원 전용 상담 ai야.
      직원 물음에는 상세하게 설명해주고, 환자 응대는 부드럽고 전문적이되, 의학적인 부분은 단호하게 해줘.
      
      아래는 노션에서 검색해 가져온 형주한의원 내부 문서 요약이야. 우선적으로 참고해서 답을 만들어라.
      참조 문서가 있다면 반드시 마지막에 [문서 제목](문서 URL) 형태로 출처를 표시해.
      --- Notion 컨텍스트 ---
      ${notionContext}
      ------------------------
    `;

    // 2) Gemini API 호출
    const completion = await ai.models.generateContent({
      model: "gemini-2.5-flash", 
      contents: text, 
      config: {
        systemInstruction: systemInstruction,
      },
    });

    const answer = completion.text; 

    // 3) Slack에 답변 보내기
    await slack.chat.postMessage({
      channel: event.channel,
      text: answer,
      thread_ts: event.ts
    });

    return res.status(200).send("ok");

  } catch (err) {
    console.error("전체 프로세스 오류:", err);

    // 에러 발생 시 Slack에 메시지 전송 (API 키 오류 등 포함)
    const errorText = err.message.includes("API key") 
      ? "API 키 또는 사용 한도 오류가 발생했습니다. Vercel 환경 변수를 확인해주세요."
      : "처리 중 알 수 없는 오류가 발생했습니다.";

    try {
      await slack.chat.postMessage({
        channel: req.body?.event?.channel,
        text: `처리 오류: ${errorText}`,
        thread_ts: req.body?.event?.ts
      });
    } catch (e) { /* Slack 메시지 전송 실패는 무시 */ }

    return res.status(500).send("error");
  }
};
