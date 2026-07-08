# Vänertekno APS

Webbaserad SaaS för avancerad produktionsplanering (Advanced Planning & Scheduling) för
tillverkningsindustrin. Ersätter manuell Excel-planering med en optimeringsmotor som skapar
finite-capacity-scheman, minimerar förseningar och ställtider och maximerar resursutnyttjande.

Se [ARCHITECTURE.md](ARCHITECTURE.md) för arkitektur och tekniska val.

## Teknik

- **Backend:** Python 3.12 · FastAPI · SQLAlchemy 2 · Alembic
- **Planeringsmotor:** Google OR-Tools CP-SAT (`backend/app/aps/engine.py`)
- **Databas:** PostgreSQL 16 · **Kö/cache:** Redis + Celery
- **Frontend:** React 18 + TypeScript + Vite (egen Gantt-vy)
- **Gateway:** Caddy med automatisk HTTPS (Let's Encrypt, auto-förnyelse)
- **Drift:** Docker Compose

## Snabbstart (produktion)

```bash
cp .env.example .env          # fyll i DOMAIN, TLS_EMAIL, lösenord, JWT_SECRET
docker compose up -d --build  # bygger och startar allt bakom Caddy (80/443)
docker compose exec api python -m app.seed   # (valfritt) demodata
```

Öppna `https://<DOMAIN>` och logga in med `FIRST_ADMIN_EMAIL` / `FIRST_ADMIN_PASSWORD`.
Migrationer körs automatiskt (`alembic upgrade head`) när API-containern startar.

### Lokal utveckling

```bash
# backend
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload           # kräver lokal Postgres + Redis, eller kör bara db/redis via compose

# frontend
cd frontend && npm install && npm run dev   # proxar /api och /ws till :8000
```

## Arbetsflöde

1. Lägg upp grunddata: maskintyper, maskiner, produkter med **routing** (operationssteg).
2. Skapa produktionsorder (produkt, antal, prioritet, leveransdatum).
3. Kör planeringen i **Gantt-vyn** → motorn schemalägger alla operationer på maskiner.
4. Lås enskilda operationer (dubbelklick) för att styra dem manuellt; kör om planeringen.
5. Vid händelser (maskinhaveri, akutorder) triggas om-planering via `POST /api/plan/replan`
   som kör i bakgrunden (Celery) och skapar en ny schemaversion.

## Driftkrav som uppfylls

- Enda exponerade portar: 80/443 via Caddy. Postgres, Redis, API, worker är interna.
- Automatisk TLS med förnyelse. HSTS + säkerhetsheaders.
- Health checks och `restart: unless-stopped` på alla tjänster.
- Persistent lagring (`db_data`, `redis_data`, `caddy_data`).
- Backup: `docker compose exec db pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup.sql`.

## Tester

```bash
cd backend && python -m pytest        # inkl. test av planeringsmotorn
```

## Roadmap

- **Fas 1 (MVP – nu):** användare/RBAC, grunddata, order, operationer, planeringsmotor, Gantt, dashboard, Docker Compose. ✅ grund lagd
- **Fas 2:** kalender/skift-constraints, sekvensberoende ställtider, auto-omplanering med diff, rapporter, integrations-API, Redis-pub/sub-realtid.
- **Fas 3:** ERP (Monitor/SAP/Dynamics/Jeeves), MES, OPC UA/MQTT, AI (förseningsprognos, inlärda operationstider).
```
