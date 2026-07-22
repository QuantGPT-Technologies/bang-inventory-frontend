import { ExternalAccountClient } from 'google-auth-library';
import { getVercelOidcToken } from '@vercel/oidc';
import { NextRequest, NextResponse } from 'next/server';

// Server-side proxy in front of the Cloud Run backend: the browser never gets a direct network
// path to Cloud Run or any GCP credential. It calls this route same-origin (see
// NEXT_PUBLIC_API_BASE_URL=/api/proxy), and this handler exchanges Vercel's own OIDC identity
// token for a short-lived GCP access token (Workload Identity Federation -- no service-account
// key ever exists) and forwards the request to Cloud Run with that token attached.
const authClient = ExternalAccountClient.fromJSON({
  type: 'external_account',
  audience: `//iam.googleapis.com/${process.env.GCP_WORKLOAD_IDENTITY_PROVIDER}`,
  subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
  token_url: 'https://sts.googleapis.com/v1/token',
  service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${process.env.GCP_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,
  // Pulls the current request's Vercel OIDC token instead of reading it from a file/URL --
  // google-auth-library calls this on every token exchange, so it always gets a fresh token
  // rather than one captured at module load.
  subject_token_supplier: {
    getSubjectToken: () => getVercelOidcToken(),
  },
});

async function handler(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const cloudRunBase = process.env.CLOUD_RUN_URL;
  if (!cloudRunBase) {
    return NextResponse.json({ error: 'CLOUD_RUN_URL is not configured' }, { status: 500 });
  }

  const targetUrl = `${cloudRunBase}/api/v1/${path.join('/')}${req.nextUrl.search}`;

  let accessToken: string | null | undefined;
  try {
    const client = await authClient;
    if (!client) throw new Error('Failed to construct external account client -- check GCP_WORKLOAD_IDENTITY_PROVIDER/GCP_SERVICE_ACCOUNT_EMAIL');
    ({ token: accessToken } = await client.getAccessToken());
  } catch (err) {
    console.error('Failed to obtain GCP access token via Workload Identity Federation:', err);
    return NextResponse.json({ error: 'Failed to authenticate with backend' }, { status: 502 });
  }

  // Forward the caller's own headers (notably the app's `Authorization: Bearer <app token>` for
  // the logged-in user, which the Go API needs) and only overwrite Authorization with the GCP
  // identity token Cloud Run's IAM check requires -- these are two unrelated bearer tokens for
  // two different layers (Cloud Run ingress vs. the app's own session), not one replacing the
  // other, so the app's token has to travel under a different header.
  const forwardedHeaders = new Headers(req.headers);
  forwardedHeaders.delete('host');
  forwardedHeaders.delete('connection');
  const appAuthorization = req.headers.get('authorization');
  if (appAuthorization) forwardedHeaders.set('x-app-authorization', appAuthorization);
  forwardedHeaders.set('authorization', `Bearer ${accessToken}`);

  const hasBody = !['GET', 'HEAD'].includes(req.method);

  const resp = await fetch(targetUrl, {
    method: req.method,
    headers: forwardedHeaders,
    body: hasBody ? await req.arrayBuffer() : undefined,
    redirect: 'manual',
  });

  const responseHeaders = new Headers(resp.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');

  return new NextResponse(resp.body, { status: resp.status, headers: responseHeaders });
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
