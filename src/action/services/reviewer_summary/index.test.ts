import assert from 'node:assert/strict';
import test from 'node:test';
import { computeReviewerSummary } from './index';
import type {
  GitHubComment, GitHubIssue, RequesterNode, SummaryInput, TargetRepository,
} from './index';
import { reviewProtocol } from '~app/protocol/services/review_protocol';

const author = { id: 10, login: 'requester', type: 'User' };
const reviewer = { id: 20, login: 'reviewer', type: 'User' };
const targetCommit = 'a'.repeat(40);
const policyCommit = 'b'.repeat(40);
const rootId = 100;
const reviewerId = 200;
const targetId = 300;

const root: RequesterNode = {
  id: rootId, isFork: false, owner: author, parentRepositoryId: null,
};

const fork: RequesterNode = {
  id: 400, isFork: true, owner: author, parentRepositoryId: rootId,
};

function comment(payload: object, admission = false): GitHubComment {
  return {
    author: reviewer,
    body: `${admission ? reviewProtocol.admission.marker : reviewProtocol.event.marker}\n${JSON.stringify(payload)}`,
    createdAt: '2026-10-01T00:00:00Z',
    id: 1,
    performedViaGitHubApp: null,
  };
}

function judgment(overrides = {}) {
  return {
    actualStarState: true,
    reviewPolicyCommit: policyCommit,
    reviewPolicyPath: 'README.md',
    reviewedAt: '2026-10-01T00:00:00Z',
    reviewerNodeId: reviewerId,
    targetCommit,
    targetDefaultBranch: 'main',
    targetRepositoryFullName: 'requester/target',
    targetRepositoryId: targetId,
    type: 'REVIEWED',
    verdict: 'PASS',
    ...overrides,
  };
}

function request(number = 1): GitHubIssue {
  return {
    author,
    body: '### Repository name\n\ntarget\n\n### Invitation message\n\n_No response_',
    comments: [
      comment({
        repositoryName: 'target', reviewerNodeId: reviewerId,
        targetRepositoryId: targetId,
      }, true),
      comment(judgment()),
    ],
    number,
    state: 'closed',
  };
}

function input(node: RequesterNode | null): SummaryInput {
  const target: TargetRepository = {
    currentDefaultBranchHead: targetCommit,
    defaultBranch: 'main',
    fullName: 'requester/target',
    id: targetId,
    isStarredByReviewer: true,
    owner: author,
  };

  return {
    issues: [request()],
    networkRootRepositoryId: rootId,
    resolvers: {
      isAllowedLifecycleAutomation: async () => false,
      resolveCurrentReviewPolicyCommit: async () => policyCommit,
      resolveRequesterNode: async () => node,
      resolveTargetRepository: async () => target,
    },
    reviewerNode: { fullName: 'reviewer/station', id: reviewerId, owner: reviewer },
  };
}

const initialMetrics = {
  invalidReviewCommentCount: 0,
  reReviewRequestIssueCount: 0,
  reviewBackedStarCount: 1,
  validReviewRequestIssueCount: 1,
};

test('Root and direct-fork Requests have identical metrics and schema', async () => {
  const rootSummary = await computeReviewerSummary(input(root));
  const forkSummary = await computeReviewerSummary(input(fork));

  assert.deepEqual(rootSummary, forkSummary);
  assert.deepEqual(rootSummary.metrics, initialMetrics);
  assert.equal(rootSummary.protocolVersion, 1);
  assert.equal(rootSummary.summarySchemaVersion, 1);
  assert.deepEqual(rootSummary.reviewerNode, { repositoryId: reviewerId });
});

for (const [name, node] of [['Root', root], ['direct fork', fork]] as const) {
  test(`${name}: valid admitted pending Request contributes before judgment`, async () => {
    const candidate = input(node);

    candidate.issues[0].comments.pop();
    candidate.issues[0].state = 'open';

    assert.deepEqual((await computeReviewerSummary(candidate)).metrics, {
      ...initialMetrics, reviewBackedStarCount: 0,
    });
  });

  test(`${name}: Manual Review preserves equivalent accounting`, async () => {
    const candidate = input(node);

    candidate.issues[0].comments.shift();

    assert.deepEqual((await computeReviewerSummary(candidate)).metrics, initialMetrics);
  });

  test(`${name}: accepted Re-review and invalid formal comments retain their meanings`, async () => {
    const candidate = input(node);
    const trigger = request(2);

    trigger.comments = [];
    candidate.issues.push(trigger);

    candidate.issues[0].comments.push(
      comment({
        eligibilityTargetCommit: targetCommit,
        reason: 'TARGET_CHANGED',
        requestIssueNumber: 2,
        reviewPolicyCommit: policyCommit,
        reviewerNodeId: reviewerId,
        targetRepositoryId: targetId,
        type: 'RE_REVIEW_REQUESTED',
      }),
      comment(judgment({ type: 'RE_REVIEWED' })),
      comment(judgment({ targetCommit: 'malformed', type: 'RE_REVIEWED' })),
    );

    assert.deepEqual((await computeReviewerSummary(candidate)).metrics, {
      ...initialMetrics,
      invalidReviewCommentCount: 1,
      reReviewRequestIssueCount: 1,
      validReviewRequestIssueCount: 2,
    });
  });

  const invalidRequests: Array<[string, (candidate: SummaryInput) => void]> = [
    ['malformed body', (candidate) => { candidate.issues[0].body = 'not a Request'; }],
    ['missing Target', (candidate) => {
      candidate.resolvers.resolveTargetRepository = async () => null;
    }],
    ['Target owner mismatch', (candidate) => {
      const resolve = candidate.resolvers.resolveTargetRepository;

      candidate.resolvers.resolveTargetRepository = async (...args) => {
        const target = await resolve(...args);

        return target && { ...target, owner: { ...author, id: 99 } };
      };
    }],
    ['self-review', (candidate) => { candidate.reviewerNode.owner = author; }],
    ['INVALID_REQUEST', (candidate) => {
      candidate.issues[0].comments = [comment({ type: 'INVALID_REQUEST' })];
    }],
    ['no admission or Manual Judgment', (candidate) => {
      candidate.issues[0].comments = [];
    }],
    ['conflicting admission', (candidate) => {
      candidate.issues[0].comments.push(comment({
        repositoryName: 'target', reviewerNodeId: reviewerId, targetRepositoryId: 999,
      }, true));
    }],
  ];

  for (const [boundary, mutate] of invalidRequests) {
    test(`${name}: ${boundary} stays non-countable`, async () => {
      const candidate = input(node);

      mutate(candidate);
      const summary = await computeReviewerSummary(candidate);

      assert.equal(summary.metrics.validReviewRequestIssueCount, 0);
      assert.equal(summary.metrics.reviewBackedStarCount, 0);
    });
  }

  for (const boundary of [
    'Target commit changed', 'Policy commit changed', 'actual Star absent',
  ]) {
    test(`${name}: ${boundary} cannot contribute a review-backed Star`, async () => {
      const candidate = input(node);
      const resolve = candidate.resolvers.resolveTargetRepository;

      if (boundary === 'Policy commit changed') {
        candidate.resolvers.resolveCurrentReviewPolicyCommit = async () => 'c'.repeat(40);
      } else {
        candidate.resolvers.resolveTargetRepository = async (...args) => {
          const target = await resolve(...args);

          return target && {
            ...target,
            ...(boundary === 'Target commit changed'
              ? { currentDefaultBranchHead: 'c'.repeat(40) }
              : { isStarredByReviewer: false }),
          };
        };
      }

      assert.deepEqual((await computeReviewerSummary(candidate)).metrics, {
        ...initialMetrics, reviewBackedStarCount: 0,
      });
    });
  }

  test(`${name}: unaccepted duplicate trigger does not count as Re-review`, async () => {
    const candidate = input(node);
    const trigger = request(2);

    trigger.comments = [comment({ type: 'NO_NEW_REVIEW_BASIS' })];
    candidate.issues.push(trigger);

    assert.deepEqual((await computeReviewerSummary(candidate)).metrics, initialMetrics);
  });
}

const invalidMemberships: Array<[string, RequesterNode | null]> = [
  ['missing node', null],
  ['organization Root', { ...root, owner: { ...author, type: 'Organization' } }],
  ['organization fork', { ...fork, owner: { ...author, type: 'Organization' } }],
  ['Root owner mismatch', { ...root, owner: { ...author, id: 99 } }],
  ['fork owner mismatch', { ...fork, owner: { ...author, id: 99 } }],
  ['downstream fork', { ...fork, parentRepositoryId: 999 }],
  ['unrelated non-fork', { ...root, id: 999 }],
  ['unrelated fork', { ...fork, parentRepositoryId: 999 }],
];

for (const [name, node] of invalidMemberships) {
  test(`Summary rejects ${name} despite valid admission and PASS evidence`, async () => {
    const summary = await computeReviewerSummary(input(node));

    assert.equal(summary.metrics.validReviewRequestIssueCount, 0);
    assert.equal(summary.metrics.reviewBackedStarCount, 0);
  });
}
