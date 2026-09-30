export default function TestReviewer({ username }: { username: string }) {
  if (!['june-shoal', 'taco-gem'].includes(username.toLowerCase())) {
    return null;
  }

  return (
    <p className="test-reviewer">
      <strong>Test Reviewer</strong>
      {' · Used to validate Shoal flows.'}
    </p>
  );
}
