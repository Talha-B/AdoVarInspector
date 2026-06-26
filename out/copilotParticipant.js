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
exports.registerCopilotParticipant = registerCopilotParticipant;
const vscode = __importStar(require("vscode"));
const variableParser_1 = require("./variableParser");
const PARTICIPANT_ID = 'adoVarInspector.assistant';
/**
 * Registers the @adovars Copilot chat participant.
 * Users can type: @adovars What does $(deploySlot) resolve to in prod?
 */
function registerCopilotParticipant(context, getActiveYaml) {
    const handler = async (request, chatContext, stream, token) => {
        const yamlSource = getActiveYaml();
        if (!yamlSource) {
            stream.markdown('⚠️ **No ADO YAML file active.**\n\nOpen an Azure DevOps pipeline YAML file in the editor first, then ask me again.');
            return;
        }
        const { content, filename } = yamlSource;
        const parseResult = (0, variableParser_1.parsePipelineVariables)(content);
        const { variables, environments } = parseResult;
        const envColumns = environments.length > 0 ? environments : ['(global)'];
        if (!envColumns.includes('(global)'))
            envColumns.unshift('(global)');
        const userQuery = request.prompt.trim();
        // Check if asking about a specific variable
        const varNameMatch = userQuery.match(/["`'«]?([\w.-]+)["`'»]?/g);
        const candidates = varNameMatch
            ?.map(m => m.replace(/[`'"«»]/g, '').trim())
            .filter(name => variables.has(name)) ?? [];
        if (candidates.length > 0) {
            for (const varName of candidates) {
                const entries = variables.get(varName);
                const matrix = (0, variableParser_1.resolveVariableMatrix)(varName, entries, envColumns);
                stream.markdown(`### Variable: \`${varName}\`\n`);
                stream.markdown(`**File:** \`${filename}\`\n\n`);
                // Summary table
                stream.markdown('| Environment | Resolved Value | Source |\n');
                stream.markdown('|-------------|---------------|--------|\n');
                for (const env of Object.keys(matrix.resolvedPerEnv)) {
                    const val = matrix.resolvedPerEnv[env];
                    const displayVal = val !== undefined ? `\`${val}\`` : '_not set_';
                    const entry = entries.find(e => env === '(global)'
                        ? e.source === 'pipeline'
                        : e.stage?.toLowerCase() === env.toLowerCase() ||
                            (e.condition?.toLowerCase().includes(`'${env.toLowerCase()}'`))) ?? entries.find(e => e.source === 'pipeline');
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
        }
        else {
            // General query — list all variables
            stream.markdown(`## ADO Variables in \`${filename}\`\n\n`);
            stream.markdown(`Detected **${variables.size} variables** across **${envColumns.join(', ')}**.\n\n`);
            if (userQuery.toLowerCase().includes('list') || userQuery.toLowerCase().includes('all')) {
                stream.markdown('| Variable | Pipeline Value | Environments |\n');
                stream.markdown('|----------|---------------|-------------|\n');
                for (const [name, entries] of variables.entries()) {
                    const baseline = entries.find(e => e.source === 'pipeline')?.value ?? '—';
                    const envCount = entries.filter(e => e.source === 'stage' || e.source === 'conditional').length;
                    stream.markdown(`| \`${name}\` | \`${baseline}\` | ${envCount} override(s) |\n`);
                }
            }
            else {
                stream.markdown('You can ask me about a specific variable, e.g.:\n\n' +
                    '> `@adovars What does $(deploySlot) resolve to in prod?`\n\n' +
                    '> `@adovars List all variables`\n\n' +
                    '> `@adovars Which variables change between environments?`\n\n');
                // Variables that differ between environments
                const differing = [];
                for (const [name, entries] of variables.entries()) {
                    const hasOverrides = entries.some(e => e.source !== 'pipeline');
                    if (hasOverrides)
                        differing.push(name);
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
//# sourceMappingURL=copilotParticipant.js.map