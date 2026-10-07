import type {
  DouyinMetricSnapshot,
  DouyinWorkBinding
} from "../../domain/douyin-ops.js";

export interface DouyinOpsRepository {
  upsertWorkBinding(
    input: DouyinWorkBinding
  ): Promise<DouyinWorkBinding>;

  findWorkBindingById(
    id: string
  ): Promise<DouyinWorkBinding | null>;

  findWorkBindingByPackage(
    packageId: string
  ): Promise<DouyinWorkBinding | null>;

  latestWorkBinding(
    projectId: string
  ): Promise<DouyinWorkBinding | null>;

  createMetricSnapshot(
    input: DouyinMetricSnapshot
  ): Promise<DouyinMetricSnapshot>;

  findMetricSnapshotByCaptureKey(
    projectId: string,
    captureKey: string
  ): Promise<DouyinMetricSnapshot | null>;

  listMetricSnapshots(input: {
    projectId: string;
    awemeId?: string;
    limit?: number;
  }): Promise<DouyinMetricSnapshot[]>;
}
