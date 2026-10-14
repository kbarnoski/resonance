#!/usr/bin/env node
// make_toe.mjs — author ResonanceShow.toe WITHOUT running TouchDesigner.
//
// TouchDesigner ships `toecollapse` (Contents/MacOS), which turns an expanded
// ASCII project (a .toe.dir folder + .toe.toc list, the format `toeexpand`
// writes) into a binary .toe, with no licence needed. This script writes that
// expanded project:
//
//   /project1                 container (the show lives in /project1/show)
//   /project1/boot            Execute DAT: on start, builds /project1/show from
//                             build_show (if it isn't built yet) and saves the .toe
//   /project1/build_show      Text DAT: scripts/touchdesigner/build_show.py
//   /project1/looks           Text DAT: scripts/touchdesigner/looks.json
//   /project1/rehearsal_log   Text DAT: a recorded OSC log (JSONL) for rehearsal mode
//   /perform                  Window COMP (F1 = perform mode → /project1/show/out)
//
// The first launch builds the network (a few seconds) and saves the file, so
// every later launch opens the finished patch directly.
//
//   node scripts/touchdesigner/make_toe.mjs [--out ~/Documents/Resonance/touchdesigner/ResonanceShow.toe]
//        [--log scripts/touchdesigner/rehearsal.oscl.jsonl] [--td /path/TouchDesigner.app]
//        [--boot-only <py file>]   (probe: a toe whose boot runs that file instead)

import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = path.resolve(opt("--out", path.join(os.homedir(), "Documents/Resonance/touchdesigner/ResonanceShow.toe")));
const TD = opt("--td", path.join(os.homedir(), "Applications/TouchDesigner.app"));
const LOG = path.resolve(opt("--log", path.join(HERE, "rehearsal.oscl.jsonl")));
const BOOT_ONLY = opt("--boot-only", null);

/** ASCII-only (TD's DAT length header counts bytes; keep it 1 byte = 1 char). */
const ascii = (s) => s.replace(/[^\x09\x0a\x0d\x20-\x7e]/g, (c) => (c.charCodeAt(0) < 0x10000 ? `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}` : "?"));

/** A DAT's .text payload: "2\n*" + 6 big-endian int32 (1,1,1,1,2,len) + bytes (1x1 table). */
export function datText(content) {
  const body = Buffer.from(ascii(content), "latin1");
  const head = Buffer.alloc(3 + 24);
  head.write("2\n*", 0, "latin1");
  [1, 1, 1, 1, 2, body.length].forEach((v, i) => head.writeInt32BE(v, 3 + i * 4));
  return Buffer.concat([head, body]);
}

const BOOT = `# boot — builds /project1/show on first start, then saves this .toe.
# Rebuild any time: delete /project1/show (or run op('/project1/boot').module.rebuild()).
import os, json, traceback

def _log(msg):
	print('[resonance-show]', msg)
	try:
		p = os.path.join(project.folder, 'ResonanceShow.build.log')
		with open(p, 'a') as f:
			f.write(msg + '\\n')
	except Exception:
		pass

def rebuild(save=True):
	try:
		bs = op('/project1/build_show').module
		report = bs.build(op('/project1'), looks_dat=op('/project1/looks'), log_dat=op('/project1/rehearsal_log'))
		_log('built: ' + json.dumps(report))
		if save and not os.environ.get('RESONANCE_TD_NOSAVE'):
			project.save(os.path.join(project.folder, project.name))
			_log('saved ' + project.name)
	except Exception:
		_log('BUILD FAILED\\n' + traceback.format_exc())

def _maybe_build():
	show = op('/project1/show')
	if show is None or not show.fetch('built', False, search=False):
		rebuild()
	selftest = os.environ.get('RESONANCE_TD_SELFTEST')
	if selftest:
		run("op('/project1/build_show').module.selftest(op('/project1/show'), %r)" % selftest, delayFrames=30)

def onStart():
	_maybe_build()
	return

def onCreate():
	return
`;

async function files() {
  const f = new Map();
  const tdBuild = (() => { try { return readFileSync(path.join(TD, "Contents/Info.plist"), "utf8").match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)/)?.[1] || "2025.33230"; } catch { return "2025.33230"; } })();
  f.set(".build", `version 099\nbuild ${tdBuild}\ntime ${new Date().toUTCString()}\n`);
  f.set(".start", "cookrate 60\nclock -f 1 -s 1 -o 0 -w 0\nrealtime on\nviewers off\n");
  f.set(".grps", "-2\n0\n");
  f.set("project1.n", "COMP:container\ntile 200 100 400 244\nflags =  picked on current on viewer 1 parlanguage 0\ncolor 0.56 0.56 0.56 \nend\n");
  f.set("project1.parm", "?\nw 0 1920\nh 0 1080\nparentshortcut 0 Project\n?\n");
  f.set("project1.panel", "1\n3\n7\nu 0.5\nv 0.5\ntrueu 0.5\ntruev 0.5\nclick 1\nscreenw 400\nscreenh 300\n");
  const dat = (name, type, x, y, parm, text) => {
    f.set(`project1/${name}.n`, `DAT:${type}\ntile ${x} ${y} 130 90\nflags =  viewer 1 parlanguage 0\ncolor 0.55 0.55 0.55 \nend\n`);
    f.set(`project1/${name}.parm`, `?\n${parm}?\n`);
    f.set(`project1/${name}.text`, datText(text));
  };
  const boot = BOOT_ONLY ? readFileSync(BOOT_ONLY, "utf8") : BOOT;
  dat("boot", "execute", -400, 300, "start 0 on\ncreate 0 on\nlanguage 0 python\n", boot);
  if (!BOOT_ONLY) {
    const code = readFileSync(path.join(HERE, "build_show.py"), "utf8");
    if (/[^\x09\x0a\x0d\x20-\x7e]/.test(code)) throw new Error("build_show.py must be ASCII-only (it is embedded byte-for-byte)");
    dat("build_show", "text", -400, 150, "language 0 python\n", code);
    dat("looks", "text", -250, 150, "language 0 text\n", readFileSync(path.join(HERE, "looks.json"), "utf8"));
    if (!existsSync(LOG)) {
      // the bundled log is generated (deterministic, seeded) rather than committed
      const { synthLog } = await import("./osc-show.mjs");
      writeFileSync(LOG, synthLog({ secondsEach: 16, gap: 3 }).map((r) => JSON.stringify(r)).join("\n") + "\n");
      console.log(`[make_toe] generated rehearsal log ${LOG}`);
    }
    dat("rehearsal_log", "text", -100, 150, "language 0 text\n", readFileSync(LOG, "utf8"));
  }
  f.set("perform.n", 'COMP:window\ncomment "Perform Mode: F1 = fullscreen show output, Esc = back to the editor"\ntile -200 40 160 130\nflags =  picked on viewer 1 parlanguage 0\nend\n');
  f.set("perform.parm", "?\nwinop 0 /project1/show/out\ntitle 0 \"Resonance Show\"\njustifyh 0 center\njustifyv 0 center\nopenin 0 main\nbordersinsize 0 off\nincludedialog 0 on\n?\n");
  f.set(".application", [
    "", "#Desk..", "# layout ", "desk -c * ", "desk -n pane1 *", "", "#pane1",
    "desk -p /project1 pane1", "desk -t neteditor pane1", "desk -k 0 pane1",
    "neteditor -c 0 -e 0 -G 0.75 -o 0 -r 1 -P 0.8 -s 0 -w 0 -x 0 -t 1 -d 1 -g 0 -p pane1", "",
    "browser on",
    "winplacement ontop=0 mode=auto posx=0 posy=0 sizex=1280 sizey=800 enable=1 perform.path=/perform", "",
    "cc /project1", "status Resonance Show - F1 perform (fullscreen), Esc editor", "",
  ].join("\n"));
  return f;
}

async function main() {
  const stage = path.join(os.tmpdir(), `resonance-toe-${process.pid}`);
  rmSync(stage, { recursive: true, force: true });
  const name = path.basename(OUT);
  const dir = path.join(stage, `${name}.dir`);
  const fl = await files();
  for (const [rel, content] of fl) {
    const p = path.join(dir, rel);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  // toc lists files in creation order; top-level meta first (as toeexpand writes it)
  writeFileSync(path.join(stage, `${name}.toc`), [...fl.keys()].join("\n") + "\n");
  const collapse = path.join(TD, "Contents/MacOS/toecollapse");
  const r = spawnSync(collapse, [path.join(stage, name)], { encoding: "utf8" });
  const built = path.join(stage, name);
  if (!existsSync(built)) {
    console.error(`toecollapse failed (${r.status}): ${r.stdout}\n${r.stderr}`);
    process.exit(1);
  }
  mkdirSync(path.dirname(OUT), { recursive: true });
  copyFileSync(built, OUT);
  rmSync(stage, { recursive: true, force: true });
  console.log(`[make_toe] ${OUT} (${(readFileSync(OUT).length / 1024).toFixed(0)} kB, ${fl.size} entries)`);
}

await main();
