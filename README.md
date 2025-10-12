# Dividend Income Tracker

A professional dividend income tracking dashboard with password-protected access, year-over-year comparisons, and visualizations.

## Features

- 🏠 Public landing page
- 🔒 Password-protected tracker
- 📊 Interactive table view with color-coded performance
- 📈 Chart view with historical data
- 💰 Key statistics dashboard
- 📥 Download your data as JSON (backup your data)
- 📤 Import your data from JSON (restore or transfer data)
- 🎨 Professional dark theme
- 📱 Fully responsive design
- 🍔 Hamburger navigation menu
- 💾 Data isolated per user (localStorage)

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
   - Drag and drop ALL files (`index.html`, `tracker.html`, `vercel.json`, `README.md`) into your GitHub repository
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

## Customizing Your Data

To update the dividend data, edit the `tracker.html` file and find the `data` object. Update the values with your own dividend income.

## Data Management

### Backup Your Data
Click the **📥 Download** button to export your data as a JSON file. This creates a backup that you can save anywhere.

### Import/Restore Data
Click the **📤 Import** button to restore data from a previously downloaded JSON file. This allows you to:
- Restore from a backup
- Transfer data between browsers
- Share data between devices

### Data Isolation
Each user's data is stored in their browser's localStorage with unique keys:
- **Public page** (`index.html`): Uses `dividendTrackerData` key
- **Private tracker** (`tracker.html`): Uses `dividendTrackerDataPersonal` key

This means each page maintains separate data, and data is isolated per browser/device.

## Color Coding

- 🟡 **Gold/Amber**: Best month of the year
- 🟢 **Green**: Better than same month last year
- 🔴 **Red**: Worse than same month last year
- ⚪ **Gray**: Neutral (first year or no comparison)

## Navigation

Use the hamburger menu (☰) in the top right to navigate between:
- Home (public landing page)
- My Tracker (password-protected)

## Tech Stack

- HTML5
- Tailwind CSS (via CDN)
- Chart.js (via CDN)
- Vanilla JavaScript

## Security Note

This uses client-side password protection, which is suitable for basic privacy but not for sensitive data. For production use with sensitive information, implement server-side authentication.

## License

Free to use for personal projects.
