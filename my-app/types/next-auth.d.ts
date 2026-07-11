import "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    userId?: string;
    workspaceId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    userId?: string;
    workspaceId?: string;
  }
}