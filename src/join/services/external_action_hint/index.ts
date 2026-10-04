export type ExternalActionHint = {
  stageId: 'node' | 'access';
  identityId: number;
  startedAt: number;
};

const key = 'shoal.quickJoin.externalAction';
export const externalHintLifetime = 30 * 60 * 1000;

export function writeExternalHint(hint?: ExternalActionHint): void {
  try {
    if (hint) {
      window.sessionStorage.setItem(key, JSON.stringify(hint));
    } else {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Storage is optional; the current runtime can still reconcile returns.
  }
}

export function readExternalHint(identityId: number): ExternalActionHint | undefined {
  try {
    const raw = window.sessionStorage.getItem(key);

    if (!raw) {
      return undefined;
    }

    const value = JSON.parse(raw) as Partial<ExternalActionHint>;
    const age = Date.now() - Number(value.startedAt);

    if ((value.stageId === 'node' || value.stageId === 'access')
      && value.identityId === identityId
      && typeof value.startedAt === 'number'
      && Number.isFinite(value.startedAt)
      && age >= 0 && age < externalHintLifetime) {
      // Copy only hints; never restore a target, confirmed plan or authority.
      return { stageId: value.stageId, identityId, startedAt: value.startedAt };
    }
  } catch {
    // Malformed or inaccessible browser state cannot establish authority.
  }

  writeExternalHint();

  return undefined;
}
