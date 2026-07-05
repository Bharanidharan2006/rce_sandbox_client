const WS_URL = `ws://${location.hostname || "localhost"}:8080/ws`;

const DEFAULT_CODE = `# Welcome to RCE Sandbox!
# Write Python code and hit Run (Ctrl+Enter)

name = input("What is your name? ")
print(f"Hello, {name}!")
`;

let editor = null;
let ws = null;
let running = false;
let chatHistory = JSON.parse(localStorage.getItem("chat_history") || "[]");
let waiting = false;
let typingEl;

const chatFab = document.getElementById("chat-fab");
const chatPanel = document.getElementById("chat-panel");
const chatCloseBtn = document.getElementById("chat-close-btn");
const chatClearBtn = document.getElementById("chat-clear-btn");
const chatSettingsBtn = document.getElementById("chat-settings-btn");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const includeCodeCheckbox = document.getElementById("include-code");

const runBtn = document.getElementById("run-btn");
const clearBtn = document.getElementById("clear-btn");
const wsStatus = document.getElementById("ws-status");
const terminal = document.getElementById("terminal");
const terminalOutput = document.getElementById("terminal-output");
const terminalInputRow = document.getElementById("terminal-input-row");
const terminalInput = document.getElementById("terminal-input");

require.config({
  paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs" },
});

require(["vs/editor/editor.main"], () => {
  registerPythonCompletions();

  editor = monaco.editor.create(document.getElementById("editor"), {
    value: localStorage.getItem("sandbox_code") || DEFAULT_CODE,
    language: "python",
    theme: "vs-dark",
    fontSize: 14,
    fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
    fontLigatures: true,
    minimap: { enabled: false },
    automaticLayout: true,
    scrollBeyondLastLine: false,
    padding: { top: 12 },
    tabSize: 4,
    wordBasedSuggestions: "currentDocument",
    quickSuggestions: { other: true, comments: false, strings: false },
    suggestOnTriggerCharacters: true,
  });

  editor.onDidChangeModelContent(() => {
    localStorage.setItem("sandbox_code", editor.getValue());
  });

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runCode);
});

/* Python keyword / builtin / snippet completions */
function registerPythonCompletions() {
  const kw = (label) => ({
    label,
    kind: monaco.languages.CompletionItemKind.Keyword,
    insertText: label,
  });
  const fn = (label, sig, doc) => ({
    label,
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: `${label}($0)`,
    insertTextRules:
      monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: sig,
    documentation: doc,
  });
  const snip = (label, insertText, doc) => ({
    label,
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText,
    insertTextRules:
      monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: "snippet",
    documentation: doc,
  });

  const suggestions = [
    // keywords
    ...[
      "and",
      "as",
      "assert",
      "async",
      "await",
      "break",
      "class",
      "continue",
      "def",
      "del",
      "elif",
      "else",
      "except",
      "finally",
      "for",
      "from",
      "global",
      "if",
      "import",
      "in",
      "is",
      "lambda",
      "nonlocal",
      "not",
      "or",
      "pass",
      "raise",
      "return",
      "try",
      "while",
      "with",
      "yield",
      "True",
      "False",
      "None",
    ].map(kw),

    // builtins
    fn(
      "print",
      "print(*values, sep=' ', end='\\n')",
      "Print values to stdout.",
    ),
    fn("input", "input(prompt='')", "Read a line from stdin."),
    fn("len", "len(obj)", "Return the number of items."),
    fn("range", "range(start, stop, step)", "Immutable sequence of numbers."),
    fn("int", "int(x, base=10)", "Convert to integer."),
    fn("float", "float(x)", "Convert to float."),
    fn("str", "str(obj)", "Convert to string."),
    fn("list", "list(iterable)", "Create a list."),
    fn("dict", "dict(**kwargs)", "Create a dictionary."),
    fn("set", "set(iterable)", "Create a set."),
    fn("tuple", "tuple(iterable)", "Create a tuple."),
    fn("sum", "sum(iterable, start=0)", "Sum items of an iterable."),
    fn("min", "min(iterable)", "Smallest item."),
    fn("max", "max(iterable)", "Largest item."),
    fn("abs", "abs(x)", "Absolute value."),
    fn("round", "round(number, ndigits)", "Round a number."),
    fn(
      "sorted",
      "sorted(iterable, key=None, reverse=False)",
      "Return a sorted list.",
    ),
    fn("reversed", "reversed(seq)", "Reverse iterator."),
    fn("enumerate", "enumerate(iterable, start=0)", "Index-value pairs."),
    fn("zip", "zip(*iterables)", "Aggregate elements."),
    fn("map", "map(func, iterable)", "Apply function to every item."),
    fn("filter", "filter(func, iterable)", "Filter items."),
    fn("open", "open(file, mode='r')", "Open a file."),
    fn("type", "type(obj)", "Type of an object."),
    fn("isinstance", "isinstance(obj, class)", "Type check."),
    fn("repr", "repr(obj)", "Printable representation."),
    fn("ord", "ord(c)", "Unicode code point of a character."),
    fn("chr", "chr(i)", "Character for a code point."),
    fn("bin", "bin(x)", "Binary string."),
    fn("hex", "hex(x)", "Hex string."),
    fn("pow", "pow(base, exp, mod)", "Power."),
    fn("divmod", "divmod(a, b)", "(quotient, remainder)."),
    fn("any", "any(iterable)", "True if any element is truthy."),
    fn("all", "all(iterable)", "True if all elements are truthy."),

    // snippets
    snip(
      "ifmain",
      'if __name__ == "__main__":\n    ${1:main()}',
      'if __name__ == "__main__" guard',
    ),
    snip("for", "for ${1:item} in ${2:iterable}:\n    ${3:pass}", "for loop"),
    snip(
      "fori",
      "for ${1:i} in range(${2:n}):\n    ${3:pass}",
      "for loop over range",
    ),
    snip("while", "while ${1:condition}:\n    ${2:pass}", "while loop"),
    snip(
      "def",
      "def ${1:name}(${2:args}):\n    ${3:pass}",
      "function definition",
    ),
    snip(
      "class",
      "class ${1:Name}:\n    def __init__(self${2:, args}):\n        ${3:pass}",
      "class definition",
    ),
    snip(
      "try",
      "try:\n    ${1:pass}\nexcept ${2:Exception} as e:\n    ${3:print(e)}",
      "try/except block",
    ),
    snip(
      "with",
      "with open(${1:'file.txt'}, ${2:'r'}) as ${3:f}:\n    ${4:pass}",
      "with open(...)",
    ),
    snip("lambda", "lambda ${1:x}: ${2:x}", "lambda expression"),
    snip(
      "listcomp",
      "[${1:x} for ${1:x} in ${2:iterable}]",
      "list comprehension",
    ),
  ];

  monaco.languages.registerCompletionItemProvider("python", {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn,
      );
      return { suggestions: suggestions.map((s) => ({ ...s, range })) };
    },
  });
}

/* ── WebSocket ──────────────────────────────────────────── */

function setWsStatus(connected) {
  wsStatus.textContent = connected ? "● connected" : "● offline";
  wsStatus.className = `ws-status ${connected ? "connected" : "disconnected"}`;
}

/* ── Run / terminal ─────────────────────────────────────── */

function runCode() {
  if (running || !editor) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    appendOutput("⚠ Not connected to the sandbox server.\n", "t-system");
    return;
  }

  running = true;
  runBtn.disabled = true;
  terminalOutput.textContent = "";
  terminalInputRow.classList.remove("hidden");
  terminalInput.focus();

  ws.send(
    JSON.stringify({
      event: "execute",
      data: { lang: "python", code: editor.getValue() },
    }),
  );
}

function finishRun(reason) {
  if (!running) return;
  running = false;
  runBtn.disabled = false;
  terminalInputRow.classList.add("hidden");
  appendOutput(`\n── ${reason || "program finished"} ──\n`, "t-system");
}

function appendOutput(text, cls) {
  if (!text) return;
  const span = document.createElement("span");
  span.className = cls;
  span.textContent = text;
  terminalOutput.appendChild(span);
  terminal.scrollTop = terminal.scrollHeight;
}

runBtn.addEventListener("click", runCode);
clearBtn.addEventListener("click", () => (terminalOutput.textContent = ""));

terminal.addEventListener("click", () => {
  if (running) terminalInput.focus();
});

terminalInput.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const text = terminalInput.value;
  terminalInput.value = "";
  appendOutput(text + "\n", "t-echo");
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event: "input", data: { text } }));
  }
});

connect();

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

chatSendBtn.addEventListener("click", sendMessage);

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
});

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || waiting) return;

  chatInput.value = "";
  chatInput.style.height = "auto";

  chatHistory.push({ role: "user", text });
  saveHistory();
  addBubble(text, "user");

  typingEl = addBubble("thinking", "model typing");
  waiting = true;
  chatSendBtn.disabled = true;

  const requestPayload = prepareGeminiRequestPayload();
  ws.send(
    JSON.stringify({
      event: "chat",
      data: requestPayload,
    }),
  );
}

async function prepareGeminiRequestPayload() {
  let systemText =
    "You are a friendly programming assistant embedded in an online Python playground. " +
    "Help the user understand, debug and improve their code. Be concise; use markdown " +
    "code blocks for code.";

  if (includeCodeCheckbox.checked && typeof editor !== "undefined" && editor) {
    systemText +=
      "\n\nThe user's current editor content (main.py):\n```python\n" +
      editor.getValue() +
      "\n```";
  }

  const body = {
    system_instruction: { parts: [{ text: systemText }] },
    contents: chatHistory.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    })),
  };

  return JSON.stringify(body);
}

function renderHistory() {
  chatMessages.innerHTML = "";
  if (chatHistory.length === 0) {
    chatMessages.innerHTML =
      '<div class="chat-empty"><p>Want to debug your code?</p>' +
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
function connect() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => setWsStatus(true);

  ws.onclose = () => {
    setWsStatus(false);
    if (running) finishRun("connection lost");
    setTimeout(connect, 2000); // auto-reconnect
  };

  ws.onerror = () => ws.close();

  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    switch (msg.event) {
      case "output": {
        const { stream, text } = msg.data || {};
        appendOutput(text, stream === "stderr" ? "t-stderr" : "t-stdout");
        break;
      }
      case "chat_output": {
        const { stream, reply } = msg.data || {};
        if (stream == "error") {
          typingEl.remove();
          addBubble(`Error: ${err.message}`, "error");
          chatHistory.pop();
          saveHistory();
        } else {
          typingEl.remove();
          chatHistory.push({ role: "model", text: reply });
          saveHistory();
          addBubble(reply, "model");
        }

        waiting = false;
        chatSendBtn.disabled = false;
        chatInput.focus();
      }
      case "finished":
        finishRun();
        break;
    }
  };
}
