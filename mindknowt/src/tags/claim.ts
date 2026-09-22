/**
 * Sends a tag claim to Airtable.
 *
 * There is no backend. The app posts one row directly, using a token scoped to
 * `data.records:write` on a single base, supplied through the environment at
 * build time rather than committed.
 *
 * Be clear-eyed about what that token is: anything bundled into a mobile app
 * can be extracted from the binary. Write-only and single-base is what bounds
 * the damage. Someone who pulls it out can add junk rows; they cannot read the
 * addresses already submitted, and they cannot reach anything else in the
 * base. If it is ever abused, the token is deleted and reissued.
 */

const BASE_ID = 'appTuJlrryXpiq76c';
const TABLE = 'Tag Claims';

export type TagClaim = {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
};

export type ClaimFailureReason =
  /** The build carried no token. Nothing to do but fix the build. */
  | 'not-configured'
  /** The token was refused. Expired, revoked, or wrong scope. */
  | 'unauthorized'
  /** Airtable understood the request and rejected it. */
  | 'rejected'
  /** Airtable is having a problem, or is rate limiting. */
  | 'server'
  /** The phone could not reach Airtable at all. */
  | 'offline'
  | 'unknown';

export class ClaimError extends Error {
  readonly reason: ClaimFailureReason;

  constructor(reason: ClaimFailureReason, message: string) {
    super(message);
    this.name = 'ClaimError';
    this.reason = reason;
  }
}

/** Set in `.env.local`, which git ignores, and read at build time. */
function token(): string | null {
  const value = process.env.EXPO_PUBLIC_AIRTABLE_TOKEN;
  return value && value.trim() ? value.trim() : null;
}

export function isClaimConfigured(): boolean {
  return token() !== null;
}

/** What to say to a person, per reason. Never the raw body. */
export function claimFailureText(err: unknown): string {
  if (!(err instanceof ClaimError)) {
    return err instanceof Error && err.message ? err.message : String(err);
  }

  switch (err.reason) {
    case 'not-configured':
      return 'This build cannot send the form yet. Nothing was sent.';
    case 'unauthorized':
      return 'The connection to our order list was refused. Nothing was sent, and this is our problem to fix, not yours.';
    case 'rejected':
      return `Airtable would not accept it: ${err.message}`;
    case 'server':
      return 'Airtable is not responding right now. Nothing was sent. Try again in a few minutes.';
    case 'offline':
      return 'No connection. Nothing was sent. Try again once you are back online.';
    default:
      return err.message;
  }
}

/**
 * Posts one row. Resolves only when Airtable confirms it stored the record,
 * so a caller can tell the person it was sent and be telling the truth.
 */
export async function submitTagClaim(claim: TagClaim): Promise<void> {
  const key = token();
  if (!key) {
    throw new ClaimError(
      'not-configured',
      'EXPO_PUBLIC_AIRTABLE_TOKEN is not set in this build.',
    );
  }

  const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records: [
          {
            fields: {
              Name: claim.name,
              Address: claim.address,
              City: claim.city,
              State: claim.state,
              Zip: claim.zip,
            },
          },
        ],
      }),
    });
  } catch (err) {
    // fetch only rejects when the request never completed.
    throw new ClaimError(
      'offline',
      err instanceof Error && err.message ? err.message : 'Request failed.',
    );
  }

  if (response.ok) return;

  // Airtable explains itself in the body, and that explanation is the only
  // thing that makes a 422 debuggable. Read it, but keep it out of the copy
  // shown to the person.
  let detail = '';
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'error' in body) {
      const error = (body as { error: unknown }).error;
      detail =
        typeof error === 'string'
          ? error
          : error && typeof error === 'object' && 'message' in error
            ? String((error as { message: unknown }).message)
            : '';
    }
  } catch {
    // A body that is not JSON tells us nothing; the status still does.
  }

  const suffix = detail ? `: ${detail}` : '';

  if (response.status === 401 || response.status === 403) {
    throw new ClaimError('unauthorized', `Airtable refused the token${suffix}`);
  }
  if (response.status === 429 || response.status >= 500) {
    throw new ClaimError('server', `Airtable returned ${response.status}${suffix}`);
  }
  throw new ClaimError('rejected', detail || `Airtable returned ${response.status}`);
}
