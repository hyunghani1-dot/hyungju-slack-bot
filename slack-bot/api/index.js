// api/index.js
const { Client } = require('@notionhq/client');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const notion = new Client({ auth: process.env.NOTION_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const query = req.body.text; 

    if (!query) {
      return res.status(200).json({
        response_type: 'ephemeral',
        text: '검색어를 입력해주세요. 예: /질문 [내용]'
      });
    }

    // [변경점] notion.search 를 사용하여 전체 검색 (권한 있는 페이지 내)
    const notionResponse = await notion.search({
      query: query, // 검색어
      sort: {
        direction: 'descending',
        timestamp: 'last_edited_time',
      },
      page_size: 5, // 상위 5개 문서 참조
    });

    if (notionResponse.results.length === 0) {
      return res.status(200).json({
        response_type: 'in_channel',
        text: `🤔 노션에서 '${query}' 관련 문서를 찾지 못했습니다. (봇이 해당 페이지에 초대되었는지 확인해주세요!)`
      });
    }

    // 검색된 페이지 정보 요약
    let context = "";
    for (const page of notionResponse.results) {
      // 제목 찾기 (데이터베이스마다 제목 컬럼명이 다를 수 있어 안전하게 처리)
      let title = "제목 없음";
      if (page.properties) {
        // properties 안에 있는 것 중 'title' 타입인 것을 찾음
        const titleKey = Object.keys(page.properties).find(key => page.properties[key].type === 'title');
        if (titleKey) {
          title = page.properties[titleKey].title[0]?.plain_text || "제목 없음";
        }
      }
      
      const url = page.url;
      context += `- 문서 제목: ${title}\n- 링크: ${url}\n\n`;
    }

    // 제미나이에게 답변 요청
    const model = genAI.getGenerativeModel({ model: "gemini-1.0-pro" });
    const prompt = `
      당신은 업무 도우미입니다. 사용자의 질문에 대해 아래 [노션 검색 결과]를 요약해서 답변해주세요.
      문서의 제목과 링크를 반드시 포함해서 깔끔하게 알려주세요.

      [사용자 질문]: ${query}

      [노션 검색 결과]:
      ${context}
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return res.status(200).json({
      response_type: 'in_channel',
      text: text
    });

  } catch (error) {
    console.error(error);
    return res.status(200).json({
        response_type: 'ephemeral',
        text: `오류가 발생했습니다: ${error.message}`
    });
  }
}





