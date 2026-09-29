import assert from 'node:assert/strict';
import test from 'node:test';
import { publicProfile } from './index';

test('reads public GitHub profile for the projected username', async () => {
  const profile = await publicProfile('taco3064', async (url) => {
    assert.equal(url, 'https://api.github.com/users/taco3064');

    return Response.json({
      type: 'User', login: 'taco3064', name: 'Taco', bio: 'Reviews code',
      location: 'Taipei', followers: 12,
    });
  });

  assert.deepEqual(profile, {
    name: 'Taco', bio: 'Reviews code', location: 'Taipei', followers: 12,
  });
});

test('a mismatched account or API failure cannot become profile decoration', async () => {
  const mismatch = await publicProfile('taco3064', async () =>
    Response.json({ type: 'User', login: 'other' }));

  const failed = await publicProfile('taco3064', async () =>
    new Response('', { status: 403 }));

  assert.equal(mismatch, null);
  assert.equal(failed, null);
});
