export default function PublicExplanation({ explanation }: {
  explanation: { title: string; paragraphs: readonly string[] };
}) {
  return (
    <details className="snapshot-note public-explanation">
      <summary>{explanation.title}</summary>
      {explanation.paragraphs.map((text) => <p key={text}>{text}</p>)}
    </details>
  );
}
