import type {
  DouyinComment,
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

  upsertComments(
    input: DouyinComment[]
  ): Promise<DouyinComment[]>;

  listComments(input: {
    projectId: string;
    awemeId?: string;
    parentCid?: string | null;
    limit?: number;
  }): Promise<DouyinComment[]>;

  findComment(input: {
    awemeId: string;
    cid: string;
  }): Promise<DouyinComment | null>;
}
