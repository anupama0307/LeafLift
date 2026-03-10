## LeafLift CI/CD — GitHub Secrets & Variables Setup

Configure the following in **GitHub → Settings → Secrets and variables → Actions**.

---

### 🔐 Repository Secrets (encrypted)

| Secret Name | Description | Where to get it |
|---|---|---|
| `JWT_SECRET` | JWT signing secret (min 32 chars) | Generate: `openssl rand -hex 32` |
| `OLA_API_KEY` | OLA Maps API key | [OLA Developer Console](https://developer.olamaps.io/) |
| `VITE_API_BASE_URL` | Full backend URL for the built frontend | e.g. `https://leaflift-api.onrender.com` |
| `VITE_OLA_API_KEY` | OLA key exposed to frontend | Same as `OLA_API_KEY` |
| `VITE_RAZORPAY_KEY` | Razorpay publishable key | Razorpay Dashboard |
| `NETLIFY_AUTH_TOKEN` | Netlify personal access token | Netlify → User Settings → Applications |
| `NETLIFY_SITE_ID` | Netlify site ID | Netlify → Site → General → Site details |
| `RENDER_API_KEY` | Render API key | Render Dashboard → Account Settings → API Keys |
| `RENDER_STAGING_SERVICE_ID` | Render service ID for staging backend | Render Dashboard → Service → Settings |
| `RENDER_PRODUCTION_SERVICE_ID` | Render service ID for production backend | Render Dashboard → Service → Settings |
| `STAGING_MONGODB_URI` | MongoDB Atlas connection string (staging) | MongoDB Atlas → Database → Connect |
| `PRODUCTION_MONGODB_URI` | MongoDB Atlas connection string (production) | MongoDB Atlas → Database → Connect |

---

### 📋 Repository Variables (non-encrypted)

| Variable Name | Description | Example |
|---|---|---|
| `STAGING_URL` | Base URL of the staging environment | `https://leaflift-staging.netlify.app` |
| `PRODUCTION_URL` | Base URL of the production environment | `https://leaflift.netlify.app` |
