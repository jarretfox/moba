Scrimby, look 0: painting templates.

full.png    the whole figure standing, facing right: the reference to paint from.
guide.png   the same with every joint marked (red crosses): where each part pins and turns.
<part>.png  each body part as drawn now, cut out where the rig pins it.
parts.json  where each picture sits (origin, in units of the unit radius r) and its scale (pxPerR).

Paint over each <part>.png keeping its size and the drawing in the same place (the joint must stay
where it is). Transparent background, facing right. Then copy the folder to public/art/champions/
scrimby/0/ and add "scrimby": [0] under "champions" in public/art/index.json.
See docs/art-bible.md for the style.