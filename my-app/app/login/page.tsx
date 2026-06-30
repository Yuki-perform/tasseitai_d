"use client";

import { signIn } from "next-auth/react";
import styles from "./login.module.css";

export default function LoginPage() {
  const handleLogin = async () => {
    await signIn("notion", {
      callbackUrl: "/home",
    });
  };

  return (
    // 元の "container" を styles.container に変更し、背景色などを適用できるようにしました
    <main className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logoWrapper}>
          <div className={styles.logo}>AI</div>
          <h1 className={styles.title}>AI秘書</h1>
        </div>

        <p className={styles.subtitle}>
          Notionと連携して、
          <br />
          あなた専属のAI秘書としてタスク・予定・メモを管理します。
        </p>

        <button
          className={styles.loginButton}
          onClick={handleLogin}
        >
          Notionでログイン
        </button>
      </div>
    </main>
  );
}