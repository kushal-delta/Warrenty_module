# Delta iERP — Warranty & Service Module
### Demo System for SOLARTIVE TECHNO INDUSTRIES PVT LTD

A complete, end-to-end Warranty & Service management solution for solar submersible pumps, motors, and controllers. Each component carries its own serial number and warranty clock.

---

## 🚀 Hosting on Vercel

This project is fully configured for seamless 1-click deployment on **Vercel**.

### Step-by-Step Vercel Deployment:

1. **Push this repository to GitHub, GitLab, or Bitbucket**:
   ```bash
   git init
   git add .
   git commit -m "Configure project for Vercel deployment"
   git push origin main
   ```

2. **Deploy on Vercel**:
   - Go to [Vercel Dashboard](https://vercel.com/new).
   - Click **Add New...** → **Project**.
   - Select your Git repository.
   - **Configure Project settings**:
     - **Framework Preset**: `Other` (or leave default auto-detection)
     - **Root Directory**: `./` (default)
     - **Build Command**: *(leave empty)*
     - **Output Directory**: *(leave empty)*
   - Click **Deploy**.

3. **That's it!**
   - Vercel will deploy both the static frontend and the serverless API functions (`/api/ping` and `/api/data`).
   - Visiting your Vercel URL (e.g. `https://your-project.vercel.app/`) will automatically redirect to `/app/index.html` with all 34 tables preloaded.

---

## 🛠️ Changes Configured for Vercel

1. **`vercel.json`**:
   - Routes root `/` and `/app` directly to `/app/index.html`.
   - Bundles the seed database (`data/**`) with serverless lambdas.
   - Sets appropriate CORS and `Cache-Control` headers for all API requests.

2. **Root Entry Point (`index.html`)**:
   - Provides instant client-side redirection to `/app/index.html` while preserving query params and hash links.
   - Includes fallback cards linking directly to the App, Demo Runbook, and Documentation.

3. **Serverless API Functions (`api/ping.js` & `api/data.js`)**:
   - Replaces the local PowerShell server (`delta-server.ps1`) in the cloud.
   - `GET /api/data`: Delivers the complete 34-table demo dataset.
   - `POST /api/data`: Accepts updates and keeps live session caching.
   - `GET /api/ping`: Service health check.

4. **Resilient Local & Cloud Data Layer (`app/store.js`)**:
   - Works seamlessly in both local and hosted environments.
   - Edits made during testing (registrations, job cards, approvals) are safely preserved in browser `localStorage` across page reloads.
   - Contextual status indicator in the top bar displays **Synced** (saved in cloud & browser storage).

5. **Cross-Platform Local Dev Server (`server.js` & `package.json`)**:
   - Run `npm run dev` on Windows, macOS, or Linux using standard Node.js without needing PowerShell.
   - The original Windows launcher `Start Warranty Service Demo.cmd` remains fully supported.

---

## 💻 Running Locally

### Option A: Using Node.js (Cross-Platform)
```bash
npm run dev
# or
node server.js
```
Opens on `http://localhost:8700/app/index.html`.

### Option B: Using Windows Launcher
Double-click `Start Warranty Service Demo.cmd` in the project root.

---

## 🔑 Demo Credentials

| Role | User Name | Password | Scope / What they see |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `admin` | `delta@2026` | Full system access, all states, ability to reset demo data. |
| **HO User** (UP Rights) | `ho.up` | `delta@2026` | Head office screens, restricted to Uttar Pradesh & neighboring states. |
| **HO Head** (L2 Approver) | `ho.head` | `delta@2026` | Level 2 approval for job cards ₹10,000 and above. |
| **Service Manager** | `mgr.gno` / `mgr.lko` | `delta@2026` | Service centre management; Level 1 job card approver. |
| **Service Engineer** | `eng.gno1` / `eng.lko1` | `delta@2026` | Mobile-friendly view: assigned calls, visit reports, job cards, van stock. |
| **Dealer** | `1001` … `1006` | `123` | Dealer portal: own customers, warranty registrations, call booking. |
| **Customer (Farmer)** | `9810101001` | OTP | OTP displayed directly on screen. Products and warranty status. |

---

## 📄 Key Resources

- **Interactive Application**: `/app/index.html`
- **75-Minute Demo Runbook**: `/Demo-Runbook.html`
- **Introduction & System Overview**: `/START HERE.html`
- **SQL Scripts & Data Dictionary**: `/database/`
- **Excel Import Templates**: `/Import Templates/`
