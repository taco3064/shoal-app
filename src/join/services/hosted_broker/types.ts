export type BrokerRequest = {
  formatVersion: 1;
  repositoryId: string;
  reviewerId: string;
  workflowRef: string;
  workflowSha: string;
  runId: string;
  runAttempt: string;
};

export type BrokerIdentity = {
  repositoryId: string;
  reviewerId: string;
  repositoryFullName: string;
};

export type BrokerAuthority = {
  reviewerToken: string;
  lifecycleToken: string;
  expiresAt: string;
};

export type BrokerRepository = {
  id: string;
  fullName: string;
  ownerId: string;
  ownerType: string;
  parentId: string | null;
  defaultBranch: string;
  private: boolean;
};

export type BrokerRun = {
  id: string;
  repositoryId: string;
  runAttempt: string;
  headSha: string;
  headBranch: string;
  event: string;
  status: string;
  path: string;
};

export type HostedBrokerGithub = {
  getRepository: (id: string) => Promise<BrokerRepository>;
  getRun: (fullName: string, id: string) => Promise<BrokerRun>;
  readWorkflow: (
    fullName: string, path: string, sha: string,
  ) => Promise<Uint8Array | null>;
  readMode: (repository: BrokerRepository) => Promise<string | null>;
};

export type BrokerOptions = {
  request: Request;
  endpoint: string;
  audience: string;
  github: HostedBrokerGithub;
  issueAuthority: (identity: BrokerIdentity) => Promise<BrokerAuthority>;
  fetcher?: typeof fetch;
  now?: () => number;
  reportFailure?: (failure: { stage: string; reason: string; status: number }) => void;
};
