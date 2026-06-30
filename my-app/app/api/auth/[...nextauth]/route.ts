import NextAuth from "next-auth";

const getBaseUrl = () => {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
};

const notionRedirectUri = `${getBaseUrl()}/api/auth/callback/notion`;

export const authOptions = {
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
          redirect_uri: notionRedirectUri,
        },
      },

      token: {
        async request({ params }: { params: { code?: string } }) {
          const response = await fetch("https://api.notion.com/v1/oauth/token", {
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
              redirect_uri: notionRedirectUri,
            }),
          });

          const tokens = await response.json();

          return {
            tokens,
          };
        },
      },

      userinfo: {
        async request({ tokens }) {
          return {
            id: tokens.access_token || "notion-user",
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
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? session.user.id;
      }
      session.accessToken = token.accessToken as string | undefined;
      session.userId = token.sub;
      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };