export type HostedMode = 'none' | 'review' | 're-review' | 'all';
export type HostedGrantState = 'disconnected' | 'connected' | 'expired'
  | 'revoked' | 'reconsent_required' | 'refresh_ambiguous' | 'unavailable';
export type HostedSettings = {
  repository: { id: number; fullName: string; defaultBranch: string } | null;
  rootOwner: boolean;
  membership: boolean;
  baseReady: boolean;
  callerSupported: boolean;
  auxiliarySupported: boolean;
  variablesAuthority: boolean;
  mode: { value: HostedMode | null; raw: string; valid: boolean };
  bootstrap: 'current' | 'repair_required' | 'unavailable';
  grant: HostedGrantState;
  copilot: 'unverified';
  installationUrl: string;
  authorizationAvailable: boolean;
};
export { HostedSettingsService } from './hosted_settings';
export type { HostedSettingsConfig } from './hosted_settings';
