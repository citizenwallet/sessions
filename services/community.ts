import 'server-only';

import { Config } from '@citizenwallet/sdk';
import walletPayBrusselsConfig from '@/assets/config/wallet.pay.brussels.json' assert { type: 'json' };

export const getConfigOfAlias = async (alias: string): Promise<Config> => {
  if (!process.env.COMMUNITIES_CONFIG_URL) {
    throw new Error('COMMUNITIES_CONFIG_URL is not set');
  }

  // TODO: temporary. remove later
  if (alias === 'wallet.pay.brussels') {
    return walletPayBrusselsConfig;
  }

  const response = await fetch(process.env.COMMUNITIES_CONFIG_URL);
  const data = (await response.json()) as Config[];

  const community = data.filter((community) => {
    const { alias: aliasFromConfig } = community.community;

    const isMatchAlias = aliasFromConfig.trim() === alias.trim();

    return isMatchAlias;
  });

  if (community.length === 0) {
    throw new Error(`No community config found for ${alias}`);
  }

  return community[0];
};
