# Dividend Income Tracker

A professional dividend income tracking dashboard with private portfolio access, year-over-year comparisons, and visualizations.

## Features

- 🏠 Home page with summary dashboard
- 📊 Interactive table view with color-coded performance
- 📈 Chart view with historical data
- 💰 Key statistics dashboard
- 💾 Private data accounts (multi-tenant)
- 🎨 Professional dark theme
- 📱 Fully responsive design
- 🍔 Hamburger navigation menu

## Pages

1. **index.html** - Main dashboard and portfolio overview
2. **tracker.html** - Detailed monthly dividend tracker

## Deploy to Vercel (Easy Steps)

### Option 1: Deploy via GitHub (Recommended)

1. **Create a new GitHub repository**
   - Go to https://github.com/new
   - Name your repository (e.g., "dividend-tracker")
   - Click "Create repository"

2. **Upload your files to GitHub**
   - Extract the zip file you downloaded
   - Drag and drop ALL files (`index.html`, `tracker.html`, `vercel.json`, `README.md`, `api/`) into your GitHub repository
   - Click "Commit changes"

3. **Deploy to Vercel**
   - Go to https://vercel.com
   - Sign in (or sign up - it's free)
   - Click "Add New Project"
   - Import your GitHub repository
   - Click "Deploy"
   - Done! Your site will be live in seconds

### Option 2: Direct Vercel Deploy

1. Go to https://vercel.com
2. Sign in or create a free account
3. Click "Add New Project"
4. Drag and drop the entire folder
5. Your site is live!

## Account Management

The application uses an "Account Name" system to keep your portfolios private. Simply go to the menu and select "Switch Account / Portfolio" to enter a unique name. Your data will be isolated to that specific name.

## Data Management

The application uses a Vercel Postgres database to store your data, making it available across all your devices.

## Backend and Database

This project uses a Node.js backend with a Vercel Postgres database.

### Setting up the Database

1.  **Create a Vercel Postgres Database:**
    *   Go to your Vercel dashboard.
    *   Navigate to the "Storage" tab.
    *   Create a new Postgres database.

2.  **Connect the Database to Your Project:**
    *   In your Vercel project settings, go to "Storage" and connect the newly created Postgres database.

3.  **Set Environment Variables:**
    *   Vercel will automatically set the necessary environment variables for you when you connect the database. These include `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, and `POSTGRES_DATABASE`. The application will use these to connect to the database.

## Privacy Note

Data is segregated by account name. While this provides privacy for multiple users, it does not use encryption for your portfolio data.

## License

Free to use for personal projects.
