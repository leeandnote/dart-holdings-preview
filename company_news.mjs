const escape = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const plain = (value) => String(value || "").replace(/<[^>]*>/g, "").replaceAll("&quot;", '"').replaceAll("&amp;", "&");
export function newsLinks(name) {
  return { naver: `https://search.naver.com/search.naver?where=news&sort=1&query=${encodeURIComponent(name)}`, google: `https://news.google.com/search?q=${encodeURIComponent(name)}&hl=ko&gl=KR&ceid=KR%3Ako` };
}
export async function loadCompanyNews(name, { env = process.env, request = fetch } = {}) {
  if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) return { status: "unconfigured", items: [] };
  try {
    const response = await request(`https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent('"' + name + '"')}&display=20&sort=date`, {
      headers: { "X-Naver-Client-Id": env.NAVER_CLIENT_ID, "X-Naver-Client-Secret": env.NAVER_CLIENT_SECRET }, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { status: "unavailable", items: [] };
    const data = await response.json();
    const seen = new Set();
    const items = (data.items || []).flatMap((item) => {
      const title = plain(item.title);
      const url = item.originallink || item.link;
      const time = Date.parse(item.pubDate);
      if (!title.includes(name) || !/^https?:\/\//i.test(url || "") || !Number.isFinite(time) || seen.has(url)) return [];
      seen.add(url);
      return [{ title, url, date: new Date(time).toISOString(), publisher: new URL(url).hostname }];
    }).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    return { status: "ready", items, fetchedAt: new Date().toISOString() };
  } catch { return { status: "unavailable", items: [] }; }
}
export function newsSection(name, news) {
  const links = newsLinks(name);
  const message = news.status === "unconfigured" ? "뉴스 목록 연결 준비 중입니다. 아래에서 최신 뉴스를 확인할 수 있습니다." : news.status === "unavailable" ? "뉴스를 불러오지 못했습니다. 아래 뉴스 검색을 이용해 주세요." : "회사명이 제목에 포함된 검색 결과가 없습니다.";
  const date = (iso) => new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(iso));
  return `<section class="pediaPanel" id="company-news"><h2>${escape(name)} 관련 뉴스</h2><div class="companyNews">${news.items.length ? `<ul>${news.items.map((item) => `<li><a href="${escape(item.url)}" target="_blank" rel="noopener noreferrer">${escape(item.title)}</a><small>${escape(item.publisher)} · ${date(item.date)} KST</small></li>`).join("")}</ul>` : `<p role="status">${message}</p>`}${news.fetchedAt ? `<p>뉴스 확인: ${date(news.fetchedAt)} KST · 네이버 뉴스 검색 · 회사명 제목 일치 기준</p>` : ""}<p>관련 뉴스는 공시와 별개이며 주가 변동의 원인을 의미하지 않습니다.</p></div><div class="pediaLinks"><a href="${escape(links.naver)}" target="_blank" rel="noopener noreferrer">네이버 뉴스 최신순</a><a href="${escape(links.google)}" target="_blank" rel="noopener noreferrer">구글 뉴스 더 보기</a></div></section>`;
}
