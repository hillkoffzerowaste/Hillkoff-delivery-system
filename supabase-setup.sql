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

-- Create orders table
create table if not exists public.orders (
  id text primary key,
  "customerId" text,
  "customerName" text,
  zone text,
  address text,
  "mapUrl" text,
  "window" text,
  boxes integer,
  cod integer,
  "driverId" text,
  status text,
  photo text,
  "checkInAt" text,
  "deliveredAt" text,
  complaint text,
  "salesNote" text,
  "createdAt" timestamp default now(),
  "updatedAt" timestamp default now()
);

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

-- Enable RLS
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.drivers enable row level security;

-- Create policies (allow all for now - adjust for production)
create policy "Allow public access to customers" on public.customers
  for all using (true);
  
create policy "Allow public access to orders" on public.orders
  for all using (true);
  
create policy "Allow public access to drivers" on public.drivers
  for all using (true);
