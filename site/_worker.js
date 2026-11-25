export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (/^\/disclosurepedia(?:\/|$)/.test(pathname) || pathname === '/sitemap-disclosurepedia.xml') {
      return new Response(request.method === 'HEAD' ? null : '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, follow"><title>종료된 페이지 | 리앤노트</title></head><body><main><h1>이 페이지는 운영을 종료했습니다.</h1><p>최신 공시와 해설은 아래 메뉴에서 확인할 수 있습니다.</p><nav><a href="/5percent">공시 검색</a> · <a href="/blog/">인사이트</a></nav></main></body></html>', {
        status: 410,
        headers: {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, follow'},
      });
    }
    return env.ASSETS.fetch(request);
  },
};
