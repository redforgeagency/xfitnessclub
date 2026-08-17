-- ==========================================================================
-- X-FITNESS CLUB - SUPABASE DATABASE SCHEMA
-- Execute this script in: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ==========================================================================

-- 1. LEADS TABLE (Form submissions from website)
CREATE TABLE IF NOT EXISTS public.leads (
    id TEXT PRIMARY KEY DEFAULT ('LEAD-' || substr(md5(random()::text), 1, 8)),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    date TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    plan TEXT NOT NULL,
    details TEXT DEFAULT 'Fără mesaj specific',
    status TEXT DEFAULT 'Nou',
    source TEXT DEFAULT 'Website'
);

-- 2. CLIENTS & MEMBERSHIPS TABLE
CREATE TABLE IF NOT EXISTS public.clients (
    id TEXT PRIMARY KEY DEFAULT ('CL-' || substr(md5(random()::text), 1, 8)),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    plan TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    price NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Activ',
    visits_left INTEGER DEFAULT NULL,
    total_visits_allowed INTEGER DEFAULT NULL,
    is_in_gym BOOLEAN DEFAULT FALSE,
    last_checkin TIMESTAMPTZ DEFAULT NULL,
    notes TEXT DEFAULT ''
);

-- 2.1. CLIENT VISITS & ATTENDANCE LOG TABLE
CREATE TABLE IF NOT EXISTS public.visits (
    id TEXT PRIMARY KEY DEFAULT ('VIS-' || substr(md5(random()::text), 1, 8)),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    client_id TEXT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    visit_date TEXT NOT NULL,
    visit_time TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    plan TEXT NOT NULL,
    notes TEXT DEFAULT ''
);

-- 3. EXPENSES TABLE (Club budget tracking)
CREATE TABLE IF NOT EXISTS public.expenses (
    id TEXT PRIMARY KEY DEFAULT ('EXP-' || substr(md5(random()::text), 1, 8)),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    title TEXT NOT NULL,
    amount NUMERIC NOT NULL DEFAULT 0,
    category TEXT NOT NULL,
    date TEXT NOT NULL,
    notes TEXT DEFAULT ''
);

-- 4. CUSTOM EXPENSE CATEGORIES
CREATE TABLE IF NOT EXISTS public.custom_categories (
    id TEXT PRIMARY KEY DEFAULT ('CAT-' || substr(md5(random()::text), 1, 8)),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    name TEXT NOT NULL UNIQUE
);

-- 5. PRICING CONFIGURATION
CREATE TABLE IF NOT EXISTS public.pricing_config (
    key TEXT PRIMARY KEY,
    price NUMERIC NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert Default Pricing
INSERT INTO public.pricing_config (key, price) VALUES
    ('visit1', 100),
    ('visit8', 400),
    ('visit12', 500),
    ('unlimited1', 600),
    ('unlimited3', 1450),
    ('unlimited6', 2500),
    ('unlimited12', 4800),
    ('pt1', 200),
    ('pt2', 150)
ON CONFLICT (key) DO NOTHING;

-- Insert Default Categories
INSERT INTO public.custom_categories (name) VALUES
    ('Salarii Personal'),
    ('Arendă Spațiu'),
    ('Energie Electrică & Încălzire'),
    ('Apă & Canalizare'),
    ('Mentenanță & Piese X-Line'),
    ('Consumabile & Igienă Vestiare'),
    ('Marketing & Social Media'),
    ('Echipamente & Accesorii Noi'),
    ('Servicii Juridice & Contabilitate'),
    ('Comisioane Bancare / POS')
ON CONFLICT (name) DO NOTHING;

-- ==========================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================================================

-- Enable RLS on all tables
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY;

-- Leads Policies (Website can insert, CRM can manage all)
DROP POLICY IF EXISTS "Public can insert leads" ON public.leads;
CREATE POLICY "Public can insert leads" ON public.leads FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anon full access to leads" ON public.leads;
CREATE POLICY "Anon full access to leads" ON public.leads FOR ALL USING (true) WITH CHECK (true);

-- Clients & Visits Policies
DROP POLICY IF EXISTS "Anon full access to clients" ON public.clients;
CREATE POLICY "Anon full access to clients" ON public.clients FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon full access to visits" ON public.visits;
CREATE POLICY "Anon full access to visits" ON public.visits FOR ALL USING (true) WITH CHECK (true);

-- Expenses Policies
DROP POLICY IF EXISTS "Anon full access to expenses" ON public.expenses;
CREATE POLICY "Anon full access to expenses" ON public.expenses FOR ALL USING (true) WITH CHECK (true);

-- Categories Policies
DROP POLICY IF EXISTS "Anon full access to categories" ON public.custom_categories;
CREATE POLICY "Anon full access to categories" ON public.custom_categories FOR ALL USING (true) WITH CHECK (true);

-- Pricing Policies
DROP POLICY IF EXISTS "Public can read pricing" ON public.pricing_config;
CREATE POLICY "Public can read pricing" ON public.pricing_config FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anon can update pricing" ON public.pricing_config;
CREATE POLICY "Anon can update pricing" ON public.pricing_config FOR ALL USING (true) WITH CHECK (true);

-- Enable Realtime (optional, for live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads, public.clients, public.visits, public.expenses, public.pricing_config;
