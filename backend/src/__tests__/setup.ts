// Set required env vars before any module is loaded
process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-at-least-32-characters-long";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";
process.env.AMANA_ESCROW_CONTRACT_ID = process.env.AMANA_ESCROW_CONTRACT_ID || "CC4425PGNYVW6XNUM4SDI4YK2PGOE7Z72X5YKWDLM6HVLY4XMUD3TDVN";
process.env.USDC_CONTRACT_ID = process.env.USDC_CONTRACT_ID || "CBSNUY3FGAJ5ANHQSKVJ5NV4MOIJGP3SE5MM7SJZ6CFOXRASXPWMJMZB";
process.env.ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || "test-admin-secret-key-value";
process.env.ADMIN_ROUTES_ENABLED = process.env.ADMIN_ROUTES_ENABLED || "true";
