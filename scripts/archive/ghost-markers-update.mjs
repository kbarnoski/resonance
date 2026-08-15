// Run this while logged in to the app — uses the user's session cookie
// Usage: open browser console and paste the fetch calls below, OR
// use this script with a service role key

import { createClient } from '@supabase/supabase-js';

const url = 'https://mgzgyisesfvftrfowsus.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nemd5aXNlc2Z2ZnRyZm93c3VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMTk3MDYsImV4cCI6MjA4Njc5NTcwNn0.yCctCfTwMQSccWN46UaqIyPt3iW4hv36VddERtbrNGc';

// Try to auth with stored credentials
const sb = createClient(url, key, {
  auth: { persistSession: false }
});

// Sign in — you'll need to provide credentials
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.log('Set ADMIN_EMAIL and ADMIN_PASSWORD env vars to authenticate');
  console.log('');
  console.log('Alternatively, paste this in your browser console while logged into Resonance:');
  console.log('');
  console.log(`
const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
const sb = createClient('${url}', '${key}');
// Use existing session
const { data: { session } } = await sb.auth.getSession();
if (!session) { console.log('Not logged in'); } else {
  const r1 = await sb.from('markers').update({ time: 97.7045 }).eq('id', 'c125ddba-bc15-4424-bb8c-8e0fd2e5eaa1');
  console.log('Marker 1:', r1.error || 'OK (98.7 -> 97.7)');
  const r2 = await sb.from('markers').update({ time: 159.757 }).eq('id', '090d864e-dd91-4455-8e35-3ccffb75d590');
  console.log('Marker 2:', r2.error || 'OK (160.8 -> 159.8)');
}
  `);
  process.exit(0);
}

const { error: authErr } = await sb.auth.signInWithPassword({ email, password });
if (authErr) { console.log('Auth failed:', authErr.message); process.exit(1); }

const { error: e1 } = await sb.from('markers').update({ time: 97.7045 }).eq('id', 'c125ddba-bc15-4424-bb8c-8e0fd2e5eaa1');
console.log('Marker 1:', e1 || 'OK (98.7 -> 97.7)');

const { error: e2 } = await sb.from('markers').update({ time: 159.757 }).eq('id', '090d864e-dd91-4455-8e35-3ccffb75d590');
console.log('Marker 2:', e2 || 'OK (160.8 -> 159.8)');

const { data: markers } = await sb.from('markers').select('id, time, label').eq('recording_id', '549fc519-f7fc-4c38-a771-adaad2edbc81').eq('type', 'cue').order('time');
console.log('Verified:', JSON.stringify(markers, null, 2));
