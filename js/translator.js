// Translator module: dictionary/glossary-based translation for static GitHub Pages
// No API keys required. Supports CSV or JSON glossary uploads.
// CSV formats supported:
// 1) source,en,fr,de  (preferred) - 'source' column is canonical terms; pick target column by language code
// 2) en,fr,de         - use 'srcLang' to pick the source column

class Translator {
    constructor() {
        this.glossary = null; // { sourceTermLower: { langCode: translatedText, ... } }
        this.availableLangs = [
            'en','fr','de','es','it','pt','nl','sv','da','fi','no','pl','ru','ja','zh'
        ];
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
        const lines = csvText.split(/\r?\n/).filter(l => l.trim().length);
        if (lines.length === 0) return [];
        const header = lines[0].split(',').map(h => h.trim());
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            const obj = {};
            header.forEach((h, idx) => obj[h] = (cols[idx] || '').trim());
            rows.push(obj);
        }
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
    }
}

window.Translator = Translator;