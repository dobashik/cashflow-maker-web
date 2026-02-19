import { NextResponse } from "next/server";
// The client you created from the Server-Side Auth instructions
import { createClient } from "@/utils/supabase/server";

export const runtime = "edge";

/**
 * リダイレクト先パスのサニタイズ（オープンリダイレクト防止）
 * 外部URLや protocol-relative URL を拒否し、相対パスのみ許可する
 */
function sanitizeRedirectPath(path: string | null): string {
  if (!path) return "/";
  // protocol-relative URL (//evil.com) を防止
  if (path.startsWith("//")) return "/";
  // 絶対URL (https://evil.com 等) を防止
  if (path.includes("://")) return "/";
  // / で始まる相対パスのみ許可
  if (!path.startsWith("/")) return "/";
  return path;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // if "next" is in param, use it as the redirect URL (sanitized)
  const next = sanitizeRedirectPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host"); // original origin before load balancer
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (isLocalEnv) {
        // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
