-- Create customers table
create table if not exists public.customers (
  id text primary key,
  name text not null,
  contact text,
  phone text,
  zone text,
  address text,
  "mapUrl" text,
  note text,
  "updatedAt" timestamp default now()
);

-- If the table already exists (older schema), add missing columns safely
alter table public.customers add column if not exists "mapUrl" text;
alter table public.customers add column if not exists note text;
alter table public.customers add column if not exists "updatedAt" timestamp default now();

-- Create orders table
create table if not exists public.orders (
  id text primary key,
  "customerId" text,
  "customerName" text,
  "customerPhone" text,
  zone text,
  address text,
  "mapUrl" text,
  "window" text,
  boxes integer,
  cod integer,
  "driverId" text,
  "driverName" text,
  "salesName" text,
  "salesPhone" text,
  status text,
  photo text,
  "checkInAt" text,
  "deliveredAt" text,
  complaint text,
  "salesNote" text,
  "createdAt" timestamp default now(),
  "updatedAt" timestamp default now()
);

-- If the table already exists (older schema), add missing columns safely
alter table public.orders add column if not exists "customerPhone" text;
alter table public.orders add column if not exists "window" text;
alter table public.orders add column if not exists boxes integer;
alter table public.orders add column if not exists cod integer;
alter table public.orders add column if not exists "driverName" text;
alter table public.orders add column if not exists "salesName" text;
alter table public.orders add column if not exists "salesPhone" text;
alter table public.orders add column if not exists photo text;
alter table public.orders add column if not exists "checkInAt" text;
alter table public.orders add column if not exists "deliveredAt" text;
alter table public.orders add column if not exists complaint text;
alter table public.orders add column if not exists "salesNote" text;
alter table public.orders add column if not exists "createdAt" timestamp default now();
alter table public.orders add column if not exists "updatedAt" timestamp default now();

-- Create drivers table
create table if not exists public.drivers (
  id text primary key,
  "firstName" text,
  "lastName" text,
  name text,
  phone text,
  vehicle text,
  plate text,
  zone text,
  lat float,
  lng float,
  "createdAt" timestamp default now(),
  "updatedAt" timestamp default now()
);

-- If the table already exists (older schema), add missing columns safely
alter table public.drivers add column if not exists "firstName" text;
alter table public.drivers add column if not exists "lastName" text;
alter table public.drivers add column if not exists vehicle text;
alter table public.drivers add column if not exists plate text;
alter table public.drivers add column if not exists zone text;
alter table public.drivers add column if not exists lat float;
alter table public.drivers add column if not exists lng float;
alter table public.drivers add column if not exists "createdAt" timestamp default now();
alter table public.drivers add column if not exists "updatedAt" timestamp default now();

-- Optional: driver live locations for mini-map (1 row per driver)
create table if not exists public.driver_locations (
  driver_id text primary key,
  driver_name text,
  plate text,
  zone text,
  lat float,
  lng float,
  timestamp bigint
);

-- Optional: shared chat for sales/dispatch/driver
create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  "createdAt" timestamp default now(),
  sender_role text,
  sender_name text,
  sender_phone text,
  message text not null
);

-- Enable RLS
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.drivers enable row level security;
alter table public.driver_locations enable row level security;
alter table public.chat_messages enable row level security;

-- Create policies (allow all for now - adjust for production)
drop policy if exists "Allow public access to customers" on public.customers;
drop policy if exists "Allow public access to orders" on public.orders;
drop policy if exists "Allow public access to drivers" on public.drivers;
drop policy if exists "Allow public access to driver_locations" on public.driver_locations;
drop policy if exists "Allow public access to chat_messages" on public.chat_messages;

create policy "Allow public access to customers" on public.customers for all using (true) with check (true);
create policy "Allow public access to orders" on public.orders for all using (true) with check (true);
create policy "Allow public access to drivers" on public.drivers for all using (true) with check (true);
create policy "Allow public access to driver_locations" on public.driver_locations for all using (true) with check (true);
create policy "Allow public access to chat_messages" on public.chat_messages for all using (true) with check (true);
