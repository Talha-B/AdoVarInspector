# ADO Variable Inspector

> Stop mentally tracing `${{ if eq(variables['env'], 'prod') }}` chains.

A VS Code extension that parses your Azure DevOps pipeline YAML and shows every variable resolved across all environments and stages — side by side, in a live table.

---

## The problem

ADO pipelines scatter variable declarations everywhere — top-level blocks, stage overrides, conditional expressions, variable groups, templates. Figuring out what `$(deploySlot)` actually resolves to in `prod` means jumping between files and mentally evaluating conditions. It's slow and error-prone.

## The solution

Open any `.yml` pipeline file and hit `Ctrl+Shift+V`. A panel opens beside your editor showing a table like this:

| Variable | Source | dev | staging | prod |
|---|---|---|---|---|
| `deploySlot` | pipeline | `slot-dev` | `slot-stg` | `slot-prod` |
| `imageTag` | conditional ⚡ | `latest` | `rc-1.2` | `1.2.0` |
| `replicas` | stage | `1` | `2` | `5` |
| `[group] secrets` | group | — | — | — |

The table updates live as you edit the file.

---

## Features

- **Variable matrix** — every variable with its resolved value per environment/stage, side by side
- **Conditional resolution** — understands `${{ if }}` / `${{ elseif }}` expressions and shows which value wins per environment
- **Scope awareness** — distinguishes pipeline-level, stage-level, job-level, and conditional overrides
- **Live refresh** — panel updates as you type, with a short debounce
- **Cursor-aware jump** — right-click any variable reference → *Inspect Variable at Cursor* scrolls and highlights that row
- **Search & filter** — filter by name or by source type (pipeline / stage / conditional)
- **Copy on hover** — hover any value cell to reveal a one-click copy button
- **Copilot Chat integration** — type `@adovars` in GitHub Copilot Chat to ask natural language questions about your variables (optional, requires GitHub Copilot Chat)

---

## Installation

### From VSIX (recommended)

1. Download the latest `.vsix` from [Releases](https://github.com/your-username/ado-var-inspector/releases)
2. In VS Code: `Ctrl+Shift+X` → `...` menu → **Install from VSIX...**

Or via terminal:
```bash
code --install-extension ado-var-inspector-0.1.0.vsix
```

### Build from source

```bash
git clone https://github.com/your-username/ado-var-inspector
cd ado-var-inspector
npm install
npm install -g @vscode/vsce
vsce package --allow-missing-repository
code --install-extension ado-var-inspector-0.1.0.vsix
```

---

## Usage

| Action | How |
|---|---|
| Open inspector panel | `Ctrl+Shift+V` (Windows/Linux) · `Cmd+Shift+V` (macOS) |
| Open inspector panel | Click the `⊞` icon in the editor title bar |
| Open inspector panel | Command Palette → `ADO: Inspect Variables` |
| Jump to variable at cursor | Right-click → `ADO: Inspect Variable at Cursor` |
| Ask Copilot about a variable | `@adovars What does $(deploySlot) resolve to in prod?` |

---

## ADO YAML patterns understood

| Pattern | Example |
|---|---|
| Pipeline variables (array form) | `variables: [{ name: foo, value: bar }]` |
| Pipeline variables (object form) | `variables: { foo: bar }` |
| Stage-level overrides | `stages: [{ stage: prod, variables: [...] }]` |
| Job-level overrides | `jobs: [{ job: deploy, variables: [...] }]` |
| Conditional blocks | `${{ if eq(variables['env'], 'prod') }}: ...` |
| Variable groups | `variables: [{ group: my-keyvault-group }]` |
| Template references | `variables: [{ template: vars/common.yml }]` |

---

## Copilot Chat (@adovars)

If you have GitHub Copilot Chat installed, the `@adovars` participant lets you ask questions in natural language:

```
@adovars What does $(deploySlot) resolve to in staging?
@adovars List all variables
@adovars Which variables have different values between environments?
```

The participant reads whichever YAML file is currently active in your editor. If Copilot Chat isn't installed, everything else still works normally.

---

## Requirements

- VS Code 1.90+
- GitHub Copilot Chat *(optional — only needed for `@adovars` chat commands)*

---

## Roadmap

- [ ] Cross-file resolution — follow `template:` references into other files
- [ ] Variable group expansion via Azure DevOps REST API
- [ ] Highlight variables that are declared but never referenced
- [ ] Export matrix to CSV or Markdown
- [ ] Diff view between two pipeline files

---

## Contributing

PRs welcome. The project is four files:

```
src/
  extension.ts          — activation, commands, auto-refresh wiring
  variableParser.ts     — YAML parsing and per-environment resolution logic
  panel.ts              — WebviewPanel with the HTML/CSS/JS table UI
  copilotParticipant.ts — @adovars Copilot Chat participant
```

---

## License

MIT
