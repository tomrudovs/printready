# PrintReady - Cloudflare Deployment Guide

## 🎯 What You'll Get
- Free hosting on Cloudflare (unlimited bandwidth)
- Custom domain support
- Global CDN (fast everywhere)
- SSL certificate (https)
- Zero server costs

---

## 📋 Prerequisites

You need these installed on your computer:
1. **Node.js** (version 18+) - https://nodejs.org/
2. **Git** - https://git-scm.com/downloads
3. **GitHub account** - https://github.com/signup
4. **Cloudflare account** - https://dash.cloudflare.com/sign-up

---

## 🚀 STEP-BY-STEP GUIDE

### STEP 1: Set Up the Project Locally

1. **Download and unzip** the `printready-project.zip` file

2. **Open Terminal/Command Prompt** and navigate to the folder:
   ```bash
   cd path/to/printready
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Test locally** (optional but recommended):
   ```bash
   npm run dev
   ```
   Open http://localhost:5173 in your browser to test

5. **Build the project:**
   ```bash
   npm run build
   ```
   This creates a `dist` folder with your production files

---

### STEP 2: Create GitHub Repository

1. Go to https://github.com/new

2. **Repository name:** `printready` (or whatever you want)

3. Keep it **Public** (free) or **Private** (also free)

4. Click **Create repository**

5. **In your terminal**, run these commands:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/printready.git
   git push -u origin main
   ```
   (Replace YOUR_USERNAME with your actual GitHub username)

---

### STEP 3: Connect to Cloudflare Pages

1. Go to https://dash.cloudflare.com

2. Click **Workers & Pages** in the left sidebar

3. Click **Create application**

4. Click **Pages** tab

5. Click **Connect to Git**

6. Click **Connect GitHub** and authorize Cloudflare

7. Select your `printready` repository

8. Click **Begin setup**

---

### STEP 4: Configure Build Settings

On the configuration page, set these EXACTLY:

| Setting | Value |
|---------|-------|
| Project name | `printready` (or your choice) |
| Production branch | `main` |
| Framework preset | `Vite` |
| Build command | `npm run build` |
| Build output directory | `dist` |

9. Click **Save and Deploy**

10. Wait 1-2 minutes for deployment

---

### STEP 5: Your Site is Live! 🎉

After deployment, you'll get a URL like:
```
https://printready.pages.dev
```

Click it to see your live site!

---

## 🌐 OPTIONAL: Add Custom Domain

1. In Cloudflare Pages, go to your project

2. Click **Custom domains** tab

3. Click **Set up a custom domain**

4. Enter your domain (e.g., `printready.com`)

5. Follow the DNS setup instructions

---

## 🔄 Making Updates

Whenever you want to update your site:

1. Make changes to your code

2. Run these commands:
   ```bash
   git add .
   git commit -m "Your update message"
   git push
   ```

3. Cloudflare automatically rebuilds and deploys!

---

## 📁 Project Structure

```
printready/
├── index.html          # Main HTML file
├── package.json        # Dependencies
├── vite.config.js      # Build config
├── tailwind.config.js  # Styling config
├── postcss.config.js   # CSS processing
├── public/
│   └── favicon.svg     # Site icon
└── src/
    ├── main.jsx        # App entry point
    ├── index.css       # Styles
    └── App.jsx         # Main app code (your tool!)
```

---

## 🛠 Troubleshooting

**Build fails?**
- Check Node version: `node --version` (need 18+)
- Delete `node_modules` and run `npm install` again

**Site not updating?**
- Clear browser cache (Ctrl+Shift+R)
- Check Cloudflare dashboard for build status

**Blank page?**
- Check browser console for errors (F12)
- Make sure build completed successfully

---

## 💰 Next Steps for Monetization

1. **Add Stripe** for payments
2. **Add upscaler API** (Replicate) for PRO features
3. **Add analytics** (Plausible or Google Analytics)
4. **Buy domain** (~$12/year)

Want help with any of these? Just ask!

---

## 📞 Support

If you get stuck, copy the error message and I'll help you fix it!
