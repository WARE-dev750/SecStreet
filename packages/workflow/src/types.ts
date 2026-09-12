export type ConditionOp =
  | "equals"
  | "notEquals"
  | "contains"
  | "exists"
  | "greaterThan"
  | "lessThan";

export interface StepCondition {
  step: string;
  path: string;
  op: ConditionOp;
  value?: unknown;
}

export interface WorkflowStep {
  id: string;
  capability: string;
  input?: unknown;
  from?: string;
  timeoutMs?: number;
  when?: StepCondition;
}

export interface Workflow {
  name: string;
  description?: string;
  steps: WorkflowStep[];
  autoAdapters?: boolean;
}

export interface StepResult {
  id: string;
  capability: string;
  ok: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
  insertedAdapter?: boolean;
  skipped?: boolean;
}

export interface WorkflowResult {
  name: string;
  ok: boolean;
  steps: StepResult[];
  output?: unknown;
  error?: string;
}
