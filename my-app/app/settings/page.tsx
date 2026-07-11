'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { signIn, signOut, useSession } from 'next-auth/react'; 
import styles from './settings.module.css';

// 選択肢となる地域データの一覧
const REGION_OPTIONS = [
  { id: 'sapporo', name: '札幌', lat: '43.0621', lon: '141.3544' },
  { id: 'sendai', name: '仙台', lat: '38.2682', lon: '140.8694' },
  { id: 'tokyo', name: '東京', lat: '35.6895', lon: '139.6917' },
  { id: 'nagoya', name: '名古屋', lat: '35.1815', lon: '136.9066' },
  { id: 'osaka', name: '大阪', lat: '34.6937', lon: '135.5023' },
  { id: 'hiroshima', name: '広島', lat: '34.3853', lon: '132.4553' },
  { id: 'fukuoka', name: '福岡', lat: '33.5904', lon: '130.4017' },
  { id: 'okinawa', name: '那覇', lat: '26.2124', lon: '127.6809' },
];

// ⭕ GNewsで利用可能なニュースジャンルの一覧
const NEWS_CATEGORY_OPTIONS = [
  { id: 'general', name: '総合' },
  { id: 'technology', name: 'テクノロジー' },
  { id: 'business', name: 'ビジネス' },
  { id: 'science', name: 'サイエンス' },
  { id: 'sports', name: 'スポーツ' },
  { id: 'entertainment', name: 'エンタメ' },
];

// Notionデータベース設定で扱うトピック一覧
const NOTION_DATABASE_TOPICS: { id: string; label: string; help: string }[] = [
  { id: "shopping", label: "買い物リスト", help: "商品名(title) / 数量(number) / メモ(rich_text)" },
  { id: "todo", label: "進捗管理", help: "タスク名(title) / ステータス(status) / 優先度(select) / 期日(date) / 説明(rich_text)" },
  { id: "schedule", label: "スケジュール", help: "予定(title) / 日時(date) / メモ(rich_text)" },
  { id: "jobhunting", label: "就活", help: "会社名(title) / ステータス(status) / 期日(date) / 説明(rich_text)" },
  { id: "memo", label: "未分類メモ", help: "メモ登録日時(title) / メモ内容(rich_text)" },
];

export default function SettingsPage() {
  const { data: session } = useSession();
  const [isMounted] = useState(() => typeof window !== 'undefined');

  const getStoredBoolean = (key: string, fallback: boolean) => {
    if (typeof window === 'undefined') return fallback;
    const value = window.localStorage.getItem(key);
    return value !== null ? JSON.parse(value) : fallback;
  };

  const getStoredString = (key: string, fallback: string) => {
    if (typeof window === 'undefined') return fallback;
    const value = window.localStorage.getItem(key);
    return value !== null ? value : fallback;
  };

  // Notionデータベース設定（トピックID -> 入力中の値）。空欄なら共有ワークスペースの既定値を使う
  const [notionDatabases, setNotionDatabases] = useState<Record<string, string>>({});
  const [notionDatabaseStatus, setNotionDatabaseStatus] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});

  // 各トグルの状態管理
  const [aiBusiness, setAiBusiness] = useState(() => getStoredBoolean('setting_aiBusiness', true));
  const [aiDaily, setAiDaily] = useState(() => getStoredBoolean('setting_aiDaily', true));
  const [notifications, setNotifications] = useState(() => getStoredBoolean('setting_notifications', true));
  
  // GitHubリポジトリ名の状態管理
  const [githubRepo, setGithubRepo] = useState(() => getStoredString('setting_githubRepo', 'haru200453/tasseitai'));

  // 天気表示用地域の状態管理（デフォルトは大阪）
  const [weatherRegion, setWeatherRegion] = useState(() => getStoredString('setting_weatherRegion', 'osaka'));

  // ⭕ ニュースジャンルの状態管理を追加（デフォルトは総合）
  const [newsCategory, setNewsCategory] = useState(() => getStoredString('setting_newsCategory', 'general'));

  const [notionPageId, setNotionPageId] = useState('');
  const [notionConnected, setNotionConnected] = useState(false);
  const [notionSaving, setNotionSaving] = useState(false);

  // 起動時にLocalStorageから設定を復元
  useEffect(() => {
    const loadNotionSettings = async () => {
      try {
        const response = await fetch('/api/notion/settings');
        if (response.ok) {
          const data = await response.json();
          setNotionPageId(data.pageId || '');
          setNotionConnected(Boolean(data.connected));
        }
      } catch {
        // 何もしない
      }
    };

    setAiBusiness(savedBusiness !== null ? JSON.parse(savedBusiness) : true);
    setAiDaily(savedDaily !== null ? JSON.parse(savedDaily) : true);
    setNotifications(savedNotif !== null ? JSON.parse(savedNotif) : true);
    
    // 💡 修正2: 保存されたデータがあればそれを入れ、無ければ確実に空っぽにする
    setGithubRepo(savedRepo !== null ? savedRepo : '');

    if (savedRegion !== null) {
      setWeatherRegion(savedRegion);
    }

    if (savedCategory !== null) {
      setNewsCategory(savedCategory);
    }

    setIsMounted(true);

    // 現在登録済みのNotionデータベースID（上書き設定分のみ）を取得しておく
    fetch('/api/notion/databases')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.overrides) {
          setNotionDatabases(data.overrides);
        }
      })
      .catch(() => {
        // 未ログインなどの場合は静かに諦める（設定画面自体は表示させる）
      });
  }, []);

  // Notionデータベース設定の入力欄が変わったときのハンドラ（フォーカスが外れたタイミングで保存する）
  const handleNotionDatabaseChange = (topic: string, value: string) => {
    setNotionDatabases((prev) => ({ ...prev, [topic]: value }));
  };

  const handleNotionDatabaseSave = async (topic: string) => {
    setNotionDatabaseStatus((prev) => ({ ...prev, [topic]: 'saving' }));
    try {
      const response = await fetch('/api/notion/databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, databaseId: notionDatabases[topic] || '' }),
      });
      if (!response.ok) throw new Error('save failed');
      setNotionDatabaseStatus((prev) => ({ ...prev, [topic]: 'saved' }));
    } catch {
      setNotionDatabaseStatus((prev) => ({ ...prev, [topic]: 'error' }));
    }
  };

  const handleToggle = (key: 'aiBusiness' | 'aiDaily' | 'notifications', value: boolean) => {
    if (key === 'aiBusiness') setAiBusiness(value);
    if (key === 'aiDaily') setAiDaily(value);
    if (key === 'notifications') setNotifications(value);

    localStorage.setItem(`setting_${key}`, JSON.stringify(value));
  };

  // GitHubリポジトリ名をLocalStorageに保存する関数
  const handleRepoChange = (value: string) => {
    setGithubRepo(value);
    localStorage.setItem('setting_githubRepo', value);
  };

  // 天気地域を変更し、座標情報などをまとめて保存する関数
  const handleRegionChange = (regionId: string) => {
    setWeatherRegion(regionId);
    
    const selected = REGION_OPTIONS.find(r => r.id === regionId);
    if (selected) {
      localStorage.setItem('setting_weatherRegion', selected.id);
      localStorage.setItem('setting_weatherName', selected.name);
      localStorage.setItem('setting_weatherLat', selected.lat);
      localStorage.setItem('setting_weatherLon', selected.lon);
    }
  };

  // ⭕ ニュースジャンルを変更し保存する関数
  const handleCategoryChange = (categoryId: string) => {
    setNewsCategory(categoryId);
    localStorage.setItem('setting_newsCategory', categoryId);
    
    // 💡 ジャンルが変わったら古いキャッシュを削除して、次回ホーム画面で強制リフレッシュさせる
    localStorage.removeItem('cache_newsData');
    localStorage.removeItem('cache_newsTimestamp');
  };

  const handleSaveNotionSettings = async () => {
    setNotionSaving(true);
    try {
      const response = await fetch('/api/notion/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: notionPageId,
          apiKey: session?.accessToken || '',
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setNotionConnected(Boolean(data.connected));
        setNotionPageId(data.pageId || notionPageId);
      }
    } finally {
      setNotionSaving(false);
    }
  };

  const handleConnectNotion = async () => {
    await signIn('notion', { callbackUrl: '/settings' });
  };

  const handleLogout = async () => {
    alert('ログアウトしました');
    await signOut({ callbackUrl: '/login' }); 
  };

  if (!isMounted) {
    return <div className={styles.container}></div>;
  }

  return (
    <div className={styles.container}>
      {/* ヘッダー */}
      <div className={styles.header}>
        <Link href="/home" className={styles.backBtn} style={{ textDecoration: 'none' }}>
          ←
        </Link>
        <h1 className={styles.title}>設定画面</h1>
      </div>

      {/* AI設定セクション */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>AI設定</span>
          <div className={styles.rowContainer}>
            <div className={styles.settingRow}>
              <span className={styles.subLabel}>ビジネス用</span>
              <div className={styles.toggleWrapper}>
                <span className={aiBusiness ? styles.textOn : styles.textOff}>
                  {aiBusiness ? 'ON' : 'OFF'}
                </span>
                <label className={styles.switch}>
                  <input 
                    type="checkbox" 
                    checked={aiBusiness} 
                    onChange={(e) => handleToggle('aiBusiness', e.target.checked)} 
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>

            <div className={styles.settingRow}>
              <span className={styles.subLabel}>日常生活用</span>
              <div className={styles.toggleWrapper}>
                <span className={aiDaily ? styles.textOn : styles.textOff}>
                  {aiDaily ? 'ON' : 'OFF'}
                </span>
                <label className={styles.switch}>
                  <input 
                    type="checkbox" 
                    checked={aiDaily} 
                    onChange={(e) => handleToggle('aiDaily', e.target.checked)} 
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 天気地域設定セクション */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>地域設定</span>
          <div className={styles.rowContainer}>
            <div className={styles.inputRow}>
              <label className={styles.subLabel} htmlFor="weatherRegionSelect">表示地域</label>
              <select
                id="weatherRegionSelect"
                className={styles.textField}
                style={{ cursor: 'pointer' }}
                value={weatherRegion}
                onChange={(e) => handleRegionChange(e.target.value)}
              >
                {REGION_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
            <p className={styles.inputHelp}>※ ホーム画面に表示する天気予報の地域を選択してください</p>
          </div>
        </div>
      </div>

      {/* ⭕ 新設：ニュースジャンル設定セクション（地域設定の下に配置） */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>ニュース設定</span>
          <div className={styles.rowContainer}>
            <div className={styles.inputRow}>
              <label className={styles.subLabel} htmlFor="newsCategorySelect">ジャンル</label>
              <select
                id="newsCategorySelect"
                className={styles.textField}
                style={{ cursor: 'pointer' }}
                value={newsCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
              >
                {NEWS_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
            <p className={styles.inputHelp}>※ ホーム画面に表示するニュースのジャンルを選択してください</p>
          </div>
        </div>
      </div>

      {/* Notion連携設定セクション */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Notion連携</span>
          <div className={styles.rowContainer}>
            <div className={styles.inputRow}>
              <label className={styles.subLabel} htmlFor="notionPageIdInput">ページID</label>
              <input
                id="notionPageIdInput"
                type="text"
                className={styles.textField}
                placeholder="例: 1234567890abcdef"
                value={notionPageId}
                onChange={(e) => setNotionPageId(e.target.value)}
              />
            </div>
            <p className={styles.inputHelp}>※ OAuth認証後に保存されるアクセストークンと、参照したい Notion ページ ID を登録します。</p>
            <div className={styles.rowContainer}>
              <button className={styles.loginButton} onClick={handleConnectNotion} style={{ marginTop: '8px' }}>
                {notionConnected ? 'Notionを再接続' : 'Notionで接続'}
              </button>
              <button className={styles.dangerBtn} onClick={handleSaveNotionSettings} style={{ marginTop: '8px' }} disabled={notionSaving}>
                {notionSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* GitHub連携設定セクション */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>外部連携</span>
          <div className={styles.rowContainer}>
            <div className={styles.inputRow}>
              <label className={styles.subLabel} htmlFor="githubRepoInput">GitHub リポジトリ</label>
              <input
                id="githubRepoInput"
                type="text"
                className={styles.textField}
                placeholder="ユーザー名/リポジトリ名"
                value={githubRepo}
                onChange={(e) => handleRepoChange(e.target.value)}
              />
            </div>
            <p className={styles.inputHelp}>※ 「アカウント名/リポジトリ名」の形式で入力してください</p>
          </div>
        </div>
      </div>

      {/* Notionデータベース設定セクション（個人ワークスペース利用者向け） */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Notionデータベース設定</span>
          <p className={styles.inputHelp}>
            ※ 自分専用のNotionワークスペースを使う場合、下記のデータベース名（例:「進捗管理」）と同じ名前のデータベースを連携済みの範囲内から自動で探します。通常はこの欄を空欄のままで問題ありません。同名のデータベースが複数あるなど自動で見つけられない場合のみ、該当するデータベースのIDを直接入力してください。
          </p>
          <div className={styles.rowContainer}>
            {NOTION_DATABASE_TOPICS.map((topic) => (
              <div className={styles.inputRow} key={topic.id}>
                <label className={styles.subLabel} htmlFor={`notionDb_${topic.id}`}>{topic.label}</label>
                <input
                  id={`notionDb_${topic.id}`}
                  type="text"
                  className={styles.textField}
                  placeholder="未設定（共有ワークスペースの既定を使用）"
                  value={notionDatabases[topic.id] || ''}
                  onChange={(e) => handleNotionDatabaseChange(topic.id, e.target.value)}
                  onBlur={() => handleNotionDatabaseSave(topic.id)}
                />
                <p className={styles.inputHelp}>
                  必要なプロパティ: {topic.help}
                  {notionDatabaseStatus[topic.id] === 'saving' && ' ・保存中...'}
                  {notionDatabaseStatus[topic.id] === 'saved' && ' ・保存しました'}
                  {notionDatabaseStatus[topic.id] === 'error' && ' ・保存に失敗しました'}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 通知機能設定セクション */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>通知機能</span>
          <div className={styles.rowContainer}>

            {/* 💡 追加：テストデモ画面へ遷移するボタン */}
            <div className={styles.inputRow} style={{ marginTop: '12px' }}>
              <Link 
                href="/notification-demo" 
                className={styles.textField} 
                style={{ 
                  textDecoration: 'none', 
                  display: 'flex', 
                  justifyContent: 'center', 
                  alignItems: 'center',
                  backgroundColor: 'rgba(59, 130, 246, 0.15)', // 薄い青色の背景
                  border: '1px solid #3b82f6', // 青色の枠線
                  color: '#3b82f6', // 青色の文字
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                🔔 通知のテスト・再設定を行う
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* アカウント操作エリア */}
      <div className={styles.dangerSection}>
        <button className={styles.dangerBtn} onClick={handleLogout}>
          ログアウト
        </button>
      </div>
    </div>
  );
}