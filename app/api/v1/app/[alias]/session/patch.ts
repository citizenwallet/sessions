'use server';
import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { StatusCodes, ReasonPhrases } from 'http-status-codes';
// import "@/lib/utils";
import {
  confirmSession,
  verifyIncomingSessionRequest,
  verifySessionConfirm,
} from '@/services/session';
import { Wallet } from 'ethers';
import { CommunityConfig } from '@citizenwallet/sdk';
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
  const config = await getConfigOfAlias(alias);
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

  const txHash = await confirmSession(
    community,
    signer,
    providerAccountAddress,
    sessionRequest.sessionRequestHash,
    sessionRequest.sessionHash,
    sessionRequest.signedSessionHash
  );

  return NextResponse.json({
    sessionConfirmTxHash: txHash,
    status: StatusCodes.OK,
  });
}
