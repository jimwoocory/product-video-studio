export type DouyinPublishProbe =
  | {
      code: "READY";
      openId: string;
      scope: string;
    }
  | {
      code: "NOT_CONFIGURED" | "AUTH_REQUIRED";
      reason: string;
    };

export type DouyinPublishResult = {
  videoId: string;
  itemId: string;
};

export interface DouyinPublishProvider {
  probe(projectId: string): Promise<DouyinPublishProbe>;
  beginOAuth(projectId: string): Promise<{ authorizationUrl: string }>;
  completeOAuth(input: {
    code: string;
    state: string;
  }): Promise<{ projectId: string }>;
  publish(input: {
    projectId: string;
    videoPath: string;
    title: string;
    description?: string;
  }): Promise<DouyinPublishResult>;
}
