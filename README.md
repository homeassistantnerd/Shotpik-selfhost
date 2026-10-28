# 📸 Shotpik — Self-Hosted Photo Proofing & Selection Platform

[![Node.js](https://img.shields.io/badge/Node.js-20_LTS-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Shotpik** is an open-source, self-hosted client photo proofing, selection, and retouch-request management system designed for wedding, event, and portrait photography studios. 

It lets clients review and choose photos directly from public **Google Drive** folders without consuming server storage or bandwidth, enforces album quotas in real-time, supports collaborative multi-user selections with color-coded roles, enables vector-accurate canvas drawing annotations, and delivers **1-click Adobe Lightroom / Capture One** filtering plus automated local RAW file gathering.

---

## 📑 Table of Contents

- [Key Architecture & Core Rules](#-key-architecture--core-rules)
- [Features](#-features)
- [Monorepo Structure](#-monorepo-structure)
- [Quickstart (Local Development)](#-quickstart-local-development)
- [Production Deployment](#-production-deployment)
  - [Method 1: Docker Compose (Recommended)](#method-1-docker-compose-recommended)
  - [Method 2: Bare Metal / VPS (Node.js + PM2 + Systemd)](#method-2-bare-metal--vps-nodejs--pm2--systemd)
  - [Reverse Proxy & SSL (Nginx / Caddy)](#reverse-proxy--ssl-nginx--caddy)
  - [Deployment on Synology / QNAP NAS](#deployment-on-synology--qnap-nas)
- [Google Drive Setup](#-google-drive-setup)
- [Photographer Companion Workflow](#-photographer-companion-workflow)
  - [1. Adobe Lightroom 1-Click Filter](#1-adobe-lightroom-1-click-filter)
  - [2. Capture One Filter](#2-capture-one-filter)
  - [3. Local RAW Companion Scripts (.bat / .sh)](#3-local-raw-companion-scripts-bat--sh)
  - [4. Direct Server-Side NAS Copy](#4-direct-server-side-nas-copy)
- [Environment Variables](#-environment-variables)
- [Backup & Maintenance](#-backup--maintenance)
- [License](#-license)

---

## ⚡ Key Architecture & Core Rules

1. **Direct Google Drive CDN (Zero Server Bandwidth)**:
   The backend never streams or proxies multi-megabyte image binaries. High-resolution thumbnails (`sz=w600`) and full-screen lightboxes (`sz=w2048`) resolve directly from Google Drive's edge network.
2. **Atomic Quota Enforcement**:
   Album selection limits (`maxSelections`) are strictly guarded at the database transaction layer across the distinct `Set` of liked `photoId`s across all clients in the album.
3. **Normalized Vector Brush Coordinates**:
   Canvas drawing annotations store stroke paths strictly as normalized `[0.0, 1.0]` coordinates (`x = clientX / width`, `y = clientY / height`), guaranteeing pixel-perfect scaling across mobile phones, tablets, and 4K displays.
4. **Clean Key Filename Normalization**:
   Filenames across all extensions (`_MG_8695.JPG`, `_MG_8695.CR3`, `_mg_8695.arw`) are stripped of extensions and lowercased via `generateCleanKey()` to ensure seamless matching against offline RAW camera files.
5. **PhotoSwipe Gesture Isolation**:
   Interactive floating overlays declare `pointer-events: auto` while backdrop viewports declare `pointer-events: none` to preserve 60fps pinch-to-zoom and pan gestures.

---

## ✨ Features

- 📱 **Mobile-First Client Gallery**: Responsive dark-mode interface with PhotoSwipe v5 lightbox.
- 👥 **Multi-Role Collaborative Choosers**: Bride, Groom, Parents, and Guests can select concurrently with dedicated name badges and color swatches.
- 🎯 **Visual Retouch Feedback**: Preset Vietnamese/English retouch tags (`#Làm mịn da`, `#Bóp eo / Thon dáng`, `#Xoá người / Rác`) paired with text comments.
- 🖌️ **Precision Canvas Brush**: Circle blemishes, flyaway hairs, or background distractions directly over the high-resolution photo.
- 🔒 **Album Lock State**: Lock album upon completion with instant feedback banner and immutable client selections.
- 📊 **Studio Admin Dashboard**:
  - Live selection progress bars (`24 / 30 photos`).
  - Google Drive 1-click re-crawl and synchronization.
  - Studio branding editor (Logo, slogan, hotline, watermark).
  - Downloadable QR codes for instant mobile sharing.
- 💻 **Offline RAW File Matcher**:
  - Auto-generated Windows `.bat` and macOS/Linux `.sh` companion scripts.
  - 1-click copyable query strings for Adobe Lightroom Text Filters and Capture One.
  - Direct local/NAS filesystem copier.

---

## 📁 Monorepo Structure

```text
shotpik-app/
├── packages/
│   ├── shared/     # Domain models, Zod validation schemas, API interfaces, coordinate utils
│   ├── backend/    # Node.js 20 Express, better-sqlite3 with WAL mode, Drizzle ORM, GDrive crawler
│   └── frontend/   # Vite 6, React 18, Tailwind CSS v3, PhotoSwipe v5, Canvas Brush, Lucide icons
├── docker-compose.yml
├── Dockerfile
├── package.json
└── README.md
```

---

## 🚀 Quickstart (Local Development)

### Prerequisites
- **Node.js**: `20.x` LTS or later
- **npm**: `10.x` or later

### Installation & Run
```bash
# 1. Clone the repository
git clone https://github.com/your-username/shotpik.git
cd shotpik/shotpik-app

# 2. Install dependencies for all workspaces
npm install

# 3. Build all packages in dependency order
npm run build

# 4. Start the production server
npm start
```

Visit:
- **Admin Dashboard**: `http://localhost:3000/admin`
- **Client Proofing**: `http://localhost:3000/albums/:slug`

### Running Development Mode (Hot-Reload)
```bash
# Terminal 1: Backend with tsx watch on port 3000
npm run dev:backend

# Terminal 2: Frontend with Vite on port 5173 (proxies /api -> 3000)
npm run dev:frontend
```

---

## 🐳 Production Deployment

### Method 1: Docker Compose (Recommended)

Docker Compose is the fastest and most reliable way to run Shotpik in production with zero external runtime dependencies.

#### 1. Setup Configuration
Create a `docker-compose.yml` file (or use the one in the repository):

```yaml
services:
  shotpik:
    image: shotpik-app:latest
    build:
      context: .
      dockerfile: Dockerfile
    container_name: shotpik-app
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE_PATH=/app/data/shotpik.db
      - STUDIO_NAME=My Photography Studio
      - APP_BASE_URL=https://proofing.yourstudio.com
    volumes:
      - ./data:/app/data
      # Optional: Mount your local/NAS RAW folder for server-side file copying
      # - /mnt/nas/raw_photos:/raw_library:ro
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

#### 2. Launch Container
```bash
# Build and start in detached background mode
docker compose up -d --build

# View container logs
docker compose logs -f
```

Data will be stored persistently in `./data/shotpik.db`.

---

### Method 2: Bare Metal / VPS (Node.js + PM2 + Systemd)

If deploying directly to a Linux VPS (Ubuntu 22.04 / 24.04 LTS, Debian):

#### 1. Install Node.js 20 & Build Tools
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential python3
sudo npm install -g pm2
```

#### 2. Clone and Build
```bash
cd /opt
sudo git clone https://github.com/your-username/shotpik.git
cd shotpik/shotpik-app
sudo npm install
sudo npm run build
sudo mkdir -p /var/lib/shotpik
sudo chown -R $USER:$USER /var/lib/shotpik /opt/shotpik
```

#### 3. Create Environment File
Create `/opt/shotpik/shotpik-app/.env`:
```ini
NODE_ENV=production
PORT=3000
DATABASE_PATH=/var/lib/shotpik/shotpik.db
APP_BASE_URL=https://proofing.yourstudio.com
STUDIO_NAME=Shotpik Studio
```

#### 4. Run with PM2
```bash
pm2 start packages/backend/dist/index.js --name shotpik
pm2 save
pm2 startup
```

---

### Reverse Proxy & SSL (Nginx / Caddy)

To expose Shotpik securely over HTTPS (`https://proofing.yourstudio.com`):

#### Nginx Configuration (`/etc/nginx/sites-available/shotpik`)
```nginx
server {
    listen 80;
    server_name proofing.yourstudio.com;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```
Obtain free SSL certificates using Certbot:
```bash
sudo certbot --nginx -d proofing.yourstudio.com
```

#### Caddy Configuration (`Caddyfile`)
If using Caddy, SSL certificates are issued and renewed automatically:
```caddy
proofing.yourstudio.com {
    reverse_proxy 127.0.0.1:3000
}
```

---

### Deployment on Synology / QNAP NAS

1. Open **Container Manager** (Synology) or **Container Station** (QNAP).
2. Create a new Project with `docker-compose.yml`.
3. Map the volume `./data` to a persistent shared folder (e.g., `/volume1/docker/shotpik/data`).
4. (Optional) Map your RAW photo library folder (e.g., `/volume1/photo/RAW`) into the container to enable direct server-side RAW copying.
5. Set container port `3000` to local port `3000` and start the container.

---

## 🔑 Google Drive Setup

Shotpik uses direct public Google Drive folder links to index photos without storing binaries.

1. Create a folder on Google Drive and upload JPEG preview photos.
2. Right-click the folder &rarr; **Share (Chia sẻ)** &rarr; **General Access (Quyền truy cập chung)**:
   - Select: **"Anyone with the link" (Bất kỳ ai có đường liên kết)**.
   - Role: **Viewer (Người xem)**.
3. Copy the URL (e.g., `https://drive.google.com/drive/folders/1A2b3C4d5E...`).
4. In Shotpik Admin (`/admin`), click **Tạo Album Mới (Create Album)**, paste the URL, and click **Tạo và quét ảnh**.

*Tip: For ultra-fast indexing with private/restricted folders, optionally set the `GOOGLE_DRIVE_API_KEY` environment variable in your `.env`.*

---

## 📸 Photographer Companion Workflow

Shotpik streamlines the handover from client selection to photo editing:

### 1. Adobe Lightroom 1-Click Filter
1. In `/admin`, open **Xuất & Đồng bộ RAW** on the customer's album.
2. Click **Sao chép** under **Adobe Lightroom** to copy the comma-separated filename query (e.g. `_MG_8695, _MG_8696`).
3. In Adobe Lightroom:
   - Switch to **Library Grid View** (press `G`).
   - Press `\` to reveal the **Library Filter Bar**.
   - Select **Text** &rarr; **Filename** &rarr; **Contains** &rarr; Paste (`Ctrl+V` / `Cmd+V`).
   - Only the client-selected photos will appear instantly.

### 2. Capture One Filter
1. Click **Sao chép** under **Capture One** to copy the space-separated list.
2. Paste into the Capture One search filter box.

### 3. Local RAW Companion Scripts (.bat / .sh)
If you have thousands of offline RAW files on your local workstation:
1. Download `copy_raw.bat` (Windows) or `copy_raw.sh` (macOS / Linux) from the album drawer.
2. Move the script into your RAW folder containing camera originals (`.CR3`, `.ARW`, `.NEF`, `.DNG`, etc.).
3. Run the script:
   - **Windows**: Double-click `copy_raw.bat`.
   - **macOS / Linux**: `chmod +x copy_raw.sh && ./copy_raw.sh`
4. The script creates a `Selected_RAW/` subfolder and copies all selected files automatically.

### 4. Direct Server-Side NAS Copy
If running Shotpik on a NAS or server with direct access to RAW storage:
1. Enter your RAW directory path (e.g., `/mnt/nas/raw_photos` or `Z:\RAW\Wedding2026`).
2. Click **Copy trên NAS**. Shotpik automatically locates and copies all matched RAW files into a `Selected_RAW` folder on the disk.

---

## ⚙️ Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Node.js execution environment (`production` or `development`) |
| `PORT` | `3000` | Port on which the web server listens |
| `DATABASE_PATH` | `./data/shotpik.db` | Filesystem path for the SQLite database with WAL mode |
| `FRONTEND_DIST_PATH` | *(Auto-detected)* | Path to the built Vite frontend assets |
| `APP_BASE_URL` | `http://localhost:3000` | Public base URL used for QR code generation and links |
| `STUDIO_NAME` | `Shotpik Photography` | Fallback studio branding name |
| `GOOGLE_DRIVE_API_KEY`| *(Optional)* | Official Google Drive API Key for quota-free scraping |

---

## 💾 Backup & Maintenance

### SQLite Database Backup
Shotpik uses SQLite in WAL (Write-Ahead Logging) mode for concurrent reads and writes. To make a clean live backup without stopping the service:

```bash
# Create an atomic backup copy
sqlite3 ./data/shotpik.db ".backup ./data/shotpik_backup_$(date +%F).db"
```

### Upgrading Shotpik
```bash
git pull origin main
npm install
npm run build
pm2 restart shotpik # or: docker compose up -d --build
```

---

## 🛡️ License

This project is licensed under the [MIT License](LICENSE) — free to use and customize for personal portfolios and commercial photography studios alike.
