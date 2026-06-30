'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from './home.module.css';

// 天気コードを人間用の文字と絵文字に変換するマップ
const decodeWeather = (code: number) => {
  if (code === 0) return { text: '快晴', emoji: '☀️' };
  if ([1, 2, 3].includes(code)) return { text: '晴れ/曇', emoji: '⛅' };
  if ([45, 48].includes(code)) return { text: '霧', emoji: '🌫️' };
  if ([51, 53, 55, 56, 57].includes(code)) return { text: '小雨', emoji: '🌦️' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { text: '雨', emoji: '☔' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { text: '雪', emoji: '❄️' };
  if ([95, 96, 99].includes(code)) return { text: '雷雨', emoji: '⛈️' };
  return { text: '不明', emoji: '❓' };
};

// 経過時間を計算する関数
const formatLastActivity = (dateString: string) => {
  const now = new Date();
  const past = new Date(dateString);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour ago`;
  return `${diffDays} day ago`;
};

// ジャンルIDから表示名にマッピングするオブジェクト
const CATEGORY_NAMES: { [key: string]: string } = {
  general: '総合',
  technology: 'テクノロジー',
  business: 'ビジネス',
  science: 'サイエンス',
  sports: 'スポーツ',
  entertainment: 'エンタメ'
};

export default function HomePage() {
  const [isMounted, setIsMounted] = useState(false);
  const [tasks, setTasks] = useState({ healthCheck: true, jobHunting: true });
  
  // 天気のStateを1つに統合して整理
  const [weather, setWeather] = useState({ 
    text: '読み込み中...', 
    emoji: '⏳', 
    temp: '--',
    windSpeed: '--', 
    pop: '--', 
    tomorrow: {
      text: '',
      emoji: '',
      temp: '--',
      pop: '--'
    }
  });

  // 画面に選択された地域名を表示するためのState（デフォルトは大阪）
  const [currentRegionName, setCurrentRegionName] = useState('大阪');

  // 画面に選択されたジャンル名を表示するためのState
  const [currentCategoryName, setCurrentCategoryName] = useState('総合');
  
  const [newsArticles, setNewsArticles] = useState<any[]>([
    { title: 'ニュースを読み込み中...', url: '#' },
    { title: 'しばらくお待ちください...', url: '#' }
  ]);

  const [projectActivities, setProjectActivities] = useState<any[]>([
    { name: '読み込み中...', action: '', time: '--', status: 'offline' }
  ]);

  // 現在表示中のリポジトリ名を画面（JSX）に反映するためのState
  const [currentRepoName, setCurrentRepoName] = useState('読み込み中...');

  useEffect(() => {
    // 💡 まずは最初に画面の枠組みをパッと表示する
    setIsMounted(true);

    // タスクの復元
    const savedHealthCheck = localStorage.getItem('task_healthCheck');
    const savedJobHunting = localStorage.getItem('task_jobHunting');
    setTasks({
      healthCheck: savedHealthCheck !== null ? JSON.parse(savedHealthCheck) : true,
      jobHunting: savedJobHunting !== null ? JSON.parse(savedJobHunting) : true,
    });

    // 💡 重いAPI通信やチェック処理は、画面表示の直後に後ろでこっそり実行する
    setTimeout(() => {
      // --- 天気APIの取得 ---
      const savedRegionName = localStorage.getItem('setting_weatherName') || '大阪';
      const savedLat = localStorage.getItem('setting_weatherLat') || '34.6937';
      const savedLon = localStorage.getItem('setting_weatherLon') || '135.5023';
      setCurrentRegionName(savedRegionName);

      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${savedLat}&longitude=${savedLon}&current=temperature_2m,weather_code,surface_pressure,wind_speed_10m&hourly=precipitation_probability&daily=weather_code,temperature_2m_max,precipitation_probability_max&timezone=Asia%2FTokyo&forecast_days=2`;
      
      fetch(weatherUrl)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.current) {
            const currentDecoded = decodeWeather(data.current.weather_code);
            const currentHour = new Date().getHours();
            const currentPop = data.hourly?.precipitation_probability?.[currentHour] ?? '--';
            const tomorrowWeatherCode = data.daily?.weather_code?.[1] ?? 0;
            const tomorrowDecoded = decodeWeather(tomorrowWeatherCode);
            const tomorrowMaxTemp = data.daily?.temperature_2m_max?.[1] ?? '--';
            const tomorrowPop = data.daily?.precipitation_probability_max?.[1] ?? '--';

            setWeather({
              text: currentDecoded.text,
              emoji: currentDecoded.emoji,
              temp: `${Math.round(data.current.temperature_2m)}°C`,
              windSpeed: `${data.current.wind_speed_10m} m/s`,
              pop: `${currentPop}%`,
              tomorrow: {
                text: tomorrowDecoded.text,
                emoji: tomorrowDecoded.emoji,
                temp: `${Math.round(tomorrowMaxTemp)}°C`,
                pop: `${tomorrowPop}%`
              }
            });
          }
        })
        .catch(() => setWeather({ 
          text: 'エラー', emoji: '⚠️', temp: '--', windSpeed: '--', pop: '--', 
          tomorrow: { text: 'エラー', emoji: '⚠️', temp: '--', pop: '--' } 
        }));

      // --- ニュースAPIの取得 ---
      const savedCategory = localStorage.getItem('setting_newsCategory') || 'general';
      setCurrentCategoryName(CATEGORY_NAMES[savedCategory] || '総合');
      const cacheData = localStorage.getItem('cache_newsData');
      const cacheTimestamp = localStorage.getItem('cache_newsTimestamp');
      const now = new Date().getTime();
      const CACHE_LIMIT = 60 * 60 * 1000; 

      if (cacheData && cacheTimestamp && now - parseInt(cacheTimestamp) < CACHE_LIMIT) {
        setNewsArticles(JSON.parse(cacheData));
      } else {
        fetch(`/api/news?category=${savedCategory}`)
          .then((res) => res.json())
          .then((data) => {
            if (data && data.articles && data.articles.length > 0) {
              const articles = data.articles.map((article: any) => ({
                title: article.title,
                url: article.url
              }));
              setNewsArticles(articles);
              localStorage.setItem('cache_newsData', JSON.stringify(articles));
              localStorage.setItem('cache_newsTimestamp', now.toString());
            } else {
              setNewsArticles([{ title: 'ニュースが見つかりませんでした', url: '#' }]);
            }
          })
          .catch(() => {
            if (cacheData) setNewsArticles(JSON.parse(cacheData));
          });
      }

      // --- 💡 GitHub設定のチェック & 実際のデータフェッチ ---
      const savedRepo = localStorage.getItem('setting_githubRepo'); // デフォルト値の `|| '...'` を削除しました

      // 未設定（空っぽ）の場合の処理
      if (!savedRepo) {
        console.log("GitHubリポジトリが設定されていません。");
        setCurrentRepoName("未設定");
        setProjectActivities([{ name: 'リポジトリが設定されていません', action: '設定画面から登録してください', time: '--', status: 'offline' }]);
      } 
      // 設定されているが、形式が「ユーザー名/リポジトリ名」として正しいかチェック
      else if (savedRepo.includes('/') && savedRepo.split('/')[0] && savedRepo.split('/')[1]) {
        const repoTitle = savedRepo.split('/')[1];
        setCurrentRepoName(repoTitle); // カードのタイトルにはリポジトリ名だけを表示

        // 実際にGitHubからコミット履歴を取得する
        fetch(`https://api.github.com/repos/${savedRepo}/commits`)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            return res.json();
          })
          .then((commits) => {
            if (commits && Array.isArray(commits) && commits.length > 0) {
              const formattedActivities = commits.slice(0, 5).map((item: any) => {
                const authorName = item.author?.login || item.commit?.author?.name || 'Unknown';
                const commitDate = item.commit?.author?.date || new Date().toISOString();
                
                return {
                  name: authorName, 
                  action: 'コードをコミット', 
                  time: formatLastActivity(commitDate), 
                  status: 'online'
                };
              });
              setProjectActivities(formattedActivities);
            } else {
              setProjectActivities([{ name: 'コミット履歴なし', action: '', time: '--', status: 'offline' }]);
            }
          })
          .catch((err) => {
            console.error('GitHubデータの取得に失敗:', err);
            setProjectActivities([{ name: '読み込み失敗', action: 'API制限またはリポジトリが見つかりません', time: '--', status: 'offline' }]);
          });
      } 
      // スラッシュが入っていないなど、入力が不完全な場合
      else {
        setCurrentRepoName("設定不完全");
        setProjectActivities([{ name: '設定不完全', action: '「ユーザー名/リポジトリ名」の形で正しく入力してください', time: '--', status: 'offline' }]);
      }
    }, 0); // 0秒ディレイで画面描画の直後に実行

  }, []);
  const handleCheckboxChange = (taskKey: 'healthCheck' | 'jobHunting', checked: boolean) => {
    setTasks((prev) => ({ ...prev, [taskKey]: checked }));
    localStorage.setItem(`task_${taskKey}`, JSON.stringify(checked));
  };

  // 💡 クライアント側のマウントが完了するまでは真っ白なコンテナを返す（Next.jsのハイドレーションエラー対策）
  if (!isMounted) {
    return <div className={styles.container} style={{ background: '#3b3a4e' }}></div>; 
  }

  return (
    <div className={styles.container}>
      {/* 歯車ヘッダー */}
      <div className={styles.header}>
        <Link href="/settings" className={styles.iconBtn}>⚙️</Link>
      </div>

      {/* モックアップ用の2カラム全体グリッド */}
      <div className={styles.mainGrid}>
        
        {/* ⬅️ 左カラム（AI、天気、GitHub） */}
        <div className={styles.leftColumn}>
          
          {/* AIチャットカード「Noir」 */}
          <Link href="/chat" className={styles.aiChatFullCard}>
            <div className={styles.chatLinkContentRow}>
              <span className={styles.chatTextLarge}>Noir</span>
            </div>
          </Link>

          {/* 天気予報 */}
          <div className={`${styles.card} ${styles.weatherCard}`}>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
              <div>
                <p className={styles.cardTitle}>天気予報 ({currentRegionName})</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '1.75rem' }}>{weather.emoji}</span>
                  <p className={styles.weatherInfo}>{weather.text}</p>
                </div>
                <p className={styles.weatherDetail} style={{ fontSize: '1rem', fontWeight: 'bold', margin: '2px 0 6px 0' }}>{weather.temp}</p>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '4px', paddingBottom: '4px' }}>
                <p className={styles.weatherDetail}>💧 降水確率: {weather.pop}</p>
                <p className={styles.weatherDetail}>🌀 風速: {weather.windSpeed}</p>
              </div>

              {weather.tomorrow.text && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '6px', marginTop: '2px' }}>
                  <p className={styles.weatherDetail} style={{ opacity: 0.6, fontSize: '0.65rem', marginBottom: '2px' }}>明日の予報</p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>{weather.tomorrow.emoji}</span>
                      <span>{weather.tomorrow.text}</span>
                    </span>
                    <span>{weather.tomorrow.temp} (💧{weather.tomorrow.pop})</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* GitHubプロジェクトアクティビティ */}
          <div className={styles.githubFullCard}>
            <p className={styles.githubTitle}>GitHub ({currentRepoName})</p>
            <p className={styles.githubSub}>last activity</p>
            <p className={styles.githubSub}>Member</p>
            <div className={styles.memberList}>
              {projectActivities.map((activity, index) => (
                <div key={index} className={styles.memberItem}>
                  <div className={styles.memberMain}>
                    <span className={`${styles.statusDot} ${styles[activity.status]}`}></span>
                    <span>{activity.name}</span>
                    {activity.action && <span style={{ fontSize: '0.75rem', fontWeight: 'normal', opacity: 0.8 }}>({activity.action})</span>}
                  </div>
                  <span className={styles.lastActivity}>Last activity: {activity.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ➡️ 右カラム（Quick link、スケジュールエリア、ニュース） */}
        <div className={styles.rightColumn}>
          
          {/* Quick link */}
          <div className={styles.quickLinkCard}>
            <span className={styles.quickLinkTitle}>クイックリンク</span>
            <div className={styles.quickLinkItems}>
              <a href="https://www.notion.so" target="_blank" rel="noopener noreferrer" className={styles.quickLinkItem}>
                <img src="https://cdn.simpleicons.org/notion/ffffff" alt="Notion" className={styles.linkIcon} />
                <span>Notion</span>
              </a>
              <a href="https://calendar.notion.so" target="_blank" rel="noopener noreferrer" className={styles.quickLinkItem}>
                <img src="https://cdn.simpleicons.org/notion/e16259" alt="Notion Calendar" className={styles.linkIcon} />
                <span>Notionカレンダー</span>
              </a>
              <a href="https://github.com" target="_blank" rel="noopener noreferrer" className={styles.quickLinkItem}>
                <img src="https://cdn.simpleicons.org/github/ffffff" alt="GitHub" className={styles.linkIcon} />
                <span>GitHub</span>
              </a>
            </div>
          </div>

          {/* スケジュールとToDoを横に並べる中間グリッド */}
          <div className={styles.scheduleTodoGrid}>
            
            {/* スケジュール（タイムライン） */}
            <div className={styles.scheduleCard}>
              <p className={styles.scheduleTitle}>Schedule</p>
              <p className={styles.scheduleDate}>6月25日（水）</p>
              
              {/* タイムラインのモック用の時間軸表示線 */}
              <div className={styles.timelineContainer}>
                <div className={styles.timelineHeader}>
                  <span>8:00</span>
                  <span>10:00</span>
                  <span>12:00</span>
                  <span>14:00</span>
                </div>
                <div className={styles.timelineBarWrapper}>
                  <div className={styles.timelineBar}>9:30 - 学校</div>
                </div>
              </div>
            </div>

            {/* ToDo */}
            <div className={styles.todoCard}>
              <p className={styles.todoTitle}>ToDo</p>
              <div className={styles.todoList}>
                <label className={styles.todoLabel}>
                  <input 
                    type="checkbox" 
                    checked={tasks.healthCheck} 
                    onChange={(e) => handleCheckboxChange('healthCheck', e.target.checked)}
                  />
                  <span className={!tasks.healthCheck ? styles.completed : ''}>健康診断</span>
                </label>

                <label className={styles.todoLabel}>
                  <input 
                    type="checkbox" 
                    checked={tasks.jobHunting} 
                    onChange={(e) => handleCheckboxChange('jobHunting', e.target.checked)}
                  />
                  <span className={!tasks.jobHunting ? styles.completed : ''}>就職活動</span>
                </label>
              </div>
            </div>
          </div>

          {/* ニュース */}
          <div className={styles.newsCard}>
            <p className={styles.cardTitle} style={{ fontSize: '1rem', opacity: 1 }}>News</p>
            <ul className={styles.newsList}>
              {newsArticles.map((article, index) => (
                <li key={index} className={styles.newsItem}>
                  {article.url && article.url !== '#' ? (
                    <a 
                      href={article.url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className={styles.newsLink}
                    >
                      • {article.title}
                    </a>
                  ) : (
                    <span>{article.title}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
}