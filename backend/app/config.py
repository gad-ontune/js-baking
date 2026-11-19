from functools import lru_cache

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    app_name: str = 'JS Baking House API'
    api_prefix: str = '/api/v1'
    environment: str = 'development'

    database_url: str = 'sqlite:///./jsbh_dev.db'
    # Deployment databases use three roles: a bootstrap superuser (provisioning
    # only), a schema owner used by Alembic, and a restricted runtime account
    # used by the API. All three default to database_url for local development.
    bootstrap_database_url: str = ''
    migration_database_url: str = ''
    # Set to false in deployments where Alembic owns the schema.
    auto_create_schema: bool = True
    cors_origins: str = (
        'http://localhost:5173,http://127.0.0.1:5173,'
        'http://localhost:4173,http://127.0.0.1:4173'
    )

    cookie_secure: bool = False
    cookie_samesite: str = 'lax'
    # When set, login/recovery limits are shared across all API workers.
    redis_url: str = ''
    session_cookie_name: str = 'jsbh_session'
    csrf_cookie_name: str = 'jsbh_csrf'

    session_absolute_hours: int = 12
    session_idle_minutes: int = 30

    argon2_time_cost: int = 2
    argon2_memory_cost_kib: int = 19456
    argon2_parallelism: int = 1

    login_attempt_limit: int = 5
    login_attempt_window_minutes: int = 15
    ip_request_limit: int = 120
    ip_request_window_minutes: int = 15

    # Email delivery. SMTP is required in production for recovery flows; when
    # it is not configured, verification tokens are shown once in development.
    smtp_host: str = ''
    smtp_port: int = 587
    smtp_username: str = ''
    smtp_password: str = ''
    smtp_from: str = ''
    smtp_use_tls: bool = True
    smtp_timeout_seconds: int = 10
    frontend_url: str = 'http://localhost:5173'
    reset_token_minutes: int = 30
    email_verification_token_minutes: int = 60
    mfa_challenge_minutes: int = 5
    # Base64-urlsafe 32-byte Fernet key. Required in production to encrypt
    # authenticator secrets at rest. Development derives a throwaway key.
    mfa_encryption_key: str = ''

    # Security alerting. At least one destination must be configured to enable
    # alerts. Webhooks must use HTTPS in production so alert contents are not
    # sent in clear text.
    alert_email_to: str = ''
    alert_webhook_url: str = ''
    alert_failed_login_threshold: int = 5
    alert_window_minutes: int = 15
    alert_cooldown_minutes: int = 30
    audit_check_interval_minutes: int = 360

    seed_owner_username: str = ''
    seed_owner_password: str = ''
    seed_owner_email: str = ''

    @field_validator('cookie_samesite')
    @classmethod
    def validate_samesite(cls, value: str) -> str:
        normalized = value.lower()
        if normalized not in {'lax', 'strict', 'none'}:
            raise ValueError('COOKIE_SAMESITE must be lax, strict or none')
        return normalized

    @model_validator(mode='after')
    def validate_production_alert_transport(self):
        if self.is_production and self.alert_webhook_url and not self.alert_webhook_url.startswith('https://'):
            raise ValueError('ALERT_WEBHOOK_URL must use https in production')
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(',') if origin.strip()]

    @property
    def bootstrap_url(self) -> str:
        return self.bootstrap_database_url or self.database_url

    @property
    def migration_url(self) -> str:
        return self.migration_database_url or self.database_url

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == 'production'

    @property
    def session_absolute_seconds(self) -> int:
        return self.session_absolute_hours * 3600

    @property
    def session_idle_seconds(self) -> int:
        return self.session_idle_minutes * 60


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
