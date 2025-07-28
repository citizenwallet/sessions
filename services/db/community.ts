import 'server-only';

import { Config } from '@citizenwallet/sdk';
import {
  PostgrestMaybeSingleResponse,
  SupabaseClient,
} from '@supabase/supabase-js';

export interface CommunityRow {
  alias: string;
  chain_id: number;
  active: boolean;
  created_at: Date;
  updated_at: Date;
  json: Config;
}

const TABLE_NAME = 'communities';

export const getCommunityByAlias = async (
  client: SupabaseClient,
  alias: string
): Promise<PostgrestMaybeSingleResponse<CommunityRow>> => {
  return await client
    .from(TABLE_NAME)
    .select('*')
    .eq('alias', alias)
    .maybeSingle();
};
