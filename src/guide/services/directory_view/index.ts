export type DirectoryEntry = {
  repositoryId: number;
  username: string;
  repository: string;
  repositoryUrl: string;
  policyUrl: string;
  joinedAt: string;
  avatarUrl: string;
  summary: { status: 'current' | 'fallback' | 'unavailable' };
};

export type DirectoryState = {
  username: string;
  sortBy: 'username' | 'joinedAt';
  sortDir: 'asc' | 'desc';
  page: number;
};

export const defaultDirectoryState: DirectoryState = {
  username: '', sortBy: 'username', sortDir: 'asc', page: 1,
};

export function readDirectoryState(search: string): DirectoryState {
  const parameters = new URLSearchParams(search);
  const rawPage = parameters.get('page') ?? '1';
  const page = /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : 1;

  return {
    username: (parameters.get('username') ?? '').trim(),
    sortBy: parameters.get('sortBy') === 'joinedAt' ? 'joinedAt' : 'username',
    sortDir: parameters.get('sortDir') === 'desc' ? 'desc' : 'asc',
    page: Number.isSafeInteger(page) ? page : 1,
  };
}

export function directoryView(reviewers: DirectoryEntry[], state: DirectoryState) {
  const filtered = reviewers.filter((reviewer) => reviewer.username
    .toLowerCase().includes(state.username.trim().toLowerCase()));

  const direction = state.sortDir === 'desc' ? -1 : 1;

  filtered.sort((a, b) => {
    const comparison = state.sortBy === 'username'
      ? a.username.toLowerCase().localeCompare(b.username.toLowerCase(), 'en')
      : a.joinedAt.localeCompare(b.joinedAt);

    return direction * (comparison || a.repositoryId - b.repositoryId);
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / 50));
  const page = Math.min(state.page, pageCount);

  return {
    state: { ...state, page },
    entries: filtered.slice((page - 1) * 50, page * 50),
    total: filtered.length,
    pageCount,
  };
}

export function directorySearch(state: DirectoryState): string {
  const parameters = new URLSearchParams({
    username: state.username,
    sortBy: state.sortBy,
    sortDir: state.sortDir,
    page: String(state.page),
  });

  return `?${parameters.toString()}`;
}
