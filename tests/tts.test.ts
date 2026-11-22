import { describe, expect, it, vi } from "vitest";
import { GET, splitTtsText } from "@/app/api/tts/route";

describe("splitTtsText", () => {
  it("keeps chunks within 180 Unicode characters and prefers sentence boundaries", () => {
    const text = `${"ا".repeat(176)}۔ ${"ب".repeat(30)}`;
    const chunks = splitTtsText(text);

    expect(chunks[0]).toBe(`${"ا".repeat(176)}۔`);
    expect(chunks.every((chunk) => Array.from(chunk).length <= 180)).toBe(true);
  });

  it("splits long words at the limit when no word boundary is available", () => {
    const chunks = splitTtsText("x".repeat(400));

    expect(chunks.map((chunk) => Array.from(chunk).length)).toEqual([180, 180, 40]);
  });

  it("requests and concatenates MP3 audio chunks with the public cache header", async () => {
    const fetchMock = vi.fn().mockImplementation(
      () => Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/mpeg" } })),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const text = `${"a".repeat(180)} ${"b".repeat(20)}`;
      const response = await GET(
        new Request(`http://localhost/api/tts?lang=en&text=${encodeURIComponent(text)}`),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
      expect(response.headers.get("Cache-Control")).toBe("public, max-age=86400");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const firstUrl = new URL(fetchMock.mock.calls[0][0] as string);
      expect(firstUrl.searchParams.get("q")).toBe("a".repeat(180));
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(
        new Uint8Array([1, 2, 3, 1, 2, 3]),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects real identity numbers without calling the speech provider", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const response = await GET(
        new Request("http://localhost/api/tts?lang=ur&text=12345-1234567-1"),
      );

      expect(response.status).toBe(422);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
