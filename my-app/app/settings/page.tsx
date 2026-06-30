'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react'; 
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

// GNewsで利用可能なニュースジャンルの一覧
const NEWS_CATEGORY_OPTIONS = [
  { id: 'general', name: '総合' },
  { id: 'technology', name: 'テクノロジー' },
  { id: 'business', name: 'ビジネス' },
  { id: 'science', name: 'サイエンス' },
  { id: 'sports', name: 'スポーツ' },
  { id: 'entertainment', name: 'エンタメ' },
];

export default function SettingsPage() {
  const [isMounted, setIsMounted] = useState(false);

  // 各トグルの状態管理
  const [aiBusiness, setAiBusiness] = useState(true);
  const [aiDaily, setAiDaily] = useState(true);
  const [notifications, setNotifications] = useState(true);
  
  // 💡 修正1: GitHubリポジトリ名の初期状態をデフォルトなし（空っぽ）に変更
  const [githubRepo, setGithubRepo] = useState('');

  // 天気表示用地域の状態管理（デフォルトは大阪）
  const [weatherRegion, setWeatherRegion] = useState('osaka');

  // ニュースジャンルの状態管理（デフォルトは総合）
  const [newsCategory, setNewsCategory] = useState('general');

  // 起動時にLocalStorageから設定を復元
  useEffect(() => {
    const savedBusiness = localStorage.getItem('setting_aiBusiness');
    const savedDaily = localStorage.getItem('setting_aiDaily');
    const savedNotif = localStorage.getItem('setting_notifications');
    const savedRepo = localStorage.getItem('setting_githubRepo');
    const savedRegion = localStorage.getItem('setting_weatherRegion');
    const savedCategory = localStorage.getItem('setting_newsCategory');

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
  }, []);

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

  // ニュースジャンルを変更し保存する関数
  const handleCategoryChange = (categoryId: string) => {
    setNewsCategory(categoryId);
    localStorage.setItem('setting_newsCategory', categoryId);
    
    // ジャンルが変わったら古いキャッシュを削除して、次回ホーム画面で強制リフレッシュさせる
    localStorage.removeItem('cache_newsData');
    localStorage.removeItem('cache_newsTimestamp');
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
              {/* 💡 修正3: select内のoptionテキストがダーク背景で見えなくならないようにスタイルをケア */}
              <select
                id="weatherRegionSelect"
                className={styles.textField}
                style={{ cursor: 'pointer', color: '#ffffff', backgroundColor: 'rgba(255, 255, 255, 0.07)' }}
                value={weatherRegion}
                onChange={(e) => handleRegionChange(e.target.value)}
              >
                {REGION_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id} style={{ color: '#000000' }}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
            <p className={styles.inputHelp}>※ ホーム画面に表示する天気予報の地域を選択してください</p>
          </div>
        </div>
      </div>

      {/* ニュースジャンル設定セクション */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>ニュース設定</span>
          <div className={styles.rowContainer}>
            <div className={styles.inputRow}>
              <label className={styles.subLabel} htmlFor="newsCategorySelect">ジャンル</label>
              <select
                id="newsCategorySelect"
                className={styles.textField}
                style={{ cursor: 'pointer', color: '#ffffff', backgroundColor: 'rgba(255, 255, 255, 0.07)' }}
                value={newsCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
              >
                {NEWS_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id} style={{ color: '#000000' }}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
            <p className={styles.inputHelp}>※ ホーム画面に表示するニュースのジャンルを選択してください</p>
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

      {/* 通知機能設定セクション */}
      <div className={styles.section}>
        <div className={styles.settingRowInline}>
          <span className={styles.sectionTitle}>通知機能</span>
          <div className={styles.toggleWrapper}>
            <span className={notifications ? styles.textOn : styles.textOff}>
              {notifications ? 'ON' : 'OFF'}
            </span>
            <label className={styles.switch}>
              <input 
                type="checkbox" 
                checked={notifications} 
                onChange={(e) => handleToggle('notifications', e.target.checked)} 
              />
              <span className={styles.slider}></span>
            </label>
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