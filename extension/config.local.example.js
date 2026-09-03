// Optional local defaults. Copy to config.local.js and fill only on your own machine.
// For custom API keys, prefer the extension Settings page so secrets stay in
// chrome.storage.local instead of project files.
globalThis.PAGE_LENS_DEFAULTS = Object.freeze({
  baseUrl: "http://127.0.0.1:8317/v1",
  apiKey: "replace-with-your-local-proxy-client-key",
  maxChars: 60000,
  customApiBaseUrl: "",
  customApiKey: "",
  customApiModel: ""
});
