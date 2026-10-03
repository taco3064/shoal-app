import { createGitHubJoinClient } from '../github_join';
import {
  createStationJoinService,
  publicInspection,
  type Inspection,
  type ExecutionCheckpoint,
  type PolicyPlan,
} from '../station_join';
import type { JoinConfig } from './config';
import type { JoinAdapter } from './http';

export function productionJoinAdapter(
  config: JoinConfig,
  injectedService?: ReturnType<typeof createStationJoinService>,
): JoinAdapter {
  const client = createGitHubJoinClient(config);
  const service = injectedService ?? createStationJoinService(client);

  const adapter: JoinAdapter = {
    identity: (token) => client.identity(token),
    inspect: (identity, previous) =>
      service.inspect(identity, previous as Inspection | undefined),
    publicInspection: (value) => ({
      ...publicInspection(value as Inspection),
      installationUrl:
        (value as Inspection).waiting === 'app_access'
          ? config.installationUrl
          : undefined,
    }),
    startExecution: (value) => ({
      plan: value,
      inspection: value,
      operations: (value as Inspection).operations.map((name) => ({
        name,
        state: 'queued',
      })),
    }),
    executeStep: async (identity, value, progress) => {
      const step = await service.executeStep(
        identity,
        value as ExecutionCheckpoint,
        async (update) => {
          await progress({
            ...update,
            verifiedOperations: update.operations
              .filter((operation) => operation.state === 'verified')
              .map((operation) => operation.name),
            currentOperation: update.operations.find(
              (operation) => operation.state === 'executing',
            )?.name,
          });
        },
      );

      const result = step.result;

      return {
        done: step.done,
        checkpoint: step.checkpoint,
        result: {
          operations: result.operations,
          completed: result.completed,
          total: result.total,
          ready: result.ready,
          inspection: {
            ...publicInspection(result.inspection),
            installationUrl:
              result.inspection.waiting === 'app_access'
                ? config.installationUrl
                : undefined,
          },
        },
      };
    },
    preparePolicy: (identity, value, input) =>
      service.preparePolicy(identity, value as Inspection, input),
    publicPolicy: (value) => {
      const plan = value as PolicyPlan;

      return {
        content: plan.content,
        noop: plan.noop,
        rootHead: plan.inspection.rootHead,
        nodeHead: plan.inspection.nodeHead,
      };
    },
    executePolicy: async (identity, value, progress) => {
      const result = await service.executePolicy(
        identity,
        value as PolicyPlan,
        async (update) => {
          await progress({
            ...update,
            verifiedOperations: update.operations
              .filter((item) => item.state === 'verified')
              .map((item) => item.name),
            currentOperation: update.operations.find(
              (item) => item.state === 'executing',
            )?.name,
          });
        },
      );

      await progress({
        completed: result.completed,
        total: result.total,
        verifiedOperations: result.operations
          .filter((item) => item.state === 'verified')
          .map((item) => item.name),
        operations: result.operations,
      });

      return {
        operations: result.operations,
        completed: result.completed,
        total: result.total,
        ready: result.ready,
        inspection: {
          ...publicInspection(result.inspection),
          installationUrl:
            result.inspection.waiting === 'app_access'
              ? config.installationUrl
              : undefined,
        },
      };
    },
  };

  return adapter;
}
