const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경변수가 없습니다.`);
  return value;
};

export function supabaseHeaders() {
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
}

export function supabaseRestUrl(path) {
  return `${required("SUPABASE_URL").replace(/\/$/, "")}/rest/v1/${path}`;
}

export async function supabaseGet(path) {
  const response = await fetch(supabaseRestUrl(path), {
    headers: supabaseHeaders(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase 조회 실패 ${response.status}: ${text}`);
  }
  return response.json();
}
