import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Create one Supabase client that the rest of the app will use
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export async function saveSighting(data) {
  const { error } = await supabase
    .from('sightings')
    .insert([data]);

  if (error) {
    console.error('Failed to save sighting:', error.message);
    return false;
  }

  return true;
}
