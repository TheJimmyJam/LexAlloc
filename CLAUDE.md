# LexAlloc — Claude Session Reference

## ⚠️ CRITICAL: File Path Mapping

There are TWO frontend trees in the repo. Only one matters for deployment.

| What I edit locally | What to push to GitHub | Why |
|---|---|---|
| `lexalloc/frontend/src/...` | `frontend/src/...` | Netlify builds from `/frontend/` at repo root |
| `lexalloc/supabase/migrations/...` | `supabase/migrations/...` | Live migrations path |

**Rule: strip `lexalloc/` from the local path to get the correct GitHub target.**

The `/lexalloc/` folder in GitHub is a stale duplicate — pushing there does nothing for the live site.

### Quick reference — correct GitHub paths
```
frontend/src/pages/AdminPanel.jsx
frontend/src/pages/Apportionment.jsx
frontend/src/pages/Dashboard.jsx
frontend/src/pages/Landing.jsx
frontend/src/pages/MatterDetail.jsx
frontend/src/pages/Matters.jsx
frontend/src/pages/Reports.jsx
frontend/src/pages/Settings.jsx        ← "Rolodex" page
frontend/src/components/Layout.jsx
supabase/migrations/XXX.sql
```

### Netlify build config (repo root netlify.toml)
```toml
[build]
  base    = "frontend"
  command = "npm run build"
  publish = "dist"
```

---

## GitHub Push Script Template

```python
import urllib.request, urllib.error, json, base64

PAT   = 'ghp_xxxx...'  # use the actual PAT — stored in Jimmy's 1Password / GitHub settings
OWNER = 'TheJimmyJam'
REPO  = 'LexAlloc'
BASE  = f'https://api.github.com/repos/{OWNER}/{REPO}/contents'
H     = {'Authorization': f'token {PAT}', 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json'}

def get_sha(path):
    req = urllib.request.Request(f'{BASE}/{path}', headers=H)
    try:
        with urllib.request.urlopen(req) as r: return json.loads(r.read())['sha']
    except urllib.error.HTTPError as e:
        if e.code == 404: return None
        raise

def push(repo_path, local_path, msg):
    with open(local_path, 'rb') as f: content = base64.b64encode(f.read()).decode()
    sha  = get_sha(repo_path)
    body = {'message': msg, 'content': content}
    if sha: body['sha'] = sha
    data = json.dumps(body).encode()
    req  = urllib.request.Request(f'{BASE}/{repo_path}', data=data, headers=H, method='PUT')
    with urllib.request.urlopen(req) as r: print(f'✓ {repo_path} ({r.status})')
```

### Local→GitHub path translation
```python
# Local base (what I edit):
LOCAL_BASE = '/sessions/admiring-busy-wozniak/mnt/LexAlloc/lexalloc'

# GitHub base (what Netlify deploys):
# Strip "lexalloc/" — push to root-level "frontend/" or "supabase/"

# Example:
push(
    'frontend/src/pages/Settings.jsx',           # GitHub path
    f'{LOCAL_BASE}/frontend/src/pages/Settings.jsx',  # local path
    'feat: description'
)
```

---

## Project Overview

**LexAlloc** — Legal invoice apportionment SaaS for law firms.

### Stack
- **Frontend**: React + Vite + Tailwind CSS (`darkMode: 'class'`)
- **Backend**: Supabase (Postgres + Auth + Edge Functions + RLS)
- **Deploy**: Netlify (auto-deploys from GitHub `main`)
- **Repo**: `TheJimmyJam/LexAlloc` on GitHub

### Key pages
| Route | File | Notes |
|---|---|---|
| `/dashboard` | Dashboard.jsx | Kanban firm cards |
| `/matters` | Matters.jsx | Active/On Hold/Closed filter |
| `/matters/:id` | MatterDetail.jsx | Party/insurer/invoice management |
| `/apportionment/:id` | Apportionment.jsx | Demand letters, bulk pay |
| `/reports` | Reports.jsx | Custom date range picker |
| `/settings` | Settings.jsx | Renamed "Rolodex" — Org/Firms/Insurers only |
| `/admin` | AdminPanel.jsx | Profile, Security, Users, Orgs, API keys, etc. |

### Supabase details
- Migrations live at `supabase/migrations/` in GitHub (and locally at `lexalloc/supabase/migrations/`)
- Latest migration: `040_insurer_profiles_and_reps.sql`
- New tables: `la_insurer_claims_reps`
- RLS: all tables gated by `org_id` via `la_profiles`

### Known issues / pending
- Migrations 039 (on_hold status) and 040 (insurer profiles + claims reps) need to be run in Supabase SQL editor
- `lexalloc/frontend/` and `lexalloc/supabase/` in GitHub are stale duplicates — do not push there

---

## Recent features shipped
- Kanban firm cards on Dashboard (alphabetical)
- On Hold matter status tag
- Demand letter follow-up schedule display (Apportionment page)
- Bulk "Mark as Paid" modal on Apportionment
- Full insurer profiles + claims reps (Settings → Rolodex → Insurers)
- Insurer Kanban cards with A-Z index + search
- Profile + Security tabs moved to AdminPanel
- Settings renamed → Rolodex
- Custom date range picker in Reports
- API key masking in AdminPanel
- Demand letter email retry banner
