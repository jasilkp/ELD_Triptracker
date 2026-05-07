# ELD Trip Planner

Full-stack trip planning app for truck drivers with HOS-compliant ELD log generation.

## Backend (Django)

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file in `backend/`:

```
DJANGO_SECRET_KEY=replace-me
DJANGO_DEBUG=1
DJANGO_ALLOWED_HOSTS=*
OPENROUTESERVICE_API_KEY=replace-me
```

Run the server:

```bash
python manage.py migrate
python manage.py runserver
```

API endpoint:

```
POST http://localhost:8000/api/trip/plan/
```

## Frontend (React + Vite)

```bash
cd frontend
npm install
```

Create a `.env` file in `frontend/`:

```
VITE_API_BASE_URL=http://localhost:8000
```

Run the dev server:

```bash
npm run dev
```

## Deployment

- Backend: use `backend/Procfile` and `backend/requirements.txt` on Railway/Render.
- Frontend: deploy `frontend/` to Vercel with the build command `npm run build` and output `dist`.
