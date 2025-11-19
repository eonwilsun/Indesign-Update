# InDesign Update Tool

A web-based application for replacing words in PDF and IDML (InDesign) files. This tool allows users to upload documents, specify word replacements, and download modified files while preserving original formatting and layout.

## Features

- **PDF Processing**: Extract text from PDFs and replace specific words while maintaining layout
- **IDML Processing**: Parse InDesign IDML files and perform text replacements that preserve all design elements
- **Translation**: Translate IDML text content using MyMemory (free), DeepL, or Google Cloud Translation APIs
- **Multiple Replacements**: Add multiple find/replace pairs in a single operation
- **CSV-driven Replacements**: Upload a CSV with source and replacement columns, or enter manual find/replace pairs
- **Case Sensitivity**: Option to perform case-sensitive or case-insensitive replacements
- **Whole Words**: Option to replace only whole words or partial matches
- **Client-Side Processing**: All processing happens in the browser - files never leave your computer
- **Responsive Design**: Works on desktop and mobile devices

## How It Works

### For PDF Files:
1. Uses PDF.js to extract text content and positions
2. Performs word replacements while tracking text locations
3. Uses pdf-lib to overlay new text and cover original text
4. Generates a new PDF with replacements

### For IDML Files:
1. Parses the IDML ZIP archive structure
2. Extracts and processes story XML files containing text content
3. Performs XML-safe text replacements in content tags
4. Reconstructs the IDML file with modifications
5. Maintains all InDesign formatting, styles, and layout elements

### CSV Replacements
This project supports simple CSV-driven find/replace operations.

- Upload a CSV with the header columns `current,replace` (case-insensitive). Each row's `current` value will be searched for in the document and replaced with the `replace` value.
- Alternatively, add manual find/replace pairs in the UI when you don't want to upload a CSV.

Example CSV (two columns only - source and replacement):

```
source,replacement
Hello,Bonjour
World,Monde
```

Notes:
- Replacements are applied in the order they appear in the CSV (top-to-bottom) when processing IDML files. For each CSV row the tool will replace the first matching occurrence in the document and then move on to the next row.
- Use the "Whole words only" option to avoid partial matches.
- The app performs all processing client-side (files are not uploaded to any server).

## Usage

### Find & Replace Mode
1. **Upload File**: Drag and drop or browse for a PDF or IDML file
2. **Add Replacements**: Enter words to find and their replacements
3. **Configure Options**: Choose case sensitivity and whole word matching
4. **Process**: Click the process button to perform replacements
5. **Download**: Download the modified file

### Translation Mode
1. **Upload IDML**: Load an InDesign IDML file
2. **Select Provider**:
   - **MyMemory** (default): Free, no API key required, 500 requests/day/IP
   - **DeepL**: Requires free API key, 500k characters/month free tier
   - **Google Cloud Translation**: Requires API key (paid service)
3. **Choose Languages**: Select source and target languages
4. **Add API Key** (if using DeepL or Google): Enter your API key - it's stored in memory only, never saved
5. **Translate**: Click the "Translate IDML" button
6. **Download**: Get your translated IDML file

#### Getting API Keys
- **DeepL Free API**: Sign up at [https://www.deepl.com/pro-api](https://www.deepl.com/pro-api) - 500k characters/month free
- **Google Cloud Translation**: Create project at [https://cloud.google.com/translate](https://cloud.google.com/translate) and enable the Translation API

#### Translation Security & Privacy
- ✅ API keys are **never stored** in files or browser storage
- ✅ Keys are held **in-memory only** during your session
- ✅ Keys are **never committed** to the git repository
- ⚠️ Your text content is sent to third-party translation services
- ⚠️ Review your provider's privacy policy before translating sensitive content
- 💡 For highest security, use a server-side proxy instead of client-side API calls

## Deployment to GitHub Pages

### Method 1: Direct Upload
1. Create a new repository on GitHub
2. Upload all files to the repository
3. Go to Settings → Pages
4. Select "Deploy from a branch" and choose "main"
5. Your app will be available at `https://yourusername.github.io/repositoryname`

### Method 2: GitHub Desktop
1. Clone your repository locally
2. Copy all the project files to the repository folder
3. Commit and push the changes
4. Enable GitHub Pages in repository settings

### Method 3: Command Line
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/yourusername/repositoryname.git
git push -u origin main
```

## File Structure

```
IndesignUpdate/
├── index.html              # Main HTML file
├── styles.css              # CSS styling
├── js/
│   ├── app.js              # Main application logic
│   ├── pdf-processor.js    # PDF processing functionality
│   ├── idml-processor.js   # IDML processing functionality
│   └── translator.js       # Translation API integration
├── .env.example            # Example API key configuration (DO NOT COMMIT .env)
└── README.md               # This file
```

## Dependencies

All dependencies are loaded via CDN:
- **pdf-lib**: For PDF creation and modification
- **PDF.js**: For PDF text extraction
- **JSZip**: For IDML (ZIP) file manipulation
- **Font Awesome**: For icons

## Browser Compatibility

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Limitations

### PDF Processing:
- Text replacement overlays new text on original (not true in-place editing)
- Complex layouts may require manual adjustment
- Best results with simple, text-based PDFs

### IDML Processing:
- Requires valid IDML files exported from InDesign
- Some advanced InDesign features may not round-trip perfectly
- Binary .indd files are not supported (use IDML export)

### Translation:
- Requires valid IDML files (PDF translation not currently supported)
- Uses external APIs - data is transmitted to third-party services
- API keys are never saved or committed to the repository
- Rate-limited to prevent quota exhaustion (200ms between requests)
- Best for simple text - complex formatting may need manual review

## Technical Details

### PDF Text Replacement Process:
1. Extract text items with coordinates using PDF.js
2. Group text items into logical lines
3. Search for target words within text content
4. Cover original text with white rectangles
5. Draw replacement text at calculated positions

### IDML Text Replacement Process:
1. Extract IDML as ZIP archive
2. Parse story XML files containing text content
3. Locate `<Content>` tags within character style ranges
4. Perform safe XML text replacement
5. Rebuild IDML archive with modified content

## Security

### Find & Replace Processing
- All processing happens client-side in the browser
- Files are never uploaded to any server
- No data is stored or transmitted

### Translation Feature Security
- **API Keys**: You provide your own API keys via the UI - they're stored in memory only during your session
- **No Storage**: Keys are never saved to browser storage, localStorage, or files
- **No Repository Exposure**: Keys are never committed to git (checked via .gitignore)
- **Third-Party Data**: When translating, your text content is sent to the selected translation API provider
- **Client-Side Calls**: API requests go directly from your browser to the provider (no backend proxy)
- **Privacy Review**: Always review the privacy policy of your chosen translation provider
- **Recommendation**: For production use with sensitive content, implement a server-side proxy to mediate API calls and store keys in environment variables instead of user input

## Contributing

This is a static web application designed for GitHub Pages. To contribute:

1. Fork the repository
2. Make your changes
3. Test thoroughly with various PDF and IDML files
4. Submit a pull request

## License

MIT License - feel free to use, modify, and distribute.

## Troubleshooting

**PDF not processing correctly:**
- Ensure the PDF contains selectable text (not scanned images)
- Try with simpler PDF layouts first
- Check browser console for error messages

**IDML not loading:**
- Verify the file is a valid IDML export from InDesign
- Ensure the file extension is .idml
- Binary .indd files are not supported

**Replacements not working:**
- Check spelling of find/replace terms
- Try disabling "whole words only" option
- Verify case sensitivity settings

**Download not working:**
- Ensure your browser allows file downloads
- Check for popup blockers
- Try a different browser

## Support

For issues and questions, please check the GitHub repository issues page.