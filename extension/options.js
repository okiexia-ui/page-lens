const CUSTOM_PREFIX = "custom::";
const defaults = {
  baseUrl: "http://127.0.0.1:8317/v1",
  apiKey: "",
  maxChars: 60000,
  customApiBaseUrl: "",
  customApiKey: "",
  customApiModel: "",
  ...(globalThis.PAGE_LENS_DEFAULTS || {})
};

const fields = {
  baseUrl: document.querySelector("#baseUrl"),
  apiKey: document.querySelector("#apiKey"),
  customApiBaseUrl: document.querySelector("#customApiBaseUrl"),
  customApiKey: document.querySelector("#customApiKey"),
  customApiModel: document.querySelector("#customApiModel"),
  customModelList: document.querySelector("#customModelList"),
  maxChars: document.querySelector("#maxChars"),
  selectedModel: document.querySelector("#selectedModel"),
  uiLanguage: document.querySelector("#uiLanguage"),
  result: document.querySelector("#result")
};
let t = PageLensI18n.translator(PageLensI18n.resolveLanguage("auto", navigator.language));
applyLanguage();

load().catch((error) => showResult(error.message, true));

document.querySelectorAll("[data-secret-target]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = fields[button.dataset.secretTarget];
    input.type = input.type === "password" ? "text" : "password";
    renderSecretButtons();
  });
});

// The language applies immediately, independent of the Save button.
fields.uiLanguage.addEventListener("change", () => {
  chrome.storage.local.set({ uiLanguage: fields.uiLanguage.value }).catch(() => {});
  setLanguage(fields.uiLanguage.value);
});
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.uiLanguage) return;
  fields.uiLanguage.value = changes.uiLanguage.newValue || "auto";
  setLanguage(fields.uiLanguage.value);
});

document.querySelector("#testProxyButton").addEventListener("click", () => testConnection("proxy"));
document.querySelector("#testCustomButton").addEventListener("click", () => testConnection("custom"));
document.querySelector("#saveButton").addEventListener("click", save);

async function load() {
  const keys = ["baseUrl", "apiKey", "maxChars", "selectedModel", "customApiBaseUrl", "customApiKey", "customApiModel", "uiLanguage"];
  const stored = await chrome.storage.local.get(keys);
  fields.uiLanguage.value = PageLensI18n.LANGUAGES.includes(stored.uiLanguage) ? stored.uiLanguage : "auto";
  setLanguage(fields.uiLanguage.value);
  for (const key of ["baseUrl", "apiKey", "maxChars", "customApiBaseUrl", "customApiKey", "customApiModel"]) {
    fields[key].value = stored[key] ?? defaults[key] ?? "";
  }
  if (stored.selectedModel) addModelOption(stored.selectedModel, displayModel(stored.selectedModel), true);
  addCustomDefaultOption();
}
async function save() {
  const config = validatedConfig();
  if (!config) return;
  addCustomDefaultOption();
  await chrome.storage.local.set({ ...config, selectedModel: fields.selectedModel.value });
  showResult(t("opt.saved"), false);
}

async function testConnection(kind) {
  const config = validatedConfig({ requireCustom: kind === "custom" });
  if (!config) return;
  const isCustom = kind === "custom";
  const targetBase = isCustom ? config.customApiBaseUrl : config.baseUrl;
  const targetKey = isCustom ? config.customApiKey : config.apiKey;
  showResult(t(isCustom ? "opt.connectingCustom" : "opt.connectingProxy"), false);

  try {
    const response = await fetch(`${targetBase.replace(/\/$/, "")}/models`, {
      headers: targetKey ? { Authorization: `Bearer ${targetKey}` } : {},
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const models = (payload.data || []).map((item) => item.id).filter(Boolean).sort();
    if (!models.length) throw new Error(t("opt.noModels"));

    if (isCustom) {
      fields.customModelList.replaceChildren();
      for (const model of models) fields.customModelList.append(new Option(model, model));
      if (!fields.customApiModel.value) fields.customApiModel.value = models[0];
      addCustomDefaultOption();
    } else {
      const current = fields.selectedModel.value;
      fields.selectedModel.replaceChildren(new Option(t("opt.chooseInPanel"), ""));
      for (const model of models) addModelOption(model, model, model === current);
      addCustomDefaultOption();
    }
    showResult(t(isCustom ? "opt.connectedCustom" : "opt.connectedProxy", { count: models.length }), false);
  } catch (error) {
    showResult(t(isCustom ? "opt.failedCustom" : "opt.failed", { error: error.message }), true);
  }
}

function validatedConfig({ requireCustom = false } = {}) {
  try {
    const proxyUrl = validHttpUrl(fields.baseUrl.value.trim(), t("opt.invalidProxyUrl"));
    const customUrlText = fields.customApiBaseUrl.value.trim();
    const customModel = fields.customApiModel.value.trim();
    const hasAnyCustomValue = Boolean(customUrlText || fields.customApiKey.value.trim() || customModel);
    if ((requireCustom || hasAnyCustomValue) && (!customUrlText || !customModel)) {
      showResult(t("opt.customNeedsBoth"), true);
      return null;
    }
    const customUrl = customUrlText ? validHttpUrl(customUrlText, t("opt.invalidCustomUrl")) : "";
    const amount = Number(fields.maxChars.value);
    if (!Number.isFinite(amount) || amount < 5000 || amount > 120000) {
      showResult(t("opt.maxCharsRange"), true);
      return null;
    }
    return {
      baseUrl: proxyUrl,
      apiKey: fields.apiKey.value.trim(),
      customApiBaseUrl: customUrl,
      customApiKey: fields.customApiKey.value.trim(),
      customApiModel: customModel,
      maxChars: amount
    };
  } catch (error) {
    showResult(error.message, true);
    return null;
  }
}

function validHttpUrl(value, message) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    return parsed.href.replace(/\/$/, "");
  } catch {
    throw new Error(message);
  }
}

function addCustomDefaultOption() {
  const model = fields.customApiModel.value.trim();
  if (!model) return;
  const value = `${CUSTOM_PREFIX}${model}`;
  addModelOption(value, t("opt.customOption", { model }), fields.selectedModel.value === value);
}

function addModelOption(value, label, selected = false) {
  if (Array.from(fields.selectedModel.options).some((option) => option.value === value)) return;
  fields.selectedModel.add(new Option(label, value, selected, selected));
}

function displayModel(value) {
  if (!value) return t("opt.chooseInPanel");
  return value.startsWith(CUSTOM_PREFIX) ? t("opt.customOption", { model: value.slice(CUSTOM_PREFIX.length) }) : value;
}

function setLanguage(preference) {
  t = PageLensI18n.translator(PageLensI18n.resolveLanguage(preference, navigator.language));
  applyLanguage();
}

function applyLanguage() {
  document.documentElement.lang = t("meta.htmlLang");
  document.title = t("opt.pageTitle");
  PageLensI18n.apply(document, t);
  renderSecretButtons();
  for (const option of fields.selectedModel.options) option.textContent = displayModel(option.value);
}

function renderSecretButtons() {
  document.querySelectorAll("[data-secret-target]").forEach((button) => {
    button.textContent = t(fields[button.dataset.secretTarget].type === "password" ? "opt.show" : "opt.hide");
  });
}

function showResult(message, isError) {
  fields.result.textContent = message;
  fields.result.hidden = false;
  fields.result.classList.toggle("error", isError);
}
