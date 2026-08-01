create table if not exists site_cache (
  key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists price_candles (
  stock_code text primary key,
  payload jsonb not null,
  start_date date,
  end_date date,
  updated_at timestamptz not null default now()
);

create index if not exists idx_price_candles_updated_at
  on price_candles(updated_at desc);

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_site_cache_updated_at on site_cache;
create trigger trg_site_cache_updated_at
before update on site_cache
for each row execute function touch_updated_at();

drop trigger if exists trg_price_candles_updated_at on price_candles;
create trigger trg_price_candles_updated_at
before update on price_candles
for each row execute function touch_updated_at();
