import * as vscode from 'vscode';
import { parsePipelineVariables, resolveVariableMatrix } from './variableParser';

const PARTICIPANT_ID = 'adoVarInspector.assistant';

/**
 * Registers the @adovars Copilot chat participant.
 * Users can type: @adovars What does $(deploySlot) resolve to in prod?
 */
export function registerCopilotParticipant(
  context: vscode.ExtensionContext,
  getActiveYaml: () => { content: string; filename: string } | undefined
): vscode.Disposable {
  const handler: vscode.ChatRequestHandler = async (
    request: vscode.ChatRequest,
    chatContext: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ) => {
    const yamlSource = getActiveYaml();

    if (!yamlSource) {
      stream.markdown(
        '⚠️ **No ADO YAML file active.**\n\nOpen an Azure DevOps pipeline YAML file in the editor first, then ask me again.'
      );
      return;
    }

    const { content, filename } = yamlSource;
    const parseResult = parsePipelineVariables(content);
    const { variables, environments } = parseResult;
    const envColumns = environments.length > 0 ? environments : ['(global)'];
    if (!envColumns.includes('(global)')) envColumns.unshift('(global)');

    const userQuery = request.prompt.trim();

    // Check if asking about a specific variable
    const varNameMatch = userQuery.match(/["`'«]?([\w.-]+)["`'»]?/g);
    const candidates = varNameMatch
      ?.map(m => m.replace(/[`'"«»]/g, '').trim())
      .filter(name => variables.has(name)) ?? [];

    if (candidates.length > 0) {
      for (const varName of candidates) {
        const entries = variables.get(varName)!;
        const matrix = resolveVariableMatrix(varName, entries, envColumns);

        stream.markdown(`### Variable: \`${varName}\`\n`);
        stream.markdown(`**File:** \`${filename}\`\n\n`);

        // Summary table
        stream.markdown('| Environment | Resolved Value | Source |\n');
        stream.markdown('|-------------|---------------|--------|\n');

        for (const env of Object.keys(matrix.resolvedPerEnv)) {
          const val = matrix.resolvedPerEnv[env];
          const displayVal = val !== undefined ? `\`${val}\`` : '_not set_';
          const entry = entries.find(e =>
            env === '(global)'
              ? e.source === 'pipeline'
              : e.stage?.toLowerCase() === env.toLowerCase() ||
                (e.condition?.toLowerCase().includes(`'${env.toLowerCase()}'`))
          ) ?? entries.find(e => e.source === 'pipeline');
          const source = entry?.source ?? '—';
          stream.markdown(`| ${env} | ${displayVal} | ${source} |\n`);
        }

        stream.markdown('\n');

        // Conditional overrides
        const conditionals = entries.filter(e => e.source === 'conditional');
        if (conditionals.length > 0) {
          stream.markdown('**Conditional overrides:**\n');
          for (const c of conditionals) {
            stream.markdown(`- When \`${c.condition}\` → \`${c.value ?? '(undefined)'}\`\n`);
          }
          stream.markdown('\n');
        }

        // Stage overrides
        const stageOverrides = entries.filter(e => e.source === 'stage');
        if (stageOverrides.length > 0) {
          stream.markdown('**Stage-level overrides:**\n');
          for (const s of stageOverrides) {
            stream.markdown(`- Stage \`${s.stage}\` → \`${s.value ?? '(undefined)'}\`\n`);
          }
        }
      }
    } else {
      // General query — list all variables
      stream.markdown(`## ADO Variables in \`${filename}\`\n\n`);
      stream.markdown(`Detected **${variables.size} variables** across **${envColumns.join(', ')}**.\n\n`);

      if (userQuery.toLowerCase().includes('list') || userQuery.toLowerCase().includes('all')) {
        stream.markdown('| Variable | Pipeline Value | Environments |\n');
        stream.markdown('|----------|---------------|-------------|\n');
        for (const [name, entries] of variables.entries()) {
          const baseline = entries.find(e => e.source === 'pipeline')?.value ?? '—';
          const envCount = entries.filter(e => e.source === 'stage' || e.source === 'conditional').length;
          stream.markdown(
            `| \`${name}\` | \`${baseline}\` | ${envCount} override(s) |\n`
          );
        }
      } else {
        stream.markdown(
          'You can ask me about a specific variable, e.g.:\n\n' +
          '> `@adovars What does $(deploySlot) resolve to in prod?`\n\n' +
          '> `@adovars List all variables`\n\n' +
          '> `@adovars Which variables change between environments?`\n\n'
        );

        // Variables that differ between environments
        const differing: string[] = [];
        for (const [name, entries] of variables.entries()) {
          const hasOverrides = entries.some(e => e.source !== 'pipeline');
          if (hasOverrides) differing.push(name);
        }
        if (differing.length > 0) {
          stream.markdown(`**Variables with environment overrides:** ${differing.map(n => `\`${n}\``).join(', ')}\n`);
        }
      }
    }

    // Always offer to open the panel
    stream.button({
      command: 'adoVarInspector.openPanel',
      title: '$(table) Open Variable Inspector Panel',
    });
  };

  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handler);
  participant.iconPath = new vscode.ThemeIcon('symbol-variable');

  return participant;
}
