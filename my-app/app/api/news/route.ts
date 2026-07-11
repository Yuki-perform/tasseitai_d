import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || "general";

  try {
    // 💡 fetchの第2引数に { next: { revalidate: 3600 } } を指定してサーバー側で1時間キャッシュ
    const res = await fetch(
      `https://gnews.io/api/v4/top-headlines?category=${category}&lang=ja&country=jp&max=5&apikey=${process.env.NEWS_API_KEY}`,
      { next: { revalidate: 3600 } }
    );

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch news from GNews" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error("News API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}