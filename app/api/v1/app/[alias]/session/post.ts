import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { StatusCodes, ReasonPhrases } from 'http-status-codes';
import {
  generateSessionChallenge,
  generateSessionHash,
  generateSessionRequestHash,
  generateSessionSalt,
  requestSession,
  verifySessionRequest,
} from '@/services/session';
import { getBytes, Wallet } from 'ethers';
import { CommunityConfig } from '@citizenwallet/sdk';
// import { sendOtpEmail } from '@/services/brevo';
import { getConfigOfAlias } from '@/services/community';

type SourceType = 'email' | 'sms' | 'passkey';

interface SessionRequest {
  provider: string; // primary session manager provider address
  owner: string; // an address of a private key
  source: string; // an email address, a phone number, a passkey public key
  type: SourceType; // email, passkey, sms
  expiry: number; // in seconds, UTC timestamp
  signature: string; // signature hex
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ alias: string }> }
) {
  const providerPrivateKey = process.env.PROVIDER_PRIVATE_KEY;
  const { alias } = await params;

  try {
    const rawBody = await req.json();
    const sessionRequest = sanitizeSessionRequest(rawBody);

    const config = await getConfigOfAlias(alias);
    const community = new CommunityConfig(config);

    if (!providerPrivateKey) {
      throw new Error('PROVIDER_PRIVATE_KEY is not set');
    }

    const signer = new Wallet(providerPrivateKey);

    const sessionManager = community.primarySessionConfig;
    if (sessionRequest.provider !== sessionManager.provider_address) {
      throw new Error('Invalid provider address');
    }

    const isValid = await verifySessionRequest(
      sessionRequest.provider,
      sessionRequest.owner,
      sessionRequest.source,
      sessionRequest.type,
      sessionRequest.expiry,
      sessionRequest.signature
    );

    if (!isValid) {
      throw new Error('Invalid session signature');
    }

    const sessionSalt = generateSessionSalt(
      sessionRequest.source,
      sessionRequest.type
    );

    const sessionRequestHash = generateSessionRequestHash(
      sessionRequest.provider,
      sessionRequest.owner,
      sessionSalt,
      sessionRequest.expiry
    );

    const challenge = await generateSessionChallenge();
    console.log('challenge', challenge);

    const sessionHash = generateSessionHash(sessionRequestHash, challenge);

    const signedSessionHash = await signer.signMessage(getBytes(sessionHash));

    const txHash = await requestSession(
      community,
      signer,
      sessionManager.provider_address,
      sessionSalt,
      sessionRequestHash,
      sessionRequest.signature,
      signedSessionHash,
      sessionRequest.expiry
    );

    if (sessionRequest.type === 'email') {
      // await sendOtpEmail(source, challenge); // TODO uncomment this
    }

    if (sessionRequest.type === 'sms') {
      // await sendOtpSms(source, challenge); // TODO uncomment this
    }

    return NextResponse.json({
      sessionRequestTxHash: txHash,
      status: StatusCodes.OK,
    });
  } catch (error) {
    // Log any unexpected errors
    console.error('Unexpected error in session POST handler:', error);

    if (error instanceof Error) {
      // Environment variable errors
      if (error.message === 'PROVIDER_PRIVATE_KEY is not set') {
        return NextResponse.json(
          {
            status: StatusCodes.INTERNAL_SERVER_ERROR,
            message: 'Server configuration error',
          },
          { status: StatusCodes.INTERNAL_SERVER_ERROR }
        );
      }

      // Community config specific errors
      if (error.message === 'COMMUNITIES_CONFIG_URL is not set') {
        return NextResponse.json(
          {
            status: StatusCodes.INTERNAL_SERVER_ERROR,
            message: 'Server configuration error',
          },
          { status: StatusCodes.INTERNAL_SERVER_ERROR }
        );
      }

      if (error.message.startsWith('No community config found for')) {
        return NextResponse.json(
          {
            status: StatusCodes.NOT_FOUND,
            message: `Community "${alias}" not found`,
          },
          { status: StatusCodes.NOT_FOUND }
        );
      }

      // Provider address validation error
      if (error.message === 'Invalid provider address') {
        return NextResponse.json(
          {
            status: StatusCodes.BAD_REQUEST,
            message: 'Invalid provider address in request',
          },
          { status: StatusCodes.BAD_REQUEST }
        );
      }

      // Session signature validation error
      if (error.message === 'Invalid session signature') {
        return NextResponse.json(
          {
            status: StatusCodes.BAD_REQUEST,
            message: 'Invalid session signature',
          },
          { status: StatusCodes.BAD_REQUEST }
        );
      }

      // Session configuration error
      if (error.message === 'No sessions found') {
        return NextResponse.json(
          {
            status: StatusCodes.BAD_REQUEST,
            message: 'Community has no session configuration',
          },
          { status: StatusCodes.BAD_REQUEST }
        );
      }

      // Add request body validation errors
      if (error.message.includes('in request body')) {
        return NextResponse.json(
          {
            status: StatusCodes.BAD_REQUEST,
            message: error.message,
          },
          { status: StatusCodes.BAD_REQUEST }
        );
      }
    }

    // Generic error for unknown error types
    return NextResponse.json(
      {
        status: StatusCodes.INTERNAL_SERVER_ERROR,
        message: ReasonPhrases.INTERNAL_SERVER_ERROR,
      },
      { status: StatusCodes.INTERNAL_SERVER_ERROR }
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeSessionRequest(body: any): SessionRequest {
  if (!body) {
    throw new Error('Request body is required');
  }

  // Check required fields
  if (!body.provider || typeof body.provider !== 'string') {
    throw new Error('Invalid provider address in request body');
  }

  if (!body.owner || typeof body.owner !== 'string') {
    throw new Error('Invalid owner address in request body');
  }

  if (!body.source || typeof body.source !== 'string') {
    throw new Error('Invalid source in request body');
  }

  if (!body.type || !['email', 'sms', 'passkey'].includes(body.type)) {
    throw new Error(
      'Invalid source type. Must be "email", "sms", or "passkey"'
    );
  }

  if (!body.expiry || typeof body.expiry !== 'number') {
    throw new Error('Invalid expiry in request body');
  }

  if (!body.signature || typeof body.signature !== 'string') {
    throw new Error('Invalid signature in request body');
  }

  if (body.type === 'email') {
    body.source = body.source.toLowerCase().trim();
  }

  // Sanitize the request
  const sanitized: SessionRequest = {
    provider: body.provider,
    owner: body.owner,
    source: body.source,
    type: body.type as SourceType,
    expiry: body.expiry,
    signature: body.signature,
  };

  return sanitized;
}
