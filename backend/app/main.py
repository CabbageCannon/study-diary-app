from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.auth import AuthFailure, verify_session
from app.database import SessionLocal, init_db
from app.models import UserProfile
from app.routers.accounts import router as accounts_router
from app.routers.algorithms import router as algorithms_router
from app.routers.desktop_pet import router as desktop_pet_router
from app.routers.diaries import router as diaries_router
from app.routers.interviews import router as interviews_router
from app.routers.reminders import router as reminders_router
from app.routers.speech import router as speech_router
from app.routers.study_sessions import router as study_sessions_router
from app.security import is_ai_request, rate_limit_key, rate_limiter


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
    allow_headers=["Content-Type", "Authorization", "X-Reminder-Cron"],
)


@app.middleware("http")
async def protect_public_mutations(request: Request, call_next):
    protected = request.url.path.startswith("/api/") and request.url.path not in {
        "/api/health", "/api/reminders/dispatch",
    }
    if protected and request.method != "OPTIONS":
        scheme, _, token = request.headers.get("Authorization", "").partition(" ")
        if scheme.lower() != "bearer" or not token.strip():
            return JSONResponse(status_code=401, content={"detail": "请先登录。"})
        try:
            identity = await verify_session(token.strip())
        except AuthFailure as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": str(exc)})
        with SessionLocal() as db:
            profile = db.get(UserProfile, identity.user_id)
            changed = profile is None
            if profile is None:
                profile = UserProfile(id=identity.user_id, email=identity.email, active=True)
                db.add(profile)
            role = "admin" if identity.user_id == settings.admin_user_id else "user"
            if profile.role != role:
                profile.role = role
                changed = True
            if profile.email != identity.email:
                profile.email = identity.email
                changed = True
            if not profile.active:
                return JSONResponse(status_code=403, content={"detail": "该账户已停用。"})
            if changed:
                db.commit()
            request.state.user_id = identity.user_id
            request.state.is_admin = profile.role == "admin"
    if is_ai_request(request) and not rate_limiter.allow(rate_limit_key(request), settings.ai_rate_limit_per_minute):
        return JSONResponse(
            status_code=429,
            content={"detail": "请求过于频繁，请稍后再试。"},
            headers={"Retry-After": "60"},
        )
    return await call_next(request)

app.include_router(diaries_router)
app.include_router(accounts_router)
app.include_router(algorithms_router)
app.include_router(interviews_router)
app.include_router(reminders_router)
app.include_router(speech_router)
app.include_router(study_sessions_router)
app.include_router(desktop_pet_router)


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
