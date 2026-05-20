import os
from pathlib import Path

from langchain_google_genai import ChatGoogleGenerativeAI

_DEFAULT_MODEL = os.environ.get("LLM_MODEL_PRO", "gemini-3.1-pro-preview")


def _load_vertex_credentials():
    from google.oauth2 import service_account

    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not creds_path:
        return None
    path = Path(creds_path)
    if not path.is_file():
        return None
    return service_account.Credentials.from_service_account_file(
        str(path),
        scopes=["https://www.googleapis.com/auth/cloud-platform"],
    )


def create_model(name: str | None = None):
    model_name = name or os.environ.get("LLM_MODEL", _DEFAULT_MODEL)
    api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    common = {"timeout": 600, "max_retries": 2}
    if api_key:
        return ChatGoogleGenerativeAI(model=model_name, api_key=api_key, **common)
    credentials = _load_vertex_credentials()
    return ChatGoogleGenerativeAI(
        model=model_name,
        credentials=credentials,
        project=os.environ.get("GOOGLE_CLOUD_PROJECT", "vertexlda"),
        location=os.environ.get("GOOGLE_CLOUD_LOCATION", "global"),
        **common,
    )
