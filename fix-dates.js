(async function() {
  var MP4_EPOCH = 2082844800;
  var supabaseUrl = "https://mgzgyisesfvftrfowsus.supabase.co";
  var supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nemd5aXNlc2Z2ZnRyZm93c3VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMTk3MDYsImV4cCI6MjA4Njc5NTcwNn0.yCctCfTwMQSccWN46UaqIyPt3iW4hv36VddERtbrNGc";

  var mod = await import("https://esm.sh/@supabase/supabase-js@2");
  var sb = mod.createClient(supabaseUrl, supabaseKey);

  var sessionRes = await sb.auth.getSession();
  var session = sessionRes.data.session;
  if (!session) { console.error("Not logged in"); return; }
  console.log("Logged in as " + session.user.email);

  var recsRes = await sb.from("recordings").select("id, file_name, recorded_at").eq("user_id", session.user.id);
  var recs = recsRes.data;
  if (!recs) { console.error("No recordings found"); return; }
  console.log("Found " + recs.length + " recordings");

  for (var i = 0; i < recs.length; i++) {
    var rec = recs[i];
    console.log("Processing " + rec.file_name + "...");

    var dlRes = await sb.storage.from("recordings").download(rec.file_name);
    if (dlRes.error || !dlRes.data) {
      console.log("  Skip - download failed: " + (dlRes.error ? dlRes.error.message : "no data"));
      continue;
    }

    var blob = dlRes.data;
    console.log("  Downloaded (" + (blob.size / 1024 / 1024).toFixed(1) + " MB)");

    var buf = await blob.arrayBuffer();
    var view = new DataView(buf);
    var offset = 0;
    var date = null;

    while (offset + 8 <= view.byteLength) {
      var size = view.getUint32(offset);
      var t0 = view.getUint8(offset + 4);
      var t1 = view.getUint8(offset + 5);
      var t2 = view.getUint8(offset + 6);
      var t3 = view.getUint8(offset + 7);
      var type = String.fromCharCode(t0, t1, t2, t3);
      if (size < 8) break;
      if (type === "moov") {
        var inner = offset + 8;
        while (inner + 20 <= offset + size) {
          var aSize = view.getUint32(inner);
          var a0 = view.getUint8(inner + 4);
          var a1 = view.getUint8(inner + 5);
          var a2 = view.getUint8(inner + 6);
          var a3 = view.getUint8(inner + 7);
          var aType = String.fromCharCode(a0, a1, a2, a3);
          if (aSize < 8) break;
          if (aType === "mvhd") {
            var v = view.getUint8(inner + 8);
            var ct = (v === 0) ? view.getUint32(inner + 12) : view.getUint32(inner + 16);
            if (ct > 0) {
              var s = ct - MP4_EPOCH;
              if (s > 0) date = new Date(s * 1000);
            }
          }
          inner += aSize;
        }
        break;
      }
      offset += size;
    }

    if (date) {
      var iso = date.toISOString();
      await sb.from("recordings").update({ recorded_at: iso }).eq("id", rec.id);
      console.log("  Updated: " + rec.recorded_at + " -> " + iso);
    } else {
      console.log("  No MP4 date found");
    }
  }
  console.log("All done!");
})();
