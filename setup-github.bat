@echo off
echo InDesign Update Tool - GitHub Setup
echo =====================================
echo.
echo This script will help you set up your project for GitHub Pages.
echo Make sure you have Git installed and have created a repository on GitHub.
echo.
pause
echo.
echo Initializing Git repository...
git init
echo.
echo Adding all files...
git add .
echo.
echo Creating initial commit...
git commit -m "Initial commit: InDesign Update Tool with PDF and IDML support"
echo.
echo Setting main branch...
git branch -M main
echo.
echo Please enter your GitHub repository URL (e.g., https://github.com/username/repo.git):
set /p repourl="Repository URL: "
echo.
echo Adding remote origin...
git remote add origin %repourl%
echo.
echo Pushing to GitHub...
git push -u origin main
echo.
echo =====================================
echo Setup complete! 
echo.
echo Next steps:
echo 1. Go to your GitHub repository
echo 2. Click on Settings
echo 3. Scroll down to Pages section
echo 4. Select "Deploy from a branch"
echo 5. Choose "main" branch
echo 6. Your site will be available at: https://username.github.io/repositoryname
echo.
pause