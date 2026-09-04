-- Development-only seed. Never use production credentials from source control.
INSERT INTO schools (name, code) VALUES ('LSK Academy Demo', 'LSK-DEMO') ON CONFLICT (code) DO NOTHING;

-- Create the first admin by generating a password hash locally using /api/auth/hash-password.
-- Then insert the resulting hash manually or through a future provisioning command.
-- No real password is stored in this repository.
