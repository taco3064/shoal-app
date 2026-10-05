import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type useHostedSettings from '~app/join/hooks/useHostedSettings';
import ModeSettings from './ModeSettings';
import CopilotAuthority from './CopilotAuthority';
import Readiness from './Readiness';

type HostedState = ReturnType<typeof useHostedSettings>;

function fixture(): HostedState {
  return {
    settings: {
      repository: { id: 42, fullName: 'owner/station', defaultBranch: 'main' },
      rootOwner: true, membership: true, baseReady: true, callerSupported: true,
      auxiliarySupported: true, variablesAuthority: true,
      mode: { value: 'none', raw: '', valid: true },
      bootstrap: 'current', grant: 'disconnected', copilot: 'unverified',
      installationUrl: 'https://github.com/apps/shoal/installations/new',
      authorizationAvailable: true,
    },
    choice: 'none', confirmed: false, connectConfirmed: false, busy: false,
    error: '', notice: '', external: false, configured: true,
    refresh: async () => {}, choose: () => {}, setConfirmed: () => {},
    setConnectConfirmed: () => {}, connect: async () => {},
    cancelExternal: () => {}, save: () => {}, repair: () => {},
    disconnect: () => {},
  };
}

test('Invalid raw mode is escaped and requires an explicit valid selection', () => {
  const state = fixture();

  state.settings!.mode = { value: null, raw: '<script>bad</script>', valid: false };
  state.choice = undefined;
  const html = renderToStaticMarkup(<ModeSettings hosted={state} />);

  assert.match(html, /Invalid saved mode/);
  assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.doesNotMatch(html, /checked=""/);
  assert.match(html, /disabled="">Save Hosted mode/);
});

test('None can be saved independently of broken caller, setup or Reviewer grant', () => {
  const state = fixture();

  state.settings!.mode = { value: 'all', raw: 'all', valid: true };
  state.settings!.baseReady = false;
  state.settings!.callerSupported = false;
  state.settings!.grant = 'unavailable';
  const html = renderToStaticMarkup(<ModeSettings hosted={state} />);

  assert.doesNotMatch(html, /disabled="">Save Hosted mode/);
  assert.match(html, /existing Pending work/);
  assert.match(html, /Reviewer Summary unchanged/);
});

test('Enabled mode needs consent; separate authority remains unverified', () => {
  const state = fixture();

  state.choice = 'review';
  const html = renderToStaticMarkup(<ModeSettings hosted={state} />);
  const authority = renderToStaticMarkup(<CopilotAuthority hosted={state} />);

  assert.match(html, /canonical recurring schedule/);
  assert.match(html, /does not guarantee a review/);
  assert.match(html, /disabled="">Save Hosted mode/);
  assert.match(authority, /Copilot access: unverified/);
  assert.match(authority, /Connect Reviewer/);
  assert.match(authority, /Reviewer comments and Star \/ Unstar effects/);
  assert.match(authority, /Requests use station workflow authority/);
  assert.match(html, /Hosted results require separate Reviewer/);
  assert.doesNotMatch(html, /Copilot requests require your separate/);
});

test('Permission upgrade and explicit recovery stay separate from mode selection', () => {
  const state = fixture();

  state.settings!.variablesAuthority = false;
  state.settings!.bootstrap = 'repair_required';
  const html = renderToStaticMarkup(<Readiness hosted={state} />);

  assert.match(html, /Upgrade GitHub App permissions/);
  assert.match(html, /Restore Hosted connection/);
  assert.match(html, /saved mode and Reviewer authority stay unchanged/);
  assert.match(html, /Repository variables/);
});

test('Unset mode behaves as None without a configured-but-unavailable warning', () => {
  const state = fixture();

  state.settings!.mode = { value: null, raw: '', valid: true };
  const html = renderToStaticMarkup(<ModeSettings hosted={state} />);

  assert.match(html, /Saved: none/);
  assert.doesNotMatch(html, /Hosted mode is configured/);
});

test('Unreadable mode remains unknown instead of assuming None or invalid raw', () => {
  const state = fixture();

  state.settings!.mode = { value: null, raw: '', valid: false };
  state.settings!.variablesAuthority = false;
  state.choice = undefined;
  const html = renderToStaticMarkup(<ModeSettings hosted={state} />);

  assert.match(html, /Saved mode unavailable/);
  assert.doesNotMatch(html, /Invalid saved mode/);
  assert.doesNotMatch(html, /checked=""/);
  assert.match(html, /No mode has been assumed or changed/);
});
