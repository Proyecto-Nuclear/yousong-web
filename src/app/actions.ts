"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { settings } from "@/lib/auth-policy";

async function configForAction() {
  const config = settings(process.env);
  if ((await headers()).get("origin") !== config.appUrl)
    throw Error("Invalid origin");
  return config;
}
export async function login() {
  await configForAction();
  await signIn("fusionauth", { redirectTo: "/" });
}
export async function logout() {
  const config = await configForAction();
  await signOut({ redirect: false });
  const url = new URL(`${config.issuer}/oauth2/logout`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("post_logout_redirect_uri", config.appUrl);
  redirect(url.href);
}
