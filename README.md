# IsoForge

Isometric asset studio for the Realms game (`../Generator`): ground tiles and towers now, primitive-built props next.

## Ground (Yer)

Every tile is worked out from formulas, not drawn, so:

- **No seams.** The surface repeats exactly every cell, so whatever leaves a tile's edge comes back in on the opposite edge of its neighbour. The face overlaps its neighbours by a pixel, so no hairline is left either.
- **Variants** share their edges and differ only inside, so a field does not visibly repeat.
- **Transitions** (e.g. grass over dirt) come as a 16-piece corner set. Tile `mask` bits: 1 = top corner, 2 = right, 4 = left, 8 = bottom corner is the `over` ground.
- **One palette** drives every tile: change a colour and the whole set follows.

Output is the game's sprite format: 256 x 512 PNG, anchor 0.5 / 0.88, top face centred at y = 437.
Files: `forge_<ground>_<n>.png` and `forge_<over>_<under>_<mask>.png`.

## Towers (Minoralar)

Towers are worked out from formulas too: the tower is a set of 3D shapes (distance functions) and every pixel casts a ray
from the game's camera to find, colour and light the surface (sun from the left, sky, soft shadows, ambient occlusion,
and the crown lighting the stone around it). Bricks, flagstones, planks, roof shingles and moss come from the surface position.

The set is grouped in clans, the game's tower traits (fire, frost, poison, blood, electric, void, stacking): each clan
is a folder in the studio and starts with six towers, from small to large, each built its own way. Towers can be
added to a clan, copied, moved to another clan or deleted; a clan can be put back to its starting six. The game reads
its sprite folder without sub-folders, so the clan is the start of the file name instead: `forge_tower_fire_1.png`.
Every tower is edited on its own:

- **Build**: plain, two tiers, tall spire, floating (top held over the stump by a beam of light), ring of pillars;
  size small / medium / large; width, height, taper.
- **Shapes**: square, diamond, hexagon, octagon, cylinder, separately for the lower and upper part.
- **Top**: battlements, plank floor, dome, shining glass dome (see-through, the crown glows inside), onion dome,
  open cupola (the crown under its dome), pointed roof.
- **Crown** (what shoots): brazier, crystal, gem, orb with ring, coil, cauldron, cannon, finial, eye.
- **Colours**: ready palettes or each colour by hand.
- **Decorations** (on/off): windows, runes, glowing cracks, circle of runes on the ground, crystals growing from
  the plinth, glowing bands, buttresses, flags; glow, magic and moss strength. Nothing floats loose round a tower.
- Brick size, outline and the shadow on the tile are shared by the whole set.

While editing, the tower shows a quick draft at once (a ray per 2 x 2 pixels), the clean picture once the settings
stay still (a ray per pixel, more only along edges), then a twice-as-sharp picture for the preview only.
The *Export* view shows exactly what goes into the PNG: the preview's tile never does.
`#tower` / `#ground` in the address opens a studio directly.

Files: `forge_tower_<clan>_<n>.png` (the name is editable), same 256 x 512 format.

## Run

```bash
npm install
npm run dev
```

**O'yinga eksport** writes the set into `FORGE_EXPORT_DIR` (default `../Generator/src/assets/sprites`, see `.env.example`).
Then rebuild the game's atlases there: `npm run generate:assets`.
