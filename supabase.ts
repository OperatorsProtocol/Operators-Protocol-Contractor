import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dszhaazztlxxzbylyive.supabase.co';
const supabaseKey = 'sb_publishable_HXdVIVHMhpNsnnGsesv8hg_3ApMiqZO';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});