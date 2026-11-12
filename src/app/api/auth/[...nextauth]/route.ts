import type { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { settings } from "@/lib/auth-policy";
import { sameOrigin } from "@/lib/bff";
export const GET = handlers.GET;
export async function POST(request: NextRequest) {
  if (!sameOrigin(request, settings(process.env).appUrl))
    return Response.json({ code: "INVALID_ORIGIN" }, { status: 403 });
  return handlers.POST(request);
}
