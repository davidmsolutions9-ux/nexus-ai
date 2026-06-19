-- ─── Seed: Plans ──────────────────────────────────────────────────────────────
INSERT INTO "plans" ("id", "name", "priceEurCents", "acusPerDay", "creditsPerDay", "multiAgentAllowed", "multiAgentDailyLimit", "avatarLevel")
VALUES
  (gen_random_uuid(), 'LITE',       900,   75,   100,  false, 0,   0),
  (gen_random_uuid(), 'PLUS',      2900,  300,   400,  false, 0,   1),
  (gen_random_uuid(), 'PRO',       7900,  900,  1200,  true,  5,   2),
  (gen_random_uuid(), 'MAX',      14900, 1875,  2500,  true,  20,  3),
  (gen_random_uuid(), 'ENTERPRISE',21900, 3750, 5000,  true,  100, 3)
ON CONFLICT ("name") DO NOTHING;

-- ─── Seed: Provider Pricing ───────────────────────────────────────────────────
INSERT INTO "provider_pricing" ("id", "provider", "model", "acuPer1kTokens", "qualityIndex", "latencyP95Ms", "loadMultiplier", "errorRate5Min", "priceSignal", "status", "updatedAt")
VALUES
  (gen_random_uuid(), 'anthropic', 'claude-sonnet-4-6',           1.200000, 0.9200, 800,  1.0, 0.0, 'NORMAL', 'ACTIVE', NOW()),
  (gen_random_uuid(), 'anthropic', 'claude-haiku-4-5-20251001',   0.300000, 0.7800, 400,  1.0, 0.0, 'NORMAL', 'ACTIVE', NOW()),
  (gen_random_uuid(), 'openai',    'gpt-4o',                      1.400000, 0.9100, 900,  1.0, 0.0, 'NORMAL', 'ACTIVE', NOW()),
  (gen_random_uuid(), 'openai',    'gpt-4o-mini',                 0.250000, 0.7600, 350,  1.0, 0.0, 'NORMAL', 'ACTIVE', NOW()),
  (gen_random_uuid(), 'google',    'gemini-2.0-flash',            0.200000, 0.8200, 450,  1.0, 0.0, 'NORMAL', 'ACTIVE', NOW()),
  (gen_random_uuid(), 'google',    'gemini-2.5-pro',              1.600000, 0.9300, 1100, 1.0, 0.0, 'NORMAL', 'ACTIVE', NOW()),
  (gen_random_uuid(), 'mistral',   'mistral-large-latest',        0.900000, 0.8500, 700,  1.0, 0.0, 'NORMAL', 'ACTIVE', NOW()),
  (gen_random_uuid(), 'groq',      'llama-3.3-70b-versatile',     0.150000, 0.7400, 200,  1.0, 0.0, 'NORMAL', 'ACTIVE', NOW())
ON CONFLICT ("provider", "model") DO NOTHING;
