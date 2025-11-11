// PDF Processing Module
class PDFProcessor {
    constructor() {
        this.pdfDocument = null;
        this.originalPdfBytes = null;
    }

    async loadPDF(file) {
        try {
            // Read file once and create independent copies for pdf.js and pdf-lib
            const arrayBuffer = await file.arrayBuffer();
            // create copies so one library cannot detach the other's buffer
            this.pdfJsBytes = new Uint8Array(arrayBuffer).slice();
            this.pdfLibBytes = new Uint8Array(arrayBuffer).slice();

            // Load PDF with PDF.js for text extraction using the pdfJsBytes copy
            const loadingTask = pdfjsLib.getDocument({
                data: this.pdfJsBytes,
                useSystemFonts: true
            });

            this.pdfDocument = await loadingTask.promise;
            return true;
        } catch (error) {
            console.error('Error loading PDF:', error);
            throw new Error('Failed to load PDF file. Please ensure it\'s a valid PDF.');
        }
    }

    async extractTextContent() {
        if (!this.pdfDocument) {
            throw new Error('No PDF loaded');
        }

        const textContent = [];
        const numPages = this.pdfDocument.numPages;

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const page = await this.pdfDocument.getPage(pageNum);
            const textContentObj = await page.getTextContent();
            
            const pageText = textContentObj.items.map(item => ({
                text: item.str,
                x: item.transform[4],
                y: item.transform[5],
                width: item.width,
                height: item.height,
                fontName: item.fontName,
                fontSize: item.height
            }));

            textContent.push({
                pageNumber: pageNum,
                textItems: pageText
            });
        }

        return textContent;
    }

    async getAllTextLines() {
        const content = await this.extractTextContent();
        const lines = [];
        for (const page of content) {
            const grouped = this.groupTextIntoLines(page.textItems);
            grouped.forEach(g => {
                const t = (g.text || '').trim();
                if (t) lines.push(t);
            });
        }
        return lines;
    }

    async processReplacements(replacements, options = {}) {
        try {
            // Load the PDF with pdf-lib for modification using the independent copy
            const pdfDoc = await PDFLib.PDFDocument.load(this.pdfLibBytes);
            const pages = pdfDoc.getPages();
            
            // Extract text content for analysis
            const textContent = await this.extractTextContent();
            
            let totalReplacements = 0;
            const replacementLog = [];

            // Embed a fallback font for measuring/drawing replacement text
            const helveticaFont = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

            // Process replacements one-by-one so we can choose first-match-per-row
            // or replace-all semantics per replacement.
            for (const replacement of replacements) {
                if (!replacement.find || !replacement.replace) continue;
                const repOptions = Object.assign({}, options, replacement.options || {});

                if (repOptions.replaceAll) {
                    // Replace all occurrences across all pages/lines
                    for (let pageIndex = 0; pageIndex < textContent.length; pageIndex++) {
                        const pageData = textContent[pageIndex];
                        const page = pages[pageIndex];
                        const lines = this.groupTextIntoLines(pageData.textItems);

                        for (const line of lines) {
                            const { found, newText, count } = this.performTextReplacement(
                                line.text,
                                replacement.find,
                                replacement.replace,
                                Object.assign({}, repOptions, { replaceAll: true })
                            );

                            if (found && count > 0) {
                                const textPosition = this.calculateTextPosition(line);
                                const fontSize = Math.max(8, line.fontSize || 10);
                                const textWidth = helveticaFont.widthOfTextAtSize(newText, fontSize);
                                const paddingX = 6;
                                const paddingY = 4;

                                const rectX = Math.max(0, textPosition.x - paddingX);
                                const rectY = Math.max(0, textPosition.y - paddingY);
                                const rectWidth = Math.max(textPosition.width, textWidth) + paddingX * 2;
                                const rectHeight = (textPosition.height || fontSize) + paddingY * 2;

                                page.drawRectangle({
                                    x: rectX,
                                    y: rectY,
                                    width: rectWidth,
                                    height: rectHeight,
                                    color: PDFLib.rgb(1, 1, 1),
                                });

                                const isRTL = this.isRTLLanguage(options?.targetLang);
                                const drawX = isRTL ? Math.max(0, textPosition.x + textPosition.width - textWidth) : textPosition.x;
                                const drawY = textPosition.y;

                                page.drawText(newText, {
                                    x: drawX,
                                    y: drawY,
                                    size: fontSize,
                                    font: helveticaFont,
                                    color: PDFLib.rgb(0, 0, 0),
                                });

                                totalReplacements += count;
                                replacementLog.push({
                                    page: pageIndex + 1,
                                    original: replacement.find,
                                    replacement: replacement.replace,
                                    position: textPosition,
                                    count
                                });
                            }
                        }
                    }
                } else {
                    // Find and replace only the first occurrence in the document
                    let foundOne = false;
                    for (let pageIndex = 0; pageIndex < textContent.length && !foundOne; pageIndex++) {
                        const pageData = textContent[pageIndex];
                        const page = pages[pageIndex];
                        const lines = this.groupTextIntoLines(pageData.textItems);

                        for (const line of lines) {
                            const { found, newText, count } = this.performTextReplacement(
                                line.text,
                                replacement.find,
                                replacement.replace,
                                Object.assign({}, repOptions, { replaceAll: false })
                            );

                            if (found && count > 0) {
                                const textPosition = this.calculateTextPosition(line);
                                const fontSize = Math.max(8, line.fontSize || 10);
                                const textWidth = helveticaFont.widthOfTextAtSize(newText, fontSize);
                                const paddingX = 6;
                                const paddingY = 4;

                                const rectX = Math.max(0, textPosition.x - paddingX);
                                const rectY = Math.max(0, textPosition.y - paddingY);
                                const rectWidth = Math.max(textPosition.width, textWidth) + paddingX * 2;
                                const rectHeight = (textPosition.height || fontSize) + paddingY * 2;

                                page.drawRectangle({
                                    x: rectX,
                                    y: rectY,
                                    width: rectWidth,
                                    height: rectHeight,
                                    color: PDFLib.rgb(1, 1, 1),
                                });

                                const isRTL = this.isRTLLanguage(options?.targetLang);
                                const drawX = isRTL ? Math.max(0, textPosition.x + textPosition.width - textWidth) : textPosition.x;
                                const drawY = textPosition.y;

                                page.drawText(newText, {
                                    x: drawX,
                                    y: drawY,
                                    size: fontSize,
                                    font: helveticaFont,
                                    color: PDFLib.rgb(0, 0, 0),
                                });

                                totalReplacements += count;
                                replacementLog.push({
                                    page: pageIndex + 1,
                                    original: replacement.find,
                                    replacement: replacement.replace,
                                    position: textPosition,
                                    count
                                });

                                // stop searching for this replacement and move to next replacement
                                foundOne = true;
                                break;
                            }
                        }
                    }
                }
            }

            // Save the modified PDF
            const modifiedPdfBytes = await pdfDoc.save();
            
            return {
                success: true,
                modifiedPdfBytes,
                totalReplacements,
                replacementLog
            };

        } catch (error) {
            console.error('Error processing PDF replacements:', error);
            throw new Error('Failed to process PDF replacements: ' + error.message);
        }
    }

    isRTLLanguage(lang) {
        return ['ar','he','fa','ur'].includes(lang);
    }

    groupTextIntoLines(textItems) {
        // Group text items that are approximately on the same line
        const lines = [];
        const sortedItems = textItems.sort((a, b) => b.y - a.y); // Sort by Y position (top to bottom)
        
        for (const item of sortedItems) {
            let addedToLine = false;
            
            for (const line of lines) {
                // Check if this item is on the same line (within a tolerance)
                const yTolerance = Math.max(5, item.height * 0.3);
                if (Math.abs(item.y - line.y) <= yTolerance) {
                    line.items.push(item);
                    line.text += ' ' + item.text;
                    line.width = Math.max(line.x + line.width, item.x + item.width) - Math.min(line.x, item.x);
                    line.x = Math.min(line.x, item.x);
                    addedToLine = true;
                    break;
                }
            }
            
            if (!addedToLine) {
                lines.push({
                    items: [item],
                    text: item.text,
                    x: item.x,
                    y: item.y,
                    width: item.width,
                    height: item.height,
                    fontSize: item.fontSize
                });
            }
        }
        
        // Sort items within each line by X position
        lines.forEach(line => {
            line.items.sort((a, b) => a.x - b.x);
            line.text = line.items.map(item => item.text).join(' ');
        });
        
        return lines;
    }

    performTextReplacement(text, findText, replaceText, options) {
        let searchText = findText;
        let targetText = text;
        
        if (!options.caseSensitive) {
            searchText = searchText.toLowerCase();
            targetText = targetText.toLowerCase();
        }
        
        let found = false;
        let newText = text;
        let count = 0;

        if (options.wholeWords) {
            // Use different flags based on whether we replace all occurrences
            if (options.replaceAll) {
                const countRegex = new RegExp(`\\b${this.escapeRegExp(searchText)}\\b`, options.caseSensitive ? 'g' : 'gi');
                const matches = targetText.match(countRegex);
                count = matches ? matches.length : 0;
                if (count > 0) {
                    found = true;
                    const replaceRegex = new RegExp(`\\b${this.escapeRegExp(searchText)}\\b`, options.caseSensitive ? 'g' : 'gi');
                    newText = text.replace(replaceRegex, replaceText);
                }
            } else {
                const firstRegex = new RegExp(`\\b${this.escapeRegExp(searchText)}\\b`, options.caseSensitive ? '' : 'i');
                if (firstRegex.test(targetText)) {
                    found = true;
                    count = 1;
                    newText = text.replace(firstRegex, replaceText);
                }
            }
        } else {
            if (options.replaceAll) {
                const countRegex = new RegExp(this.escapeRegExp(findText), options.caseSensitive ? 'g' : 'gi');
                const matches = targetText.match(countRegex);
                count = matches ? matches.length : 0;
                if (count > 0) {
                    found = true;
                    const replaceRegex = new RegExp(this.escapeRegExp(findText), options.caseSensitive ? 'g' : 'gi');
                    newText = text.replace(replaceRegex, replaceText);
                }
            } else {
                // Replace only the first occurrence
                if (!options.caseSensitive) {
                    const idx = targetText.indexOf(searchText);
                    if (idx !== -1) {
                        found = true;
                        count = 1;
                        newText = text.slice(0, idx) + replaceText + text.slice(idx + searchText.length);
                    }
                } else {
                    const idx = text.indexOf(findText);
                    if (idx !== -1) {
                        found = true;
                        count = 1;
                        newText = text.slice(0, idx) + replaceText + text.slice(idx + findText.length);
                    }
                }
            }
        }

        return { found, newText, count };
    }

    calculateTextPosition(line) {
        return {
            x: line.x,
            y: line.y,
            width: line.width,
            height: line.height,
            fontSize: Math.max(8, line.fontSize) // Use detected font size from PDF
        };
    }

    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    async createDownloadableBlob(pdfBytes) {
        return new Blob([pdfBytes], { type: 'application/pdf' });
    }
}

// Export for use in other modules
window.PDFProcessor = PDFProcessor;