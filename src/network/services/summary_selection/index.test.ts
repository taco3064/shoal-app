import assert from 'node:assert/strict';
import test from 'node:test';
import { hasMatchingProvenance, hash } from './index';

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
