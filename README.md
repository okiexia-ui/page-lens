# Page Lens — GPT + Kimi Chrome Side Panel

Page Lens reads the active web page and sends only the selected page text and your question to either a local CLIProxyAPI instance or a custom OpenAI-compatible API. CLIProxyAPI supplies an OpenAI-compatible endpoint backed by your Codex/ChatGPT and Kimi Code subscription logins.

## Local architecture

```text
Chrome side panel -> http://127.0.0.1:8317/v1 -> CLIProxyAPI -> Codex OAuth / Kimi OAuth
                  -> Custom API Base URL       -> Your API provider
```

The proxy is intentionally bound to `127.0.0.1`. Its management API is disabled. OAuth credential files live under `~/.cli-proxy-api`; the extension contains only a separate local client key.

## Load the extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the absolute `extension` folder in this project.
5. Pin **Page Lens — GPT + Kimi**, open a normal web page, then click its toolbar icon.

After changing files, click **Reload** on the extension card in `chrome://extensions`.

## Add a custom API

1. Open the Page Lens settings from the gear button.
2. Under **自定义 OpenAI 兼容 API**, enter the Base URL, API Key, and exact model name.
3. Optionally click **测试并获取模型**. Providers without a `/models` endpoint can still be used by entering the model manually.
4. Save, then choose **自定义 API** in the side panel.

Custom providers must implement the OpenAI-compatible `POST /chat/completions` request format. Streaming SSE and non-streaming JSON responses are supported. Custom keys are saved in `chrome.storage.local`, not in this repository.

For a fresh clone that uses CLIProxyAPI, copy `extension/config.local.example.js` to `extension/config.local.js` and replace the local proxy client key. The real `config.local.js` is ignored by Git.

Run the dependency-free smoke checks with `npm test`.

## Useful commands

```bash
cliproxyapi -config ~/.cli-proxy-api/config.yaml -codex-login
cliproxyapi -config ~/.cli-proxy-api/config.yaml -kimi-login
launchctl kickstart -k gui/$(id -u)/com.local.pagelens.cliproxyapi
curl -H "Authorization: Bearer YOUR_LOCAL_KEY" http://127.0.0.1:8317/v1/models
```

To stop the local service:

```bash
launchctl bootout gui/$(id -u)/com.local.pagelens.cliproxyapi
```

## Privacy and quota behavior

- Nothing is scanned in the background. Page capture happens after you open the side panel or click **重新读取**.
- Each question sends the configured page excerpt with the conversation. A 60,000-character cap is the default; lower it in settings to conserve quota or API credit.
- When a custom API is selected, page content is sent directly to its configured Base URL. Review that provider's privacy policy before use.
- Restricted browser pages such as `chrome://` cannot be read by Chrome extensions.
- Never publish `extension/config.local.js` or the runtime configuration. Both are excluded by `.gitignore`.
