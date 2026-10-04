import type {
  CreativeBatch,
  DirectorGenerationTarget,
  ProductTruth,
  ProductionPlan,
  ReferenceVideoProfile,
  ScriptDraft
} from "../../domain/schemas.js";
import type { CreativeProductionContext } from "../../domain/smart-generation.js";

export type ProductDirectorInput = {
  productTruth: ProductTruth;
  creativeBatch: CreativeBatch;
  selectedCreativeId: string;
  script: ScriptDraft;
  referenceVideoProfile?: ReferenceVideoProfile | null;
  projectTargetDurationMs: number;
  generationTarget?: DirectorGenerationTarget;
  creativeContext?: CreativeProductionContext;
  productionPlanVersion?: number;
};

export interface ProductDirectorGenerator {
  id: string;
  version: string;
  generate(input: ProductDirectorInput): Promise<ProductionPlan>;
}
