import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { hasMatchingProvenance, hash, selectSummary } from './index';
import type { SummarySource } from './index';
import type { GitHubRepository, WorkflowRun } from '../github_api';
import {
  allowedSummaryWorkflows,
  summaryWorkflowPath,
} from '~app/protocol/services/network_compatibility';

const bytes = new TextEncoder().encode('{"a":1}\n');
const digest = hash(bytes);
const invocation = 'https://github.com/alice/node/actions/runs/55/attempts/2';

const verified = [
  {
    verificationResult: {
      signature: { certificate: { runInvocationURI: invocation } },
      statement: { subject: [{ digest: { sha256: digest } }] },
    },
  },
];

test('verified certificate and exact subject digest bind one run attempt', () => {
  assert.equal(hasMatchingProvenance(verified, digest, invocation), true);

  assert.equal(
    hasMatchingProvenance(
      verified,
      digest,
      'https://github.com/alice/node/actions/runs/55/attempts/1',
    ),
    false,
  );

  assert.equal(
    hasMatchingProvenance(
      verified,
      hash(new TextEncoder().encode('{ "a": 1 }\n')),
      invocation,
    ),
    false,
  );
});

test('unverified or missing certificate fields cannot establish provenance', () => {
  assert.equal(
    hasMatchingProvenance(
      [
        {
          verificationResult: {
            statement: { subject: [{ digest: { sha256: digest } }] },
          },
        },
      ],
      digest,
      invocation,
    ),
    false,
  );
});

const stationWorkflow = readFileSync(
  new URL('./fixtures/reviewer-summary-station-9.yml', import.meta.url),
);

const station11Workflow = readFileSync(
  new URL('./fixtures/reviewer-summary-station-11.yml', import.meta.url),
);

const stationDigest = '3b66f6c4afb545bbf1ad847aed96d0dd8c336e6df100c6b898250a0bddf58fd6';
const stationAction = 'b4d72405ebc03afc35d29093302b5593e1ddff1b';

const station11Digest = [
  '70d1011d0b1a6a68677bc891a408f2b73af868a89d283bffdfefa2fd24a6b9d2',
].join('');

const station11Action = 'e1824eaa4766891a6fe56bb1ea2dfb3f13541e73';

const node = {
  id: 12,
  full_name: 'alice/node',
} as GitHubRepository;

const run: WorkflowRun = {
  id: 55,
  path: summaryWorkflowPath,
  repository: { id: node.id },
  head_repository: { id: node.id },
  head_sha: 'a'.repeat(40),
  run_attempt: 1,
  run_started_at: '2026-10-01T00:00:00Z',
  status: 'completed',
  conclusion: 'success',
  html_url: 'https://github.com/alice/node/actions/runs/55',
};

const summary = {
  protocolVersion: 1,
  summarySchemaVersion: 1,
  reviewerNode: { repositoryId: node.id },
  metrics: {
    reviewBackedStarCount: 1,
    validReviewRequestIssueCount: 2,
    reReviewRequestIssueCount: 1,
    invalidReviewCommentCount: 0,
  },
};

function stationSource(
  workflowBytes: Uint8Array = stationWorkflow,
  value: unknown = summary,
): SummarySource {
  return {
    async committedBytes() {
      return workflowBytes;
    },
    async publicSummary() {
      return {
        bytes: new TextEncoder().encode(JSON.stringify(value)),
        url: 'https://raw.githubusercontent.com/alice/node/shoal-summary-12-55-1/reviewer-summary.json',
      };
    },
    async runAttempt() {
      throw new Error('Unexpected rerun.');
    },
  };
}

test('station#9 exact bytes bind the pinned Action and real 1/1 contract', async () => {
  assert.equal(hash(stationWorkflow), stationDigest);
  assert.match(stationWorkflow.toString(), new RegExp(`uses: taco3064/shoal-action@${stationAction}\\n`));

  assert.deepEqual(allowedSummaryWorkflows.get(stationDigest), {
    actionCommit: stationAction,
    reviewerSummary: { protocolVersion: 1, summarySchemaVersion: 1 },
  });

  const selected = await selectSummary(node, [run], stationSource(), async () => true);

  assert.equal(selected.status, 'current');

  assert.equal(selected.source.workflowDigest, stationDigest);
  assert.equal(selected.source.actionCommit, stationAction);
  assert.deepEqual(selected.summary, summary);
});

test(
  'station#11 exact bytes bind the corrected Action and real 1/1 contract',
  async () => {
    assert.equal(hash(station11Workflow), station11Digest);

    assert.match(
      station11Workflow.toString(),
      new RegExp(`uses: taco3064/shoal-action@${station11Action}\\n`),
    );

    assert.deepEqual(allowedSummaryWorkflows.get(station11Digest), {
      actionCommit: station11Action,
      reviewerSummary: { protocolVersion: 1, summarySchemaVersion: 1 },
    });

    const selected = await selectSummary(
      node,
      [run],
      stationSource(station11Workflow),
      async () => true,
    );

    assert.equal(selected.status, 'current');

    assert.equal(selected.source.workflowDigest, station11Digest);
    assert.equal(selected.source.actionCommit, station11Action);
    assert.deepEqual(selected.summary, summary);
  },
);

test('station#9 rejects byte drift and changed Action before attestation', async () => {
  const changedAction = stationWorkflow.toString().replace(stationAction, 'b'.repeat(40));

  for (const changed of [stationWorkflow.toString() + '\n', changedAction]) {
    const selected = await selectSummary(
      node,
      [run],
      stationSource(new TextEncoder().encode(changed)),
      async () => {
        assert.fail('Unsupported workflow must not reach attestation verification.');
      },
    );

    assert.equal(selected.status, 'unavailable');
  }
});

test('station#11 rejects byte drift and changed Action before attestation', async () => {
  const changedAction = station11Workflow.toString().replace(
    station11Action,
    'b'.repeat(40),
  );

  for (const changed of [station11Workflow.toString() + '\n', changedAction]) {
    const selected = await selectSummary(
      node,
      [run],
      stationSource(new TextEncoder().encode(changed)),
      async () => {
        assert.fail('Unsupported workflow must not reach attestation verification.');
      },
    );

    assert.equal(selected.status, 'unavailable');
  }
});

test('station#9 rejects unsupported tuples and invalid attestation', async () => {
  for (const value of [
    { ...summary, protocolVersion: 999 },
    { ...summary, summarySchemaVersion: 999 },
  ]) {
    const selected = await selectSummary(
      node,
      [run],
      stationSource(stationWorkflow, value),
      async () => true,
    );

    assert.equal(selected.status, 'unavailable');
  }

  const rejected = await selectSummary(node, [run], stationSource(), async () => false);

  assert.equal(rejected.status, 'unavailable');
});

test('station#9 incompatible latest attempt preserves historical evidence', async () => {
  const priorWorkflow = readFileSync(
    new URL('../network_projection/fixtures/reviewer-summary.yml', import.meta.url),
  );

  const prior = {
    ...run,
    id: 54,
    head_sha: 'c'.repeat(40),
    run_started_at: '2026-09-30T00:00:00Z',
  };

  const api = stationSource();

  api.committedBytes = async (_name, _path, ref) =>
    ref === run.head_sha ? stationWorkflow : priorWorkflow;

  api.publicSummary = async (_name, _id, runId) => ({
    bytes: new TextEncoder().encode(JSON.stringify(
      runId === run.id ? { ...summary, protocolVersion: 999 } : summary,
    )),
    url: `https://raw.githubusercontent.com/alice/node/shoal-summary-12-${runId}-1/reviewer-summary.json`,
  });

  const selected = await selectSummary(node, [prior, run], api, async () => true);

  assert.equal(selected.status, 'fallback');

  assert.equal(selected.source.runId, prior.id);
  assert.equal(selected.source.workflowDigest, hash(priorWorkflow));
  assert.deepEqual(selected.summary, summary);
});
