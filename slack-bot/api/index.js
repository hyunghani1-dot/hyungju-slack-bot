// api/index.js
const { Client } = require('@notionhq/client');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const notion = new Client({ auth: process.env.NOTION_KEY });
// 구글 키 연결
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const query = req.body.text; 
    if (!query) return res.status(200).json({ response_type: 'ephemeral', text: '검색어를 입력해주세요.' });

    // 1. 노션 검색
    const notionResponse = await notion.search({
      query: query,
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
      page_size: 5,
    });

    if (notionResponse.results.length === 0) {
      return res.status(200).json({ response_type: 'in_channel', text: `🤔 노션에서 '${query}' 관련 문서를 찾지 못했습니다.` });
    }

    let context = "";
    for (const page of notionResponse.results) {
      let title = "제목 없음";
      if (page.properties) {
        const titleKey = Object.keys(page.properties).find(key => page.properties[key].type === 'title');
        if (titleKey) title = page.properties[titleKey].title[0]?.plain_text || "제목 없음";
      }
      context += `- 제목: ${title}\n- 링크: ${page.url}\n\n`;
    }

    // 2. 제미나이 답변 (모델명: gemini-1.5-flash)
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `질문: ${query}\n\n[노션 검색 결과]:\n${context}\n\n위 내용을 바탕으로 답변해주고 링크도 줘.`;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return res.status(200).json({ response_type: 'in_channel', text: text });

  } catch (error) {
    console.error(error); // Vercel 로그에 에러 기록
    return res.status(200).json({ response_type: 'ephemeral', text: `오류: ${error.message}` });
  }
}
