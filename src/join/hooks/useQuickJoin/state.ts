export type AuthState = 'unknown' | 'unauthenticated' | 'authenticated' | 'expired';
export type InspectionState = 'idle' | 'verifying' | 'verified' | 'failed' | 'stale';
type TerminalExecutionState = 'failed' | 'blocked' | 'complete';
export type ExecutionState = 'none' | 'queued' | 'running' | TerminalExecutionState;
