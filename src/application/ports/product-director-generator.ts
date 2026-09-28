import type {
  CreativeBatch,
  ProductTruth,
  ProductionPlan,
  ScriptDraft
} from "../../domain/schemas.js";

export type ProductDirectorInput = {
  productTruth: ProductTruth;
  creativeBatch: CreativeBatch;
  selectedCreativeId: string;
  script: ScriptDraft;
  projectTargetDurationMs: number;
  productionPlanVersion?: number;
};

export interface ProductDirectorGenerator {
  id: string;
  version: string;
  generate(input: ProductDirectorInput): Promise<ProductionPlan>;
}
