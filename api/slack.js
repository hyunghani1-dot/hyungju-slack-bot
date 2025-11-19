// api/slack.js

const OpenAI = require("openai");
const { WebClient } = require("@slack/web-api");
const { buildNotionContext } = require("./notion");

// OpenAI 클라이언트
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Slack 클라이언트
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

module.exports = async (req, res) => {
  try {
    // 1) Slack에서 오는 건 POST만 처리
    if (req.method !== "POST") {
      return res.status(200).send("OK");
    }

    const body = req.body || {};

    // 2) URL 검증 단계 (슬랙이 challenge 보내는 부분)
    if (body.type === "url_verification") {
      // Slack이 준 challenge 값을 그대로 돌려줘야 함
      return res.status(200).send(body.challenge);
    }

    const event = body.event || {};

    // 3) 봇이 자기 자신한테 보내는 메시지는 무시
    if (event.bot_id) {
      return res.status(200).send("ignored");
    }

    // 4) 멘션 텍스트에서 @봇이름 부분 제거
        const rawText = event.text || "";
    const text = rawText.replace(/<@[^>]+>/, "").trim();

    if (!text) {
      return res.status(200).send("no text");
    }

    // 4-A) 노션 전체 검색해서 관련 내용 context 만들기
    let notionContext = "";
    try {
      notionContext = await buildNotionContext(text, 3); // 상위 3개 페이지 사용
    } catch (e) {
      console.error("Notion 검색 중 에러:", e);
      notionContext = "";
    }

    // 5) OpenAI gpt-4.1-mini 호출 (노션 context를 함께 전달)
    const messages = [
      {
        role: "system",
        content:
          "너는 형주한의원 전용상담 gpt야. 직원 물음에는 상세하게 설명해주고, 환자응대는 부드럽고 전문적이되, 의학적인 부분은 단호하게 해줘."
      }
    ];

    // 노션에서 뽑은 내용이 있을 때만 system 메시지 하나 더 추가
    if (notionContext) {
      messages.push({
        role: "system",
        content:
          "아래는 형주한의원의 내부 노션 문서에서 가져온 참고 정보야. 답변할 때 이 내용을 우선 참고하고, 부족한 부분만 일반적인 의학 지식으로 보완해.\n\n" +
          notionContext
      });
    }

    // 마지막에 실제 사용자의 질문
    messages.push({
      role: "user",
      content: text
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages
    });

    // 6) Slack 채널에 스레드로 답변 달기
    await slack.chat.postMessage({
      channel: event.channel,
      text: answer,
      thread_ts: event.ts
    });

    return res.status(200).send("ok");
  } catch (err) {
    console.error(err);
    return res.status(500).send("error");
  }
};
