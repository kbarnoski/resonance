/**
 * classify.ts — TF.js DoodleNet inference + geometric heuristic fallback
 * 529-kids-doodle-choir
 *
 * Headline technique: TensorFlow.js real-time sketch classification.
 * Uses yining1023's DoodleNet (CNN trained on Quick, Draw! 345-category
 * dataset, ported to TF.js). Reference: Jongejan, Ha, et al. "Quick, Draw!"
 * Google (2016). DoodleNet by yining1023: https://github.com/yining1023/doodlenet
 *
 * Model URL: https://storage.googleapis.com/tfjs-models/tfjs/doodle_recognition_v1/model.json
 * Input: 28×28 greyscale (white bg, black strokes), values 0–1
 * Output: 345-class softmax
 *
 * Falls back to pixel-level geometric heuristic if TF.js or model unavailable.
 * NEVER throws — always returns an Archetype.
 */

// ── Archetypes ────────────────────────────────────────────────────────────────

export type Archetype =
  | 'sun'      // rising warm pad
  | 'fish'     // bubbly arpeggio
  | 'bird'     // chirpy high motif
  | 'plant'    // gentle bell bloom
  | 'cloud'    // airy whoosh chord
  | 'star'     // twinkle
  | 'critter'  // playful walking bassline
  | 'home';    // soft chord

// ── DoodleNet class → Archetype mapping ──────────────────────────────────────

const CLASS_TO_ARCHETYPE: Record<string, Archetype> = {
  // sun / circular / celestial → "sun"
  sun: 'sun', moon: 'sun', circle: 'sun', clock: 'sun', wheel: 'sun',
  donut: 'sun', face: 'sun', 'smiley face': 'sun', pizza: 'sun', cookie: 'sun',
  apple: 'sun', orange: 'sun', lollipop: 'sun', eye: 'sun', tornado: 'sun',
  'hot air balloon': 'sun', soccer: 'sun', basketball: 'sun',

  // fish / ocean / water → "fish"
  fish: 'fish', whale: 'fish', shark: 'fish', dolphin: 'fish', lobster: 'fish',
  submarine: 'fish', boat: 'fish', anchor: 'fish', wave: 'fish', jellyfish: 'fish',
  turtle: 'fish', 'sea turtle': 'fish', crocodile: 'fish', mermaid: 'fish',
  ocean: 'fish', pond: 'fish', pool: 'fish', river: 'fish',

  // bird / winged → "bird"
  bird: 'bird', duck: 'bird', owl: 'bird', flamingo: 'bird',
  butterfly: 'bird', parrot: 'bird', swan: 'bird', dragonfly: 'bird',
  bat: 'bird', kite: 'bird', airplane: 'bird', helicopter: 'bird',
  angel: 'bird', feather: 'bird', 'flying saucer': 'bird',

  // tree / flower / plant → "plant"
  tree: 'plant', flower: 'plant', leaf: 'plant', cactus: 'plant',
  mushroom: 'plant', grass: 'plant', plant: 'plant', 'palm tree': 'plant',
  pineapple: 'plant', broccoli: 'plant', carrot: 'plant', corn: 'plant',
  banana: 'plant', grapes: 'plant', watermelon: 'plant', strawberry: 'plant',
  bush: 'plant', garden: 'plant', pear: 'plant',

  // cloud / rain / sky → "cloud"
  cloud: 'cloud', rain: 'cloud', rainbow: 'cloud', snowflake: 'cloud',
  snowman: 'cloud', lightning: 'cloud', tornado_cloud: 'cloud',
  umbrella: 'cloud', hurricane: 'cloud', fog: 'cloud',

  // star / sparkle → "star"
  star: 'star', comet: 'star', fireworks: 'star', diamond: 'star',
  crown: 'star', flag: 'star', sparkle: 'star',

  // critter / animal → "critter"
  cat: 'critter', dog: 'critter', snail: 'critter', rabbit: 'critter',
  mouse: 'critter', frog: 'critter', ant: 'critter', bee: 'critter',
  crab: 'critter', spider: 'critter', octopus: 'critter', scorpion: 'critter',
  bear: 'critter', lion: 'critter', tiger: 'critter', elephant: 'critter',
  pig: 'critter', cow: 'critter', horse: 'critter', sheep: 'critter',
  monkey: 'critter', penguin: 'critter', hedgehog: 'critter', squirrel: 'critter',
  dragon: 'critter', giraffe: 'critter', kangaroo: 'critter', panda: 'critter',
  raccoon: 'critter', rhinoceros: 'critter', mosquito: 'critter', camel: 'critter',
  zebra: 'critter',

  // house / structures / everything else → "home"
  house: 'home', castle: 'home', tent: 'home', igloo: 'home',
  building: 'home', skyscraper: 'home', church: 'home', barn: 'home',
  bridge: 'home', hospital: 'home',
};

function rawClassToArchetype(cls: string): Archetype {
  const lower = cls.toLowerCase().trim();
  return CLASS_TO_ARCHETYPE[lower] ?? 'home';
}

// ── Full 345-label list (index matches DoodleNet softmax output) ──────────────
const DOODLE_LABELS: string[] = [
  'aircraft carrier','airplane','alarm clock','ambulance','angel','animal migration',
  'ant','anvil','apple','arm','asparagus','axe','backpack','banana','bandage',
  'barn','baseball','baseball bat','basket','basketball','bat','bathtub','beach',
  'bear','beard','bed','bee','belt','bench','bicycle','binoculars','bird',
  'blackberry','blueberry','book','boomerang','bottlecap','bowtie','bracelet',
  'brain','bread','bridge','broccoli','broom','bucket','bulldozer','bus',
  'bush','butterfly','cactus','cake','calculator','calendar','camel','camera',
  'camouflage','campfire','candle','cannon','canoe','car','carrot','castle',
  'cat','ceiling fan','cell phone','chair','chandelier','church','circle',
  'clarinet','clock','cloud','coffee cup','compass','computer','cookie','cooler',
  'couch','cow','crab','crayon','crocodile','crown','cruise ship','cup',
  'diamond','dishwasher','diving board','dog','dolphin','donut','door',
  'dragon','dresser','drill','drums','duck','dumbbell','ear','elbow',
  'elephant','envelope','eraser','eye','eyeglasses','face','fan','feather',
  'fence','finger','fire hydrant','fireplace','firetruck','fish','flamingo',
  'flashlight','flip flops','floor lamp','flower','flying saucer','foot','fork',
  'frog','frying pan','garden','garden hose','giraffe','goatee','golf club',
  'grapes','grass','guitar','hamburger','hammer','hand','harp','hat','headphones',
  'hedgehog','helicopter','helmet','hexagon','hockey puck','hockey stick',
  'horse','hospital','hot air balloon','hot dog','hourglass','house','hurricane',
  'ice cream','jacket','jail','kangaroo','keyboard','knee','knife','ladder',
  'lantern','laptop','leaf','leg','light bulb','lighter','lighthouse','lightning',
  'line','lion','lobster','lollipop','mailbox','map','marker','matches',
  'megaphone','mermaid','microphone','microwave','monkey','moon','mosquito',
  'motorbike','mountain','mouse','moustache','mouth','mug','mushroom','nail',
  'necklace','nose','ocean','octopus','onion','oven','owl','paint can',
  'paintbrush','palm tree','panda','pants','paper clip','parachute','parrot',
  'passport','peanut','pear','peas','pencil','penguin','piano','pickup truck',
  'picture frame','pig','pillow','pineapple','pizza','pliers','police car',
  'pond','pool','popsicle','postcard','potato','power outlet','purse','rabbit',
  'raccoon','radio','rain','rainbow','rake','remote control','rhinoceros',
  'rifle','river','roller coaster','rollerskates','sailboat','sandwich','saw',
  'saxophone','school bus','scissors','scorpion','screwdriver','sea turtle',
  'see saw','shark','sheep','shoe','shorts','shovel','sink','skateboard',
  'skull','skyscraper','sleeping bag','smiley face','snail','snake','snorkel',
  'snowflake','snowman','soccer ball','sock','speedboat','spider','spoon',
  'spreadsheet','square','squiggle','squirrel','stairs','star','steak',
  'stereo','stethoscope','stitches','stop sign','stove','strawberry','streetlight',
  'string bean','submarine','suitcase','sun','swan','sweater','swing set',
  'sword','syringe','t-shirt','table','teapot','teddy-bear','telephone',
  'television','tennis racquet','tent','tiger','toaster','toe','toilet',
  'tooth','toothbrush','toothpaste','tornado','tractor','traffic light','train',
  'tree','triangle','trombone','truck','trumpet','umbrella','underwear','van',
  'vase','violin','washing machine','watermelon','waterslide','whale','windmill',
  'wine bottle','wine glass','wristwatch','yoga','zebra','zigzag',
];

// ── TF.js dynamic import types ────────────────────────────────────────────────

type TFModel = {
  predict: (t: unknown) => { data: () => Promise<Float32Array>; dispose: () => void };
  dispose: () => void;
};

type TFModule = {
  ready: () => Promise<void>;
  loadLayersModel: (url: string) => Promise<TFModel>;
  tidy: <T>(fn: () => T) => T;
  browser: { fromPixels: (src: HTMLCanvasElement | ImageData, ch?: number) => unknown };
  expandDims: (t: unknown, axis?: number) => unknown;
  div: (a: unknown, b: unknown) => unknown;
  scalar: (v: number) => unknown;
};

const TFJS_CDN = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4/+esm';
const MODEL_URL =
  'https://storage.googleapis.com/tfjs-models/tfjs/doodle_recognition_v1/model.json';

// ── Module-level state (singleton) ────────────────────────────────────────────

type ClassifierMode = 'loading' | 'ml' | 'heuristic';

let _mode: ClassifierMode = 'loading';
let _tf: TFModule | null = null;
let _model: TFModel | null = null;

export function getClassifierMode(): ClassifierMode {
  return _mode;
}

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loadClassifier(): Promise<void> {
  try {
    const tf = (await import(/* webpackIgnore: true */ TFJS_CDN)) as TFModule;
    _tf = tf;
    await tf.ready();
    const model = await tf.loadLayersModel(MODEL_URL);
    // Warm-up pass to avoid first-inference latency
    const blank = makeDoodleImageData();
    const warmResult = tf.tidy(() => {
      const t = tf.browser.fromPixels(blank, 1);
      const t2 = tf.div(t, tf.scalar(255));
      const t3 = tf.expandDims(t2, 0);
      return model.predict(t3);
    }) as { data: () => Promise<Float32Array>; dispose: () => void };
    await warmResult.data();
    warmResult.dispose();
    _model = model;
    _mode = 'ml';
  } catch {
    _mode = 'heuristic';
  }
}

function makeDoodleImageData(): ImageData {
  const d = new ImageData(28, 28);
  // White background (all 255)
  for (let i = 0; i < d.data.length; i += 4) {
    d.data[i] = 255; d.data[i + 1] = 255; d.data[i + 2] = 255; d.data[i + 3] = 255;
  }
  return d;
}

// ── Main classifier (async, uses ML or falls back) ────────────────────────────

export async function classifyDrawing(drawCanvas: HTMLCanvasElement): Promise<Archetype> {
  if (_mode === 'ml' && _tf && _model) {
    try {
      return await runMLInference(drawCanvas);
    } catch {
      return geometricHeuristic(drawCanvas);
    }
  }
  return geometricHeuristic(drawCanvas);
}

async function runMLInference(drawCanvas: HTMLCanvasElement): Promise<Archetype> {
  const tf = _tf!;
  const model = _model!;

  // Rasterise to 28×28 (white background, black strokes)
  const offscreen = document.createElement('canvas');
  offscreen.width = 28;
  offscreen.height = 28;
  const octx = offscreen.getContext('2d')!;
  octx.fillStyle = '#ffffff';
  octx.fillRect(0, 0, 28, 28);
  // drawCanvas has dark bg + light strokes — invert to DoodleNet convention
  octx.filter = 'invert(1)';
  octx.drawImage(drawCanvas, 0, 0, 28, 28);

  let topIdx = 0;
  // tidy() is synchronous — call .data() outside tidy to await the Promise
  const predResult = tf.tidy(() => {
    const raw = tf.browser.fromPixels(offscreen, 1);
    const norm = tf.div(raw, tf.scalar(255));
    const batched = tf.expandDims(norm, 0);
    return model.predict(batched);
  }) as { data: () => Promise<Float32Array>; dispose: () => void };

  const scores = await predResult.data();
  predResult.dispose();
  let best = -Infinity;
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] > best) { best = scores[i]; topIdx = i; }
  }

  const label = DOODLE_LABELS[topIdx] ?? 'house';
  return rawClassToArchetype(label);
}

// ── Geometric heuristic ───────────────────────────────────────────────────────
// Analyses pixel bounding box + density from the drawing canvas.
// Dark canvas with light strokes (opposite of DoodleNet convention).

export function geometricHeuristic(canvas: HTMLCanvasElement): Archetype {
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'home';

    const w = canvas.width;
    const h = canvas.height;
    const img = ctx.getImageData(0, 0, w, h);

    let minX = w, maxX = 0, minY = h, maxY = 0;
    let inkPx = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const brightness = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
        // On dark canvas, bright pixels = ink strokes
        if (brightness > 80) {
          inkPx++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (inkPx < 30) return 'star'; // tiny mark → star

    const bboxW = Math.max(1, maxX - minX);
    const bboxH = Math.max(1, maxY - minY);
    const aspect = bboxW / bboxH;
    const density = inkPx / (bboxW * bboxH);
    const relArea = (bboxW * bboxH) / (w * h);

    // Heuristic decision tree
    if (density > 0.40) return 'sun';          // dense → sun/circle
    if (aspect > 2.8)   return 'fish';         // very wide → fish/wave
    if (aspect < 0.45)  return 'plant';        // very tall → tree/plant
    if (relArea < 0.06) return 'star';         // tiny → star
    if (density < 0.08 && aspect < 1.2) return 'bird'; // sparse, squarish → bird
    if (density < 0.12) return 'cloud';        // sparse, airy → cloud
    if (relArea > 0.32) return 'home';         // big shape → home
    if (aspect > 1.5)   return 'fish';         // wide → fish
    return 'critter';                           // default organic → critter
  } catch {
    return 'home';
  }
}
