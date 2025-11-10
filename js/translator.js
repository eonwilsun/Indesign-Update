// Translator module: dictionary/glossary-based translation for static GitHub Pages
// No API keys required. Supports CSV or JSON glossary uploads.
// CSV formats supported:
// 1) source,en,fr,de  (preferred) - 'source' column is canonical terms; pick target column by language code
// 2) en,fr,de         - use 'srcLang' to pick the source column

class Translator {
    constructor() {
        this.glossary = null; // { sourceTermLower: { langCode: translatedText, ... } }
        this.availableLangs = [
            'en','fr','de','es','it','pt','nl','sv','da','fi','no','pl','ru','ja','zh','ar','he'
        ];
        this._detectedLangs = new Set();
    }

    // Public: load glossary file (File object); returns parsed language set
    async loadGlossary(file, srcLangHint = 'auto') {
        const text = await file.text();
        let data;
        if (file.name.toLowerCase().endsWith('.json')) {
            data = JSON.parse(text);
            this._ingestJSON(data, srcLangHint);
        } else {
            data = this._parseCSV(text);
            this._ingestTable(data, srcLangHint);
        }
        const langs = new Set();
        Object.values(this.glossary).forEach(map => {
            Object.keys(map).forEach(l => langs.add(l));
        });
        this._detectedLangs = langs;
        return Array.from(langs);
    }

    // (JSON paste API removed in CSV-only mode)

    // Build replacements array for selected target language; optionally restricted to a subset
    buildReplacementsFor(targetLang, srcLang = 'auto') {
        if (!this.glossary) throw new Error('No glossary loaded');
        const replacements = [];
        // Sort keys by length desc to prefer longer phrase matches first
        const keys = Object.keys(this.glossary).sort((a,b) => b.length - a.length);
        for (const key of keys) {
            const entry = this.glossary[key];
            const tgt = entry[targetLang];
            if (!tgt) continue;
            // If srcLang specified and available, we ensure the canonical source text
            // Otherwise we use the normalized key
            const find = entry[srcLang] || key;
            replacements.push({ find, replace: tgt });
        }
        return replacements;
    }

    // Very small CSV parser (no quoted multiline support). For robust needs, use PapaParse.
    _parseCSV(csvText) {
        // Use PapaParse for robust CSV handling
        const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
        if (parsed.errors && parsed.errors.length) {
            console.warn('CSV parse warnings:', parsed.errors);
        }
        const header = parsed.meta.fields || [];
        const rows = parsed.data || [];
        return { header, rows };
    }

    _ingestJSON(json, srcLangHint) {
        // JSON can be an array of { source: 'Term', en: '...', fr: '...' }
        if (Array.isArray(json)) {
            const header = new Set();
            json.forEach(obj => Object.keys(obj).forEach(k => header.add(k)));
            this._ingestTable({ header: Array.from(header), rows: json }, srcLangHint);
            return;
        }
        throw new Error('Unsupported JSON format. Expect an array of objects');
    }

    _ingestTable(table, srcLangHint) {
        const header = table.header.map(h => h.trim());
        const lowerHeader = header.map(h => h.toLowerCase());

        // Determine source column
        let srcColIdx = lowerHeader.indexOf('source');
        if (srcColIdx === -1 && srcLangHint !== 'auto') {
            srcColIdx = lowerHeader.indexOf(srcLangHint.toLowerCase());
        }
        if (srcColIdx === -1) {
            // Fallback to the first column as source
            srcColIdx = 0;
        }

        // Determine language columns
        const langCols = [];
        header.forEach((h, idx) => {
            const code = h.toLowerCase();
            if (idx !== srcColIdx && this.availableLangs.includes(code)) {
                langCols.push({ idx, code });
            }
        });

        // Build glossary map
        // glossary: { sourceLower: { langCode: text } }
        this.glossary = {};
        for (const row of table.rows) {
            const cols = header.map(h => (row[h] ?? '').toString());
            const sourceText = (cols[srcColIdx] || '').trim();
            if (!sourceText) continue;
            const key = sourceText.toLowerCase();
            this.glossary[key] = this.glossary[key] || {};
            // Record also the explicit source language value if available
            const srcCode = header[srcColIdx].toLowerCase();
            if (this.availableLangs.includes(srcCode)) {
                this.glossary[key][srcCode] = sourceText;
            }
            for (const { idx, code } of langCols) {
                const val = (cols[idx] || '').trim();
                if (val) this.glossary[key][code] = val;
            }
        }
        // Track detected langs
        const detected = new Set();
        header.forEach(h => {
            const code = h.toLowerCase();
            if (this.availableLangs.includes(code)) detected.add(code);
        });
        this._detectedLangs = detected;
    }

    // Apply CSV content directly to a plain text string.
    // csvText: CSV file content (string)
    // targetLang: language code to replace with (e.g., 'fr')
    // srcLangHint: optional source language column name or 'auto'
    // options: { caseSensitive: boolean, wholeWords: boolean, longestFirst: boolean }
    applyCsvReplacementsToText(text, csvText, targetLang, srcLangHint = 'auto', options = {}) {
        const opts = Object.assign({ caseSensitive: false, wholeWords: false, longestFirst: true }, options || {});

        // Parse CSV into header/rows using existing parser
        const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
        const header = parsed.meta.fields || [];
        const rows = parsed.data || [];

        // Normalize header
        const headerTrim = header.map(h => (h || '').trim());
        const lowerHeader = headerTrim.map(h => h.toLowerCase());

        // Determine source column index
        let srcColIdx = lowerHeader.indexOf('source');
        if (srcColIdx === -1 && srcLangHint !== 'auto') {
            srcColIdx = lowerHeader.indexOf((srcLangHint || '').toLowerCase());
        }
        if (srcColIdx === -1) srcColIdx = 0;

        // Determine language columns (availableLangs describes valid language codes)
        const langCols = [];
        headerTrim.forEach((h, idx) => {
            const code = (h || '').toLowerCase();
            if (idx !== srcColIdx && this.availableLangs.includes(code)) {
                langCols.push({ idx, code });
            }
        });

        // Build local glossary map: { sourceOriginal: { srcCode?: text, langCode: text } }
        const glossary = {};
        for (const row of rows) {
            const cols = headerTrim.map(h => (row[h] ?? '').toString());
            const sourceText = (cols[srcColIdx] || '').trim();
            if (!sourceText) continue;
            const key = sourceText; // keep original-case source for matching
            glossary[key] = glossary[key] || {};
            const srcCode = headerTrim[srcColIdx].toLowerCase();
            if (this.availableLangs.includes(srcCode)) glossary[key][srcCode] = sourceText;
            for (const { idx, code } of langCols) {
                const val = (cols[idx] || '').trim();
                if (val) glossary[key][code] = val;
            }
        }

        // Build replacements array for targetLang
        const replacements = [];
        for (const sourceOriginal of Object.keys(glossary)) {
            const entry = glossary[sourceOriginal];
            const tgt = entry[targetLang];
            if (!tgt) continue;
            const srcVal = entry[srcLangHint] || entry[headerTrim[srcColIdx].toLowerCase()] || sourceOriginal;
            replacements.push({ find: srcVal, replace: tgt });
        }

        // Optionally sort by length descending to prefer longest match first
        if (opts.longestFirst) replacements.sort((a, b) => b.find.length - a.find.length);

        // Apply replacements sequentially
        let newText = text;
        let totalReplacements = 0;
        const replacementLog = [];

        for (const rep of replacements) {
            if (!rep.find) continue;
            const escaped = this.escapeRegExp(rep.find);
            const flags = opts.caseSensitive ? 'g' : 'gi';
            const pattern = opts.wholeWords ? `\\b${escaped}\\b` : escaped;
            const regex = new RegExp(pattern, flags);
            // Count occurrences
            const matches = newText.match(regex);
            const count = matches ? matches.length : 0;
            if (count > 0) {
                newText = newText.replace(regex, rep.replace);
                totalReplacements += count;
                replacementLog.push({ original: rep.find, replacement: rep.replace, count });
            }
        }

        return { text: newText, totalReplacements, replacementLog };
    }

    escapeRegExp(string) {
        return (string + '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    getLanguages() {
        return Array.from(this._detectedLangs || []);
    }

    getPreviewRows(limit = 15) {
        if (!this.glossary) return [];
        const langs = this.getLanguages();
        const rows = [];
        const keys = Object.keys(this.glossary).slice(0, limit);
        for (const key of keys) {
            const entry = this.glossary[key];
            const row = { source: key };
            for (const l of langs) {
                row[l] = entry[l] || '';
            }
            rows.push(row);
        }
        return { langs, rows };
    }
}

window.Translator = Translator;