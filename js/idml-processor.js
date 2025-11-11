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

                        // If we've already modified this story earlier in the
                        // replacement sequence, operate on the modified content so
                        // subsequent replacements build on prior changes instead
                        // of overwriting them.
                        let xmlContent;
                        if (this.modifiedFiles.has(storyPath)) {
                            xmlContent = this.modifiedFiles.get(storyPath);
                        } else {
                            xmlContent = await storyFile.async('text');
                        }

                        const { newXml, count, debugMatches, matchType } = this.performXMLTextReplacement(
                            xmlContent,
                            replacement.find,
                            replacement.replace,
                            repOptions
                        );

                        if (count > 0) {
                            this.modifiedFiles.set(storyPath, newXml);
                            totalReplacements += count;
                            const debug = this._createDebugSnippet(xmlContent, newXml) || {};
                            debug.matches = debugMatches || [];
                            debug.method = matchType || 'block-level';
                            replacementLog.push({
                                file: storyPath,
                                original: replacement.find,
                                replacement: replacement.replace,
                                count: count,
                                debug
                            });
                            console.log(`[IDMLProcessor] Replaced ${count} occurrence(s) for '${replacement.find}' in ${storyPath}`);
                            if (debug) console.log(`[IDMLProcessor][debug] ${storyPath}:`, debug);
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

                        // Prefer the story's currently-modified version if present
                        // so we don't lose earlier replacements in the same run.
                        let xmlContent;
                        if (this.modifiedFiles.has(storyPath)) {
                            xmlContent = this.modifiedFiles.get(storyPath);
                        } else {
                            xmlContent = await storyFile.async('text');
                        }

                        // Try to replace only the first match inside this story
                        const { newXml, count, debugMatches, matchType } = this.performXMLTextReplacementOnce(
                            xmlContent,
                            replacement.find,
                            replacement.replace,
                            repOptions
                        );

                        if (count > 0) {
                            // Store modified content for this story
                            this.modifiedFiles.set(storyPath, newXml);
                            totalReplacements += count;
                            const debug = this._createDebugSnippet(xmlContent, newXml) || {};
                            debug.matches = debugMatches || [];
                            debug.method = matchType || 'block-level';
                            replacementLog.push({
                                file: storyPath,
                                original: replacement.find,
                                replacement: replacement.replace,
                                count: count,
                                debug
                            });
                            console.log(`[IDMLProcessor] Replaced first occurrence for '${replacement.find}' in ${storyPath}`);
                            if (debug) console.log(`[IDMLProcessor][debug] ${storyPath}:`, debug);
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

        // If no replacements were found inside individual Content blocks,
        // attempt a pragmatic cross-block replacement fallback: try to match
        // the findText across adjacent <Content> blocks (useful for
        // multi-paragraph/heading spans). This inserts the replacement into
        // the first matched block and clears the consumed text from subsequent
        // blocks to avoid touching XML tags.
        let debugMatches = [];
        let matchType = null;
        if (count === 0) {
            const crossResult = this._replaceAcrossContentBlocks(xmlContent, findText, replaceText, options, /* firstOnly */ false);
            if (crossResult.count > 0) {
                newXml = crossResult.newXml;
                count += crossResult.count;
                debugMatches = crossResult.debugMatches || [];
                matchType = 'cross-block';
            }
        } else {
            // If we replaced inside blocks, try to collect debugMatches by
            // re-running the block-level extraction to get per-block matches.
            // Note: replaceTextContent currently returns debugMatches when used
            // in the replace callbacks; but we aggregate here using a simple
            // best-effort approach: we won't duplicate that work here.
        }

        return { newXml, count, debugMatches, matchType };
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
                    const { newText, replacementCount, debugMatches: dm } = this.replaceTextContentOnce(
                        contentText,
                        findText,
                        replaceText,
                        options
                    );
                    if (replacementCount > 0) {
                        count += replacementCount;
                        // attach debugMatches if provided (we can't surface them
                        // directly from here, but performXMLTextReplacementOnce will
                        // surface cross-block matches if needed)
                        done = true;
                        return contentMatch.replace(contentText, newText);
                    }
                    return contentMatch;
                });

                return match.replace(charContent, updatedCharContent);
            });
        }

        // If still not replaced, try cross-block single replacement fallback
        let debugMatches = [];
        let matchType = null;
        if (count === 0) {
            const crossResult = this._replaceAcrossContentBlocks(xmlContent, findText, replaceText, options, /* firstOnly */ true);
            if (crossResult.count > 0) {
                newXml = crossResult.newXml;
                count += crossResult.count;
                debugMatches = crossResult.debugMatches || [];
                matchType = 'cross-block';
            }
        }

        return { newXml, count, debugMatches, matchType };
    }

    // Replace only the first occurrence inside a block of text (not the whole XML)
    // Returns { newText, replacementCount } where replacementCount is 0 or 1.
    replaceTextContentOnce(text, findText, replaceText, options) {
        // Use whitespace-normalized matching so multi-line/paragraph finds
        // (with newlines or multiple spaces) still match content blocks.
        const res = this._normalizedReplace(text, findText, replaceText, options, /* firstOnly */ true);
        // res: { newText, replacementCount, debugMatches }
        return { newText: res.newText, replacementCount: res.replacementCount, debugMatches: res.debugMatches || [] };
    }

    replaceTextContent(text, findText, replaceText, options) {
        // Use whitespace-normalized matching for robust multi-line/space handling
        const res = this._normalizedReplace(text, findText, replaceText, options, /* firstOnly */ false);
        return { newText: res.newText, replacementCount: res.replacementCount, debugMatches: res.debugMatches || [] };
    }

    // Helper: perform matching on a normalized (collapsed whitespace) copy of the
    // text and map matches back to original indices so replacements preserve XML
    // structure. If firstOnly is true, only the first match is replaced.
    _normalizedReplace(originalText, findText, replaceText, options = {}, firstOnly = false) {
        const opts = Object.assign({ caseSensitive: false, wholeWords: false }, options || {});

        // Unescape common XML entities and build mapping from unescaped indices
        // back to original string indices. This handles cases where XML stores
        // '&' as '&amp;' etc.
        const unescapeWithMap = (str) => {
            const out = [];
            const mapUnesc = [];
            let i = 0;
            while (i < str.length) {
                if (str[i] === '&') {
                    const rest = str.slice(i);
                    if (rest.startsWith('&amp;')) { out.push('&'); mapUnesc.push(i); i += 5; continue; }
                    if (rest.startsWith('&lt;')) { out.push('<'); mapUnesc.push(i); i += 4; continue; }
                    if (rest.startsWith('&gt;')) { out.push('>'); mapUnesc.push(i); i += 4; continue; }
                    if (rest.startsWith('&quot;')) { out.push('"'); mapUnesc.push(i); i += 6; continue; }
                    if (rest.startsWith('&apos;')) { out.push('\''); mapUnesc.push(i); i += 6; continue; }
                }
                out.push(str[i]); mapUnesc.push(i); i++;
            }
            return { unescaped: out.join(''), mapUnesc };
        };

        const { unescaped, mapUnesc } = unescapeWithMap(originalText);

        // Build normalized text and mapping from normalized indices back to
        // unescaped indices.
        const buildNormalized = (str) => {
            const normChars = [];
            const map = []; // map[normIndex] = sourceIndex (in unescaped string)
            let i = 0;
            while (i < str.length) {
                const ch = str[i];
                if (/[\s\u00A0]/.test(ch)) {
                    let j = i; while (j < str.length && /[\s\u00A0]/.test(str[j])) j++;
                    normChars.push(' ');
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

        const { norm: normUnesc, map: mapNormToUnesc } = buildNormalized(unescaped);
        const normFind = findText.replace(/[\s\u00A0]+/g, ' ').trim();

        let searchOrig = normUnesc;
        let searchFind = normFind;
        if (!opts.caseSensitive) {
            searchOrig = normUnesc.toLowerCase();
            searchFind = normFind.toLowerCase();
        }

        const matches = [];
        if (opts.wholeWords) {
            const re = new RegExp('\\b' + this.escapeRegExp(searchFind) + '\\b', opts.caseSensitive ? 'g' : 'gi');
            let m; const execSource = opts.caseSensitive ? normUnesc : normUnesc.toLowerCase();
            while ((m = re.exec(execSource)) !== null) {
                matches.push({ start: m.index, end: m.index + m[0].length }); if (firstOnly) break;
            }
        } else {
            let idx = 0; while (true) {
                const foundAt = searchOrig.indexOf(searchFind, idx);
                if (foundAt === -1) break; matches.push({ start: foundAt, end: foundAt + searchFind.length });
                if (firstOnly) break; idx = foundAt + searchFind.length;
            }
        }

        if (matches.length === 0) return { newText: originalText, replacementCount: 0, debugMatches: [] };

        // Map normalized matches back to original indices using two-step mapping:
        // normIndex -> unescapedIndex -> originalIndex
        let newText = originalText; let total = 0;
        const debugMatches = [];
        for (let i = matches.length - 1; i >= 0; i--) {
            const m = matches[i];
            const unescStartIndex = mapNormToUnesc[m.start];
            const unescEndIndex = (m.end < mapNormToUnesc.length) ? mapNormToUnesc[m.end] : (unescaped.length);
            const origStart = mapUnesc[unescStartIndex];
            const origEnd = (unescEndIndex < mapUnesc.length) ? mapUnesc[unescEndIndex] : originalText.length;

            // capture a small snippet of the unescaped matched text for debugging
            const matchedUnescaped = unescaped.slice(unescStartIndex, unescEndIndex);
            debugMatches.push({ normStart: m.start, normEnd: m.end, unescStartIndex, unescEndIndex, origStart, origEnd, matchedUnescaped });

            newText = newText.slice(0, origStart) + replaceText + newText.slice(origEnd);
            total++;
        }

        return { newText, replacementCount: total, debugMatches };
    }

    // Attempt to find and replace findText that spans across multiple adjacent
    // <Content> blocks in a story XML. This is a pragmatic fallback that
    // writes the replacement into the first involved block and clears the
    // consumed ranges from subsequent blocks to avoid touching XML tags.
    _replaceAcrossContentBlocks(xmlContent, findText, replaceText, options = {}, firstOnly = false) {
        const contentRegex = /<Content[^>]*>(.*?)<\/Content>/gs;
        const blocks = [];

        let m;
        while ((m = contentRegex.exec(xmlContent)) !== null) {
            const fullMatch = m[0];
            const inner = m[1];
            const matchStart = m.index;
            // compute inner start (after the first '>') and inner end (before the last '<')
            const innerStartRel = fullMatch.indexOf('>') + 1;
            const innerStart = matchStart + innerStartRel;
            const innerEnd = matchStart + fullMatch.lastIndexOf('<');
            blocks.push({ inner, innerStart, innerEnd, fullStart: matchStart, fullEnd: matchStart + fullMatch.length });
        }

        if (blocks.length === 0) return { newXml: xmlContent, count: 0 };

        // Build combined unescaped text and mapping back to block/inner indices
        const combinedChars = [];
        const combinedMap = []; // each entry: {blockIndex, innerIndex}

        // helper to unescape common entities for a block and map
        const unescapeWithMap = (str, blockIndex) => {
            const out = [];
            const map = [];
            let i = 0;
            while (i < str.length) {
                if (str[i] === '&') {
                    const rest = str.slice(i);
                    if (rest.startsWith('&amp;')) { out.push('&'); map.push({ blockIndex, innerIndex: i }); i += 5; continue; }
                    if (rest.startsWith('&lt;')) { out.push('<'); map.push({ blockIndex, innerIndex: i }); i += 4; continue; }
                    if (rest.startsWith('&gt;')) { out.push('>'); map.push({ blockIndex, innerIndex: i }); i += 4; continue; }
                    if (rest.startsWith('&quot;')) { out.push('"'); map.push({ blockIndex, innerIndex: i }); i += 6; continue; }
                    if (rest.startsWith('&apos;')) { out.push('\''); map.push({ blockIndex, innerIndex: i }); i += 6; continue; }
                }
                out.push(str[i]); map.push({ blockIndex, innerIndex: i }); i++;
            }
            return { out: out.join(''), map };
        };

        for (let bi = 0; bi < blocks.length; bi++) {
            const b = blocks[bi];
            const { out, map } = unescapeWithMap(b.inner, bi);
            for (let i = 0; i < out.length; i++) {
                combinedChars.push(out[i]);
                combinedMap.push(map[i]);
            }
            // insert a single space separator between blocks
            combinedChars.push(' ');
            combinedMap.push(null);
        }

        // Build normalized combined string and normalized map
        const combined = combinedChars.join('');
        const normChars = [];
        const normMap = [];
        let i = 0;
        while (i < combined.length) {
            const ch = combined[i];
            if (/[\s\u00A0]/.test(ch)) {
                let j = i;
                while (j < combined.length && /[\s\u00A0]/.test(combined[j])) j++;
                normChars.push(' ');
                normMap.push(combinedMap[i]);
                i = j;
            } else {
                normChars.push(ch);
                normMap.push(combinedMap[i]);
                i++;
            }
        }
        const normCombined = normChars.join('');

        // Prepare search term normalized (and case handling)
        let normFind = findText.replace(/[\s\u00A0]+/g, ' ').trim();
        let searchSource = normCombined;
        let searchTerm = normFind;
        if (!options.caseSensitive) { searchSource = normCombined.toLowerCase(); searchTerm = normFind.toLowerCase(); }

        const matches = [];
        if (options.wholeWords) {
            const re = new RegExp('\\b' + this.escapeRegExp(searchTerm) + '\\b', options.caseSensitive ? 'g' : 'gi');
            let mm;
            while ((mm = re.exec(searchSource)) !== null) {
                matches.push({ start: mm.index, end: mm.index + mm[0].length });
                if (firstOnly) break;
            }
        } else {
            let idx = 0;
            while (true) {
                const at = searchSource.indexOf(searchTerm, idx);
                if (at === -1) break;
                matches.push({ start: at, end: at + searchTerm.length });
                if (firstOnly) break;
                idx = at + searchTerm.length;
            }
        }

        if (matches.length === 0) return { newXml: xmlContent, count: 0, debugMatches: [] };

        // For each match (or only first), map back to blocks and perform replacements
        let newXml = xmlContent;
        let total = 0;
        const debugMatches = [];
        for (let mi = matches.length - 1; mi >= 0; mi--) {
            const match = matches[mi];
            const startMapEntry = normMap[match.start];
            const endMapEntry = normMap[match.end - 1];
            if (!startMapEntry || !endMapEntry) continue;

            const startBlock = startMapEntry.blockIndex;
            const startInner = startMapEntry.innerIndex;
            const endBlock = endMapEntry.blockIndex;
            const endInner = endMapEntry.innerIndex + 1; // exclusive

            // Unescape the preserved slices so we don't double-escape existing
            // XML entities when we re-escape the final combined string.
            const preUnesc = this._unescapeForXML(blocks[startBlock].inner.slice(0, startInner));
            const postUnesc = this._unescapeForXML(blocks[endBlock].inner.slice(endInner));
            const newStartInner = preUnesc + replaceText + postUnesc;

            // Replace in xml by reconstructing the first full Content element and
            // dropping the full elements for the intervening blocks. We escape
            // the replacement for XML safety.
            const before = newXml.slice(0, blocks[startBlock].fullStart);
            const after = newXml.slice(blocks[endBlock].fullEnd);
            const middle = `<Content>${this._escapeForXML(newStartInner)}<\/Content>`;
            newXml = before + middle + after;

            // record debug info about this cross-block match
            try {
                const matched = normCombined.slice(match.start, match.end);
                debugMatches.push({ normStart: match.start, normEnd: match.end, startBlock, endBlock, startInner, endInner, matched });
            } catch (e) {
                // ignore
            }

            total++;
            if (firstOnly) break;
        }

        return { newXml, count: total };
    }

    // Escape text for safe insertion back into XML Content elements
    _escapeForXML(text) {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    }

    // Unescape common XML entities to their character equivalents
    _unescapeForXML(text) {
        return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    }

    // Create a small debug snippet describing the change between original
    // and modified XML for a story. Returns null when no change.
    _createDebugSnippet(orig, modified, contextLen = 200) {
        if (orig === modified) return null;
        const minLen = Math.min(orig.length, modified.length);
        let a = 0;
        while (a < minLen && orig[a] === modified[a]) a++;
        let b1 = orig.length - 1;
        let b2 = modified.length - 1;
        while (b1 >= a && b2 >= a && orig[b1] === modified[b2]) { b1--; b2--; }

        const before = orig.slice(Math.max(0, a - contextLen), Math.min(orig.length, b1 + 1 + contextLen));
        const after = modified.slice(Math.max(0, a - contextLen), Math.min(modified.length, b2 + 1 + contextLen));

        return {
            startIndex: a,
            endIndexOrig: b1,
            endIndexNew: b2,
            before,
            after
        };
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