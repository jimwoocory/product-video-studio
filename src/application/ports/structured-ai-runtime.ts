export type StructuredAiRequest = {
  task: string;
  instructions: string;
  input: unknown;
  outputContract: unknown;
};

export interface StructuredAiRuntime {
  readonly id: string;
  readonly version: string;
  generateJson(request: StructuredAiRequest): Promise<unknown>;
}
