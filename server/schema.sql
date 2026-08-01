create table if not exists companies (
  corp_code text primary key,
  stock_code text not null unique,
  corp_name text not null,
  market text not null check (market in ('KOSPI', 'KOSDAQ')),
  updated_at timestamptz not null default now()
);

create table if not exists major_holding_reports (
  rcept_no text primary key,
  rcept_date date not null,
  corp_code text not null references companies(corp_code),
  stock_code text not null,
  report_type text not null check (report_type in ('일반', '약식')),
  reporter text not null,
  previous_rate numeric(8, 4),
  current_rate numeric(8, 4),
  delta_rate numeric(8, 4),
  shares text,
  share_delta text,
  reason text,
  dart_url text not null,
  raw_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_major_holding_reports_date
  on major_holding_reports(rcept_date desc);

create index if not exists idx_major_holding_reports_stock_date
  on major_holding_reports(stock_code, rcept_date desc);

create index if not exists idx_major_holding_reports_delta
  on major_holding_reports(delta_rate desc);

create table if not exists stock_issue_analysis (
  id bigserial primary key,
  stock_code text not null,
  period_start date not null,
  period_end date not null,
  score numeric(10, 4) not null,
  title text not null,
  summary text not null,
  supply_commentary text not null,
  risk_commentary text not null,
  generated_at timestamptz not null default now(),
  unique(stock_code, period_start, period_end)
);
