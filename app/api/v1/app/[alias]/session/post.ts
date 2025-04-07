'use server';

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
import { CommunityConfig, Config } from '@citizenwallet/sdk';
// import { sendOtpEmail } from '@/services/brevo';
import { getConfigOfAlias } from '@/services/community';

interface SessionRequest {
  provider: string; // process.env.PROVIDER_ACCOUNT_ADDRESS
  owner: string; // an address of a private key
  source: string; // an email address, a phone number, a passkey public key
  type: string; // email, passkey, sms
  expiry: number; // UTC timestamp
  signature: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ alias: string }> }
) {
  const providerPrivateKey = process.env.PROVIDER_PRIVATE_KEY;
  const { alias } = await params;

  if (!providerPrivateKey) {
    return NextResponse.json(
      {
        status: StatusCodes.INTERNAL_SERVER_ERROR, // 500
        message: ReasonPhrases.INTERNAL_SERVER_ERROR, // "Internal Server Error" message
      },
      {
        status: StatusCodes.INTERNAL_SERVER_ERROR, // Using the 500 constant
      }
    );
  }

  const signer = new Wallet(providerPrivateKey);

  const providerAccountAddress = process.env.PROVIDER_ACCOUNT_ADDRESS;
  if (!providerAccountAddress) {
    return NextResponse.json({
      status: StatusCodes.INTERNAL_SERVER_ERROR, // 500
      message: ReasonPhrases.INTERNAL_SERVER_ERROR, // "Internal Server Error" message
    });
  }

  const sessionRequest: SessionRequest = await req.json();

  if (sessionRequest.provider !== providerAccountAddress) {
    return NextResponse.json({
      status: StatusCodes.BAD_REQUEST, // 400
      message: ReasonPhrases.BAD_REQUEST, // "Bad Request" message
    });
  }

  let source = sessionRequest.source;
  if (sessionRequest.type === 'email') {
    source = source.toLowerCase().trim();
  }

  const isValid = await verifySessionRequest(
    sessionRequest.provider,
    sessionRequest.owner,
    source,
    sessionRequest.type,
    sessionRequest.expiry,
    sessionRequest.signature
  );

  if (!isValid) {
    return NextResponse.json(
      {
        status: StatusCodes.BAD_REQUEST, // 400
        message: ReasonPhrases.BAD_REQUEST, // "Bad Request" message
      },
      {
        status: StatusCodes.BAD_REQUEST, // Using the 400 constant
      }
    );
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

  const sessionHash = generateSessionHash(sessionRequestHash, challenge);

  const signedSessionHash = await signer.signMessage(getBytes(sessionHash));

  // TODO: add 2fa provider to community config
  let config: Config;
  try {
    config = await getConfigOfAlias(alias);
  } catch (error) {
    console.error('Failed to get community config:', error);

    if (error instanceof Error) {
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
    }

    // Generic error response for fetch failures or other errors
    return NextResponse.json(
      {
        status: StatusCodes.INTERNAL_SERVER_ERROR,
        message: ReasonPhrases.INTERNAL_SERVER_ERROR,
      },
      { status: StatusCodes.INTERNAL_SERVER_ERROR }
    );
  }

  const community = new CommunityConfig(config);

  let txHash: string;
  try {
    txHash = await requestSession(
      community,
      signer,
      providerAccountAddress,
      sessionSalt,
      sessionRequestHash,
      sessionRequest.signature,
      signedSessionHash,
      sessionRequest.expiry
    );
  } catch (error) {
    console.error('Session request failed:', error);

    if (error instanceof Error) {
      if (error.message === 'No sessions found') {
        return NextResponse.json(
          {
            status: StatusCodes.BAD_REQUEST,
            message: 'Community has no session configuration',
          },
          { status: StatusCodes.BAD_REQUEST }
        );
      }
    }

    // Generic error response for other types of errors
    return NextResponse.json(
      {
        status: StatusCodes.INTERNAL_SERVER_ERROR,
        message: ReasonPhrases.INTERNAL_SERVER_ERROR,
      },
      { status: StatusCodes.INTERNAL_SERVER_ERROR }
    );
  }

  // TODO: temopary. remove later
  // await sendOtpEmail(source, challenge);

  return NextResponse.json({
    sessionRequestTxHash: txHash,
    status: StatusCodes.OK,
  });
}
