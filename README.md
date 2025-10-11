# Dividend Income Tracker

A professional dividend income tracking dashboard with password-protected access, year-over-year comparisons, and visualizations.

## Features

- 🏠 Public landing page
- 🔒 Password-protected tracker (password: `andydividends`)
- 📊 Interactive table view with color-coded performance
- 📈 Chart view with historical data
- 💰 Key statistics dashboard
- 🎨 Professional dark theme
- 📱 Fully responsive design
- 🍔 Hamburger navigation menu

## Pages

1. **index.html** - Public landing page
2. **tracker.html** - Password-protected dividend tracker (password: `andydividends`)

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

## Password

The tracker is protected with the password: **andydividends**

You can change this by editing `index.html` and finding the line:
```javascript
if (password === 'andydividends') {
```

## Customizing Your Data

To update the dividend data, edit the `tracker.html` file and find the `data` object. Update the values with your own dividend income.

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
