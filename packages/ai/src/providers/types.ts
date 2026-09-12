export interface CompletionRequest {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}

export interface CompletionResult {
  text: string;
  model: string;
  provider: string;
}

export interface AIProvider {
  readonly name: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}
