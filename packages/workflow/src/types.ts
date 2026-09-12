export interface WorkflowStep {
  id: string;
  capability: string;
  input?: unknown;
  from?: string;
  timeoutMs?: number;
}

export interface Workflow {
  name: string;
  description?: string;
  steps: WorkflowStep[];
}

export interface StepResult {
  id: string;
  capability: string;
  ok: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
}

export interface WorkflowResult {
  name: string;
  ok: boolean;
  steps: StepResult[];
  output?: unknown;
  error?: string;
}
