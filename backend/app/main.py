from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import init_db
from app.routers.algorithms import router as algorithms_router
from app.routers.desktop_pet import router as desktop_pet_router
from app.routers.diaries import router as diaries_router
from app.routers.interviews import router as interviews_router
from app.routers.reminders import router as reminders_router
from app.routers.study_sessions import router as study_sessions_router
from app.security import is_ai_request, rate_limit_key, rate_limiter, requires_write_access


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="学习日记记录系统 API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Study-Diary-Access"],
)


@app.middleware("http")
async def protect_public_mutations(request: Request, call_next):
    is_api_mutation = request.url.path.startswith("/api/") and request.method in {"POST", "PATCH", "PUT", "DELETE"}
    is_desktop_pet_data = request.url.path.startswith("/api/desktop-pet") or request.url.path.startswith("/api/study-sessions")
    is_reminder_dispatch = request.url.path == "/api/reminders/dispatch"
    if (is_api_mutation or is_desktop_pet_data) and not is_reminder_dispatch and requires_write_access(request):
        return JSONResponse(status_code=401, content={"detail": "此操作需要访问码。"})
    if is_ai_request(request) and not rate_limiter.allow(rate_limit_key(request), settings.ai_rate_limit_per_minute):
        return JSONResponse(
            status_code=429,
            content={"detail": "请求过于频繁，请稍后再试。"},
            headers={"Retry-After": "60"},
        )
    return await call_next(request)

app.include_router(diaries_router)
app.include_router(algorithms_router)
app.include_router(interviews_router)
app.include_router(reminders_router)
app.include_router(study_sessions_router)
app.include_router(desktop_pet_router)


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
