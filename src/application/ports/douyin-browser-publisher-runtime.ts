export type DouyinBrowserEngineProbe = {
  ok: boolean;
  status: string;
  engine?: string;
  bridgeVersion?: number;
  runtimeRoot?: string;
  message?: string;
};

export type DouyinBrowserAccountStatus = {
  ok: boolean;
  account: string;
  status: "VALID" | "AUTH_REQUIRED" | "FAILED" | string;
  valid: boolean;
  message?: string;
};

export type DouyinBrowserLoginResult = {
  ok: boolean;
  account: string;
  status: string;
  message?: string;
  currentUrl?: string;
};

export type DouyinBrowserPublishResult = {
  ok: boolean;
  account: string;
  status: string;
  verified: boolean;
  externalReference?: string;
  currentUrl?: string;
  verificationMessage?: string;
  message?: string;
};

export type DouyinBrowserPublishRequest = {
  videoPath: string;
  title: string;
  description?: string;
  tags?: string[];
  thumbnailPath?: string;
  headed?: boolean;
  declaration?: string;
};

export interface DouyinBrowserPublisherRuntime {
  resolveAccountName(): Promise<string>;
  probe(): Promise<DouyinBrowserEngineProbe>;
  check(accountName?: string): Promise<DouyinBrowserAccountStatus>;
  login(accountName: string, headed?: boolean): Promise<DouyinBrowserLoginResult>;
  publish(
    request: DouyinBrowserPublishRequest,
    accountName?: string
  ): Promise<DouyinBrowserPublishResult>;
}
