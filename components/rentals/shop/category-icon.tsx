import {
  Armchair, BookOpen, Castle, CircleDot, CloudFog, Flame, Frame, Gamepad2, Joystick, Layers, LayoutGrid, Lightbulb, Package, PartyPopper,
  Presentation, Shirt, Signpost, Speaker, Table, Tent, TrafficCone, UtensilsCrossed, Zap, Grid3x3, type LucideIcon,
} from "lucide-react";

/** An icon for a hire category, from words in its name (any business's categories). */
const RULES: [RegExp, LucideIcon][] = [
  [/marquee|tent|gazebo|shade/i, Tent], [/chair|stool|seat/i, Armchair], [/table/i, Table], [/cater|food|kitchen|bbq|drink|bar\b|beverage/i, UtensilsCrossed],
  [/light/i, Lightbulb], [/dance|floor/i, Grid3x3], [/arcade|video/i, Joystick], [/pool|billiard/i, CircleDot], [/game|fun/i, Gamepad2],
  [/brochure|stand|display|merchand/i, BookOpen], [/sound|pa\b|speaker|audio|effect/i, Speaker], [/sign|barrier/i, Signpost], [/board|easel/i, Presentation],
  [/inflat|castle|jump/i, Castle], [/party|event/i, PartyPopper], [/rack|cloth|apparel/i, Shirt], [/site|generator|power|essential/i, TrafficCone],
  [/heat|fire/i, Flame], [/linen|cloth|cover/i, Layers], [/frame|photo|backdrop/i, Frame], [/decor|styling/i, LayoutGrid], [/fog|smoke|haze/i, CloudFog],
];
export function categoryIcon(name: string): LucideIcon {
  if (/neon/i.test(name)) return Zap;
  for (const [re, I] of RULES) if (re.test(name)) return I;
  return Package;
}
