export default function TestReviewer({ username }: { username: string }) {
  if (!['june-shoal', 'taco-gem'].includes(username.toLowerCase())) {
    return null;
  }

  return (
    <span className="test-reviewer" aria-label="Test Reviewer" title="Test Reviewer">
      Test
    </span>
  );
}
