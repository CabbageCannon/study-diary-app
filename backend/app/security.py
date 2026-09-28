from collections import defaultdict, deque
from time import monotonic

from fastapi import Request

AI_ROUTE_MARKERS = ("/draft", "/ai-review", "/evaluate", "/answers", "/hint", "/reasoning/checks", "/speech/transcriptions")


class SlidingWindowRateLimiter:
    def __init__(self) -> None:
        self._attempts: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str, limit: int, window_seconds: int = 60) -> bool:
        now = monotonic()
        attempts = self._attempts[key]
        cutoff = now - window_seconds
        while attempts and attempts[0] <= cutoff:
            attempts.popleft()
        if len(attempts) >= limit:
            return False
        attempts.append(now)
        return True


rate_limiter = SlidingWindowRateLimiter()


def is_ai_request(request: Request) -> bool:
    if request.url.path == "/api/algorithms/reasoning/answers":
        return False
    if request.url.path.startswith("/api/algorithms/reasoning/answers/") and request.url.path.endswith("/check"):
        return request.method == "POST"
    return request.method in {"POST", "PATCH"} and any(marker in request.url.path for marker in AI_ROUTE_MARKERS)


def rate_limit_key(request: Request) -> str:
    host = request.client.host if request.client else "unknown"
    return f"{host}:{request.url.path}"
