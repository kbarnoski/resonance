import { createClient } from '@supabase/supabase-js';
const url = 'https://mgzgyisesfvftrfowsus.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nemd5aXNlc2Z2ZnRyZm93c3VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMTk3MDYsImV4cCI6MjA4Njc5NTcwNn0.yCctCfTwMQSccWN46UaqIyPt3iW4hv36VddERtbrNGc';
const sb = createClient(url, key);

const { data: rec, error: recErr } = await sb.from('recordings').select('id, title, duration').ilike('title', '%KB_GHOST_REF%').limit(1);
if (recErr || !rec?.[0]) { console.log('Recording not found:', recErr); process.exit(1); }
console.log('Recording:', rec[0].id, rec[0].title, 'duration:', rec[0].duration);

const { data: markers, error: mErr } = await sb.from('markers').select('id, time, label, type').eq('recording_id', rec[0].id).eq('type', 'cue').order('time');
if (mErr) { console.log('Marker error:', mErr); process.exit(1); }
console.log('Cue markers:', JSON.stringify(markers, null, 2));
