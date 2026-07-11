import type { AuthOptions } from "next-auth";
import { saveNotionToken } from "@/lib/notionTokenStore";

export const authOptions: AuthOptions = {
  debug: true,

  pages: {
    signIn: "/login",
    error: "/login",
  },

  providers: [
    {
      id: "notion",
      name: "Notion",
      type: "oauth",

      clientId: process.env.NOTION_CLIENT_ID!,
      clientSecret: process.env.NOTION_CLIENT_SECRET!,

      authorization: {
        url: "https://api.notion.com/v1/oauth/authorize",
        params: {
          owner: "user",
          response_type: "code",
        },
      },

      token: {
        async request({ params, provider }) {
          // NEXTAUTH_URLが実際のアクセス先ドメインとズレていても、認可時にNextAuthが
          // 実際に使ったcallbackUrlをそのまま使うことで redirect_uri の不一致を防ぐ
          const response = await fetch(
            "https://api.notion.com/v1/oauth/token",
            {
              method: "POST",
              headers: {
                Authorization:
                  "Basic " +
                  Buffer.from(
                    `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`
                  ).toString("base64"),
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                grant_type: "authorization_code",
                code: params.code,
                redirect_uri: provider.callbackUrl,
              }),
            }
          );

          const tokens = await response.json();

          if (!response.ok || !tokens.access_token) {
            console.error("Notionトークン取得エラー:", tokens);
            throw new Error(
              `Notionトークンの取得に失敗しました: ${tokens?.error_description || tokens?.error || response.status}`
            );
          }

          return {
            tokens,
          };
        },
      },

      userinfo: {
        async request({ tokens }) {
          if (!tokens.access_token) {
            throw new Error("Notionのaccess_tokenが取得できませんでした");
          }
          return {
            id: tokens.access_token,
            name: "Notion User",
          };
        },
      },

      profile(profile) {
        return {
          id: profile.id,
          name: profile.name,
        };
      },
    },
  ],

  callbacks: {
    async jwt({ token, account }) {
      // account はサインイン直後のリクエストにしか渡ってこない。以降のリクエストでは
      // 何もせずtokenをそのまま返す（毎リクエストRedisに書きに行かないようにする）
      if (account?.access_token && account?.providerAccountId) {
        token.accessToken = account.access_token;
        token.userId = account.providerAccountId;
        if (account.workspace_id) {
          token.workspaceId = account.workspace_id as string;
        }
        // cronには実行時にログインセッションが無いため、通知作成時に使えるようトークンを保存しておく
        await saveNotionToken(token.userId, token.accessToken).catch((error) => {
          console.error("Notionトークンの保存に失敗:", error);
        });
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.workspaceId = token.workspaceId;
      session.userId = token.userId;
      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};
