/**
 * Runtime settings the shared code needs, set once by whichever entry point starts the app
 * (`main.ts` for Deno, `cloudflare/src/index.ts` for the Worker). Shared modules read this
 * instead of `Deno.env` or a Worker `env`, so they run unchanged on either.
 */
export interface Config {
  /** Local development: cookies without `Secure`. */
  dev: boolean;
  /** PBKDF2 iterations for new password hashes. Workers refuses more than 100,000. */
  pbkdf2Iterations: number;
  /** Largest single photo accepted. The Worker keeps photos in D1, which stores at most 2 MB per value. */
  maxPhotoBytes: number;
}

export const config: Config = {
  dev: false,
  pbkdf2Iterations: 100_000,
  maxPhotoBytes: 6 * 1024 * 1024,
};

export function configure(c: Partial<Config>) {
  Object.assign(config, c);
}
