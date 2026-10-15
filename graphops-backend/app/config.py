from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    # App
    app_name: str = 'GraphOps Brain API'
    app_version: str = '0.1.0'
    env: str = 'development'
    host: str = '0.0.0.0'
    port: int = 8000
    cors_origins: str = 'http://localhost:5173'
    jwt_secret: str = 'change-me'

    # FalkorDB
    falkordb_host: str = 'localhost'
    falkordb_port: int = 6379
    falkordb_username: str = ''
    falkordb_password: str = ''
    control_graph: str = 'control'
    default_workspace_id: str = 'acme'
    enable_vector_index: bool = False
    embedding_dim: int = 768

    # Redis
    redis_url: str = 'redis://localhost:6380/0'

    # LLM (xAI Grok, OpenAI-compatible)
    xai_api_key: str = ''
    llm_base_url: str = 'https://api.x.ai/v1'
    llm_model_reasoning: str = 'grok-4.7'
    llm_model_fast: str = 'grok-build-0.1'
    llm_timeout_seconds: float = 60
    llm_max_output_tokens: int = 2000
    demo_cache: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(',') if o.strip()]

    @property
    def llm_configured(self) -> bool:
        return bool(self.xai_api_key.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
