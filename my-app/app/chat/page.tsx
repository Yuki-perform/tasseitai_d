"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import styles from "./chat.module.css";

// 1. データ構造に image プロパティ（任意）を追加
type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  image?: string; // 送信された画像のURLを保持する用
};

export default function ChatPage() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePlusClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleSend = async () => {
    const question = message.trim();
    if (!question && !selectedFile) return;

    // 2. ローカルで表示するための画像URLを作成
    let imageUrl = "";
    if (selectedFile && selectedFile.type.startsWith("image/")) {
      imageUrl = URL.createObjectURL(selectedFile);
    }

    // 自分のメッセージを画面に追加（画像URLも一緒に保持）
    setMessages((prev) => [
      ...prev,
      { role: "user", text: question, image: imageUrl },
    ]);
    
    setMessage("");
    setSelectedFile(null);

    try {
      // NOTE: GroqなどのLLMへ画像データを送信して認識させたい場合は、
      // 将来的にここを FormData 形式にするか、Base64に変換して body に含める必要があります。
      // 現状は既存のテキスト送信ロジックを維持しています。
      const response = await fetch("/api/groq", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "API request failed");
      }

      const assistantText = typeof data.content === "string" ? data.content : "";
      if (assistantText.trim()) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: assistantText },
        ]);
      }
    } catch (error) {
      console.error("チャット送信エラー:", error);
    }
  };

  return (
    <main className={styles.container}>
      {/* ヘッダー */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.back()}>
          ←
        </button>
      </div>

      {/* チャット履歴エリア */}
      <div className={styles.chatArea}>
        {messages.map((msg, index) => (
          <div
            key={index}
            className={
              msg.role === "assistant"
                ? styles.messageRowAssistant
                : styles.messageRowUser
            }
          >
            {/* 役割ラベル */}
            <div className={styles.roleLabel}>
              {msg.role === "assistant" ? "Noir" : "User"}
            </div>
            
            {/* メッセージの吹き出し */}
            <div
              className={
                msg.role === "assistant"
                  ? styles.assistantBubble
                  : styles.userBubble
              }
            >
              {/* 3. メッセージ内に画像URLがあれば、先に画像を表示 */}
              {msg.image && (
                <div className={styles.sentImageWrapper}>
                  <img src={msg.image} alt="Sent" className={styles.sentImage} />
                </div>
              )}
              {/* テキストがあれば表示 */}
              {msg.text && <div>{msg.text}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* ボトム入力エリア */}
      <div className={styles.inputArea}>
        
        {/* 画像が選択されている場合のプレビュー表示 */}
        {selectedFile && (
          <div className={styles.filePreview}>
            {selectedFile.type.startsWith("image/") ? (
              <img
                src={URL.createObjectURL(selectedFile)}
                alt="preview"
                className={styles.previewImage}
                onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
              />
            ) : (
              <span>📎 {selectedFile.name}</span>
            )}
            <button type="button" onClick={() => setSelectedFile(null)} className={styles.clearFileBtn}>
              ✕
            </button>
          </div>
        )}

        {/* カプセル型の入力枠コンテナ */}
        <div className={styles.inputWrapper}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            style={{ display: "none" }}
            accept="image/*,application/pdf"
          />

          <button
            type="button"
            className={styles.plusBtn}
            onClick={handlePlusClick}
          >
            ＋
          </button>

          <input
            type="text"
            placeholder="Message Noir..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSend();
              }
            }}
            className={styles.textField}
          />

          <button className={styles.sendBtn} onClick={handleSend}>
            ▶
          </button>
        </div>
      </div>
    </main>
  );
}