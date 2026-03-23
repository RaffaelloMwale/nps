SET search_path TO nps, public;

INSERT INTO nps.system_settings (setting_key, setting_value, description)
VALUES ('security.default_user_password', 'Temp@12345',
        'Default password assigned to new users. Users must change on first login.')
ON CONFLICT (setting_key) DO NOTHING;

SELECT setting_key, setting_value FROM nps.system_settings WHERE setting_key LIKE 'security.%';
