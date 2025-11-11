# InDesign Update Tool

A web-based application for replacing words in PDF and IDML (InDesign) files. This tool allows users to upload documents, specify word replacements, and download modified files while preserving original formatting and layout.

## Features

- **PDF Processing**: Extract text from PDFs and replace specific words while maintaining layout
- **IDML Processing**: Parse InDesign IDML files and perform text replacements that preserve all design elements
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

Example CSV:

```
current,replace
Hello,Bonjour
World,Monde
```

Notes:
- Replacements are applied in the order they appear in the CSV (top-to-bottom) when processing IDML files. For each CSV row the tool will replace the first matching occurrence in the document and then move on to the next row.
- Use the "Whole words only" option to avoid partial matches.
- The app performs all processing client-side (files are not uploaded to any server).

## Usage

1. **Upload File**: Drag and drop or browse for a PDF or IDML file
2. **Add Replacements**: Enter words to find and their replacements
3. **Configure Options**: Choose case sensitivity and whole word matching
4. **Process**: Click the process button to perform replacements
5. **Download**: Download the modified file

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
│   └── idml-processor.js   # IDML processing functionality
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

### Translate Mode:
- This is glossary-based (no external translation API). It won't translate arbitrary sentences beyond entries provided in your glossary
- For live machine translation (e.g., Azure, DeepL), you need a server-side proxy to protect API keys. A static GitHub Pages site cannot safely store secrets

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

- All processing happens client-side in the browser
- Files are never uploaded to any server
- No data is stored or transmitted

For machine translation via cloud APIs, use a server-side proxy (e.g., serverless function) to keep API keys secret; direct browser calls from a static site will expose keys.

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