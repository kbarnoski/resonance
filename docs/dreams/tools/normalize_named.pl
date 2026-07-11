#!/usr/bin/perl
# Bind off-brand NAMED Tailwind hue utilities -> the brand VIOLET ramp,
# preserving the SHADE so each piece keeps its luminance intent and any
# gradient stops stay distinct (from-amber-900 -> from-violet-900, etc).
# This is the design-system art rule: "vary by luminance, not by hue."
#
# Only touches real Tailwind class tokens (they carry a `-<shade>` digit),
# so hex/hsl/named-CSS canvas strings are never matched. Opacity suffix and
# any variant prefix (hover:, group-hover:, md:, ...) are preserved because
# only the `<util>-<hue>-<shade>[/op]` fragment is rewritten.
# LEFT ALONE: violet (already brand), red (semantic/error, hand-reviewed),
# and neutrals (slate/gray/zinc/neutral/stone — structure).
use strict; use warnings;
local $/; my $s = <>;

my $p = 'text|bg|border|from|via|to|ring|fill|stroke|shadow|outline|decoration|divide|accent|caret|placeholder';
my $c = 'amber|emerald|rose|orange|lime|teal|cyan|sky|green|yellow|pink|fuchsia|indigo|blue';

# off-brand hue at shade N -> violet at the same shade N (keeps opacity)
$s =~ s{\b($p)-(?:$c)-(\d+)(/\d+|/\[[^\]]+\])?}{ "$1-violet-$2" . (defined $3 ? $3 : '') }ge;

print $s;
