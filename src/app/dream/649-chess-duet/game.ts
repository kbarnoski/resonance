// game.ts — The bundled famous game + a tiny self-contained SAN/PGN parser.
//
// GAME: Anderssen vs Kieseritzky, "The Immortal Game", London 1851.
// One of the most celebrated games in chess history: Anderssen (White)
// sacrifices a bishop, both rooks and the queen, then mates with three
// minor pieces. The drama of escalating sacrifice -> sudden quiet ->
// inevitable mate is exactly the arc we sonify.
//
// We bundle the moves as SAN (Standard Algebraic Notation) and parse
// them into structured, board-resolved moves (from-square + to-square +
// piece + event flags). No network, no npm deps.

// --- The Immortal Game, 23 White moves / 23 Black moves = 45 plies
//     (Black resigns / is mated after 23.Be7#).
export const IMMORTAL_GAME_PGN = `
1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6
7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6
13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2
18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8 22. Qf6+ Nxf6
23. Be7#
`.trim();

export const GAME_META = {
  name: "The Immortal Game",
  white: "Adolf Anderssen",
  black: "Lionel Kieseritzky",
  event: "London 1851 (casual)",
  result: "1-0",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PieceType = "P" | "N" | "B" | "R" | "Q" | "K";
export type Color = "w" | "b";

export interface Ply {
  index: number; // 0-based ply index
  moveNo: number; // 1-based full-move number
  color: Color;
  san: string; // original SAN, e.g. "Bxf7+"
  piece: PieceType;
  fromFile: number; // 0..7 (a..h)
  fromRank: number; // 0..7 (rank1..rank8)
  toFile: number; // 0..7
  toRank: number; // 0..7
  capture: boolean;
  check: boolean;
  mate: boolean;
  castle: "K" | "Q" | null; // king-side / queen-side
  promotion: PieceType | null;
}

// ---------------------------------------------------------------------------
// Minimal board model — enough to resolve SAN -> from/to squares.
// Board stored as 8x8 array indexed [rank][file]; rank 0 = rank 1 (White
// home), rank 7 = rank 8 (Black home). Pieces are { type, color } | null.
// ---------------------------------------------------------------------------

interface Sq {
  type: PieceType;
  color: Color;
}
type Board = (Sq | null)[][];

function makeStartBoard(): Board {
  const b: Board = Array.from({ length: 8 }, () => new Array<Sq | null>(8).fill(null));
  const back: PieceType[] = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  for (let f = 0; f < 8; f++) {
    b[0][f] = { type: back[f], color: "w" };
    b[1][f] = { type: "P", color: "w" };
    b[6][f] = { type: "P", color: "b" };
    b[7][f] = { type: back[f], color: "b" };
  }
  return b;
}

const fileIdx = (c: string) => c.charCodeAt(0) - 97; // 'a' -> 0
const rankIdx = (c: string) => c.charCodeAt(0) - 49; // '1' -> 0

const KNIGHT_DELTAS = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];
const KING_DELTAS = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

function onBoard(r: number, f: number) {
  return r >= 0 && r < 8 && f >= 0 && f < 8;
}

// Find the source square of a move given the destination + piece type +
// optional disambiguation. Returns [fromRank, fromFile].
function findSource(
  board: Board,
  color: Color,
  piece: PieceType,
  toR: number,
  toF: number,
  hintFile: number | null,
  hintRank: number | null,
  isCapture: boolean
): [number, number] {
  const candidates: [number, number][] = [];

  const matches = (r: number, f: number): boolean => {
    const sq = board[r][f];
    if (!sq || sq.color !== color || sq.type !== piece) return false;
    if (hintFile !== null && f !== hintFile) return false;
    if (hintRank !== null && r !== hintRank) return false;
    return true;
  };

  if (piece === "P") {
    const dir = color === "w" ? 1 : -1;
    if (isCapture) {
      // pawn captures come from an adjacent file, one rank back
      for (const df of [-1, 1]) {
        const r = toR - dir;
        const f = toF + df;
        if (onBoard(r, f) && matches(r, f)) candidates.push([r, f]);
      }
    } else {
      // straight push: one or two squares back
      const r1 = toR - dir;
      if (onBoard(r1, toF) && matches(r1, toF)) candidates.push([r1, toF]);
      else {
        const r2 = toR - 2 * dir;
        if (onBoard(r2, toF) && matches(r2, toF) && !board[toR - dir][toF])
          candidates.push([r2, toF]);
      }
    }
  } else if (piece === "N") {
    for (const [dr, df] of KNIGHT_DELTAS) {
      const r = toR + dr;
      const f = toF + df;
      if (onBoard(r, f) && matches(r, f)) candidates.push([r, f]);
    }
  } else if (piece === "K") {
    for (const [dr, df] of KING_DELTAS) {
      const r = toR + dr;
      const f = toF + df;
      if (onBoard(r, f) && matches(r, f)) candidates.push([r, f]);
    }
  } else {
    const dirs = piece === "R" ? ROOK_DIRS : piece === "B" ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS];
    for (const [dr, df] of dirs) {
      let r = toR + dr;
      let f = toF + df;
      while (onBoard(r, f)) {
        if (board[r][f]) {
          if (matches(r, f)) candidates.push([r, f]);
          break;
        }
        r += dr;
        f += df;
      }
    }
  }

  if (candidates.length === 0) {
    // Fallback: scan whole board for a matching piece (robustness).
    for (let r = 0; r < 8; r++)
      for (let f = 0; f < 8; f++) if (matches(r, f)) candidates.push([r, f]);
  }
  // If still ambiguous, take the first — our bundled game is unambiguous
  // once disambiguation hints are applied.
  return candidates[0] ?? [toR, toF];
}

function applyMove(board: Board, ply: Ply) {
  const { fromRank, fromFile, toRank, toFile, color, promotion, castle } = ply;
  const moving = board[fromRank][fromFile];
  board[fromRank][fromFile] = null;
  board[toRank][toFile] = moving
    ? { type: promotion ?? moving.type, color: moving.color }
    : { type: ply.piece, color };

  if (castle) {
    // Move the rook too.
    const rank = color === "w" ? 0 : 7;
    if (castle === "K") {
      board[rank][5] = board[rank][7];
      board[rank][7] = null;
    } else {
      board[rank][3] = board[rank][0];
      board[rank][0] = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Parser: SAN string -> Ply[]
// ---------------------------------------------------------------------------

export function parsePGN(pgn: string): Ply[] {
  // Strip move numbers, comments, result tokens.
  const cleaned = pgn
    .replace(/\{[^}]*\}/g, " ") // comments
    .replace(/\([^)]*\)/g, " ") // variations
    .replace(/\d+\.(\.\.)?/g, " ") // move numbers (1. and 1...)
    .replace(/\$\d+/g, " ") // NAG
    .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, " ") // results
    .trim();

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const board = makeStartBoard();
  const plies: Ply[] = [];

  tokens.forEach((tok, i) => {
    const color: Color = i % 2 === 0 ? "w" : "b";
    const moveNo = Math.floor(i / 2) + 1;

    // Detect flags
    const check = /\+/.test(tok);
    const mate = /#/.test(tok);
    const san = tok;
    const clean = tok.replace(/[+#!?]/g, "");

    // Castling
    if (clean === "O-O" || clean === "O-O-O") {
      const castle: "K" | "Q" = clean === "O-O" ? "K" : "Q";
      const rank = color === "w" ? 0 : 7;
      const toFile = castle === "K" ? 6 : 2;
      const ply: Ply = {
        index: i, moveNo, color, san, piece: "K",
        fromFile: 4, fromRank: rank, toFile, toRank: rank,
        capture: false, check, mate, castle, promotion: null,
      };
      applyMove(board, ply);
      plies.push(ply);
      return;
    }

    // Promotion (=Q)
    let promotion: PieceType | null = null;
    let core = clean;
    const promoMatch = core.match(/=([QRBN])$/);
    if (promoMatch) {
      promotion = promoMatch[1] as PieceType;
      core = core.replace(/=([QRBN])$/, "");
    }

    // Piece type
    let piece: PieceType = "P";
    if (/^[NBRQK]/.test(core)) {
      piece = core[0] as PieceType;
      core = core.slice(1);
    }

    const capture = /x/.test(core);
    core = core.replace(/x/, "");

    // Destination is the trailing two chars (file+rank)
    const destMatch = core.match(/([a-h])([1-8])$/);
    if (!destMatch) {
      // Should not happen with our bundled game; skip robustly.
      return;
    }
    const toFile = fileIdx(destMatch[1]);
    const toRank = rankIdx(destMatch[2]);

    // Remaining chars are disambiguation hints
    const hint = core.slice(0, core.length - 2);
    let hintFile: number | null = null;
    let hintRank: number | null = null;
    for (const ch of hint) {
      if (/[a-h]/.test(ch)) hintFile = fileIdx(ch);
      else if (/[1-8]/.test(ch)) hintRank = rankIdx(ch);
    }

    const [fromRank, fromFile] = findSource(
      board, color, piece, toRank, toFile, hintFile, hintRank, capture
    );

    const ply: Ply = {
      index: i, moveNo, color, san, piece,
      fromFile, fromRank, toFile, toRank,
      capture, check, mate, castle: null, promotion,
    };
    applyMove(board, ply);
    plies.push(ply);
  });

  return plies;
}

// Piece point values, used for a running material-balance signal that
// biases the harmony brighter (White ahead) / darker (Black ahead).
export const PIECE_VALUE: Record<PieceType, number> = {
  P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0,
};

export const FILE_NAMES = ["a", "b", "c", "d", "e", "f", "g", "h"];
export const PIECE_NAMES: Record<PieceType, string> = {
  P: "Pawn", N: "Knight", B: "Bishop", R: "Rook", Q: "Queen", K: "King",
};
