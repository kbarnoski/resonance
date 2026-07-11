#!/usr/bin/perl
# Safe chrome-token normalization for dream prototype pages (v3).
# Rewrites Tailwind WHITE-based utility classes -> Resonance semantic tokens.
# Never touches bg-black (sanctioned art-canvas base), hex/hsl canvas colors,
# named art colors, or logic. Idempotent. Prefixes (hover:, group-hover:, etc.)
# are preserved because only the `<util>-white[/op]` fragment is matched.
use strict; use warnings;
local $/; my $s = <>;

# text-white/<n> -> foreground (>=80), muted-foreground (45-79), muted/70 (<45)
$s =~ s{\btext-white/(\d+)\b}{ $1>=80 ? 'text-foreground' : ($1>=45 ? 'text-muted-foreground' : 'text-muted-foreground/70') }ge;
$s =~ s{\btext-white/\[[^\]]+\]}{text-muted-foreground}g;
$s =~ s{\btext-white(?![\w/\-])}{text-foreground}g;

# bg-white/<n> -> accent when a hover/state, else muted; bracket -> muted; bare -> card
$s =~ s{((?:hover|focus|active|group-hover|group-focus|open|data-\[[^\]]*\]):)bg-white/(?:\d+|\[[^\]]+\])}{${1}bg-accent}g;
$s =~ s{\bbg-white/(?:\d+|\[[^\]]+\])}{bg-muted}g;
$s =~ s{\bbg-white(?![\w/\-])}{bg-card}g;

# borders / dividers / rings (structural hairlines)
$s =~ s{\bborder-white/(?:\d+|\[[^\]]+\])}{border-border}g;
$s =~ s{\bborder-white(?![\w/\-])}{border-border}g;
$s =~ s{\bdivide-white/(?:\d+|\[[^\]]+\])}{divide-border}g;
$s =~ s{\bring-white/(?:\d+|\[[^\]]+\])}{ring-border}g;
$s =~ s{\bring-white(?![\w/\-])}{ring-border}g;

# underline / decoration color
$s =~ s{\bdecoration-white/(?:\d+|\[[^\]]+\])}{decoration-muted-foreground}g;
$s =~ s{\bdecoration-white(?![\w/\-])}{decoration-muted-foreground}g;

# form-control accent + placeholder
$s =~ s{\baccent-white(?:/\d+)?(?![\w/\-])}{accent-primary}g;
$s =~ s{\bplaceholder-white/(?:\d+|\[[^\]]+\])}{placeholder-muted-foreground}g;
$s =~ s{\bplaceholder-white(?![\w/\-])}{placeholder-muted-foreground}g;

# subtle gradient sheens from white -> foreground (keep opacity)
$s =~ s{\b(from|via|to)-white/(\d+)\b}{$1-foreground/$2}g;
$s =~ s{\b(from|via|to)-white/\[[^\]]+\]}{$1-foreground/10}g;
$s =~ s{\b(from|via|to)-white(?![\w/\-])}{$1-foreground}g;

# SVG fill/stroke white used for UI text/icons in the chrome layer
# (art layers use hex/hsl or currentColor, so this only catches Tailwind-class UI).
$s =~ s{\bfill-white/(\d+)\b}{ $1>=80 ? 'fill-foreground' : 'fill-muted-foreground' }ge;
$s =~ s{\bfill-white/\[[^\]]+\]}{fill-muted-foreground}g;
$s =~ s{\bfill-white(?![\w/\-])}{fill-foreground}g;
$s =~ s{\bstroke-white/(\d+)\b}{ $1>=80 ? 'stroke-foreground' : 'stroke-muted-foreground' }ge;
$s =~ s{\bstroke-white/\[[^\]]+\]}{stroke-muted-foreground}g;
$s =~ s{\bstroke-white(?![\w/\-])}{stroke-foreground}g;

# font-serif -> font-semibold. Resonance ships NO serif font (only Geist sans +
# Geist Mono), so `font-serif` silently falls back to browser-default Times —
# off-brand on every heading. font-semibold gives the same emphasis in the
# brand sans, matching the dashboard's own h1 treatment. Leaves font-mono alone.
$s =~ s{\bfont-serif\b}{font-semibold}g;

# shadow tint
$s =~ s{\bshadow-white/(?:\d+|\[[^\]]+\])}{shadow-border}g;

print $s;
