FROM python:3.11-slim AS model

RUN pip install --no-cache-dir modelscope
COPY scripts/download_model.py /download_model.py
RUN python /download_model.py

FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY --from=model /models/sensevoice /models/sensevoice
COPY app ./app

ENV PYTHONUNBUFFERED=1
ENV PORT=8000
ENV SENSEVOICE_MODEL_PATH=/models/sensevoice

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
