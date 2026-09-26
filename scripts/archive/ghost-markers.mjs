import { createClient } from '@supabase/supabase-js';
const url = 'https://mgzgyisesfvftrfowsus.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(url, key);

const { data: rec, error: recErr } = await sb.from('recordings').select('id, title, duration').ilike('title', '%KB_GHOST_REF%').limit(1);
if (recErr || !rec?.[0]) { console.log('Recording not found:', recErr); process.exit(1); }
console.log('Recording:', rec[0].id, rec[0].title, 'duration:', rec[0].duration);

const { data: markers, error: mErr } = await sb.from('markers').select('id, time, label, type').eq('recording_id', rec[0].id).eq('type', 'cue').order('time');
if (mErr) { console.log('Marker error:', mErr); process.exit(1); }
console.log('Cue markers:', JSON.stringify(markers, null, 2));
