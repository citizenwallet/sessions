"use server";

import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { StatusCodes, ReasonPhrases } from "http-status-codes";
import "@/lib/utils";
import {
  generateSessionChallenge,
  generateSessionHash,
  generateSessionRequestHash,
  generateSessionSalt,
  requestSession,
  verifySessionRequest,
} from "@/services/session";
import { getBytes, Wallet } from "ethers";
import { CommunityConfig } from "@citizenwallet/sdk";
import { sendOtpEmail } from "@/services/brevo";
 import { getConfigOfAlias } from "@/services/community"; 

interface SessionRequest {
  provider: string;
  owner: string;
  source: string;
  type: string;
  expiry: number;
  signature: string;
}

export async function POST(req: NextRequest, { params }: { params: { alias: string } }) {
  const providerPrivateKey = process.env.PROVIDER_PRIVATE_KEY;

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

  const isValid = await verifySessionRequest(
    sessionRequest.provider,
    sessionRequest.owner,
    sessionRequest.source,
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
  const alias = params.alias;
  const config = await getConfigOfAlias(alias);
  const community = new CommunityConfig(config);

  const txHash = await requestSession(
    community,
    signer,
    providerAccountAddress,
    sessionSalt,
    sessionRequestHash,
    sessionRequest.signature,
    signedSessionHash,
    sessionRequest.expiry
  );

  await sendOtpEmail(sessionRequest.source, challenge);

  return NextResponse.json({
    sessionRequestTxHash: txHash,
    status: StatusCodes.OK,
  });
}


