import 'server-only';

import { PostgrestSingleResponse, SupabaseClient } from '@supabase/supabase-js';

export interface SessionRequest {
  id: number;
  salt: string;
  alias: string;
  created_at: string;
}

export const createSessionRequest = async (
  client: SupabaseClient,
  data: Pick<SessionRequest, 'salt' | 'alias'>
): Promise<PostgrestSingleResponse<SessionRequest | null>> => {
  return client
    .from('session_request')
    .insert({
      salt: data.salt,
      alias: data.alias,
      created_at: new Date().toISOString(),
    })
    .select('*')
    .maybeSingle();
};

// get count of session requests for a given salt + alias in the last 10 minutes
export const getRecentSessionRequestCount = async (
  client: SupabaseClient,
  filter: Pick<SessionRequest, 'salt' | 'alias'>
): Promise<number> => {
  const { data, error } = await client
    .from('session_request')
    .select('count')
    .eq('salt', filter.salt)
    .eq('alias', filter.alias)
    .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .maybeSingle();
  if (error) {
    return 0;
  }
  return data?.count ?? 0;
};

// get count of session requests for a given salt + alias in the last 24 hours
export const getDailySessionRequestCount = async (
  client: SupabaseClient,
  filter: Pick<SessionRequest, 'salt' | 'alias'>
): Promise<number> => {
  const { data, error } = await client
    .from('session_request')
    .select('count')
    .eq('salt', filter.salt)
    .eq('alias', filter.alias)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .maybeSingle();
  if (error) {
    return 0;
  }
  return data?.count ?? 0;
};

// get count of session requests for a given salt + alias in the last 30 seconds
export const getImmediateSessionRequestCount = async (
  client: SupabaseClient,
  filter: Pick<SessionRequest, 'salt' | 'alias'>
): Promise<number> => {
  const { data, error } = await client
    .from('session_request')
    .select('count')
    .eq('salt', filter.salt)
    .eq('alias', filter.alias)
    .gte('created_at', new Date(Date.now() - 30 * 1000).toISOString())
    .maybeSingle();
  if (error) {
    return 0;
  }
  return data?.count ?? 0;
};
