"use client";

import { signIn } from "next-auth/react";
import { useEffect } from "react";

export default function NotionLoginPopupPage() {
  useEffect(() => {
    signIn("notion", { callbackUrl: "/home" });
  }, []);

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
      <p>Notionにログイン中...</p>
    </div>
  );
}
