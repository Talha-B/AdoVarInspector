import * as vscode from 'vscode';
import { parsePipelineVariables, extractVariableAtPosition } from './variableParser';
import { VariableInspectorPanel } from './panel';
import { registerCopilotParticipant } from './copilotParticipant';

function getActiveYamlEditor(): { content: string; filename: string; editor: vscode.TextEditor } | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;
  const doc = editor.document;
  if (!doc.fileName.match(/\.(yml|yaml)$/i)) return undefined;
  return {
    content: doc.getText(),
    filename: doc.fileName.split(/[/\\]/).pop() ?? doc.fileName,
    editor,
  };
}

export function activate(context: vscode.ExtensionContext) {
  console.log('ADO Variable Inspector: activated');

  // ── Command: Open Panel ──────────────────────────────────────────────────
  const openPanelCmd = vscode.commands.registerCommand(
    'adoVarInspector.openPanel',
    () => {
      const yamlSource = getActiveYamlEditor();
      if (!yamlSource) {
        vscode.window.showWarningMessage(
          'ADO Variable Inspector: Open an Azure DevOps YAML pipeline file first.'
        );
        return;
      }
      const parseResult = parsePipelineVariables(yamlSource.content);
      if (parseResult.errors.length > 0) {
        vscode.window.showWarningMessage(`ADO Variable Inspector: ${parseResult.errors[0]}`);
      }
      VariableInspectorPanel.createOrShow(context.extensionUri, parseResult, yamlSource.filename);
    }
  );

  // ── Command: Inspect variable at cursor ──────────────────────────────────
  const inspectAtCursorCmd = vscode.commands.registerCommand(
    'adoVarInspector.inspectAtCursor',
    () => {
      const yamlSource = getActiveYamlEditor();
      if (!yamlSource) return;
      const { content, filename, editor } = yamlSource;
      const position = editor.selection.active;
      const line = editor.document.lineAt(position.line).text;
      const varName = extractVariableAtPosition(line, position.character);
      const parseResult = parsePipelineVariables(content);
      VariableInspectorPanel.createOrShow(context.extensionUri, parseResult, filename);
      if (varName && VariableInspectorPanel.currentPanel) {
        setTimeout(() => VariableInspectorPanel.currentPanel?.focusVariable(varName), 300);
      } else if (!varName) {
        vscode.window.showInformationMessage(
          'ADO Variable Inspector: Place your cursor on a variable name to jump to it.'
        );
      }
    }
  );

  // ── Auto-refresh on edit ─────────────────────────────────────────────────
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const onTextChange = vscode.workspace.onDidChangeTextDocument(event => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || event.document !== editor.document) return;
    if (!event.document.fileName.match(/\.(yml|yaml)$/i)) return;
    if (!VariableInspectorPanel.currentPanel) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      const yamlSource = getActiveYamlEditor();
      if (!yamlSource) return;
      const parseResult = parsePipelineVariables(yamlSource.content);
      VariableInspectorPanel.currentPanel?.update(parseResult, yamlSource.filename);
    }, 600);
  });

  // ── Re-parse on tab switch ───────────────────────────────────────────────
  const onEditorChange = vscode.window.onDidChangeActiveTextEditor(editor => {
    if (!editor) return;
    if (!editor.document.fileName.match(/\.(yml|yaml)$/i)) return;
    if (!VariableInspectorPanel.currentPanel) return;
    const content = editor.document.getText();
    const filename = editor.document.fileName.split(/[/\\]/).pop() ?? editor.document.fileName;
    const parseResult = parsePipelineVariables(content);
    VariableInspectorPanel.currentPanel.update(parseResult, filename);
  });

  // ── Copilot Chat Participant (optional) ──────────────────────────────────
  let copilotParticipant: vscode.Disposable | undefined;
  try {
    if (typeof (vscode as any).chat?.createChatParticipant === 'function') {
      copilotParticipant = registerCopilotParticipant(
        context,
        () => {
          const s = getActiveYamlEditor();
          return s ? { content: s.content, filename: s.filename } : undefined;
        }
      );
    }
  } catch (e) {
    console.warn('ADO Variable Inspector: Copilot Chat not available, skipping participant.', e);
  }

  context.subscriptions.push(
    openPanelCmd,
    inspectAtCursorCmd,
    onTextChange,
    onEditorChange,
    ...(copilotParticipant ? [copilotParticipant] : [])
  );
}

export function deactivate() {}
