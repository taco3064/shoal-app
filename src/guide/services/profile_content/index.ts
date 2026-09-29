export type PublicProfile = {
  name: string | null;
  bio: string | null;
  location: string | null;
  followers: number;
};

export async function publicProfile(
  username: string,
  fetcher: typeof fetch = fetch,
): Promise<PublicProfile | null> {
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username)) {
    throw new Error('Invalid GitHub username.');
  }

  try {
    const response = await fetcher(`https://api.github.com/users/${username}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return null;
    }

    const profile = await response.json() as Record<string, unknown>;

    if (
      profile.type !== 'User'
      || typeof profile.login !== 'string'
      || profile.login.toLowerCase() !== username.toLowerCase()
    ) {
      return null;
    }

    return {
      name: typeof profile.name === 'string' ? profile.name : null,
      bio: typeof profile.bio === 'string' ? profile.bio : null,
      location: typeof profile.location === 'string' ? profile.location : null,
      followers: typeof profile.followers === 'number' && profile.followers >= 0
        ? profile.followers
        : 0,
    };
  } catch {
    return null;
  }
}
