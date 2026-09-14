FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=10

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# constraints.txt (om den finns) låser även indirekta beroenden till kända versioner.
COPY requirements.txt constraints.tx[t] ./
RUN if [ -f constraints.txt ]; then pip install -r requirements.txt -c constraints.txt; \
    else pip install -r requirements.txt; fi

# Kör som vanlig användare, aldrig root. HOME pekar på /tmp (tmpfs när containern är read_only).
RUN useradd --system --uid 10001 --no-create-home app
ENV HOME=/tmp

COPY . .

USER app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
