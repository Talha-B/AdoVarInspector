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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const variableParser_1 = require("./variableParser");
const panel_1 = require("./panel");
const copilotParticipant_1 = require("./copilotParticipant");
function getActiveYamlEditor() {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return undefined;
    const doc = editor.document;
    if (!doc.fileName.match(/\.(yml|yaml)$/i))
        return undefined;
    return {
        content: doc.getText(),
        filename: doc.fileName.split(/[/\\]/).pop() ?? doc.fileName,
        editor,
    };
}
function activate(context) {
    console.log('ADO Variable Inspector: activated');
    // ── Command: Open Panel ──────────────────────────────────────────────────
    const openPanelCmd = vscode.commands.registerCommand('adoVarInspector.openPanel', () => {
        const yamlSource = getActiveYamlEditor();
        if (!yamlSource) {
            vscode.window.showWarningMessage('ADO Variable Inspector: Open an Azure DevOps YAML pipeline file first.');
            return;
        }
        const parseResult = (0, variableParser_1.parsePipelineVariables)(yamlSource.content);
        if (parseResult.errors.length > 0) {
            vscode.window.showWarningMessage(`ADO Variable Inspector: ${parseResult.errors[0]}`);
        }
        panel_1.VariableInspectorPanel.createOrShow(context.extensionUri, parseResult, yamlSource.filename);
    });
    // ── Command: Inspect variable at cursor ──────────────────────────────────
    const inspectAtCursorCmd = vscode.commands.registerCommand('adoVarInspector.inspectAtCursor', () => {
        const yamlSource = getActiveYamlEditor();
        if (!yamlSource)
            return;
        const { content, filename, editor } = yamlSource;
        const position = editor.selection.active;
        const line = editor.document.lineAt(position.line).text;
        const varName = (0, variableParser_1.extractVariableAtPosition)(line, position.character);
        const parseResult = (0, variableParser_1.parsePipelineVariables)(content);
        panel_1.VariableInspectorPanel.createOrShow(context.extensionUri, parseResult, filename);
        if (varName && panel_1.VariableInspectorPanel.currentPanel) {
            setTimeout(() => panel_1.VariableInspectorPanel.currentPanel?.focusVariable(varName), 300);
        }
        else if (!varName) {
            vscode.window.showInformationMessage('ADO Variable Inspector: Place your cursor on a variable name to jump to it.');
        }
    });
    // ── Auto-refresh on edit ─────────────────────────────────────────────────
    let refreshTimer;
    const onTextChange = vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || event.document !== editor.document)
            return;
        if (!event.document.fileName.match(/\.(yml|yaml)$/i))
            return;
        if (!panel_1.VariableInspectorPanel.currentPanel)
            return;
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
            const yamlSource = getActiveYamlEditor();
            if (!yamlSource)
                return;
            const parseResult = (0, variableParser_1.parsePipelineVariables)(yamlSource.content);
            panel_1.VariableInspectorPanel.currentPanel?.update(parseResult, yamlSource.filename);
        }, 600);
    });
    // ── Re-parse on tab switch ───────────────────────────────────────────────
    const onEditorChange = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (!editor)
            return;
        if (!editor.document.fileName.match(/\.(yml|yaml)$/i))
            return;
        if (!panel_1.VariableInspectorPanel.currentPanel)
            return;
        const content = editor.document.getText();
        const filename = editor.document.fileName.split(/[/\\]/).pop() ?? editor.document.fileName;
        const parseResult = (0, variableParser_1.parsePipelineVariables)(content);
        panel_1.VariableInspectorPanel.currentPanel.update(parseResult, filename);
    });
    // ── Copilot Chat Participant (optional) ──────────────────────────────────
    let copilotParticipant;
    try {
        if (typeof vscode.chat?.createChatParticipant === 'function') {
            copilotParticipant = (0, copilotParticipant_1.registerCopilotParticipant)(context, () => {
                const s = getActiveYamlEditor();
                return s ? { content: s.content, filename: s.filename } : undefined;
            });
        }
    }
    catch (e) {
        console.warn('ADO Variable Inspector: Copilot Chat not available, skipping participant.', e);
    }
    context.subscriptions.push(openPanelCmd, inspectAtCursorCmd, onTextChange, onEditorChange, ...(copilotParticipant ? [copilotParticipant] : []));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map