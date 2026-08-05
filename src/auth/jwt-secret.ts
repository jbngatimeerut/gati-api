// The one place JWT_SECRET is read from. Every previous call site had its own
// `process.env.JWT_SECRET || 'dev-secret-change-me'` fallback — that string is public (it's in
// this repo's history), so an unset JWT_SECRET in any real deployment meant anyone could forge a
// valid token for any member, including APEX_ADMIN. Failing fast at boot is safer than silently
// running with a known-insecure secret.
if (!process.env.JWT_SECRET) {
  throw new Error(
    'JWT_SECRET environment variable is not set. Refusing to start — running with a default/guessable ' +
    'secret would let anyone forge valid login tokens. Set JWT_SECRET in your .env (see .env.example).',
  );
}

export const JWT_SECRET: string = process.env.JWT_SECRET;
