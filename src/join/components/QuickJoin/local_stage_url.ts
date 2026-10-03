export function readLocalStageId() {
  if (typeof window === 'undefined') {
    return null;
  }

  return new URL(window.location.href).searchParams.get('localStage');
}

export function writeLocalStageId(stageId: string | null) {
  if (typeof window === 'undefined') {
    return;
  }

  const url = new URL(window.location.href);

  if (stageId) {
    url.searchParams.set('localStage', stageId);
  } else {
    url.searchParams.delete('localStage');
  }

  window.history.replaceState(
    null,
    '',
    `${url.pathname}${url.search}${url.hash}`,
  );
}
