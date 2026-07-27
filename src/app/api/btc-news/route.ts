import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface NewsArticle {
  id: string;
  title: string;
  url: string;
  source: string;
  imageUrl: string | null;
  publishedAt: number;
}

const decodeEntities = (text: string): string =>
  text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim();

const extractTag = (block: string, tag: string): string | null => {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return match ? decodeEntities(match[1]) : null;
};

function parseRssItems(xml: string): NewsArticle[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return items.map((block, index) => {
    const title = extractTag(block, "title") ?? "Untitled";
    const link = extractTag(block, "link") ?? "";
    const pubDate = extractTag(block, "pubDate");
    const imageMatch = block.match(
      /<media:content[^>]*url="([^"]+)"|<enclosure[^>]*url="([^"]+)"/,
    );
    const guid = extractTag(block, "guid") ?? `${link}-${index}`;

    return {
      id: guid,
      title,
      url: link,
      source: "Cointelegraph",
      imageUrl: imageMatch ? imageMatch[1] || imageMatch[2] : null,
      publishedAt: pubDate ? new Date(pubDate).getTime() : Date.now(),
    };
  });
}

export async function GET() {
  try {
    const res = await fetch("https://cointelegraph.com/rss/tag/bitcoin", {
      next: { revalidate: 300 },
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BitFactoryBot/1.0)" },
    });
    if (!res.ok) throw new Error(`Cointelegraph RSS error: ${res.status}`);
    const xml = await res.text();
    const articles = parseRssItems(xml).slice(0, 10);

    return NextResponse.json({ articles, timestamp: Date.now() });
  } catch (error) {
    console.error("[BTC News API] Error:", error);
    return NextResponse.json(
      {
        articles: [],
        error: error instanceof Error ? error.message : "Failed to fetch news",
      },
      { status: 200 },
    );
  }
}
