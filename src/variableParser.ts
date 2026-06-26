import * as yaml from 'js-yaml';

export interface VariableEntry {
  name: string;
  value: string | undefined;
  source: 'pipeline' | 'stage' | 'job' | 'template' | 'group' | 'conditional';
  stage?: string;
  job?: string;
  condition?: string;
  lineNumber?: number;
  isSecret?: boolean;
  isReadonly?: boolean;
}

export interface EnvironmentMatrix {
  variable: string;
  entries: VariableEntry[];
  resolvedPerEnv: Record<string, string | undefined>;
}

export interface ParseResult {
  variables: Map<string, VariableEntry[]>;
  environments: string[];
  stages: string[];
  rawYaml: any;
  errors: string[];
}

/** Flatten a variables block (array or object form) into VariableEntry[] */
function flattenVariablesBlock(
  block: any,
  source: VariableEntry['source'],
  stage?: string,
  job?: string,
  lineOffset?: number
): VariableEntry[] {
  const entries: VariableEntry[] = [];
  if (!block) return entries;

  if (Array.isArray(block)) {
    for (const item of block) {
      if (item.name !== undefined) {
        entries.push({
          name: item.name,
          value: item.value !== undefined ? String(item.value) : undefined,
          source,
          stage,
          job,
          isSecret: item.isSecret === true,
          isReadonly: item.isReadonly === true,
        });
      } else if (item.group !== undefined) {
        entries.push({
          name: `[group] ${item.group}`,
          value: undefined,
          source: 'group',
          stage,
          job,
        });
      } else if (item.template !== undefined) {
        entries.push({
          name: `[template] ${item.template}`,
          value: undefined,
          source: 'template',
          stage,
          job,
        });
      }
    }
  } else if (typeof block === 'object') {
    for (const [key, value] of Object.entries(block)) {
      entries.push({
        name: key,
        value: value !== undefined ? String(value) : undefined,
        source,
        stage,
        job,
      });
    }
  }

  return entries;
}

/** Recursively expand ${{ if }} conditional expressions and collect variable definitions */
function extractConditionalVariables(
  block: any,
  source: VariableEntry['source'],
  stage?: string,
  job?: string
): VariableEntry[] {
  const entries: VariableEntry[] = [];
  if (!block || typeof block !== 'object') return entries;

  // ADO conditional syntax appears as keys like "${{ if eq(variables['env'], 'prod') }}:"
  for (const [key, value] of Object.entries(block)) {
    const conditionalMatch = key.match(/^\$\{\{\s*(if|elseif)\s+(.+?)\s*\}\}$/);
    if (conditionalMatch) {
      const condition = conditionalMatch[2];
      const inner = value as any;
      if (Array.isArray(inner)) {
        for (const item of inner) {
          if (item?.name !== undefined) {
            entries.push({
              name: item.name,
              value: item.value !== undefined ? String(item.value) : undefined,
              source: 'conditional',
              stage,
              job,
              condition,
            });
          }
        }
      } else if (inner && typeof inner === 'object') {
        for (const [varName, varVal] of Object.entries(inner)) {
          if (!varName.startsWith('${{')) {
            entries.push({
              name: varName,
              value: varVal !== undefined ? String(varVal) : undefined,
              source: 'conditional',
              stage,
              job,
              condition,
            });
          }
        }
      }
    }
  }

  return entries;
}

/** Walk an ADO pipeline YAML document and collect all variable declarations */
export function parsePipelineVariables(yamlContent: string): ParseResult {
  const errors: string[] = [];
  const allEntries: VariableEntry[] = [];
  const stages: string[] = [];

  let doc: any;
  try {
    doc = yaml.load(yamlContent);
  } catch (e: any) {
    return {
      variables: new Map(),
      environments: [],
      stages: [],
      rawYaml: null,
      errors: [`YAML parse error: ${e.message}`],
    };
  }

  if (!doc || typeof doc !== 'object') {
    return { variables: new Map(), environments: [], stages: [], rawYaml: doc, errors: [] };
  }

  // Top-level variables
  if (doc.variables) {
    allEntries.push(...flattenVariablesBlock(doc.variables, 'pipeline'));
    allEntries.push(...extractConditionalVariables(
      Array.isArray(doc.variables)
        ? Object.fromEntries(doc.variables.map((v: any, i: number) => [i, v]))
        : doc.variables,
      'conditional'
    ));
  }

  // Stages
  if (Array.isArray(doc.stages)) {
    for (const stage of doc.stages) {
      const stageName: string = stage.stage || stage.template || 'unnamed';
      stages.push(stageName);

      if (stage.variables) {
        allEntries.push(...flattenVariablesBlock(stage.variables, 'stage', stageName));
      }

      // Jobs within stages
      const jobs = stage.jobs || [];
      for (const job of jobs) {
        const jobName: string = job.job || job.deployment || job.template || 'unnamed';
        if (job.variables) {
          allEntries.push(...flattenVariablesBlock(job.variables, 'job', stageName, jobName));
        }
        // Steps can reference variables but don't declare them
      }
    }
  }

  // Jobs at root level (no explicit stages)
  if (Array.isArray(doc.jobs)) {
    for (const job of doc.jobs) {
      const jobName: string = job.job || job.deployment || 'unnamed';
      if (job.variables) {
        allEntries.push(...flattenVariablesBlock(job.variables, 'job', undefined, jobName));
      }
    }
  }

  // Collect into a map keyed by variable name
  const variableMap = new Map<string, VariableEntry[]>();
  for (const entry of allEntries) {
    const existing = variableMap.get(entry.name) || [];
    existing.push(entry);
    variableMap.set(entry.name, existing);
  }

  // Derive environment list: stages + any 'environment' keys in deployment jobs
  const envSet = new Set<string>(stages);
  if (Array.isArray(doc.stages)) {
    for (const stage of doc.stages) {
      for (const job of (stage.jobs || [])) {
        if (job.environment) {
          const env = typeof job.environment === 'string' ? job.environment : job.environment?.name;
          if (env) envSet.add(env);
        }
      }
    }
  }

  // Also infer environments from conditional expressions like eq(variables['Environment'], 'prod')
  const conditionEnvRegex = /eq\s*\(\s*variables\[['"](\w+)['"]\]\s*,\s*['"](\w+)['"]\)/gi;
  const yamlStr = yamlContent;
  let match;
  while ((match = conditionEnvRegex.exec(yamlStr)) !== null) {
    const paramName = match[1].toLowerCase();
    if (['env', 'environment', 'stage', 'envname', 'deployenv'].includes(paramName)) {
      envSet.add(match[2]);
    }
  }

  const environments = Array.from(envSet);

  return { variables: variableMap, environments, stages, rawYaml: doc, errors };
}

/** Build a resolved-per-environment matrix for a single variable */
export function resolveVariableMatrix(
  name: string,
  entries: VariableEntry[],
  environments: string[]
): EnvironmentMatrix {
  const resolvedPerEnv: Record<string, string | undefined> = {};

  // Pipeline-level value is the baseline
  const pipelineEntry = entries.find(e => e.source === 'pipeline' && !e.condition);
  const baseline = pipelineEntry?.value;

  for (const env of environments) {
    // Try stage-specific override first
    const stageEntry = entries.find(
      e => e.source === 'stage' && e.stage?.toLowerCase() === env.toLowerCase()
    );
    if (stageEntry) {
      resolvedPerEnv[env] = stageEntry.value;
      continue;
    }

    // Try conditional override: look for conditions that mention this env value
    const condEntry = entries.find(e => {
      if (!e.condition) return false;
      const cond = e.condition.toLowerCase();
      return cond.includes(`'${env.toLowerCase()}'`) || cond.includes(`"${env.toLowerCase()}"`);
    });
    if (condEntry) {
      resolvedPerEnv[env] = condEntry.value;
      continue;
    }

    // Fall back to pipeline-level baseline
    resolvedPerEnv[env] = baseline;
  }

  // "global" env always shows baseline
  if (environments.length === 0 || !environments.includes('(global)')) {
    resolvedPerEnv['(global)'] = baseline;
  }

  return { variable: name, entries, resolvedPerEnv };
}

/** Find the variable name the cursor is currently on */
export function extractVariableAtPosition(line: string, character: number): string | null {
  // Match patterns: $(varName), variables['varName'], variables.varName, varName: value
  const patterns = [
    /\$\((\w+)\)/g,
    /variables\[['"](\w+)['"]\]/g,
    /variables\.(\w+)/g,
  ];

  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(line)) !== null) {
      if (character >= m.index && character <= m.index + m[0].length) {
        return m[1];
      }
    }
  }

  // Also: bare key on a variable definition line "  - name: foo"
  const nameLineMatch = line.match(/^\s*-?\s*name:\s*(\w+)/);
  if (nameLineMatch) return nameLineMatch[1];

  // bare "key: value" variable line
  const kvMatch = line.match(/^\s{2,}(\w+)\s*:/);
  if (kvMatch) return kvMatch[1];

  return null;
}
