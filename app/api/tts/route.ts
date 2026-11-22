const MAX_CHUNK_LENGTH = 180;
const MAX_TEXT_LENGTH = 2_000;
const TTS_URL = "https://translate.google.com/translate_tts";

export function splitTtsText(text: string): string[] {
  const characters = Array.from(text.trim());
  const chunks: string[] = [];
  let start = 0;

  while (start < characters.length) {
    let end = Math.min(start + MAX_CHUNK_LENGTH, characters.length);

    if (end < characters.length) {
      let sentenceEnd = -1;
      for (let index = end - 1; index >= start; index -= 1) {
        if (".!?؟۔".includes(characters[index])) {
          sentenceEnd = index + 1;
          break;
        }
      }

      if (sentenceEnd > start) {
        end = sentenceEnd;
      } else {
        let wordEnd = -1;
        for (let index = end - 1; index > start; index -= 1) {
          if (/\s/u.test(characters[index])) {
            wordEnd = index;
            break;
          }
        }
        if (wordEnd > start) end = wordEnd;
      }
    }

    const chunk = characters.slice(start, end).join("").trim();
    if (chunk) chunks.push(chunk);
    start = end;
    while (start < characters.length && /\s/u.test(characters[start])) start += 1;
  }

  return chunks;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get("text");
  const lang = searchParams.get("lang");

  if (!text || (lang !== "ur" && lang !== "en")) {
    return Response.json({ error: "Provide text and lang=ur|en." }, { status: 400 });
  }

  if (Array.from(text).length > MAX_TEXT_LENGTH) {
    return Response.json({ error: "Text is too long." }, { status: 413 });
  }

  const containsRealId = /\d{5}-?\d{7}-?\d/u.test(text);
  const containsPakistaniPhone = /(?:\+?92[\s-]?|0)3\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/u.test(text);
  if (containsRealId || containsPakistaniPhone) {
    return Response.json({ error: "Real personal numbers cannot be spoken." }, { status: 422 });
  }

  const audioParts: BlobPart[] = [];
  for (const chunk of splitTtsText(text)) {
    const url = `${TTS_URL}?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodeURIComponent(chunk)}`;
    try {
      const response = await fetch(url, {
        headers: { Accept: "audio/mpeg" },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        return Response.json({ error: "Speech provider is unavailable." }, { status: 502 });
      }
      if (!response.headers.get("content-type")?.toLowerCase().startsWith("audio/")) {
        return Response.json({ error: "Speech provider returned invalid audio." }, { status: 502 });
      }
      audioParts.push(await response.arrayBuffer());
    } catch {
      return Response.json({ error: "Speech provider is unavailable." }, { status: 502 });
    }
  }

  if (audioParts.length === 0) {
    return Response.json({ error: "Text is required." }, { status: 400 });
  }

  return new Response(new Blob(audioParts, { type: "audio/mpeg" }), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
