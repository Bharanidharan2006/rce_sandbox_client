/* ── AI chat widget (Gemini API) ────────────────────────── */

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`;

const chatFab = document.getElementById("chat-fab");
const chatPanel = document.getElementById("chat-panel");
const chatCloseBtn = document.getElementById("chat-close-btn");
const chatClearBtn = document.getElementById("chat-clear-btn");
const chatSettingsBtn = document.getElementById("chat-settings-btn");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const includeCodeCheckbox = document.getElementById("include-code");

/* history: [{ role: "user"|"model", text: string }] */
let chatHistory = JSON.parse(localStorage.getItem("chat_history") || "[]");
let waiting = false;

/* ── Panel toggle ───────────────────────────────────────── */

chatFab.addEventListener("click", () => {
  chatPanel.classList.toggle("hidden");
  if (!chatPanel.classList.contains("hidden")) {
    renderHistory();
    chatInput.focus();
  }
});

chatCloseBtn.addEventListener("click", () => chatPanel.classList.add("hidden"));

chatClearBtn.addEventListener("click", () => {
  chatHistory = [];
  saveHistory();
  renderHistory();
});

chatSettingsBtn.addEventListener("click", () => askForApiKey(true));

/* ── API key ────────────────────────────────────────────── */

function askForApiKey(force = false) {
  let key = localStorage.getItem("gemini_api_key");
  if (key && !force) return key;
  key = prompt(
    "Enter your Gemini API key (stored only in this browser's localStorage).\n" +
      "Get one free at https://aistudio.google.com/apikey",
    key || ""
  );
  if (key) localStorage.setItem("gemini_api_key", key.trim());
  return key ? key.trim() : null;
}

/* ── Sending ────────────────────────────────────────────── */

chatSendBtn.addEventListener("click", sendMessage);

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

/* auto-grow textarea */
chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
});

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || waiting) return;

  const apiKey = askForApiKey();
  if (!apiKey) {
    addBubble("A Gemini API key is required to chat.", "error");
    return;
  }

  chatInput.value = "";
  chatInput.style.height = "auto";

  chatHistory.push({ role: "user", text });
  saveHistory();
  addBubble(text, "user");

  const typingEl = addBubble("thinking", "model typing");
  waiting = true;
  chatSendBtn.disabled = true;

  try {
    const reply = await callGemini(apiKey);
    typingEl.remove();
    chatHistory.push({ role: "model", text: reply });
    saveHistory();
    addBubble(reply, "model");
  } catch (err) {
    typingEl.remove();
    addBubble(`Error: ${err.message}`, "error");
    // drop the failed user turn so history stays consistent with Gemini's view
    chatHistory.pop();
    saveHistory();
  } finally {
    waiting = false;
    chatSendBtn.disabled = false;
    chatInput.focus();
  }
}

async function callGemini(apiKey) {
  let systemText =
    "You are a friendly programming assistant embedded in an online Python playground. " +
    "Help the user understand, debug and improve their code. Be concise; use markdown " +
    "code blocks for code.";

  if (includeCodeCheckbox.checked && typeof editor !== "undefined" && editor) {
    systemText += "\n\nThe user's current editor content (main.py):\n```python\n" + editor.getValue() + "\n```";
  }

  const body = {
    system_instruction: { parts: [{ text: systemText }] },
    contents: chatHistory.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    })),
  };

  const res = await fetch(GEMINI_URL(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).error?.message || detail; } catch {}
    throw new Error(detail);
  }

  const data = await res.json();
  const reply = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  if (!reply) throw new Error("Gemini returned an empty response.");
  return reply;
}

/* ── Rendering ──────────────────────────────────────────── */

function renderHistory() {
  chatMessages.innerHTML = "";
  if (chatHistory.length === 0) {
    chatMessages.innerHTML =
      '<div class="chat-empty"><p>👋 Ask me anything about your code!</p>' +
      '<p class="chat-empty-sub">Tick “include code” to send your editor content as context.</p></div>';
    return;
  }
  for (const m of chatHistory) addBubble(m.text, m.role);
}

function addBubble(text, cls) {
  const empty = chatMessages.querySelector(".chat-empty");
  if (empty) empty.remove();

  const div = document.createElement("div");
  div.className = `msg ${cls}`;
  if (cls.includes("typing") || cls === "error" || cls === "user") {
    div.textContent = text;
  } else {
    div.innerHTML = renderMarkdown(text);
  }
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

/* Minimal, safe markdown: escape HTML first, then apply formatting */
function renderMarkdown(text) {
  const escape = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const parts = text.split(/```(\w*)\n?([\s\S]*?)```/g);
  let html = "";

  for (let i = 0; i < parts.length; i += 3) {
    // regular text segment
    let seg = escape(parts[i] || "");
    seg = seg
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/^### (.+)$/gm, "<strong>$1</strong>")
      .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
      .replace(/(<li>[\s\S]*?<\/li>)(\n?)/g, "$1")
      .replace(/\n\n+/g, "</p><p>")
      .replace(/\n/g, "<br>");
    html += `<p>${seg}</p>`;

    // fenced code block segment
    if (i + 2 < parts.length) {
      html += `<pre><code>${escape(parts[i + 2] || "")}</code></pre>`;
    }
  }
  return html;
}

function saveHistory() {
  localStorage.setItem("chat_history", JSON.stringify(chatHistory));
}

renderHistory();
