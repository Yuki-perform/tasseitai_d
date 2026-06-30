"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function NotionLogoutPage() {
  const router = useRouter();
  const popupRef = useRef<Window | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [status, setStatus] = useState<"idle" | "waiting" | "blocked">("idle");

  // 自分のアプリ側のセッションは先にクリアしておく
  useEffect(() => {
    signOut({ redirect: false });
  }, []);

  // アンマウント時にポーリングを止める
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleSwitchAccount = () => {
    const popup = window.open(
      "https://www.notion.so/logout",
      "notion-logout-popup",
      "width=800,height=900"
    );

    if (!popup) {
      setStatus("blocked");
      return;
    }

    popupRef.current = popup;
    setStatus("waiting");

    // ログアウト処理が終わるのを待ってから、自分のアプリのOAuth開始ページへ
    setTimeout(() => {
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.location.href = "/notion-login-popup";
      }
    }, 1500);

    // ポップアップが自分のドメイン(/home)に戻ってきたらログイン完了とみなす
    intervalRef.current = setInterval(() => {
      const popup = popupRef.current;
      if (!popup || popup.closed) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setStatus("idle");
        return;
      }

      try {
        // notion.so 表示中はクロスオリジンなのでここで例外になる
        const pathname = popup.location.pathname;
        if (pathname.startsWith("/home")) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          popup.close();
          router.push("/home");
        }
      } catch {
        // 無視して次のポーリングを待つ
      }
    }, 500);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        gap: "16px",
      }}
    >
      {status === "waiting" ? (
        <p>別ウィンドウでログインしてください...</p>
      ) : (
        <>
          <p>別のアカウントでログインしますか？</p>
          <button onClick={handleSwitchAccount}>Notionで別アカウントログイン</button>
          {status === "blocked" && (
            <p style={{ color: "red" }}>
              ポップアップがブロックされました。ブラウザの設定を確認してください。
            </p>
          )}
        </>
      )}
    </div>
  );
}
