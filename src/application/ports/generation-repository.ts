import type {
  CompiledPrompt,
  GenerationRequest,
  PreflightReport,
  UserApproval
} from "../../domain/schemas.js";

export interface GenerationRepository {
  markSubmissionChainStale(projectId: string, staleAt: string): Promise<void>;
  saveCompiledPrompt(prompt: CompiledPrompt): Promise<CompiledPrompt>;
  listCompiledPrompts(projectId: string): Promise<CompiledPrompt[]>;
  createGenerationRequest(request: GenerationRequest): Promise<GenerationRequest>;
  getGenerationRequest(id: string): Promise<GenerationRequest | null>;
  listGenerationRequests(projectId: string): Promise<GenerationRequest[]>;
  listCurrentGenerationRequests(projectId: string): Promise<GenerationRequest[]>;
  createPreflightReport(report: PreflightReport): Promise<PreflightReport>;
  getPreflightReport(id: string): Promise<PreflightReport | null>;
  listPreflightReports(projectId: string): Promise<PreflightReport[]>;
  createUserApproval(approval: UserApproval): Promise<UserApproval>;
  getUserApproval(id: string): Promise<UserApproval | null>;
  listUserApprovals(projectId: string): Promise<UserApproval[]>;
}
