import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.redirect(
    new URL("/sitemap/sitemapindex.xml", "https://rvroadlog.com"),
    301
  );
}
