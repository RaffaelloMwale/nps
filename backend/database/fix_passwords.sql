-- ============================================================
-- FIX: Update all user password hashes with correct bcrypt values
-- Run this in psql:
--   psql -U postgres -d nps_db -f fix_passwords.sql
-- ============================================================

SET search_path TO nps, public;

-- admin password: Admin@123456
UPDATE nps.system_users
SET password_hash = '$2b$12$TxDymY2I3tMWe1O3dP1uF.IaRoEaWEHx1xhtEN6gJgVmNQy3rk4CO',
    must_change_pwd = false
WHERE username = 'admin';

-- creator1 password: Temp@12345
UPDATE nps.system_users
SET password_hash = '$2b$12$cY/zi9QAT4yNGVsjnbLv0e2rdMMEH.JIgxtU2FK.Qf9b3P/Cfyx.6',
    must_change_pwd = true
WHERE username = 'creator1';

-- approver1a password: Temp@12345
UPDATE nps.system_users
SET password_hash = '$2b$12$cY/zi9QAT4yNGVsjnbLv0e2rdMMEH.JIgxtU2FK.Qf9b3P/Cfyx.6',
    must_change_pwd = true
WHERE username = 'approver1a';

-- approver2a password: Temp@12345
UPDATE nps.system_users
SET password_hash = '$2b$12$cY/zi9QAT4yNGVsjnbLv0e2rdMMEH.JIgxtU2FK.Qf9b3P/Cfyx.6',
    must_change_pwd = true
WHERE username = 'approver2a';

-- Confirm
SELECT username, role, must_change_pwd,
       left(password_hash, 20) || '...' AS hash_preview
FROM nps.system_users
ORDER BY role;
