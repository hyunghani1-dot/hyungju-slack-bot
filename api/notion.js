// api/notion.js

const { Client } = require("@notionhq/client");

const notion = new Client({
  auth: process.env.NOTION_API_KEY
});

/**
 * 노션 전체에서 query와 관련된 페이지를 검색하고
 * 상위 maxPages 개의 페이지 내용을 모아서 하나의 문자열로 반환
 */
async function buildNotionContext(query, maxPages = 3) {
  if (!process.env.NOTION_API_KEY) {
    console.warn("NOTION_API_KEY is not set");
    return "";
  }

  // 1) 노션 검색: 최근 수정 순으로 정렬
  const searchResponse = await notion.search({
    query,
    sort: {
      direction: "descending",
      timestamp: "last_edited_time"
    },
    page_size: maxPages
  });

  const results = searchResponse.results || [];
  if (results.length === 0) return "";

  let contextChunks = [];

  for (const result of results) {
    if (result.object !== "page") continue;

    const pageId = result.id;

    // 페이지 제목 가져오기
    const title =
      result.properties?.title?.title?.[0]?.plain_text ||
      result.properties?.Name?.title?.[0]?.plain_text ||
      "제목 없음";

    let pageTexts = [`# ${title}`];

    // 2) 페이지의 블록(내용) 가져오기
    const blocks = await notion.blocks.children.list({
      block_id: pageId,
      page_size: 100
    });

    for (const block of blocks.results) {
      let richTexts = [];

      if (block.type === "paragraph") {
        richTexts = block.paragraph.rich_text;
      } else if (block.type === "heading_1") {
        richTexts = block.heading_1.rich_text;
      } else if (block.type === "heading_2") {
        richTexts = block.heading_2.rich_text;
      } else if (block.type === "heading_3") {
        richTexts = block.heading_3.rich_text;
      } else if (block.type === "bulleted_list_item") {
        richTexts = block.bulleted_list_item.rich_text;
      } else if (block.type === "numbered_list_item") {
        richTexts = block.numbered_list_item.rich_text;
      }

      if (richTexts && richTexts.length > 0) {
        const plain = richTexts.map((t) => t.plain_text).join("");
        if (plain.trim()) pageTexts.push(plain.trim());
      }
    }

    contextChunks.push(pageTexts.join("\n"));
  }

  // 3) 전체 컨텍스트 문자열로 결합
  let context = contextChunks.join("\n\n---\n\n");

  // GPT 입력 길이 제한을 위해 자르기
  const MAX_CHARS = 8000;
  if (context.length > MAX_CHARS) {
    context = context.slice(0, MAX_CHARS) + "\n\n...(생략)";
  }

  return context;
}

module.exports = {
  buildNotionContext
};
