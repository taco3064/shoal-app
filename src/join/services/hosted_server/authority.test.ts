import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { buildSync } from 'esbuild';
import { Miniflare } from 'miniflare';

const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
  .export({ type: 'pkcs8', format: 'pem' }).toString();

const code = buildSync({ stdin: { resolveDir: process.cwd(), contents: `
import { issueHostedAuthority } from './src/join/services/hosted_server/authority.ts';
import { brokerGithub } from './src/join/services/hosted_server/broker_github.ts';
let scenario = '', calls = [], grants = [];
const root = {id:1379044983,full_name:'root/station',default_branch:'main',
  owner:{id:99,type:'User'},private:false};
const node = {id:200,full_name:'reviewer/station',default_branch:'main',
  owner:{id:100,type:'User'},parent:{id:root.id},private:false};
const env = {JOIN_SERVICE_ORIGIN:'https://join.test',
  JOIN_WEBSITE_RETURN_URL:'https://site.test/join/',GITHUB_APP_ID:'1',
  GITHUB_APP_SLUG:'test-app',GITHUB_APP_PRIVATE_KEY:${JSON.stringify(privateKey)},
  HOSTED_OAUTH_CLIENT_ID:'test-client',HOSTED_OAUTH_CLIENT_SECRET:'test-secret',
  HOSTED_GRANT_ENCRYPTION_KEY:'k'.repeat(32),
  HOSTED_GRANTS:{idFromName:(name)=>name,get:(name)=>({fetch:async(url,init)=>{
    const input=JSON.parse(init.body); grants.push({name,input});
    if(scenario==='grant-revoked')return Response.json({}, {status:403});
    return Response.json({token:'reviewer_'+'a'.repeat(32),expires:Date.now()+3600000});
  }})}};
const fetcher=async(url,init)=>{
  const path=new URL(url).pathname;
  const body=init.body?JSON.parse(init.body):null;
  calls.push({url:String(url),path,method:init.method,body});
  if(path==='/repositories/1379044983')return Response.json(root);
  if(path==='/repositories/200')return Response.json({...node,
    owner:scenario==='transferred'?{id:101,type:'User'}:node.owner,
    parent:scenario==='indirect'?{id:500}:node.parent});
  if(path.endsWith('/installation'))return Response.json({id:7,
    account:{id:100,type:'User'},permissions:{actions_variables:'write',
      issues:scenario==='issues-denied'?'read':'write'}});
  if(path==='/app/installations/7/access_tokens')return Response.json({
    token:'lifecycle_'+'b'.repeat(32),expires_at:new Date(Date.now()+3600000).toISOString()});
  if(path.endsWith('/variables/SHOAL_AUTOMATED_REVIEW'))return Response.json({
    name:'SHOAL_AUTOMATED_REVIEW',value:scenario==='none'?'none':'all'});
  if(path.includes('/variables/'))return Response.json({}, {status:404});
  if(path.includes('/contents/'))return Response.json({type:'file',encoding:'base64',
    content:btoa('exact workflow bytes')});
  throw new Error('Unexpected GitHub boundary');
};
export default {async fetch(request){
  scenario=new URL(request.url).pathname.slice(1);calls=[];grants=[];
  try{
    const identity={repositoryId:'200',reviewerId:'100',repositoryFullName:'reviewer/station'};
    const result=scenario==='bytes'
      ? [...await brokerGithub(env,fetcher).readWorkflow('reviewer/station',
        '.github/workflows/hosted-review.yml','1'.repeat(40))]
      : await issueHostedAuthority(env,identity,fetcher);
    return Response.json({result,calls,grants});
  }catch{return Response.json({calls,grants},{status:403})}
}};
` }, bundle: true, write: false, format: 'esm', platform: 'node',
external: ['cloudflare:workers'], target: 'es2022' }).outputFiles[0].text;

async function worker() {
  return new Miniflare({ workers: [{ config: { name: 'authority-test',
    compatibilityDate: '2026-10-05', compatibilityFlags: ['nodejs_compat'],
    manifest: { mainModule: 'worker.mjs', modules: {
      'worker.mjs': { type: 'esm', contents: code },
    } },
  } }] });
}

test('Production issuer keeps Reviewer and selected-node lifecycle authority separate',
  async () => {
    const runtime = await worker();

    try {
      const response = await runtime.dispatchFetch('https://join.test/positive');

      assert.equal(response.status, 200);
      const body = await response.json() as any;

      assert.notEqual(body.result.reviewerToken, body.result.lifecycleToken);

      assert.deepEqual(body.grants, [{ name: '100:200', input: {
        operation: 'token', binding: { repositoryId: '200', reviewerId: '100' },
      } }]);

      const lifecycle = body.calls.filter((call: any) => call.body?.permissions?.issues);

      assert.equal(lifecycle.length, 1);

      assert.deepEqual(lifecycle[0].body, {
        repository_ids: [200], permissions: { metadata: 'read', issues: 'write' },
      });

      assert.ok(Date.parse(body.result.expiresAt) > Date.now() + 60_000);
      assert.ok(!JSON.stringify(body.result).includes('refresh'));
    } finally {
      await runtime.dispose();
    }
  });

test('Current node, mode, grant and App permission failures mint no lifecycle authority',
  async () => {
    const runtime = await worker();

    try {
      for (const scenario of ['transferred', 'indirect', 'none', 'grant-revoked',
        'issues-denied']) {
        const response = await runtime.dispatchFetch(`https://join.test/${scenario}`);

        assert.equal(response.status, 403, scenario);
        const body = await response.json() as any;

        assert.equal(body.calls.filter((call: any) => call.body?.permissions?.issues)
          .length, 0, scenario);
      }
    } finally {
      await runtime.dispose();
    }
  });

test('Broker GitHub adapter reads execution bytes at the exact authenticated SHA',
  async () => {
    const runtime = await worker();

    try {
      const response = await runtime.dispatchFetch('https://join.test/bytes');

      assert.equal(response.status, 200);
      const body = await response.json() as any;

      assert.equal(new TextDecoder().decode(new Uint8Array(body.result)),
        'exact workflow bytes');

      assert.equal(body.calls.length, 1);
      assert.equal(new URL(body.calls[0].url).searchParams.get('ref'), '1'.repeat(40));
      assert.match(body.calls[0].path, /\/contents\/\.github\/workflows\/hosted-review.yml$/);
    } finally {
      await runtime.dispose();
    }
  });
