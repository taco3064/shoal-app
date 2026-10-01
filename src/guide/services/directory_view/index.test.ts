import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultDirectoryState, directorySearch, directoryView, readDirectoryState,
  type DirectoryEntry,
} from './index';

const reviewers: DirectoryEntry[] = Array.from({ length: 123 }, (_, index) => ({
  repositoryId: index + 1,
  username: `reviewer-${String(index).padStart(3, '0')}`,
  repository: 'shoal-station',
  repositoryUrl: `https://github.com/reviewer-${index}/shoal-station`,
  policyUrl: '',
  joinedAt: '2026-01-01T00:00:00Z',
  avatarUrl: '',
  stationStatus: index % 10 === 0 ? 'setup_required' : 'ready',
  stationReadinessReasons: index % 10 === 0
    ? ['issues_disabled']
    : [],
  summaryStatus: 'current',
  summary: { status: 'current' },
}));

test('URL state normalizes invalid values, duplicate parameters and defaults', () => {
  const state = readDirectoryState(
    '?username=%20REVIEWER%20&sortBy=unknown&sortDir=unknown&page=1.5&page=3',
  );

  assert.deepEqual(state, { ...defaultDirectoryState, username: 'REVIEWER' });

  assert.equal(directorySearch(state),
    '?username=REVIEWER&sortBy=username&sortDir=asc&page=1');

  for (const value of ['0', '-1', 'NaN', 'Infinity', '9007199254740992']) {
    assert.equal(readDirectoryState(`?page=${value}`).page, 1);
  }
});

test('filter then sort then paginate limits pages to 50 and keeps stable ties', () => {
  const view = directoryView(reviewers, {
    ...defaultDirectoryState, sortDir: 'desc', page: 2,
  });

  assert.equal(view.total, 123);
  assert.equal(view.pageCount, 3);
  assert.equal(view.entries.length, 50);
  assert.equal(view.entries[0].username, 'reviewer-072');
  assert.equal(view.entries[49].username, 'reviewer-023');
  assert.equal(reviewers[0].username, 'reviewer-000');

  const ties = directoryView([...reviewers].reverse(), {
    ...defaultDirectoryState, sortBy: 'joinedAt', sortDir: 'desc',
  });

  assert.equal(ties.entries[0].repositoryId, 123);
});

test('filtered and empty results clamp page without phantom entries', () => {
  const filtered = directoryView(reviewers, {
    ...defaultDirectoryState, username: 'REVIEWER-12', page: 8,
  });

  assert.equal(filtered.total, 3);
  assert.equal(filtered.state.page, 1);
  assert.equal(filtered.entries.length, 3);

  const empty = directoryView(reviewers, {
    ...defaultDirectoryState, username: 'missing', page: 8,
  });

  assert.equal(empty.state.page, 1);
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.entries, []);
});

test('valid deep links round trip sort, direction, filter and page', () => {
  const state = readDirectoryState(
    '?username=reviewer&sortBy=joinedAt&sortDir=desc&page=3',
  );

  assert.deepEqual(readDirectoryState(directorySearch(state)), state);
  assert.equal(directoryView(reviewers, state).entries.length, 23);
});

test('setup-required reviewers remain searchable, counted and paginated', () => {
  const view = directoryView(reviewers, {
    ...defaultDirectoryState,
    username: 'reviewer-010',
  });

  assert.equal(view.total, 1);
  assert.equal(view.entries[0].stationStatus, 'setup_required');

  assert.deepEqual(view.entries[0].stationReadinessReasons, [
    'issues_disabled',
  ]);
});
