// Main Application JavaScript
class InDesignUpdateApp {
    constructor() {
        this.currentFile = null;
        this.fileType = null;
        this.pdfProcessor = new PDFProcessor();
        this.idmlProcessor = new IDMLProcessor();
        this.translator = new Translator();
        this.pairCounter = 1;
        this.mode = 'replace'; // 'replace' | 'translate'
        
        this.initializeEventListeners();
        this.setupDragAndDrop();
    }

    initializeEventListeners() {
        // File input
        document.getElementById('fileInput').addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFileSelection(e.target.files[0]);
            }
        });

        // Remove file button
        document.getElementById('removeFileBtn').addEventListener('click', () => {
            this.removeFile();
        });

        // Add replacement pair button
        document.getElementById('addPairBtn').addEventListener('click', () => {
            this.addReplacementPair();
        });

        // Mode toggle
        document.getElementById('modeToggle').addEventListener('change', (e) => {
            if (e.target && e.target.name === 'mode') {
                this.setMode(e.target.value);
            }
        });

        // Glossary upload
        const glossaryInput = document.getElementById('glossaryFile');
        if (glossaryInput) {
            glossaryInput.addEventListener('change', async (e) => {
                if (e.target.files && e.target.files[0]) {
                    try {
                        const srcLang = document.getElementById('srcLang').value || 'auto';
                        const langs = await this.translator.loadGlossary(e.target.files[0], srcLang);
                        this._updateGlossaryStatus(`Loaded glossary. Detected language columns: ${langs.join(', ')}`);
                    } catch (err) {
                        this.showError('Failed to load glossary: ' + err.message);
                        e.target.value = '';
                        this._updateGlossaryStatus('Glossary load failed.');
                    }
                }
            });
        }

        // (Removed JSON paste option; CSV upload only now.)

        // Process button
        document.getElementById('processBtn').addEventListener('click', () => {
            this.processFile();
        });

    // Preview glossary
    const previewBtn = document.getElementById('previewGlossaryBtn');
    if (previewBtn) previewBtn.addEventListener('click', () => this.previewGlossary());

    // Export text for glossary
    const exportBtn = document.getElementById('exportTextBtn');
    if (exportBtn) exportBtn.addEventListener('click', () => this.exportTextForGlossary());

    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) themeToggle.addEventListener('click', () => this.toggleTheme());
    // (UI handlers above already wired once)

        // Download button
        document.getElementById('downloadBtn').addEventListener('click', () => {
            this.downloadFile();
        });

        // Restart button
        document.getElementById('restartBtn').addEventListener('click', () => {
            this.restart();
        });

        // Input validation for first pair
        this.setupInputValidation();
    }

    setupDragAndDrop() {
        const uploadArea = document.getElementById('fileUploadArea');
        
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileSelection(files[0]);
            }
        });

        uploadArea.addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });
    }

    async handleFileSelection(file) {
        try {
            // Validate file type
            const fileName = file.name.toLowerCase();
            if (!fileName.endsWith('.pdf') && !fileName.endsWith('.idml')) {
                throw new Error('Please select a PDF or IDML file.');
            }

            this.currentFile = file;
            this.fileType = fileName.endsWith('.pdf') ? 'pdf' : 'idml';

            // Update UI
            this.showFileInfo(file);
            this.showReplacementSection();

            // Load file for processing
            this.showLoading('Loading file...');
            
            if (this.fileType === 'pdf') {
                await this.pdfProcessor.loadPDF(file);
            } else {
                await this.idmlProcessor.loadIDML(file);
                
                // Get IDML info for user feedback
                const idmlInfo = await this.idmlProcessor.getIDMLInfo();
                if (!idmlInfo.isValid) {
                    console.warn('IDML validation warning:', idmlInfo.error);
                }
            }

            this.hideLoading();
            this.showSuccess(`${this.fileType.toUpperCase()} file loaded successfully!`);
            // Show export button and preview button
            const exportBtn = document.getElementById('exportTextBtn');
            const previewBtn = document.getElementById('previewGlossaryBtn');
            if (exportBtn) exportBtn.style.display = 'inline-block';
            if (previewBtn && this.mode === 'translate') previewBtn.style.display = 'inline-block';

        } catch (error) {
            this.hideLoading();
            this.showError(error.message);
            this.removeFile();
        }
    }

    showFileInfo(file) {
        const fileName = document.getElementById('fileName');
        const fileSize = document.getElementById('fileSize');
        const fileInfo = document.getElementById('fileInfo');
        const uploadArea = document.getElementById('fileUploadArea');

        fileName.textContent = file.name;
        fileSize.textContent = this.formatFileSize(file.size);
        
        uploadArea.style.display = 'none';
        fileInfo.style.display = 'flex';
        fileInfo.classList.add('fade-in');
    }

    removeFile() {
        this.currentFile = null;
        this.fileType = null;
        
        // Reset UI
        document.getElementById('fileUploadArea').style.display = 'block';
        document.getElementById('fileInfo').style.display = 'none';
        document.getElementById('replacementSection').style.display = 'none';
        document.getElementById('progressSection').style.display = 'none';
        document.getElementById('downloadSection').style.display = 'none';
        
        // Reset file input
        document.getElementById('fileInput').value = '';
    }

    showReplacementSection() {
        const section = document.getElementById('replacementSection');
        section.style.display = 'block';
        section.classList.add('slide-in');
        
        // Focus on first input
        document.getElementById('findWord1').focus();
    }

    addReplacementPair() {
        this.pairCounter++;
        const pairsContainer = document.getElementById('replacementPairs');
        
        const pairDiv = document.createElement('div');
        pairDiv.className = 'replacement-pair';
        pairDiv.innerHTML = `
            <div class="input-group">
                <label for="findWord${this.pairCounter}">Find Word:</label>
                <input type="text" id="findWord${this.pairCounter}" placeholder="Enter word to replace">
            </div>
            <div class="input-group">
                <label for="replaceWord${this.pairCounter}">Replace With:</label>
                <input type="text" id="replaceWord${this.pairCounter}" placeholder="Enter replacement word">
            </div>
            <button class="remove-pair-btn" onclick="app.removePair(this)">
                <i class="fas fa-trash"></i>
            </button>
        `;
        
        pairsContainer.appendChild(pairDiv);
        pairDiv.classList.add('slide-in');
        
        // Update remove button visibility
        this.updateRemoveButtons();
        
        // Focus on new input
        document.getElementById(`findWord${this.pairCounter}`).focus();
    }

    removePair(button) {
        const pair = button.closest('.replacement-pair');
        pair.remove();
        this.updateRemoveButtons();
    }

    updateRemoveButtons() {
        const pairs = document.querySelectorAll('.replacement-pair');
        pairs.forEach((pair, index) => {
            const removeBtn = pair.querySelector('.remove-pair-btn');
            removeBtn.style.display = pairs.length > 1 ? 'block' : 'none';
        });
    }

    setupInputValidation() {
        const processBtn = document.getElementById('processBtn');
        
        const validateInputs = () => {
            if (this.mode === 'replace') {
                const pairs = document.querySelectorAll('.replacement-pair');
                let hasValidPair = false;
                pairs.forEach(pair => {
                    const findInput = pair.querySelector('input[id^="findWord"]');
                    const replaceInput = pair.querySelector('input[id^="replaceWord"]');
                    if (findInput.value.trim() && replaceInput.value.trim()) {
                        hasValidPair = true;
                    }
                });
                processBtn.disabled = !hasValidPair || !this.currentFile;
            } else {
                const tgt = document.getElementById('tgtLang').value;
                const glossaryReady = !!this.translator.glossary;
                processBtn.disabled = !this.currentFile || !tgt || !glossaryReady || !this._glossaryHasLang(tgt);
            }
        };

        // Add input listeners to all current and future inputs
        document.addEventListener('input', (e) => {
            if (e.target.matches('input[id^="findWord"], input[id^="replaceWord"]')) {
                validateInputs();
            }
            if (e.target.matches('#tgtLang, #srcLang')) {
                validateInputs();
            }
        });

        // Initial validation
        validateInputs();
    }

    _glossaryHasLang(lang) {
        if (!this.translator.glossary) return false;
        return Object.values(this.translator.glossary).some(entry => entry[lang]);
    }

    _updateGlossaryStatus(message) {
        const el = document.getElementById('glossaryStatus');
        if (!el) return;
        el.textContent = message;
    }

    setMode(mode) {
        this.mode = mode;
        const isTranslate = mode === 'translate';
        document.getElementById('replacementPairs').style.display = isTranslate ? 'none' : 'block';
        document.getElementById('addPairBtn').style.display = isTranslate ? 'none' : 'inline-block';
        const pane = document.getElementById('translatePane');
        if (pane) pane.style.display = isTranslate ? 'block' : 'none';
        this.setupInputValidation();
    }

    async processFile() {
        try {
            if (!this.currentFile) {
                throw new Error('No file selected');
            }

            // Build replacements: either manual pairs or from glossary (translate mode)
            let replacements;
            if (this.mode === 'replace') {
                replacements = this.getReplacementPairs();
                if (replacements.length === 0) {
                    throw new Error('Please add at least one replacement pair');
                }
            } else {
                const tgt = document.getElementById('tgtLang').value;
                const src = document.getElementById('srcLang').value || 'auto';
                if (!tgt) throw new Error('Select a target language');
                if (!this.translator.glossary) throw new Error('Load a glossary file');
                replacements = this.translator.buildReplacementsFor(tgt, src);
                if (!replacements.length) throw new Error('No entries for the selected target language in the glossary');
            }

            // Get options
            const options = {
                caseSensitive: document.getElementById('caseSensitive').checked,
                wholeWords: document.getElementById('wholeWords').checked
            };

            // Show progress
            this.showProgress();
            this.updateProgress(10, 'Starting processing...');

            let result;
            if (this.fileType === 'pdf') {
                this.updateProgress(30, 'Processing PDF...');
                result = await this.pdfProcessor.processReplacements(replacements, options);
            } else {
                this.updateProgress(30, 'Processing IDML...');
                result = await this.idmlProcessor.processReplacements(replacements, options);
            }

            this.updateProgress(90, 'Finalizing...');

            if (result.success) {
                // Store result for download
                this.processedFile = result;
                this.updateProgress(100, 'Complete!');
                
                setTimeout(() => {
                    this.showDownloadSection(result);
                    // render replacement details
                    this.renderReplacementDetails(result.replacementLog || []);
                }, 500);
            } else {
                throw new Error('Processing failed');
            }

        } catch (error) {
            this.hideProgress();
            this.showError(error.message);
        }
    }

    getReplacementPairs() {
        const pairs = [];
        const replacementPairs = document.querySelectorAll('.replacement-pair');
        
        replacementPairs.forEach(pair => {
            const findInput = pair.querySelector('input[id^="findWord"]');
            const replaceInput = pair.querySelector('input[id^="replaceWord"]');
            
            const find = findInput.value.trim();
            const replace = replaceInput.value.trim();
            
            if (find && replace) {
                pairs.push({ find, replace });
            }
        });
        
        return pairs;
    }

    showProgress() {
        document.getElementById('replacementSection').style.display = 'none';
        document.getElementById('progressSection').style.display = 'block';
        document.getElementById('progressSection').classList.add('fade-in');
    }

    updateProgress(percentage, text) {
        document.getElementById('progressFill').style.width = percentage + '%';
        document.getElementById('progressText').textContent = text;
    }

    hideProgress() {
        document.getElementById('progressSection').style.display = 'none';
    }

    showDownloadSection(result) {
        document.getElementById('progressSection').style.display = 'none';
        document.getElementById('downloadSection').style.display = 'block';
        document.getElementById('downloadSection').classList.add('slide-in');
        
        // Update summary
        const summary = document.getElementById('replacementSummary');
        summary.textContent = `${result.totalReplacements} replacement(s) made successfully`;
    }

    async downloadFile() {
        try {
            if (!this.processedFile) {
                throw new Error('No processed file available');
            }

            let blob;
            let filename;
            
            if (this.fileType === 'pdf') {
                blob = await this.pdfProcessor.createDownloadableBlob(this.processedFile.modifiedPdfBytes);
                filename = this.currentFile.name.replace('.pdf', '_modified.pdf');
            } else {
                blob = await this.idmlProcessor.createDownloadableBlob(this.processedFile.modifiedIdmlBytes);
                filename = this.currentFile.name.replace('.idml', '_modified.idml');
            }

            // Create download link
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.showSuccess('File downloaded successfully!');

        } catch (error) {
            this.showError('Download failed: ' + error.message);
        }
    }

    restart() {
        this.removeFile();
        this.processedFile = null;
        
        // Reset replacement pairs to just one
        const pairsContainer = document.getElementById('replacementPairs');
        pairsContainer.innerHTML = `
            <div class="replacement-pair">
                <div class="input-group">
                    <label for="findWord1">Find Word:</label>
                    <input type="text" id="findWord1" placeholder="Enter word to replace">
                </div>
                <div class="input-group">
                    <label for="replaceWord1">Replace With:</label>
                    <input type="text" id="replaceWord1" placeholder="Enter replacement word">
                </div>
                <button class="remove-pair-btn" onclick="app.removePair(this)" style="display: none;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        this.pairCounter = 1;
        
        // Reset checkboxes
        document.getElementById('caseSensitive').checked = false;
        document.getElementById('wholeWords').checked = false;
        
        // Re-setup validation
        this.setupInputValidation();
    }

    // Utility methods
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showLoading(message = 'Loading...') {
        const overlay = document.getElementById('loadingOverlay');
        overlay.style.display = 'flex';
        // You could add the message display here if needed
    }

    hideLoading() {
        document.getElementById('loadingOverlay').style.display = 'none';
    }

    showSuccess(message) {
        // Simple success notification - you could enhance this
        console.log('Success:', message);
        // You could add a toast notification system here
    }

    showError(message) {
        // Simple error notification - you could enhance this
        console.error('Error:', message);
        alert('Error: ' + message);
    }
}

// Initialize the application when the page loads
let app;
document.addEventListener('DOMContentLoaded', () => {
    // Wait for external libraries to load
    const checkLibraries = () => {
        if (typeof PDFLib !== 'undefined' && 
            typeof pdfjsLib !== 'undefined' && 
            typeof JSZip !== 'undefined') {
            app = new InDesignUpdateApp();
        } else {
            setTimeout(checkLibraries, 100);
        }
    };
    
    checkLibraries();
});

// Make app globally available for button onclick handlers
window.app = app;