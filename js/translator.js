// Translation Module
// Uses translation APIs (user-provided key) to translate IDML text content
// SECURITY: Never store API keys in this file or commit them to the repo

class Translator {
    constructor() {
        this.apiKey = null;
        this.provider = 'mymemory'; // default free provider (no key needed)
        this.sourceLanguage = 'auto';
        this.targetLanguage = 'en';
    }

    setApiKey(key, provider = 'deepl') {
        // Store API key in memory only (never persisted)
        this.apiKey = key;
        this.provider = provider;
    }

    setLanguages(source, target) {
        this.sourceLanguage = source;
        this.targetLanguage = target;
    }

    // Decode HTML/numeric entities returned by translation APIs
    decodeHtmlEntities(str) {
        if (!str || typeof str !== 'string') return str;
        try {
            // First decode numeric entities like &#39;
            str = str.replace(/&#(\d+);/g, function(_, n) { return String.fromCharCode(Number(n)); });
            // Use DOM to decode named entities
            const d = document.createElement('div');
            d.innerHTML = str;
            return d.textContent || d.innerText || '';
        } catch (e) {
            return str;
        }
    }

    async translateText(text) {
        if (!text || text.trim().length === 0) return text;

        try {
            switch (this.provider) {
                case 'mymemory':
                    return await this.translateWithMyMemory(text);
                case 'deepl':
                    return await this.translateWithDeepL(text);
                case 'google':
                    return await this.translateWithGoogle(text);
                case 'xano':
                    return await this.translateWithXano(text);
                default:
                    throw new Error('Unsupported translation provider');
            }
        } catch (error) {
            console.error('Translation error:', error);
            throw new Error(`Translation failed: ${error.message}`);
        }
    }

    // MyMemory: Free translation API (no key required, 500 requests/day limit per IP)
    async translateWithMyMemory(text) {
        const langPair = `${this.sourceLanguage}|${this.targetLanguage}`;
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langPair)}`;
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`MyMemory API error: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.responseStatus !== 200) {
            throw new Error(data.responseDetails || 'Translation failed');
        }
        
        return this.decodeHtmlEntities(data.responseData.translatedText);
    }

    // DeepL: High-quality translation (requires API key, free tier: 500k chars/month)
    async translateWithDeepL(text) {
        if (!this.apiKey) {
            throw new Error('DeepL API key required. Get one free at https://www.deepl.com/pro-api');
        }

        const url = 'https://api-free.deepl.com/v2/translate';
        const params = new URLSearchParams({
            auth_key: this.apiKey,
            text: text,
            target_lang: this.targetLanguage.toUpperCase()
        });

        if (this.sourceLanguage !== 'auto') {
            params.append('source_lang', this.sourceLanguage.toUpperCase());
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || `DeepL API error: ${response.status}`);
        }

        const data = await response.json();
        const raw = data.translations[0].text;
        return this.decodeHtmlEntities(raw);
    }

    // Google Cloud Translation API (requires API key)
    async translateWithGoogle(text) {
        if (!this.apiKey) {
            throw new Error('Google Cloud Translation API key required');
        }

        const url = `https://translation.googleapis.com/language/translate/v2?key=${this.apiKey}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                q: text,
                target: this.targetLanguage,
                source: this.sourceLanguage !== 'auto' ? this.sourceLanguage : undefined
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `Google API error: ${response.status}`);
        }

        const data = await response.json();
        const raw = data.data.translations[0].translatedText;
        return this.decodeHtmlEntities(raw);
    }

    // Xano Backend Proxy: Secure server-side API that handles translation
    // Your Xano endpoint stores API keys securely and forwards translation requests
    async translateWithXano(text) {
        if (!this.apiKey) {
            throw new Error('Xano API endpoint URL required');
        }

        // this.apiKey stores your Xano endpoint URL (e.g., https://x8ki-letl-twmt.n7.xano.io/api:xxx/translate)
        const url = this.apiKey;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: text,
                source: this.sourceLanguage,
                target: this.targetLanguage
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Xano API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        // Adjust based on your Xano endpoint response structure
        // Example: { translatedText: "..." } or { translation: "..." }
        const raw = data.translatedText || data.translation || data.text;
        return this.decodeHtmlEntities(raw);
    }

    // Batch translate multiple text strings (with rate limiting)
    async translateBatch(texts, onProgress) {
        const translated = [];
        const total = texts.length;

        for (let i = 0; i < texts.length; i++) {
            try {
                const result = await this.translateText(texts[i]);
                translated.push(result);
                
                if (onProgress) {
                    onProgress((i + 1) / total * 100, `Translating ${i + 1}/${total}`);
                }

                // Rate limiting: small delay between requests to avoid hitting API limits
                if (i < texts.length - 1) {
                    await this.delay(200); // 200ms delay between requests
                }
            } catch (error) {
                console.error(`Failed to translate text ${i + 1}:`, error);
                translated.push(texts[i]); // fallback to original text
            }
        }

        return translated;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Extract translatable text from IDML content
    extractTextFromIDML(xmlContent) {
        const contentRegex = /<Content[^>]*>(.*?)<\/Content>/gs;
        const texts = [];
        let match;

        while ((match = contentRegex.exec(xmlContent)) !== null) {
            const innerText = match[1];
            // Decode XML entities
            const decoded = this.decodeXMLEntities(innerText);
            if (decoded.trim().length > 0) {
                texts.push({
                    original: innerText,
                    decoded: decoded,
                    fullMatch: match[0],
                    index: match.index
                });
            }
        }

        return texts;
    }

    // Inject translated text back into IDML XML
    injectTranslatedText(xmlContent, textMappings) {
        let result = xmlContent;

        // Process in reverse order to preserve string indices
        for (let i = textMappings.length - 1; i >= 0; i--) {
            const mapping = textMappings[i];
            if (!mapping.translated) continue;

            // Encode translated text for XML
            const encoded = this.encodeForXML(mapping.translated);
            const newContent = `<Content>${encoded}</Content>`;

            // Replace the original Content block
            result = result.slice(0, mapping.index) + newContent + result.slice(mapping.index + mapping.fullMatch.length);
        }

        return result;
    }

    decodeXMLEntities(text) {
        return text
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'");
    }

    encodeForXML(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}

// Export for use in other modules
window.Translator = Translator;