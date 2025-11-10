// IDML Processing Module
class IDMLProcessor {
    constructor() {
        this.idmlZip = null;
        this.storyFiles = [];
        this.modifiedFiles = new Map();
    }

    async loadIDML(file) {
        try {
            // IDML files are ZIP archives containing XML files
            this.idmlZip = await JSZip.loadAsync(file);
            
            // Find all story files (these contain the text content)
            this.storyFiles = [];
            this.idmlZip.forEach((relativePath, zipEntry) => {
                if (relativePath.startsWith('Stories/') && relativePath.endsWith('.xml')) {
                    this.storyFiles.push(relativePath);
                }
            });

            if (this.storyFiles.length === 0) {
                throw new Error('No story files found in IDML. This may not be a valid IDML file.');
            }

            return true;
        } catch (error) {
            console.error('Error loading IDML:', error);
            throw new Error('Failed to load IDML file. Please ensure it\'s a valid IDML file exported from InDesign.');
        }
    }

    async processReplacements(replacements, options = {}) {
        try {
            let totalReplacements = 0;
            const replacementLog = [];
            
            // Process each story file
            for (const storyPath of this.storyFiles) {
                const storyFile = this.idmlZip.file(storyPath);
                if (!storyFile) continue;

                const xmlContent = await storyFile.async('text');
                let modifiedXml = xmlContent;
                let storyReplacements = 0;

                // Process each replacement
                for (const replacement of replacements) {
                    if (!replacement.find || !replacement.replace) continue;

                    const { newXml, count } = this.performXMLTextReplacement(
                        modifiedXml,
                        replacement.find,
                        replacement.replace,
                        options
                    );

                    if (count > 0) {
                        modifiedXml = newXml;
                        storyReplacements += count;
                        totalReplacements += count;
                        
                        replacementLog.push({
                            file: storyPath,
                            original: replacement.find,
                            replacement: replacement.replace,
                            count: count
                        });
                    }
                }

                // Store modified content if changes were made
                if (storyReplacements > 0) {
                    this.modifiedFiles.set(storyPath, modifiedXml);
                }
            }

            // Create new IDML file with modifications
            const modifiedIdmlBytes = await this.createModifiedIDML();

            return {
                success: true,
                modifiedIdmlBytes,
                totalReplacements,
                replacementLog
            };

        } catch (error) {
            console.error('Error processing IDML replacements:', error);
            throw new Error('Failed to process IDML replacements: ' + error.message);
        }
    }

    performXMLTextReplacement(xmlContent, findText, replaceText, options) {
        let count = 0;
        let newXml = xmlContent;

        // IDML stores text content in <Content> tags within story files
        // We need to be careful to only replace text content, not XML tags or attributes
        
        const contentRegex = /<Content[^>]*>(.*?)<\/Content>/gs;
        
        newXml = newXml.replace(contentRegex, (match, contentText) => {
            const { newText, replacementCount } = this.replaceTextContent(
                contentText, 
                findText, 
                replaceText, 
                options
            );
            
            count += replacementCount;
            return match.replace(contentText, newText);
        });

        // Also check text in CharacterStyleRange elements
        const charStyleRegex = /<CharacterStyleRange[^>]*>(.*?)<\/CharacterStyleRange>/gs;
        
        newXml = newXml.replace(charStyleRegex, (match, charContent) => {
            // Look for Content tags within CharacterStyleRange
            const updatedCharContent = charContent.replace(contentRegex, (contentMatch, contentText) => {
                const { newText, replacementCount } = this.replaceTextContent(
                    contentText, 
                    findText, 
                    replaceText, 
                    options
                );
                
                count += replacementCount;
                return contentMatch.replace(contentText, newText);
            });
            
            return match.replace(charContent, updatedCharContent);
        });

        return { newXml, count };
    }

    replaceTextContent(text, findText, replaceText, options) {
        let searchText = findText;
        let targetText = text;
        let replacementCount = 0;
        
        if (!options.caseSensitive) {
            searchText = searchText.toLowerCase();
            targetText = targetText.toLowerCase();
        }
        
        let newText = text;
        
        if (options.wholeWords) {
            const regex = new RegExp(`\\b${this.escapeRegExp(searchText)}\\b`, 
                options.caseSensitive ? 'g' : 'gi');
            
            // Count matches
            const matches = targetText.match(regex);
            if (matches) {
                replacementCount = matches.length;
                newText = text.replace(regex, replaceText);
            }
        } else {
            // Count occurrences
            let index = targetText.indexOf(searchText);
            while (index !== -1) {
                replacementCount++;
                index = targetText.indexOf(searchText, index + 1);
            }
            
            if (replacementCount > 0) {
                const regex = new RegExp(this.escapeRegExp(findText), 
                    options.caseSensitive ? 'g' : 'gi');
                newText = text.replace(regex, replaceText);
            }
        }
        
        return { newText, replacementCount };
    }

    async createModifiedIDML() {
        // Create a new ZIP file with all original files plus modifications
        const newZip = new JSZip();
        
        // Copy all files from original IDML
        const copyPromises = [];
        this.idmlZip.forEach((relativePath, zipEntry) => {
            if (this.modifiedFiles.has(relativePath)) {
                // Use modified version
                newZip.file(relativePath, this.modifiedFiles.get(relativePath));
            } else {
                // Copy original file
                copyPromises.push(
                    zipEntry.async('uint8array').then(content => {
                        newZip.file(relativePath, content);
                    })
                );
            }
        });

        await Promise.all(copyPromises);

        // Generate the modified IDML file
        return await newZip.generateAsync({
            type: 'uint8array',
            compression: 'DEFLATE',
            compressionOptions: {
                level: 6
            }
        });
    }

    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    async createDownloadableBlob(idmlBytes) {
        return new Blob([idmlBytes], { 
            type: 'application/vnd.adobe.indesign-idml-package'
        });
    }

    // Utility method to validate IDML structure
    async validateIDMLStructure() {
        const requiredFiles = [
            'mimetype',
            'META-INF/metadata.xml',
            'designmap.xml'
        ];

        for (const filePath of requiredFiles) {
            if (!this.idmlZip.file(filePath)) {
                return false;
            }
        }

        return true;
    }

    // Get information about the IDML file
    async getIDMLInfo() {
        try {
            const designmapFile = this.idmlZip.file('designmap.xml');
            if (!designmapFile) {
                throw new Error('designmap.xml not found');
            }

            const designmapContent = await designmapFile.async('text');
            
            // Parse basic info from designmap
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(designmapContent, 'text/xml');
            
            const info = {
                storyCount: this.storyFiles.length,
                hasDesignmap: true,
                isValid: await this.validateIDMLStructure()
            };

            return info;
        } catch (error) {
            console.error('Error getting IDML info:', error);
            return {
                storyCount: this.storyFiles.length,
                hasDesignmap: false,
                isValid: false,
                error: error.message
            };
        }
    }

    // Extract all textual content lines from story files (for export/preview)
    async getAllTextLines() {
        if (!this.idmlZip) throw new Error('No IDML loaded');
        const lines = [];
        const contentRegex = /<Content[^>]*>(.*?)<\/Content>/gs;
        for (const storyPath of this.storyFiles) {
            const storyFile = this.idmlZip.file(storyPath);
            if (!storyFile) continue;
            const xmlContent = await storyFile.async('text');
            let match;
            while ((match = contentRegex.exec(xmlContent)) !== null) {
                const txt = match[1].replace(/\s+/g, ' ').trim();
                if (txt) lines.push(txt);
            }
        }
        return lines;
    }
}

// Export for use in other modules
window.IDMLProcessor = IDMLProcessor;