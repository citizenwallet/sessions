import 'server-only';

import { Config } from '@citizenwallet/sdk';

interface RCommunity {
  json: Config;
}

export const getConfigOfAlias = async (alias: string): Promise<Config> => {
  const dashboardUrl = process.env.DASHBOARD_BASE_URL;
  if (!dashboardUrl) throw new Error('DASHBOARD_URL is not set');

  const rCommunity: RCommunity = await fetch(
    `${dashboardUrl}/communities/${alias}`
  ).then((res) => res.json());

  const community = rCommunity.json;

  if (!community) throw new Error(`Community ${alias} not found`);

  return community;
};
