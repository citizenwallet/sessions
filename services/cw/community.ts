import 'server-only';

import { Config } from '@citizenwallet/sdk';
import communities from '@/services/cw/communities.json' assert { type: 'json' };

export const getConfigOfAlias = (alias: string): Config => {
  const community: Config = communities.find(
    (community) => community.community.alias === alias
  ) as unknown as Config;

  if (!community) throw new Error(`Community ${alias} not found`);

  return community;
};
