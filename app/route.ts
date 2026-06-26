import { HOME_HTML } from "../lib/home-html";

export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(HOME_HTML, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=31536000, s-maxage=31536000" },
  });
}
