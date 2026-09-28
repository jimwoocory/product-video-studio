import { HermesStructuredAiRuntime } from "../dist/src/adapters/ai/hermes-structured-ai-runtime.js";
import { AiGenerationService } from "../dist/src/application/services/ai-generation.js";

const runtime = new HermesStructuredAiRuntime(process.cwd());
const service = new AiGenerationService(runtime);
const truth = await service.generateProductTruthDraft(
  {
    projectId: "smoke-hermes-product",
    productName: "Widget X",
    featureDescription: "Widget X has a physical power button and a removable protective cover.",
    brand: "Example Brand",
    category: "Demo Hardware",
    referenceImageIds: ["asset-ref-smoke"],
    referenceImageArtifacts: [
      {
        id: "artifact-smoke",
        relativePath: "input/assets/widget.png",
        sha256: "a".repeat(64),
        mimeType: "image/png"
      }
    ],
    forbiddenChanges: [
      {
        id: "forbid-smoke",
        field: "logo",
        description: "Do not alter the brand logo.",
        severity: "HARD"
      }
    ]
  },
  1
);

if (truth.status !== "DRAFT" || truth.productName !== "Widget X") {
  throw new Error("Unexpected ProductTruth output");
}
console.log(
  JSON.stringify({
    hermesProductTruth: "PASS",
    facts: truth.confirmedFeatures.length + truth.sellingPoints.length,
    uncertainClaims: truth.uncertainClaims.length,
    contentHash: truth.contentHash
  })
);
