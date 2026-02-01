# Dividend Income Tracker

A professional dividend income tracking dashboard with password-protected access, year-over-year comparisons, and visualizations.

## Features

- 🏠 Public landing page
- 🔒 Password-protected tracker
- 📊 Interactive table view with color-coded performance
- 📈 Chart view with historical data
- 💰 Key statistics dashboard
- 💾 Data is now available across devices
- 🎨 Professional dark theme
- 📱 Fully responsive design
- 🍔 Hamburger navigation menu

## Pages

1. **index.html** - Public landing page
2. **tracker.html** - Password-protected dividend tracker

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

## Setup Your Password

To set your own password, edit `index.html` and find this line:
```javascript
const correctPassword = 'YOUR_PASSWORD_HERE';
```
Replace `'YOUR_PASSWORD_HERE'` with your desired password.

## Data Management

The application now uses a Vercel Postgres database to store your data, making it available across all your devices.

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

## Security Note

This uses client-side password protection, which is suitable for basic privacy but not for sensitive data. For production use with sensitive information, implement server-side authentication.

## License

Free to use for personal projects.
