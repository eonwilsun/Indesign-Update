# Xano Backend Setup Guide for Translation

This guide shows you how to set up a **Xano backend API** to securely handle translation requests without exposing your API keys in the frontend.

## Why Use Xano?

- 🔒 **Secure**: API keys stored on server-side, never exposed in browser
- 🚀 **No coding required**: Visual API builder
- 💰 **Free tier**: Up to 100k API calls/month
- 🌐 **CORS enabled**: Works with GitHub Pages

## Setup Steps

### 1. Create Xano Account
1. Go to [https://xano.com](https://xano.com)
2. Sign up for free account
3. Create a new workspace

### 2. Create Translation Endpoint

#### Add External API Configuration (for DeepL example)
1. In Xano dashboard, go to **Settings** → **Environment Variables**
2. Add these variables:
   ```
   DEEPL_API_KEY = your-deepl-api-key-here
   TRANSLATION_PROVIDER = deepl
   ```

#### Create API Endpoint
1. Go to **API** section
2. Click **Add API Group** (name it "Translation")
3. Click **Add Endpoint**
4. Name it `translate`
5. Set method to **POST**
6. Enable **Public API** (no authentication needed for now)

#### Configure Endpoint Logic

**Input Schema** (Request Body):
```json
{
  "text": "string",
  "source": "string",
  "target": "string"
}
```

**Function Stack** (drag these blocks):

1. **Get Input** blocks:
   - `text` (string)
   - `source` (string)
   - `target` (string)

2. **Add External Request** block:
   - Name: `DeepL Translation`
   - URL: `https://api-free.deepl.com/v2/translate`
   - Method: `POST`
   - Headers:
     ```
     Content-Type: application/x-www-form-urlencoded
     ```
   - Body (use Form Data):
     ```
     auth_key: {{env.DEEPL_API_KEY}}
     text: {{input.text}}
     source_lang: {{input.source}}
     target_lang: {{input.target}}
     ```

3. **Add Response** block:
   - Return the external request result:
   ```json
   {
     "translatedText": {{external_request.translations[0].text}}
   }
   ```

### 3. Test Your Endpoint

In Xano, use the **Test** tab:
```json
{
  "text": "Hello world",
  "source": "EN",
  "target": "ES"
}
```

Expected response:
```json
{
  "translatedText": "Hola mundo"
}
```

### 4. Get Your Endpoint URL

After creating the endpoint, Xano will show you a URL like:
```
https://x8ki-letl-twmt.n7.xano.io/api:abc123/translate
```

Copy this URL!

### 5. Use in Your App

1. Open your InDesign Update tool
2. Select **Xano (Secure backend proxy)** as provider
3. Paste your Xano endpoint URL in the field
4. Select languages and click **Translate IDML**

## Alternative: Google Cloud Translation

To use Google Translate instead of DeepL:

**Environment Variable:**
```
GOOGLE_API_KEY = your-google-api-key-here
```

**External Request Block:**
- URL: `https://translation.googleapis.com/language/translate/v2`
- Method: `POST`
- Headers:
  ```
  Content-Type: application/json
  ```
- Body (JSON):
  ```json
  {
    "q": "{{input.text}}",
    "source": "{{input.source}}",
    "target": "{{input.target}}",
    "key": "{{env.GOOGLE_API_KEY}}"
  }
  ```

**Response:**
```json
{
  "translatedText": "{{external_request.data.translations[0].translatedText}}"
}
```

## Alternative: MyMemory (No Key Required)

**External Request Block:**
- URL: `https://api.mymemory.translated.net/get`
- Method: `GET`
- Query Parameters:
  ```
  q: {{input.text}}
  langpair: {{input.source}}|{{input.target}}
  ```

**Response:**
```json
{
  "translatedText": "{{external_request.responseData.translatedText}}"
}
```

## Advanced: Multi-Provider Endpoint

You can create a smart endpoint that switches between providers:

1. Add input parameter: `provider` (string)
2. Use **If/Else** blocks to route to different external APIs based on provider
3. One endpoint handles all translation services

Example logic:
```
IF provider == "deepl"
  → Call DeepL API
ELSE IF provider == "google"
  → Call Google API
ELSE
  → Call MyMemory API
```

## Security Best Practices

✅ **DO:**
- Store API keys in Xano environment variables
- Use HTTPS for all requests
- Rate limit your endpoint (Xano settings)
- Monitor usage in Xano dashboard

❌ **DON'T:**
- Share your Xano endpoint URL publicly
- Commit API keys to git
- Expose internal API keys in frontend code

## Troubleshooting

**CORS Errors:**
- Xano automatically handles CORS for web apps
- If issues occur, check endpoint is marked "Public"

**Translation Errors:**
- Check Xano logs (dashboard → API → Logs)
- Verify environment variables are set
- Test external API directly in Xano's test panel

**Rate Limiting:**
- Xano free tier: 100k calls/month
- DeepL free tier: 500k characters/month
- Google: Paid per character

## Cost Comparison

| Provider | Free Tier | Cost After Free |
|----------|-----------|----------------|
| Xano | 100k API calls/month | $29/month (1M calls) |
| DeepL | 500k chars/month | $5.49/month |
| Google | $0 (paid only) | $20 per 1M chars |
| MyMemory | 500 calls/day/IP | None (free only) |

## Need Help?

- Xano Documentation: [https://docs.xano.com](https://docs.xano.com)
- Xano Community: [https://community.xano.com](https://community.xano.com)
- DeepL API Docs: [https://www.deepl.com/docs-api](https://www.deepl.com/docs-api)
- Google Translate API: [https://cloud.google.com/translate/docs](https://cloud.google.com/translate/docs)
