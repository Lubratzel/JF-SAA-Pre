import { json } from '@sveltejs/kit';

const FEED_URL = 'https://www.tagesschau.de/xml/rss2/';
const MAX_ITEMS = 10;

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'"
};

function decodeXmlEntities(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-fA-F]+|\w+);/g, (match, entity) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    return XML_ENTITIES[entity] ?? match;
  });
}

function extractTag(item: string, tag: string): string {
  const match = item.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  let value = match?.[1] ?? '';
  value = value.replace('<![CDATA[', '').replace(']]>', '').trim();
  return decodeXmlEntities(value);
}

function extractImage(item: string): string | null {
  // Das Titelbild steckt im content:encoded-CDATA-Block, z. B. <img src="…" alt="…" />
  const encodedMatch = item.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/);
  if (!encodedMatch) return null;
  const imgMatch = encodedMatch[1].match(/<img[^>]*\ssrc="([^"]+)"/);
  return imgMatch ? decodeXmlEntities(imgMatch[1]) : null;
}

interface NewsItem {
  title: string;
  description: string;
  image: string | null;
}

function parseItems(xml: string): NewsItem[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return items
    .map((item) => ({
      title: extractTag(item, 'title'),
      description: extractTag(item, 'description'),
      image: extractImage(item)
    }))
    .filter((item) => item.title.length > 0)
    .slice(0, MAX_ITEMS);
}

// GET /api/news – aktuelle Schlagzeilen (mit Bild, falls vorhanden) für die Ruhebildschirm-Diashow (Tagesschau RSS)
export async function GET() {
  try {
    const res = await fetch(FEED_URL, { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return json({ items: parseItems(xml) });
  } catch (err) {
    console.warn('[news] Konnte Nachrichten nicht laden:', err);
    return json({ items: [] });
  }
}
