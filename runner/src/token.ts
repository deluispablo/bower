/** The runner's Drive token, from the Worker's token route with the run's ticket (stub). */

/** What `GET /runner/runs/:id/token` answers. */
export interface TokenGrant {
  accessToken: string;
  /** Epoch ms. */
  expiresAt: number;
  folderId: string;
  attempt: number;
}

export interface RunnerTokenOptions {
  /** The Worker's origin, such as `https://api.example.com`. */
  api: string;
  runId: string;
  ticket: string;
  fetch?: typeof fetch;
  now?: () => number;
}

export class RunnerToken {
  constructor(readonly opts: RunnerTokenOptions) {}

  async token(_fresh: boolean): Promise<string> {
    return '';
  }

  async grant(): Promise<TokenGrant> {
    return { accessToken: '', expiresAt: 0, folderId: '', attempt: 0 };
  }
}
