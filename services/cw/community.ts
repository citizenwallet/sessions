import 'server-only';

import { Config } from '@citizenwallet/sdk';

export const getConfigOfAlias = async (alias: string): Promise<Config> => {
  const dashboardUrl = process.env.DASHBOARD_BASE_URL;
  if (!dashboardUrl) throw new Error('DASHBOARD_URL is not set');

  const community: Config = await fetch(
    `${dashboardUrl}/communities/${alias}`
  ).then((res) => res.json());

  if (!community) throw new Error(`Community ${alias} not found`);

  return community;
};
