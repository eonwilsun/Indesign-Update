// Main Application JavaScript
class InDesignUpdateApp {
    constructor() {
        this.currentFile = null;
        this.fileType = null;
        this.pdfProcessor = new PDFProcessor();
        this.idmlProcessor = new IDMLProcessor();
        this.parsedCsvRows = null; // temporary parsed CSV preview buffer (awaiting user accept)
        this.pairCounter = 1;
        this.mode = 'replace';
        
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

        // Mode toggle removed — CSV/manual replace is the single supported workflow now.

    // Glossary / CSV upload: accept CSV with headers `current,replace` for direct replacements
        const glossaryInput = document.getElementById('glossaryFile');
        if (glossaryInput) {
            glossaryInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    const file = e.target.files[0];
                    // Parse with Papa to inspect header quickly
                    Papa.parse(file, {
                        header: true,
                        skipEmptyLines: true,
                        complete: async (parsed) => {
                            try {
                                const header = (parsed.meta.fields || []).map(h => (h||'').trim().toLowerCase());
                                const rows = parsed.data || [];
                                // If header contains current & replace, build csvReplacements
                                if (header.includes('current') && header.includes('replace')) {
                                    // Store parsed rows for preview; require explicit Accept
                                    const curKey = parsed.meta.fields.find(h => (h||'').trim().toLowerCase() === 'current');
                                    const repKey = parsed.meta.fields.find(h => (h||'').trim().toLowerCase() === 'replace');
                                    this.parsedCsvRows = rows.map(r => ({ find: (r[curKey]||'').toString(), replace: (r[repKey]||'').toString() })).filter(p => p.find && p.replace);
                                    this._updateGlossaryStatus(`Parsed CSV: ${this.parsedCsvRows.length} pairs — preview and click Accept to use`);
                                    // Show preview and accept/reject buttons
                                    const previewBtn = document.getElementById('previewGlossaryBtn');
                                    const acceptBtn = document.getElementById('acceptCsvBtn');
                                    const rejectBtn = document.getElementById('rejectCsvBtn');
                                    if (previewBtn) previewBtn.style.display = 'inline-block';
                                    if (acceptBtn) acceptBtn.style.display = 'inline-block';
                                    if (rejectBtn) rejectBtn.style.display = 'inline-block';
                                } else {
                                    // We only accept CSVs with 'current' and 'replace' headers for direct replacements.
                                    this.parsedCsvRows = null;
                                    e.target.value = '';
                                    this._updateGlossaryStatus('CSV must include header columns: current, replace');
                                    this.showError('CSV must include header columns: current, replace');
                                }
                            } catch (err) {
                                this.showError('Failed to parse CSV: ' + err.message);
                                e.target.value = '';
                                this._updateGlossaryStatus('CSV parse failed.');
                            }
                        }
                    });
                }
            });
        }

        // (Removed JSON paste option; CSV upload only now.)

        // Process button (default: first-match-per-row behavior)
        document.getElementById('processBtn').addEventListener('click', () => {
            this.processFile(false);
        });

        // Replace All button - replaces all matches across the file
        const replaceAllBtn = document.getElementById('replaceAllBtn');
        if (replaceAllBtn) replaceAllBtn.addEventListener('click', () => {
            this.processFile(true);
        });

    // Preview glossary / CSV
    const previewBtn = document.getElementById('previewGlossaryBtn');
    if (previewBtn) previewBtn.addEventListener('click', () => this.previewGlossary());

    const acceptBtn = document.getElementById('acceptCsvBtn');
    if (acceptBtn) acceptBtn.addEventListener('click', () => {
        if (Array.isArray(this.parsedCsvRows) && this.parsedCsvRows.length) {
            this.csvReplacements = this.parsedCsvRows;
            this.parsedCsvRows = null;
            this._updateGlossaryStatus(`Accepted CSV replacements: ${this.csvReplacements.length} pairs`);
            // hide accept/reject
            const accept = document.getElementById('acceptCsvBtn');
            const reject = document.getElementById('rejectCsvBtn');
            if (accept) accept.style.display = 'none';
            if (reject) reject.style.display = 'none';
            // Update Process button state now that CSV is accepted
            if (typeof this.updateProcessButtonState === 'function') this.updateProcessButtonState();
        }
    });

    const rejectBtn = document.getElementById('rejectCsvBtn');
    if (rejectBtn) rejectBtn.addEventListener('click', () => {
        // clear parsed CSV and reset input
        this.parsedCsvRows = null;
        const glossaryInput = document.getElementById('glossaryFile');
        if (glossaryInput) glossaryInput.value = '';
        this._updateGlossaryStatus('CSV rejected. Upload another CSV if needed.');
        const accept = document.getElementById('acceptCsvBtn');
        const reject = document.getElementById('rejectCsvBtn');
        if (accept) accept.style.display = 'none';
        if (reject) reject.style.display = 'none';
        const preview = document.getElementById('glossaryPreview');
        if (preview) preview.style.display = 'none';
        // Update Process button state after rejection
        if (typeof this.updateProcessButtonState === 'function') this.updateProcessButtonState();
    });

    // Export text for glossary
    const exportBtn = document.getElementById('exportTextBtn');
    if (exportBtn) exportBtn.addEventListener('click', () => this.exportTextForGlossary());
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
            if (previewBtn) previewBtn.style.display = 'inline-block';
            // Update Process button state now that a file is loaded
            if (typeof this.updateProcessButtonState === 'function') this.updateProcessButtonState();

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

        // Centralized state check used across the app
        this.updateProcessButtonState = () => {
            const csvReady = Array.isArray(this.csvReplacements) && this.csvReplacements.length > 0;
            // Also allow manual replacement pairs
            let hasManualPair = false;
            const pairs = document.querySelectorAll('.replacement-pair');
            pairs.forEach(pair => {
                const findInput = pair.querySelector('input[id^="findWord"]');
                const replaceInput = pair.querySelector('input[id^="replaceWord"]');
                if (findInput && replaceInput && findInput.value.trim() && replaceInput.value.trim()) hasManualPair = true;
            });

            processBtn.disabled = !this.currentFile || !(csvReady || hasManualPair);
        };

        // Add input listeners to update button state dynamically
        document.addEventListener('input', (e) => {
            if (e.target.matches('input[id^="findWord"], input[id^="replaceWord"], input[id^="caseSensitive"], input[id^="wholeWords"], #glossaryFile')) {
                this.updateProcessButtonState();
            }
        });

        // Initial validation
        this.updateProcessButtonState();
    }

    // Show a preview of the loaded glossary (first N rows)
    previewGlossary() {
        const container = document.getElementById('glossaryPreview');
        container.innerHTML = '';

        // Prefer showing parsed (unaccepted) CSV preview first so user can Accept/Reject
        if (this.parsedCsvRows && this.parsedCsvRows.length) {
            const table = document.createElement('table');
            table.className = 'preview-table-inner';
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            const thCur = document.createElement('th'); thCur.textContent = 'Current'; headerRow.appendChild(thCur);
            const thRep = document.createElement('th'); thRep.textContent = 'Replace With'; headerRow.appendChild(thRep);
            thead.appendChild(headerRow);
            table.appendChild(thead);
            const tbody = document.createElement('tbody');
            for (const r of this.parsedCsvRows.slice(0,50)) {
                const tr = document.createElement('tr');
                const td1 = document.createElement('td'); td1.textContent = r.find; tr.appendChild(td1);
                const td2 = document.createElement('td'); td2.textContent = r.replace; tr.appendChild(td2);
                tbody.appendChild(tr);
            }
            table.appendChild(tbody);
            container.appendChild(table);
            container.style.display = 'block';
            // show accept/reject - handled elsewhere
            return;
        }

        if (this.csvReplacements && this.csvReplacements.length) {
            // Render CSV replacements preview
            const table = document.createElement('table');
            table.className = 'preview-table-inner';
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            const thCur = document.createElement('th'); thCur.textContent = 'Current'; headerRow.appendChild(thCur);
            const thRep = document.createElement('th'); thRep.textContent = 'Replace With'; headerRow.appendChild(thRep);
            thead.appendChild(headerRow);
            table.appendChild(thead);
            const tbody = document.createElement('tbody');
            for (const r of this.csvReplacements.slice(0,50)) {
                const tr = document.createElement('tr');
                const td1 = document.createElement('td'); td1.textContent = r.find; tr.appendChild(td1);
                const td2 = document.createElement('td'); td2.textContent = r.replace; tr.appendChild(td2);
                tbody.appendChild(tr);
            }
            table.appendChild(tbody);
            container.appendChild(table);
            container.style.display = 'block';
            return;
        }

        // If we reach here there were no CSV replacements
        container.textContent = 'No CSV replacements loaded. Upload a CSV with headers: current, replace.';
        container.style.display = 'block';
    }

    _glossaryHasLang(lang) {
        // Legacy helper retained for UI checks — return true if CSV replacements are present
        return Array.isArray(this.csvReplacements) && this.csvReplacements.length > 0;
    }

    _updateGlossaryStatus(message) {
        const el = document.getElementById('glossaryStatus');
        if (!el) return;
        el.textContent = message;
    }

    setMode(mode) {
        // Mode switching removed. Keep method stub for compatibility but do nothing.
        this.mode = 'replace';
    }

    // If replaceAll flag is true, every replacement will replace ALL occurrences
    // in the document; otherwise the previous behavior (first-occurrence-per-row
    // for IDML and first-only for PDF when appropriate) is used.
    async processFile(replaceAll = false) {
        try {
            if (!this.currentFile) {
                throw new Error('No file selected');
            }

            // Build replacements: prefer CSV replacements if present, otherwise use manual pairs
            let replacements = [];
            if (this.csvReplacements && this.csvReplacements.length) {
                // Attach global options to CSV replacements (CSV rows don't carry per-row options)
                const globalOptions = {
                    caseSensitive: document.getElementById('caseSensitive').checked,
                    wholeWords: document.getElementById('wholeWords').checked
                };
                replacements = this.csvReplacements.map(r => ({ find: r.find, replace: r.replace, options: Object.assign({}, globalOptions) }));
            } else {
                replacements = this.getReplacementPairs();
                if (replacements.length === 0) throw new Error('Please add at least one replacement pair or upload a CSV with current,replace headers');
            }

            // Get options (include replaceAll flag)
            const options = {
                caseSensitive: document.getElementById('caseSensitive').checked,
                wholeWords: document.getElementById('wholeWords').checked,
                replaceAll: !!replaceAll
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
            const csInput = pair.querySelector('input[id^="caseSensitive"]');
            const wwInput = pair.querySelector('input[id^="wholeWords"]');

            const find = findInput ? findInput.value.trim() : '';
            const replace = replaceInput ? replaceInput.value.trim() : '';
            const caseSensitive = csInput ? csInput.checked : false;
            const wholeWords = wwInput ? wwInput.checked : false;

            if (find && replace) {
                pairs.push({ find, replace, options: { caseSensitive, wholeWords } });
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
    // Mode toggle fallback removed — app handles UI state directly.

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