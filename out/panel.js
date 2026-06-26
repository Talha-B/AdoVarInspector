"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.VariableInspectorPanel = void 0;
const vscode = __importStar(require("vscode"));
const variableParser_1 = require("./variableParser");
class VariableInspectorPanel {
    static createOrShow(extensionUri, parseResult, filename) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (VariableInspectorPanel.currentPanel) {
            VariableInspectorPanel.currentPanel._panel.reveal(vscode.ViewColumn.Beside);
            VariableInspectorPanel.currentPanel.update(parseResult, filename);
            return;
        }
        const panel = vscode.window.createWebviewPanel(VariableInspectorPanel.viewType, 'ADO Variable Inspector', vscode.ViewColumn.Beside, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
            retainContextWhenHidden: true,
        });
        VariableInspectorPanel.currentPanel = new VariableInspectorPanel(panel, extensionUri);
        VariableInspectorPanel.currentPanel.update(parseResult, filename);
    }
    constructor(panel, _extensionUri) {
        this._extensionUri = _extensionUri;
        this._disposables = [];
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage((message) => {
            switch (message.command) {
                case 'copyValue':
                    vscode.env.clipboard.writeText(message.value);
                    vscode.window.showInformationMessage(`Copied: ${message.value}`);
                    break;
                case 'askCopilot':
                    vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus').then(() => {
                        vscode.commands.executeCommand('workbench.action.chat.open', {
                            query: message.query,
                        });
                    });
                    break;
            }
        }, null, this._disposables);
    }
    update(parseResult, filename) {
        this._parseResult = parseResult;
        this._panel.webview.html = this._getHtmlContent(parseResult, filename);
    }
    focusVariable(varName) {
        this._panel.webview.postMessage({ command: 'focusVariable', name: varName });
    }
    _getHtmlContent(parseResult, filename) {
        const { variables, environments, errors } = parseResult;
        // Add "(global)" as a catch-all env column if no envs detected
        const envColumns = environments.length > 0 ? environments : ['(global)'];
        if (!envColumns.includes('(global)')) {
            envColumns.unshift('(global)');
        }
        // Build matrix data
        const matrices = [];
        for (const [name, entries] of variables.entries()) {
            matrices.push((0, variableParser_1.resolveVariableMatrix)(name, entries, envColumns));
        }
        const errorsHtml = errors.length
            ? `<div class="banner error">⚠ ${errors.join(' | ')}</div>`
            : '';
        const tableRows = matrices.map(m => {
            const varName = escapeHtml(m.variable);
            const isGroup = varName.startsWith('[group]');
            const isTemplate = varName.startsWith('[template]');
            const rowClass = isGroup ? 'row-group' : isTemplate ? 'row-template' : '';
            const badge = isGroup ? '<span class="badge badge-group">group</span>' : isTemplate ? '<span class="badge badge-template">tpl</span>' : '';
            const cells = envColumns.map(env => {
                const val = m.resolvedPerEnv[env];
                if (val === undefined)
                    return `<td class="cell-undefined"><span class="undef">—</span></td>`;
                const escaped = escapeHtml(val);
                // Detect if value references another variable
                const isRef = val.includes('$(') || val.includes('${{');
                return `<td class="${isRef ? 'cell-ref' : 'cell-value'}" title="${escaped}" data-copy="${escaped}">
          <span class="val-text">${escaped}</span>
          <button class="copy-btn" onclick="copyCell(this)" title="Copy value">⎘</button>
        </td>`;
            }).join('');
            const sources = [...new Set(m.entries.map(e => e.source))].join(', ');
            const hasConditional = m.entries.some(e => e.source === 'conditional');
            const conditionalIcon = hasConditional ? ' <span class="cond-icon" title="Has conditional overrides">⚡</span>' : '';
            return `<tr class="${rowClass}" data-varname="${varName}">
        <td class="col-name"><span class="var-name">${varName}</span>${badge}${conditionalIcon}</td>
        <td class="col-source"><span class="source-tag source-${sources.split(',')[0].trim()}">${sources}</span></td>
        ${cells}
        <td class="col-actions">
          <button class="action-btn copilot-btn" onclick="askCopilot('${varName.replace(/'/g, "\\'")}')" title="Ask Copilot about this variable">✦ Ask</button>
        </td>
      </tr>`;
        }).join('');
        const envHeaders = envColumns.map(e => `<th class="col-env">${escapeHtml(e)}</th>`).join('');
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<title>ADO Variable Inspector</title>
<style>
  :root {
    --bg: var(--vscode-editor-background);
    --fg: var(--vscode-editor-foreground);
    --border: var(--vscode-panel-border, #3c3c3c);
    --header-bg: var(--vscode-editorGroupHeader-tabsBackground);
    --row-hover: var(--vscode-list-hoverBackground);
    --accent: var(--vscode-button-background, #0078d4);
    --accent-fg: var(--vscode-button-foreground, #fff);
    --tag-bg: var(--vscode-badge-background);
    --tag-fg: var(--vscode-badge-foreground);
    --input-bg: var(--vscode-input-background);
    --input-border: var(--vscode-input-border);
    --font: var(--vscode-font-family);
    --mono: var(--vscode-editor-font-family, 'Cascadia Code', 'Consolas', monospace);
    --warn: var(--vscode-inputValidation-warningBorder, #cca700);
    --error-bg: var(--vscode-inputValidation-errorBackground, #5a1d1d);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--bg);
    color: var(--fg);
    font-family: var(--font);
    font-size: 13px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Header ── */
  .header {
    padding: 10px 16px 8px;
    background: var(--header-bg);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }
  .header-title {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    opacity: 0.7;
    flex: 1;
  }
  .filename-chip {
    font-family: var(--mono);
    font-size: 11px;
    background: var(--tag-bg);
    color: var(--tag-fg);
    padding: 2px 8px;
    border-radius: 3px;
  }
  .stat-chip {
    font-size: 11px;
    opacity: 0.6;
  }

  /* ── Toolbar ── */
  .toolbar {
    padding: 6px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .search-box {
    background: var(--input-bg);
    border: 1px solid var(--input-border, var(--border));
    color: var(--fg);
    padding: 4px 8px;
    border-radius: 3px;
    font-size: 12px;
    width: 200px;
    outline: none;
  }
  .search-box:focus { border-color: var(--accent); }

  .filter-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--fg);
    padding: 3px 8px;
    border-radius: 3px;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.1s;
  }
  .filter-btn:hover, .filter-btn.active {
    background: var(--accent);
    color: var(--accent-fg);
    border-color: var(--accent);
  }
  .toolbar-right { margin-left: auto; font-size: 11px; opacity: 0.5; }

  /* ── Banners ── */
  .banner {
    padding: 6px 12px;
    font-size: 11px;
    flex-shrink: 0;
  }
  .banner.error { background: var(--error-bg); }

  /* ── Table container ── */
  .table-wrap {
    flex: 1;
    overflow: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  thead {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--header-bg);
  }

  th {
    padding: 7px 10px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    border-bottom: 2px solid var(--border);
    white-space: nowrap;
    opacity: 0.8;
  }
  th.col-env {
    background: color-mix(in srgb, var(--accent) 12%, var(--header-bg));
    color: color-mix(in srgb, var(--accent) 80%, var(--fg));
    font-weight: 700;
  }

  tr { border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent); }
  tr:hover { background: var(--row-hover); }
  tr.highlighted { background: color-mix(in srgb, var(--accent) 15%, transparent) !important; }
  tr.row-group { opacity: 0.7; font-style: italic; }
  tr.hidden { display: none; }

  td { padding: 6px 10px; vertical-align: middle; }

  /* Variable name column */
  .col-name { min-width: 160px; }
  .var-name {
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 500;
  }
  .col-source { width: 90px; }
  .col-actions { width: 70px; }

  /* Value cells */
  td.cell-value .val-text,
  td.cell-ref .val-text,
  td.cell-undefined .val-text {
    font-family: var(--mono);
    font-size: 11px;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: inline-block;
    vertical-align: middle;
  }
  td.cell-ref .val-text { color: var(--vscode-symbolIcon-variableForeground, #9cdcfe); }
  td.cell-undefined { opacity: 0.3; }

  td.cell-value, td.cell-ref {
    position: relative;
  }
  td.cell-value:hover .copy-btn,
  td.cell-ref:hover .copy-btn { opacity: 1; }

  /* Badges */
  .badge {
    display: inline-block;
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 2px;
    margin-left: 4px;
    vertical-align: middle;
    text-transform: uppercase;
    font-weight: 700;
    letter-spacing: 0.05em;
  }
  .badge-group { background: #3a2d00; color: #cca700; }
  .badge-template { background: #1e3a1e; color: #4ec994; }

  .source-tag {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .source-pipeline { background: #1a3a5c; color: #4fc3f7; }
  .source-stage    { background: #2a1a4a; color: #ce93d8; }
  .source-job      { background: #1a3a2a; color: #80cbc4; }
  .source-conditional { background: #3a2a1a; color: #ffb74d; }
  .source-group    { background: #3a2d00; color: #cca700; }
  .source-template { background: #1e3a1e; color: #4ec994; }

  .cond-icon { font-size: 10px; cursor: help; }

  /* Buttons */
  .copy-btn {
    background: transparent;
    border: none;
    color: var(--fg);
    cursor: pointer;
    opacity: 0;
    font-size: 11px;
    padding: 1px 3px;
    border-radius: 2px;
    margin-left: 4px;
    vertical-align: middle;
    transition: opacity 0.1s, background 0.1s;
  }
  .copy-btn:hover { background: var(--accent); color: var(--accent-fg); opacity: 1 !important; }

  .action-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--fg);
    padding: 3px 6px;
    border-radius: 3px;
    font-size: 10px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.1s;
  }
  .action-btn:hover { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
  .copilot-btn::before { content: ''; }

  /* Legend */
  .legend {
    padding: 6px 12px;
    border-top: 1px solid var(--border);
    display: flex;
    gap: 12px;
    flex-shrink: 0;
    flex-wrap: wrap;
    opacity: 0.65;
    font-size: 10px;
    align-items: center;
  }
  .legend-item { display: flex; align-items: center; gap: 4px; }

  /* Empty state */
  .empty-state {
    padding: 40px;
    text-align: center;
    opacity: 0.5;
  }
  .empty-state h3 { margin-bottom: 8px; font-size: 14px; }
</style>
</head>
<body>

<div class="header">
  <span class="header-title">ADO Variable Inspector</span>
  <span class="filename-chip">${escapeHtml(filename)}</span>
  <span class="stat-chip">${variables.size} variables · ${envColumns.length} envs</span>
</div>

${errorsHtml}

<div class="toolbar">
  <input class="search-box" id="searchBox" type="text" placeholder="Filter variables…" oninput="filterTable(this.value)" />
  <button class="filter-btn active" id="btn-all" onclick="setFilter('all', this)">All</button>
  <button class="filter-btn" id="btn-pipeline" onclick="setFilter('pipeline', this)">Pipeline</button>
  <button class="filter-btn" id="btn-stage" onclick="setFilter('stage', this)">Stage</button>
  <button class="filter-btn" id="btn-conditional" onclick="setFilter('conditional', this)">Conditional ⚡</button>
  <span class="toolbar-right">Hover a value to copy · ✦ Ask = open in Copilot</span>
</div>

<div class="table-wrap">
  ${matrices.length === 0 ? `
    <div class="empty-state">
      <h3>No variables found</h3>
      <p>Open an ADO pipeline YAML file and run <strong>ADO: Inspect Variables</strong></p>
    </div>
  ` : `
  <table id="varTable">
    <thead>
      <tr>
        <th>Variable</th>
        <th>Source</th>
        ${envHeaders}
        <th></th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>
  `}
</div>

<div class="legend">
  <span class="legend-item"><span class="source-tag source-pipeline">pipeline</span> top-level variables block</span>
  <span class="legend-item"><span class="source-tag source-stage">stage</span> stage-scoped override</span>
  <span class="legend-item"><span class="source-tag source-conditional">conditional</span> &#36;&#123;&#123; if &#125;&#125; expression</span>
  <span class="legend-item"><span style="font-family:monospace;color:#9cdcfe">$(ref)</span> references another variable</span>
  <span class="legend-item">⚡ has conditional branches</span>
</div>

<script>
  const vscode = acquireVsCodeApi();
  let activeFilter = 'all';
  let activeSearch = '';

  function copyCell(btn) {
    const val = btn.closest('td').dataset.copy;
    vscode.postMessage({ command: 'copyValue', value: val });
    btn.textContent = '✓';
    setTimeout(() => btn.textContent = '⎘', 1200);
  }

  function askCopilot(varName) {
    const query = '@adovars What is the purpose and expected value of the variable "' + varName + '" in this ADO pipeline? Show me all its overrides.';
    vscode.postMessage({ command: 'askCopilot', query });
  }

  function filterTable(search) {
    activeSearch = search.toLowerCase();
    applyFilters();
  }

  function setFilter(source, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = source;
    applyFilters();
  }

  function applyFilters() {
    const rows = document.querySelectorAll('#varTable tbody tr');
    rows.forEach(row => {
      const varName = (row.dataset.varname || '').toLowerCase();
      const sourceCell = row.querySelector('.source-tag');
      const sourceText = sourceCell ? sourceCell.textContent.trim().toLowerCase() : '';

      const matchesSearch = !activeSearch || varName.includes(activeSearch);
      const matchesFilter = activeFilter === 'all' || sourceText.includes(activeFilter);

      row.classList.toggle('hidden', !(matchesSearch && matchesFilter));
    });
  }

  // Handle messages from extension
  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.command === 'focusVariable') {
      const row = document.querySelector('[data-varname="' + msg.name + '"]');
      if (row) {
        row.classList.add('highlighted');
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => row.classList.remove('highlighted'), 2500);
      }
      // Also filter to that variable
      document.getElementById('searchBox').value = msg.name;
      filterTable(msg.name);
    }
  });
</script>
</body>
</html>`;
    }
    dispose() {
        VariableInspectorPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d)
                d.dispose();
        }
    }
}
exports.VariableInspectorPanel = VariableInspectorPanel;
VariableInspectorPanel.viewType = 'adoVarInspector';
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
//# sourceMappingURL=panel.js.map