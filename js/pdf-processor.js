// PDF Processing Module
class PDFProcessor {
    constructor() {
        this.pdfDocument = null;
        this.originalPdfBytes = null;
    }

    async loadPDF(file) {
        try {
            this.originalPdfBytes = await file.arrayBuffer();
            
            // Load PDF with PDF.js for text extraction
            const loadingTask = pdfjsLib.getDocument({
                data: this.originalPdfBytes,
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

    async processReplacements(replacements, options = {}) {
        try {
            // Load the PDF with pdf-lib for modification
            const pdfDoc = await PDFLib.PDFDocument.load(this.originalPdfBytes);
            const pages = pdfDoc.getPages();
            
            // Extract text content for analysis
            const textContent = await this.extractTextContent();
            
            let totalReplacements = 0;
            const replacementLog = [];

            // Process each page
            for (let pageIndex = 0; pageIndex < textContent.length; pageIndex++) {
                const pageData = textContent[pageIndex];
                const page = pages[pageIndex];
                
                // Group text items by approximate line
                const lines = this.groupTextIntoLines(pageData.textItems);
                
                for (const line of lines) {
                    for (const replacement of replacements) {
                        if (!replacement.find || !replacement.replace) continue;
                        
                        const { found, newText } = this.performTextReplacement(
                            line.text, 
                            replacement.find, 
                            replacement.replace, 
                            options
                        );
                        
                        if (found) {
                            // Calculate position for replacement text
                            const textPosition = this.calculateTextPosition(line);
                            
                            // Cover the original text with a white rectangle
                            page.drawRectangle({
                                x: textPosition.x - 2,
                                y: textPosition.y - 2,
                                width: textPosition.width + 4,
                                height: textPosition.height + 4,
                                color: PDFLib.rgb(1, 1, 1), // White
                            });
                            
                            // Draw the new text
                            page.drawText(newText, {
                                x: textPosition.x,
                                y: textPosition.y,
                                size: textPosition.fontSize,
                                color: PDFLib.rgb(0, 0, 0),
                            });
                            
                            totalReplacements++;
                            replacementLog.push({
                                page: pageIndex + 1,
                                original: replacement.find,
                                replacement: replacement.replace,
                                position: textPosition
                            });
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
        
        if (options.wholeWords) {
            const regex = new RegExp(`\\b${this.escapeRegExp(searchText)}\\b`, 
                options.caseSensitive ? 'g' : 'gi');
            if (regex.test(targetText)) {
                found = true;
                newText = text.replace(regex, replaceText);
            }
        } else {
            if (targetText.includes(searchText)) {
                found = true;
                const regex = new RegExp(this.escapeRegExp(findText), 
                    options.caseSensitive ? 'g' : 'gi');
                newText = text.replace(regex, replaceText);
            }
        }
        
        return { found, newText };
    }

    calculateTextPosition(line) {
        return {
            x: line.x,
            y: line.y,
            width: line.width,
            height: line.height,
            fontSize: Math.max(8, line.fontSize * 0.8) // Slightly smaller to fit better
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