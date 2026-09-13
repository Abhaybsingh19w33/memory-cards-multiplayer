# Deployment Guide — Memory Cards Multiplayer

This guide details how to deploy **Memory Cards Multiplayer** to various production hosting platforms.

---

## 1. Pre-Deployment Verification

Before deploying, run the automated production build script:

```bash
npm run build
```

This validates:
- Presence of all 16 required production files.
- Syntax verification across all source files.
- Execution of all 42 scenario & unit tests.

---

## 2. Deploy to Render (Recommended Free/Easy Option)

[Render](https://render.com) supports WebSockets natively out of the box with zero configuration.

1. Create a free account at [render.com](https://render.com).
2. Click **New +** $\to$ **Web Service**.
3. Connect your GitHub / GitLab repository.
4. Configure service settings:
   - **Name**: `memory-cards-multiplayer`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
5. Click **Create Web Service**.
6. Render will build and launch your app with a public HTTPS URL (e.g. `https://memory-cards.onrender.com`).

---

## 3. Deploy to Railway

[Railway](https://railway.app) automatically detects Node.js apps and deploys them instantly.

1. Push your repository to GitHub.
2. Go to [railway.app](https://railway.app) and click **New Project** $\to$ **Deploy from GitHub repo**.
3. Select your `memory-cards-multiplayer` repository.
4. Railway will automatically run `npm install` and `npm start`.
5. Under service settings, click **Generate Domain** to get a live URL.

---

## 4. Deploy with Docker

A production-ready multi-stage [`Dockerfile`](../Dockerfile) and [`.dockerignore`](../.dockerignore) are included.

### 4.1 Build Docker Image
```bash
docker build -t memory-cards-multiplayer .
```

### 4.2 Run Docker Container
```bash
docker run -d -p 3000:3000 --name memory-cards memory-cards-multiplayer
```

The game will be accessible at `http://localhost:3000`.

---

## 5. Deploy to a Linux VPS (Ubuntu / Debian) with PM2

### 5.1 Clone & Install
```bash
cd /var/www
git clone <your-repo-url> memory-cards
cd memory-cards
npm install --production
```

### 5.2 Start with PM2
```bash
# Install PM2 globally if not installed
npm install -g pm2

# Start the application
pm2 start server.js --name "memory-cards"

# Save PM2 process list to start on system reboot
pm2 save
pm2 startup
```

### 5.3 Configure Nginx Reverse Proxy (with WebSocket Support)
In `/etc/nginx/sites-available/memory-cards`:

```nginx
server {
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable site and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/memory-cards /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## 6. Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | The port the HTTP and Socket.IO server binds to. Automatically assigned by Render, Railway, Heroku, etc. |
| `NODE_ENV` | `development` | Set to `production` in live environments. |

