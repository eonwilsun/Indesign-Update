# GitHub Pages Deployment Guide

## Quick Setup (5 minutes)

### Option 1: Using GitHub Web Interface

1. **Create a new repository on GitHub:**
   - Go to https://github.com/new
   - Name it something like `indesign-update-tool`
   - Make it public
   - Don't initialize with README (we have our own)

2. **Upload files:**
   - Click "uploading an existing file"
   - Drag all files from your IndesignUpdate folder
   - Commit with message "Initial upload"

3. **Enable GitHub Pages:**
   - Go to repository Settings
   - Scroll to "Pages" section
   - Source: "Deploy from a branch"
   - Branch: "main"
   - Folder: "/ (root)"
   - Click Save

4. **Access your site:**
   - Your site will be at: `https://yourusername.github.io/indesign-update-tool`
   - It may take a few minutes to become available

### Option 2: Using Git Command Line

1. **Open PowerShell in your project folder:**
   ```powershell
   cd "C:\Users\FiercePC\Desktop\IndesignUpdate"
   ```

2. **Run the setup script:**
   ```powershell
   .\setup-github.bat
   ```
   
   Or manually:
   ```powershell
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/yourusername/repositoryname.git
   git push -u origin main
   ```

3. **Enable GitHub Pages in repository settings**

## Testing Your Deployment

1. **Test libraries:** Visit `https://yourusername.github.io/repositoryname/test.html`
2. **Use the app:** Visit `https://yourusername.github.io/repositoryname`

## File Structure on GitHub

```
your-repo/
├── index.html          # Main application
├── styles.css          # Styling
├── test.html           # Library test page
├── README.md           # Documentation
├── _config.yml         # GitHub Pages config
├── setup-github.bat    # Setup script
└── js/
    ├── app.js          # Main app logic
    ├── pdf-processor.js # PDF handling
    └── idml-processor.js # IDML handling
```

## Troubleshooting

### Libraries not loading:
- Check browser console for errors
- Ensure internet connection for CDN resources
- Try the test.html page first

### GitHub Pages not updating:
- Check the Actions tab for build status
- Changes can take 1-10 minutes to deploy
- Clear browser cache

### File upload not working:
- Ensure you're using HTTPS (required for file APIs)
- Check browser permissions
- Try a different browser

## Custom Domain (Optional)

1. Buy a domain (e.g., from Namecheap, GoDaddy)
2. Add a CNAME file to your repository with your domain
3. Configure DNS settings at your domain provider
4. Enable HTTPS in GitHub Pages settings

## Security Notes

- All processing happens client-side
- Files never leave the user's browser
- No server-side storage or processing
- Perfect for sensitive documents

## Updates

To update your deployed app:
1. Make changes to local files
2. Commit and push to GitHub
3. GitHub Pages will automatically redeploy

## Support

- GitHub Pages documentation: https://pages.github.com/
- Repository issues for app-specific problems
- Browser compatibility: Chrome 80+, Firefox 75+, Safari 13+