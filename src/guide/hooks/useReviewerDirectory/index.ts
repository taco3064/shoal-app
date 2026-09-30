import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import {
  defaultDirectoryState, directorySearch, directoryView, readDirectoryState,
  type DirectoryEntry, type DirectoryState,
} from '~app/guide/services/directory_view';

export type { DirectoryEntry } from '~app/guide/services/directory_view';

export default function useReviewerDirectory(reviewers: DirectoryEntry[]) {
  const [state, setState] = useState(defaultDirectoryState);
  const view = useMemo(() => directoryView(reviewers, state), [reviewers, state]);

  useEffect(() => {
    const restore = () => {
      const normalized = directoryView(
        reviewers, readDirectoryState(window.location.search),
      ).state;

      const url = `${window.location.pathname}${directorySearch(normalized)}${window.location.hash}`;

      if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        window.history.replaceState(window.history.state, '', url);
      }

      setState(normalized);
    };

    restore();
    window.addEventListener('popstate', restore);

    return () => window.removeEventListener('popstate', restore);
  }, [reviewers]);

  const update = (changes: Partial<DirectoryState>) => {
    const next = directoryView(reviewers, {
      ...state, ...changes,
      page: changes.page ?? 1,
    }).state;

    const url = `${window.location.pathname}${directorySearch(next)}${window.location.hash}`;

    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.pushState(window.history.state, '', url);
    }

    setState(next);
  };

  const pageUrl = (page: number) => directorySearch({ ...state, page });

  const navigatePage = (event: MouseEvent<HTMLAnchorElement>, page: number) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey
      || event.altKey) {
      return;
    }

    event.preventDefault();
    update({ page });
  };

  return { ...view, update, pageUrl, navigatePage };
}
