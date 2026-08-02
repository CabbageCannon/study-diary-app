from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routers.algorithms import router as algorithms_router
from app.routers.diaries import router as diaries_router
from app.routers.interviews import router as interviews_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="学习日记记录系统 API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(diaries_router)
app.include_router(algorithms_router)
app.include_router(interviews_router)


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
