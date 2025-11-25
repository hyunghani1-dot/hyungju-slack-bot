// api/notion.js
const { Client } = require("@notionhq/client");

// Notion 클라이언트 초기화
const notion = new Client({ auth: process.env.NOTION_API_KEY });

// Notion 데이터베이스 ID (Notion URL에서 추출해야 합니다!)
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

/**
 * Notion 데이터베이스에서 텍스트를 검색하고 컨텍스트를 구축합니다.
 * @param {string} query 사용자 질문
 * @returns {Promise<string>} Gemini에게 전달할 컨텍스트 문자열
 */
async function buildNotionContext(query) {
  if (!DATABASE_ID) {
    return "Notion 데이터베이스 ID가 설정되지 않았습니다.";
  }

  try {
    // 1. Notion 데이터베이스 검색 (사용자 질문과 제목 또는 내용이 일치하는 문서 검색)
    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: {
        or: [
          { // 예시: 제목 속성에서 검색
            property: '이름', // Notion DB의 제목 속성 이름
            title: {
              contains: query.substring(0, 50) // 쿼리 일부를 사용하여 검색
            }
          },
          // 더 복잡한 검색 필터링을 여기에 추가할 수 있습니다.
        ]
      },
      page_size: 3, // 최대 3개의 관련 문서만 가져옵니다.
    });

    if (response.results.length === 0) {
      return "검색된 관련 내부 문서가 없습니다.";
    }

    let context = "--- Notion 검색 결과 ---\n";

    // 2. 각 페이지의 제목과 URL을 컨텍스트에 추가
    for (const page of response.results) {
      const title = page.properties.이름.title[0]?.plain_text || '제목 없음';
      const pageUrl = page.url;
      
      // 페이지 내용(블록)까지 가져오려면 블록 API를 별도로 호출해야 하지만, 
      // 여기서는 간결화를 위해 제목과 URL만 사용합니다.
      context += `[${title}](${pageUrl})\n`;
    }

    context += "-------------------------\n";
    return context;

  } catch (error) {
    console.error("Notion API 오류:", error.message);
    return "Notion 검색 중 오류가 발생하여 내부 문서를 참조할 수 없습니다.";
  }
}

module.exports = { buildNotionContext };
