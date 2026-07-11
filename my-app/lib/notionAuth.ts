import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export async function resolveNotionApiKey(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.accessToken ?? null;
}

export async function resolveNotionSession(): Promise<{ accessToken: string; userId: string } | null> {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || !session?.userId) return null;
  return { accessToken: session.accessToken, userId: session.userId };
}
