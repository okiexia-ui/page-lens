// Optional local defaults. Copy to config.local.js and fill only on your own machine.
// For keys, prefer the extension Settings page so secrets stay in
// chrome.storage.local instead of project files. apiKey is left empty on purpose:
// a placeholder here would be sent to the proxy as a real key and prefill Settings.
globalThis.PAGE_LENS_DEFAULTS = Object.freeze({
  baseUrl: "http://127.0.0.1:8317/v1",
  apiKey: "",
  maxChars: 60000,
  customApiBaseUrl: "",
  customApiKey: "",
  customApiModel: ""
});
