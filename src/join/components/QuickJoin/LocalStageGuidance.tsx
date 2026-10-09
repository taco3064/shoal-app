import { findJoinGuidance } from '~app/join/hooks/useQuickJoin';

type StageWithId = {
  id: string;
};

export default function LocalStageGuidance({
  open = false,
  stage,
}: {
  open?: boolean;
  stage: StageWithId;
}) {
  const guidance = findJoinGuidance(stage.id);

  if (!guidance) {
    return null;
  }

  return (
    <details className="quick-local-note" open={open}>
      <summary>Local / CLI mode for this stage</summary>
      <p>{guidance.localDescription}</p>
      {guidance.commands && (
        <ol>
          {guidance.commands.map((command) => (
            <li key={command}><code>{command}</code></li>
          ))}
        </ol>
      )}
    </details>
  );
}
