import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { load } from "js-yaml";

const document = load(
  await readFile(resolve(process.cwd(), "public", "openapi.yaml"), "utf8"),
);

export async function GET() {
  return Response.json(document, {
    headers: { "Cache-Control": "public, max-age=60" },
  });
}
