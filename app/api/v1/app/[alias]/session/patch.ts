'use server';
import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { StatusCodes, ReasonPhrases } from 'http-status-codes';
import { Wallet } from 'ethers';
import {
  CommunityConfig,
  confirmSession,
  verifyIncomingSessionRequest,
  verifySessionConfirm,
} from '@citizenwallet/sdk';
import { getConfigOfAlias } from '@/services/cw/community';

interface SessionConfirm {
  provider: string; // primary session manager provider address
  owner: string; // an address of a private key
  sessionRequestHash: string; // hash created from sessionRequest
  sessionHash: string; // hash of sessionRequestHash and challenge
  signedSessionHash: string;
}

/**
 * PATCH handler for confirming session requests
 *
 * @route PATCH /api/v1/app/[alias]/session
 *
 * @param {NextRequest} req - The request object
 * @param {Object} params - Route parameters
 * @param {string} params.alias - Community alias
 *
 * @requestBody {Object} request
 * @property {string} provider - Community primary session manager provider address
 * @property {string} owner - Address of the private key owner
 * @property {string} sessionRequestHash - generateSessionRequestHash(provider, sessionOwner, salt, expiry)
 * @property {string} sessionHash - generateSessionHash(sessionRequestHash,challenge)
 * @property {string} signedSessionHash - Signature of the session hash by the owner
 *
 * @returns {Promise<NextResponse>} JSON Response
 * @success {Object} 200
 * @property {string} sessionConfirmTxHash - Transaction hash of the session confirmation
 * @property {number} status - HTTP status code
 *
 * @error {Object} 400
 * @property {number} status - HTTP status code
 * @property {string} message - Error message for invalid requests:
 *   - "Session request expired"
 *   - "Challenge expired"
 *   - "Invalid session confirm"
 *   - "Invalid session hash"
 *   - Various request body validation errors
 *
 * @error {Object} 404
 * @property {number} status - HTTP status code
 * @property {string} message - Error messages:
 *   - "Community '{alias}' not found"
 *   - "Session request not found"
 *
 * @error {Object} 500
 * @property {number} status - HTTP status code
 * @property {string} message - Server configuration or internal error message
 *
 * @example
 * // Request
 * PATCH /api/v1/app/mycommunity/session
 * {
 *   "provider": "0x1234...",
 *   "owner": "0x5678...",
 *   "sessionRequestHash": "0xabcd...",
 *   "sessionHash": "0xdef...",
 *   "signedSessionHash": "0xghij..."
 * }
 *
 * // Success Response
 * {
 *   "sessionConfirmTxHash": "0xklmn...",
 *   "status": 200
 * }
 */

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ alias: string }> }
) {
  const providerPrivateKey = process.env.PROVIDER_PRIVATE_KEY;
  const { alias } = await params;

  try {
    const rawBody = await req.json();
    const sessionConfirm = sanitizeSessionConfirm(rawBody);

    const config = await getConfigOfAlias(alias);
    const community = new CommunityConfig(config);

    if (!providerPrivateKey) {
      throw new Error('PROVIDER_PRIVATE_KEY is not set');
    }

    const signer = new Wallet(providerPrivateKey);

    const sessionManager = community.primarySessionConfig;
    if (sessionConfirm.provider !== sessionManager.provider_address) {
      throw new Error('Invalid provider address');
    }

    const isValid = verifySessionConfirm({
      sessionOwner: sessionConfirm.owner,
      sessionHash: sessionConfirm.sessionHash,
      signedSessionHash: sessionConfirm.signedSessionHash,
    });

    if (!isValid) {
      throw new Error('Invalid session confirm');
    }

    const isSessionHashValid = await verifyIncomingSessionRequest({
      community: community,
      signer,
      sessionRequestHash: sessionConfirm.sessionRequestHash,
      sessionHash: sessionConfirm.sessionHash,
    });

    if (!isSessionHashValid) {
      throw new Error('Invalid session hash');
    }

    const txHash = await confirmSession({
      community,
      signer,
      sessionRequestHash: sessionConfirm.sessionRequestHash,
      sessionHash: sessionConfirm.sessionHash,
      signedSessionHash: sessionConfirm.signedSessionHash,
    });

    return NextResponse.json({
      sessionConfirmTxHash: txHash,
      status: StatusCodes.OK,
    });
  } catch (error) {
    console.error('Unexpected error in session PATCH handler:', error);

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

      // Community config errors
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

      // Session verification errors from verifyIncomingSessionRequest
      if (error.message === 'Session request not found') {
        return NextResponse.json(
          {
            status: StatusCodes.NOT_FOUND,
            message: 'Session request not found',
          },
          { status: StatusCodes.NOT_FOUND }
        );
      }

      if (
        error.message === 'Session request expired' ||
        error.message === 'Challenge expired'
      ) {
        return NextResponse.json(
          {
            status: StatusCodes.BAD_REQUEST,
            message: error.message,
          },
          { status: StatusCodes.BAD_REQUEST }
        );
      }

      // Request body validation errors
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
function sanitizeSessionConfirm(body: any): SessionConfirm {
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

  if (!body.sessionRequestHash || typeof body.sessionRequestHash !== 'string') {
    throw new Error('Invalid sessionRequestHash in request body');
  }

  if (!body.sessionHash || typeof body.sessionHash !== 'string') {
    throw new Error('Invalid sessionHash in request body');
  }

  if (!body.signedSessionHash || typeof body.signedSessionHash !== 'string') {
    throw new Error('Invalid signedSessionHash in request body');
  }

  // Sanitize the request
  const sanitized: SessionConfirm = {
    provider: body.provider,
    owner: body.owner,
    sessionRequestHash: body.sessionRequestHash,
    sessionHash: body.sessionHash,
    signedSessionHash: body.signedSessionHash,
  };

  return sanitized;
}
