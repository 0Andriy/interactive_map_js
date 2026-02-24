-- Файл: profile_service_schema.sql

CREATE TABLE USER_PROFILES (
    user_id            RAW(16) NOT NULL, -- Отримано від Auth Service
    email              VARCHAR2(100),
    first_name         VARCHAR2(100),
    last_name          VARCHAR2(100),
    phone              VARCHAR2(20),
    avatar_url         VARCHAR2(500),
    bio                VARCHAR2(1000),
    updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by         RAW(16),
    deleted_at         TIMESTAMP, -- Синхронізується через події/Message Broker
    deleted_by         RAW(16),
    CONSTRAINT PK_USER_PROFILES PRIMARY KEY (user_id),
    CONSTRAINT UK_PROFILES_EMAIL UNIQUE (email)
);

COMMENT ON COLUMN USER_PROFILES.user_id IS 'FK на USERS.id (з Auth Service)';
COMMENT ON COLUMN USER_PROFILES.email IS 'Контактна пошта користувача';
COMMENT ON COLUMN USER_PROFILES.first_name IS 'Ім’я';
COMMENT ON COLUMN USER_PROFILES.last_name IS 'Прізвище';
COMMENT ON COLUMN USER_PROFILES.phone IS 'Номер телефону';

-- Індекси Profile Service
CREATE INDEX IDX_PROF_EMAIL_ACT ON USER_PROFILES(email, deleted_at);
CREATE INDEX IDX_PROF_NAME ON USER_PROFILES(last_name, first_name);








-- Варіант 1
CREATE TABLE user_settings (
    user_id     RAW(16) PRIMARY KEY,
    -- BLOB або VARCHAR2(4000) з CHECK-констрейнтом на JSON
    settings_data JSON NOT NULL,
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Варіант 2: Таблиця EAV (Entity-Attribute-Value)
CREATE TABLE user_preferences (
    user_id    RAW(16),
    pref_key   VARCHAR2(50), -- наприклад 'THEME'
    pref_value VARCHAR2(255), -- наприклад 'DARK'
    PRIMARY KEY (user_id, pref_key)
);

