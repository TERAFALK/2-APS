# Vänertekno APS — Systemarkitektur

**Produkt:** Webbaserad SaaS för avancerad produktionsplanering (APS) för tillverkningsindustrin.
**Kund:** Vänertekno AB
**Status:** Fas 1 (MVP) under uppbyggnad.

---

## 1. Övergripande arkitektur

```
                        Internet (HTTPS 443)
                              │
                    ┌─────────▼─────────┐
                    │   Caddy (reverse   │  ← automatisk TLS (Let's Encrypt),
                    │   proxy / gateway) │    auto-förnyelse, enda exponerade porten
                    └───┬───────────┬────┘
             /api, /ws  │           │  /  (statiska filer)
                    ┌───▼────┐  ┌───▼─────┐
                    │ API    │  │ Frontend │  (Nginx som serverar byggd SPA)
                    │FastAPI │  └──────────┘
                    └─┬──┬──┬┘
          SQLAlchemy  │  │  └── WebSocket (realtid)
                 ┌────▼┐ ┌▼──────┐
                 │ PG  │ │ Redis │
                 └─────┘ └───┬───┘
                             │  broker + result backend
                        ┌────▼─────────┐
                        │ Celery worker│  ← APS-motor, om-/planering (OR-Tools)
                        │ Celery beat  │  ← schemalagda jobb (health, backup-triggers)
                        └──────────────┘
```

Interna tjänster (Postgres, Redis, API, worker) exponeras **inte** externt — endast Caddy
lyssnar på 80/443. All intern trafik sker på ett privat Docker-nätverk.

## 2. Teknikval och motivering

| Område | Val | Motivering |
|---|---|---|
| Backend | **Python 3.12 + FastAPI** | Async, typad (Pydantic v2), automatisk OpenAPI. Samma språk som optimeringsmotorn → ingen bro. |
| Planeringsmotor | **Google OR-Tools (CP-SAT)** | Branschstandard för finite-capacity scheduling / job-shop. Hanterar constraints (kapacitet, ställtider, prioritet, leveransdatum) deklarativt. Fri, produktionsklar. |
| ORM/migrationer | **SQLAlchemy 2.0 + Alembic** | Moget, typat, versionerade schemaändringar. |
| Databas | **PostgreSQL 16** | ACID, JSONB för flexibla attribut, robust för industriell drift, utmärkt tidsserie-/analysstöd. |
| Kö & cache | **Redis 7 + Celery** | Asynkron om-planering (kan ta sekunder–minuter) utanför request-cykeln. Redis även för cache och WebSocket pub/sub. |
| Frontend | **React 18 + TypeScript + Vite** | Snabb DX, stort ekosystem. |
| State/data | **TanStack Query + Zustand** | Server-cache + lokal UI-state. |
| Gantt | **egen SVG/Canvas-komponent + dnd-kit** | Full kontroll över drag-släpp, låsning, konfliktvisning; undviker licenskostnad för kommersiella Gantt-bibliotek. |
| Realtid | **WebSockets (FastAPI) + Redis pub/sub** | Push av plan-/statusändringar till alla klienter. |
| Auth | **OAuth2 password flow + JWT (access/refresh), RBAC** | Standard, stateless, enkelt att integrera. |
| Gateway/TLS | **Caddy** | "NGINX motsvarande" med **automatisk** cert-utfärdande och förnyelse — uppfyller driftkravet utan cron/certbot-krångel. |
| Container | **Docker + Docker Compose** | Reproducerbar deployment på egen server eller moln. |

## 3. Moduler (mappar)

- `aps/engine` — optimeringsmotorn (CP-SAT-modell, prioriteringsregler, mål).
- `api` — REST + WebSocket-endpoints.
- `models` — SQLAlchemy-datamodell (se DATAMODEL nedan).
- `schemas` — Pydantic in-/utdata.
- `services` — affärslogik (order, resurser, schema, om-planering).
- `auth` — autentisering, RBAC.
- `integrations` — ERP/MES/OPC UA-adaptrar (Fas 3, gränssnitt definieras nu).

## 4. Datamodell (kärna)

Customer · Product · BOM · Routing/Operation-mall · Machine · Employee · Skill ·
ProductionOrder · Operation (schemalagd) · Schedule · ScheduleVersion · CalendarException.
Detaljerat schema genereras via Alembic. Se `backend/app/models/`.

## 5. Planeringsmotor (APS Engine)

CP-SAT-modell per planeringskörning:

- **Variabler:** start/slut-intervall per operation, maskin-tilldelning (alternativa maskiner),
  sekvens per maskin.
- **Constraints:** routing-ordning, finite kapacitet (NoOverlap per maskin), arbetstider/kalender,
  underhållsfönster, materialtillgång, manuella låsningar, ställtid vid produktbyte (sequence-dependent setup).
- **Mål (viktad):** minimera försening (tardiness) → minimera ledtid → minimera ställtider →
  maximera utnyttjande. Vikter konfigurerbara per körning.
- **Om-planering:** vid händelse (maskinhaveri, materialbrist, akutorder) körs motorn på påverkad
  horisont med låsta pågående operationer; ny `ScheduleVersion` skapas → diff mot föregående visas.

## 6. Säkerhet

TLS överallt · JWT + refresh · RBAC (Admin/Planerare/Chef/Operatör) · argon2-hashade lösenord ·
audit-logg på skrivande operationer · secrets via env/Docker secrets · minimal portexponering.

## 7. Fasplan

- **Fas 1 (MVP):** användare, produkter, maskiner, order, operationer, enkel planeringsmotor, Gantt, Docker Compose.
- **Fas 2:** avancerad optimering, auto-omplanering, dashboards, rapporter, integrations-API.
- **Fas 3:** ERP/MES/IoT (OPC UA, MQTT), AI (förseningsprognos, inlärda tider).
