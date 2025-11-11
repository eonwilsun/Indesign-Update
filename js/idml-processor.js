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

            // Iterate replacements in order (CSV rows). By default, we perform
            // first-occurrence-per-row semantics (search stories in order and stop
            // after the first found). If options.replaceAll (or per-replacement
            // replacement.options.replaceAll) is true, then we replace all
            // occurrences across all story files for that replacement.
            for (const replacement of replacements) {
                if (!replacement.find || !replacement.replace) continue;

                const repOptions = Object.assign({}, options, replacement.options || {});

                if (repOptions.replaceAll) {
                    // Replace all occurrences across all story files
                    let anyFound = false;
                    for (const storyPath of this.storyFiles) {
                        const storyFile = this.idmlZip.file(storyPath);
                        if (!storyFile) continue;

                        const xmlContent = await storyFile.async('text');

                        const { newXml, count } = this.performXMLTextReplacement(
                            xmlContent,
                            replacement.find,
                            replacement.replace,
                            repOptions
                        );

                        if (count > 0) {
                            this.modifiedFiles.set(storyPath, newXml);
                            totalReplacements += count;
                            replacementLog.push({
                                file: storyPath,
                                original: replacement.find,
                                replacement: replacement.replace,
                                count: count
                            });
                            console.log(`[IDMLProcessor] Replaced ${count} occurrence(s) for '${replacement.find}' in ${storyPath}`);
                            anyFound = true;
                        }
                    }

                    if (!anyFound) {
                        console.log(`[IDMLProcessor] No occurrence found for '${replacement.find}' (replaceAll)`);
                    }
                } else {
                    // Old behavior: replace only the first occurrence (search stories in order)
                    let replaced = false;
                    for (const storyPath of this.storyFiles) {
                        const storyFile = this.idmlZip.file(storyPath);
                        if (!storyFile) continue;

                        const xmlContent = await storyFile.async('text');

                        // Try to replace only the first match inside this story
                        const { newXml, count } = this.performXMLTextReplacementOnce(
                            xmlContent,
                            replacement.find,
                            replacement.replace,
                            repOptions
                        );

                        if (count > 0) {
                            // Store modified content for this story
                            this.modifiedFiles.set(storyPath, newXml);
                            totalReplacements += count;
                            replacementLog.push({
                                file: storyPath,
                                original: replacement.find,
                                replacement: replacement.replace,
                                count: count
                            });
                            console.log(`[IDMLProcessor] Replaced first occurrence for '${replacement.find}' in ${storyPath}`);
                            replaced = true;
                            break; // move to next CSV row
                        }
                    }

                    if (!replaced) {
                        console.log(`[IDMLProcessor] No occurrence found for '${replacement.find}'`);
                    }
                }
            }

            // Debug summary before packaging
            console.log('[IDMLProcessor] Total replacements across all stories:', totalReplacements);
            console.log('[IDMLProcessor] Total modified files to include in new IDML:', this.modifiedFiles.size);

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

    // Similar to performXMLTextReplacement but stops after replacing the FIRST
    // match found in the XML content. Returns { newXml, count } where count is
    // 0 or 1.
    performXMLTextReplacementOnce(xmlContent, findText, replaceText, options) {
        let count = 0;
        let newXml = xmlContent;

        const contentRegex = /<Content[^>]*>(.*?)<\/Content>/gs;

        // Replace only the first matching Content block occurrence
        let done = false;
        newXml = newXml.replace(contentRegex, (match, contentText) => {
            if (done) return match; // already replaced elsewhere

            const { newText, replacementCount } = this.replaceTextContentOnce(
                contentText,
                findText,
                replaceText,
                options
            );

            if (replacementCount > 0) {
                count += replacementCount;
                done = true; // stop further replacements
                return match.replace(contentText, newText);
            }

            return match;
        });

        if (count === 0) {
            // Also try CharacterStyleRange blocks (which may contain Content)
            const charStyleRegex = /<CharacterStyleRange[^>]*>(.*?)<\/CharacterStyleRange>/gs;
            newXml = newXml.replace(charStyleRegex, (match, charContent) => {
                if (done) return match;
                const updatedCharContent = charContent.replace(contentRegex, (contentMatch, contentText) => {
                    if (done) return contentMatch;
                    const { newText, replacementCount } = this.replaceTextContentOnce(
                        contentText,
                        findText,
                        replaceText,
                        options
                    );
                    if (replacementCount > 0) {
                        count += replacementCount;
                        done = true;
                        return contentMatch.replace(contentText, newText);
                    }
                    return contentMatch;
                });

                return match.replace(charContent, updatedCharContent);
            });
        }

        return { newXml, count };
    }

    // Replace only the first occurrence inside a block of text (not the whole XML)
    // Returns { newText, replacementCount } where replacementCount is 0 or 1.
    replaceTextContentOnce(text, findText, replaceText, options) {
        // Use whitespace-normalized matching so multi-line/paragraph finds
        // (with newlines or multiple spaces) still match content blocks.
        const { newText, replacementCount } = this._normalizedReplace(text, findText, replaceText, options, /* firstOnly */ true);
        return { newText, replacementCount };
    }

    replaceTextContent(text, findText, replaceText, options) {
        // Use whitespace-normalized matching for robust multi-line/space handling
        const { newText, replacementCount } = this._normalizedReplace(text, findText, replaceText, options, /* firstOnly */ false);
        return { newText, replacementCount };
    }

    // Helper: perform matching on a normalized (collapsed whitespace) copy of the
    // text and map matches back to original indices so replacements preserve XML
    // structure. If firstOnly is true, only the first match is replaced.
    _normalizedReplace(originalText, findText, replaceText, options = {}, firstOnly = false) {
        // Build normalized text and mapping from normalized indices back to original
        const buildNormalized = (str) => {
            const normChars = [];
            const map = []; // map[normIndex] = origIndex
            let i = 0;
            while (i < str.length) {
                const ch = str[i];
                if (/[\s\u00A0]/.test(ch)) {
                    // collapse any sequence of whitespace into a single space
                    let j = i;
                    while (j < str.length && /[\s\u00A0]/.test(str[j])) j++;
                    normChars.push(' ');
                    // map this normIndex to the start index of the whitespace run
                    map.push(i);
                    i = j;
                } else {
                    normChars.push(ch);
                    map.push(i);
                    i++;
                }
            }
            return { norm: normChars.join(''), map };
        };

        const opts = Object.assign({ caseSensitive: false, wholeWords: false }, options || {});

        const { norm: normOrig, map } = buildNormalized(originalText);
        const normFind = findText.replace(/[\s\u00A0]+/g, ' ').trim();

        let searchOrig = normOrig;
        let searchFind = normFind;
        if (!opts.caseSensitive) {
            searchOrig = normOrig.toLowerCase();
            searchFind = normFind.toLowerCase();
        }

        const matches = [];

        if (opts.wholeWords) {
            // Build a word-boundary regex on the normalized find text
            const re = new RegExp('\\b' + this.escapeRegExp(searchFind) + '\\b', opts.caseSensitive ? 'g' : 'gi');
            let m;
            const execSource = opts.caseSensitive ? normOrig : normOrig.toLowerCase();
            while ((m = re.exec(execSource)) !== null) {
                matches.push({ start: m.index, end: m.index + m[0].length });
                if (firstOnly) break;
            }
        } else {
            // Simple substring search on normalized text
            let idx = 0;
            while (true) {
                const foundAt = searchOrig.indexOf(searchFind, idx);
                if (foundAt === -1) break;
                matches.push({ start: foundAt, end: foundAt + searchFind.length });
                if (firstOnly) break;
                idx = foundAt + searchFind.length;
            }
        }

        if (matches.length === 0) return { newText: originalText, replacementCount: 0 };

        // Map normalized matches back to original ranges and perform replacements
        // Replace from last to first to keep indices valid
        let newText = originalText;
        let total = 0;
        for (let i = matches.length - 1; i >= 0; i--) {
            const m = matches[i];
            const origStart = map[m.start];
            const origEnd = map[m.end - 1] + 1; // inclusive
            newText = newText.slice(0, origStart) + replaceText + newText.slice(origEnd);
            total++;
        }

        return { newText, replacementCount: total };
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