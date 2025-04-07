'use server';
import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { StatusCodes, ReasonPhrases } from 'http-status-codes';
import {
  confirmSession,
  verifyIncomingSessionRequest,
  verifySessionConfirm,
} from '@/services/session';
import { Wallet } from 'ethers';
import { CommunityConfig, Config } from '@citizenwallet/sdk';
import { getConfigOfAlias } from '@/services/community';

interface SessionConfirm {
  provider: string;
  owner: string;
  sessionRequestHash: string;
  sessionHash: string;
  signedSessionHash: string;
}

export async function PATCH(
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

  const sessionRequest: SessionConfirm = await req.json();
  if (sessionRequest.provider !== providerAccountAddress) {
    return NextResponse.json({
      status: StatusCodes.BAD_REQUEST, // 400
      message: ReasonPhrases.BAD_REQUEST, // "Bad Request" message
    });
  }

  const isValid = await verifySessionConfirm(
    sessionRequest.owner,
    sessionRequest.sessionHash,
    sessionRequest.signedSessionHash
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

  const isSessionHashValid = await verifyIncomingSessionRequest(
    community,
    signer,
    providerAccountAddress,
    sessionRequest.sessionRequestHash,
    sessionRequest.sessionHash
  );

  if (!isSessionHashValid) {
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

  let txHash: string;
  try {
    txHash = await confirmSession(
      community,
      signer,
      providerAccountAddress,
      sessionRequest.sessionRequestHash,
      sessionRequest.sessionHash,
      sessionRequest.signedSessionHash
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

  return NextResponse.json({
    sessionConfirmTxHash: txHash,
    status: StatusCodes.OK,
  });
}
