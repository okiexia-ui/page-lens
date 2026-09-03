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
  result: document.querySelector("#result")
};

load().catch((error) => showResult(error.message, true));

document.querySelectorAll("[data-secret-target]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = fields[button.dataset.secretTarget];
    const revealing = input.type === "password";
    input.type = revealing ? "text" : "password";
    button.textContent = revealing ? "隐藏" : "显示";
  });
});

document.querySelector("#testProxyButton").addEventListener("click", () => testConnection("proxy"));
document.querySelector("#testCustomButton").addEventListener("click", () => testConnection("custom"));
document.querySelector("#saveButton").addEventListener("click", save);

async function load() {
  const keys = ["baseUrl", "apiKey", "maxChars", "selectedModel", "customApiBaseUrl", "customApiKey", "customApiModel"];
  const stored = await chrome.storage.local.get(keys);
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
  showResult("设置已保存。侧边栏会自动刷新模型配置。", false);
}

async function testConnection(kind) {
  const config = validatedConfig({ requireCustom: kind === "custom" });
  if (!config) return;
  const isCustom = kind === "custom";
  const targetBase = isCustom ? config.customApiBaseUrl : config.baseUrl;
  const targetKey = isCustom ? config.customApiKey : config.apiKey;
  showResult(isCustom ? "正在连接自定义 API…" : "正在连接订阅代理…", false);

  try {
    const response = await fetch(`${targetBase.replace(/\/$/, "")}/models`, {
      headers: targetKey ? { Authorization: `Bearer ${targetKey}` } : {},
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const models = (payload.data || []).map((item) => item.id).filter(Boolean).sort();
    if (!models.length) throw new Error("接口在线，但没有返回模型");

    if (isCustom) {
      fields.customModelList.replaceChildren();
      for (const model of models) fields.customModelList.append(new Option(model, model));
      if (!fields.customApiModel.value) fields.customApiModel.value = models[0];
      addCustomDefaultOption();
    } else {
      const current = fields.selectedModel.value;
      fields.selectedModel.replaceChildren(new Option("在侧边栏中选择", ""));
      for (const model of models) addModelOption(model, model, model === current);
      addCustomDefaultOption();
    }
    showResult(`${isCustom ? "自定义 API" : "订阅代理"}连接成功，共发现 ${models.length} 个模型。`, false);
  } catch (error) {
    const suffix = isCustom ? "；若服务不支持 /models，仍可手动填写准确模型名后保存" : "";
    showResult(`连接失败：${error.message}${suffix}`, true);
  }
}

function validatedConfig({ requireCustom = false } = {}) {
  try {
    const proxyUrl = validHttpUrl(fields.baseUrl.value.trim(), "请输入有效的本机代理地址");
    const customUrlText = fields.customApiBaseUrl.value.trim();
    const customModel = fields.customApiModel.value.trim();
    const hasAnyCustomValue = Boolean(customUrlText || fields.customApiKey.value.trim() || customModel);
    if ((requireCustom || hasAnyCustomValue) && (!customUrlText || !customModel)) {
      showResult("自定义 API 需要同时填写 Base URL 和模型名称。", true);
      return null;
    }
    const customUrl = customUrlText ? validHttpUrl(customUrlText, "请输入有效的自定义 API Base URL") : "";
    const amount = Number(fields.maxChars.value);
    if (!Number.isFinite(amount) || amount < 5000 || amount > 120000) {
      showResult("字符数需要在 5,000 到 120,000 之间。", true);
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
  addModelOption(value, `自定义 API · ${model}`, fields.selectedModel.value === value);
}

function addModelOption(value, label, selected = false) {
  if (Array.from(fields.selectedModel.options).some((option) => option.value === value)) return;
  fields.selectedModel.add(new Option(label, value, selected, selected));
}

function displayModel(value) {
  return value.startsWith(CUSTOM_PREFIX) ? `自定义 API · ${value.slice(CUSTOM_PREFIX.length)}` : value;
}

function showResult(message, isError) {
  fields.result.textContent = message;
  fields.result.hidden = false;
  fields.result.classList.toggle("error", isError);
}
