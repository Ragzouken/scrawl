import { Texture, NearestFilter, MeshBasicMaterial, DoubleSide, Mesh, BufferGeometry, BufferAttribute, Vector3, Vector2, Color, Box2, Group, ImageLoader, Material, MathUtils } from "three";

/**
 * @typedef {Object} BipsiDataFont
 * @property {string} name
 * @property {number} charWidth
 * @property {number} charHeight
 * @property {number[][]} runs
 * @property {Object.<number, { spacing: number, offset: Vector2, size: Vector2 }>} special
 * @property {string} atlas
 */

/**
 * @typedef Element
 * @property {boolean} breakPriority
 * @property {boolean} breakDiscard
 * @property {Vector2} position
 * @property {Glyph} glyph
 * @property {Color} color
 * @property {boolean} visible
 */

/**
 * @typedef ElementLine
 * @property {Element[]} elements
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef Glyph
 * @property {Box2} pxCoords
 * @property {Box2} uvCoords
 * @property {Vector2} size
 */

export const DEFAULT_BREAKS = {
    " ": 2,
    "-": 1,
    "_": 1,
};

/**
 * @param {BitmapFont} font
 * @param {string} text
 * @param {*} options
 */
export function parseLine(font, text, { breaks = {} } = {}) {
    breaks = { ...DEFAULT_BREAKS, breaks };

    function charToElement(char) {
        /** @type {Element} */
        const element = {
            breakPriority: breaks[char] ?? 0,
            breakDiscard: char === " ",
            position: new Vector2(),
            glyph: font.glyphs.get(char.codePointAt(0)),
            color: new Color("white"),
            visible: true,
            // color: new Color(Math.random(), Math.random(), Math.random()),
        };

        return element;
    }

    return [...text].map(charToElement);
}

/**
 * @param {Element[]} elements
 * @param {*} options
 * @return {ElementLine[]}
 */
export function breakLines(elements, { width = Infinity } = {}) {
    let bestBreakIndex = 0;
    let bestBreak = elements[0];
    let justBroke = false;

    let lineStart = 0;

    let lines = [];
    let x = 0;

    function makeLine(elements) {
        while (elements[elements.length-1]?.breakDiscard)
            elements.pop();

        const line = { 
            elements,
            width: 0,
            height: 0,
        };

        line.width = line.elements.reduce((width, element) => width + element.glyph.size.width, 0);
        line.height = line.elements.reduce((height, element) => Math.max(height, element.glyph.size.height), 0);

        return line;
    }

    for (let i = 0; i < elements.length; ++i) {
        const element = elements[i];
        const prevBest = bestBreakIndex;

        function saveBreak() {
            bestBreak = element;
            bestBreakIndex = i;
        }

        function doBreak() {
            saveBreak();

            lines.push(makeLine(elements.slice(lineStart, prevBest+1)));

            x = 0;
            i = prevBest;
            justBroke = true;

            lineStart = prevBest+1;

            while (elements[lineStart]?.breakDiscard)
                lineStart += 1;
        }

        if (x + element.glyph.size.width > width) {
            doBreak();
            continue;
        } 
        
        if (bestBreak.breakPriority <= element.breakPriority) {
            saveBreak();
        }

        if (justBroke && element.breakDiscard) {
            justBroke = false;
            continue;
        }

        x += element.glyph.size.width;
        justBroke = false;
    }

    lines.push(makeLine(elements.slice(lineStart)));

    return lines;
}

/**
 * @param {Box2} bounds
 * @param {ElementLine[]} lines
 * @param {*} options
 */
export function layoutLines(bounds, lines, { lineHeight, align }) {
    bounds = bounds.clone();
    bounds.max.y = bounds.min.y + lineHeight * lines.length;

    let y = bounds.max.y - lineHeight;
    lines.forEach(({ elements, width }) => {
        let slack = bounds.max.x - bounds.min.x - width;
        let x = bounds.min.x + Math.floor(slack * align);

        elements.forEach((element) => {
            element.position.set(x, y);
            x += element.glyph.size.width;
        });

        y -= lineHeight;
    });

    return bounds;
}

/**
 * @param {BitmapFont} font
 * @param {{ label: string, value: any }[]} items
 * @param {*} options
 */
export function makeListMenu(font, items, { width, uiAtlas, align }) {
    const mesh = new TextMesh(font, 256);

    const fullBox = new Box2(new Vector2(0, 0), new Vector2(width, 100));
    const textBox = fullBox.clone().expandByVector(new Vector2(-6, -8));
    textBox.max.x -= 6;
    textBox.translate(new Vector2(0, 0))
    const textSize = textBox.getSize(new Vector2());

    const lines = items.map(({ label }) => {
        const elements = parseLine(font, label);
        return { elements, width, height: 0 };
    });
    textBox.copy(layoutLines(textBox, lines, { lineHeight: font.lineHeight, align }));

    lines.forEach((line) => line.elements.forEach((element) => mesh.addElement(element)));

    fullBox.max.y = textBox.max.y + 4;// + font.lineHeight;

    const frame = makeBox(uiAtlas, fullBox.max, "ui-box");
    const cursor = makeBox(uiAtlas, new Vector2(width-6, 11), "select", { margin: 0, color: new Color("DeepSkyBlue") });
    cursor.position.x += 3;
    cursor.position.y += 7;

    cursor.renderOrder = .5;
    frame.renderOrder = 0;
    mesh.renderOrder = 1;

    const group = new Group();
    group.add(frame);
    group.add(cursor);
    group.add(mesh);

    return { group, size: fullBox.getSize(new Vector2()) };
}

/**
 * @param {BitmapFont} font
 * @param {string} text
 * @param {*} options
 */
export function makeTextBox(font, text, { width, uiAtlas, align }) {
    const mesh = new TextMesh(font, 256);

    const fullBox = new Box2(new Vector2(0, 0), new Vector2(width, 100));
    const textBox = fullBox.clone().expandByVector(new Vector2(-6, -8));
    textBox.max.x -= 6;
    textBox.translate(new Vector2(0, 0))
    const textSize = textBox.getSize(new Vector2());

    const elements = parseLine(font, text);
    const lines = breakLines(elements, { width: textSize.width });
    textBox.copy(layoutLines(textBox, lines, { lineHeight: font.lineHeight, align }));

    const [arrow, ] = parseLine(font, "☻");
    arrow.position.set(textBox.max.x, textBox.min.y);
    mesh.addElement(arrow);

    lines.forEach((line) => line.elements.forEach((element) => mesh.addElement(element)));

    fullBox.max.y = textBox.max.y + 4;// + font.lineHeight;

    const frame = makeBox(uiAtlas, fullBox.max, "ui-box");

    frame.renderOrder = 0;
    mesh.renderOrder = 1;

    const group = new Group();
    group.add(frame);
    group.add(mesh);

    return { group, size: fullBox.getSize(new Vector2()) };
}

/**
 * @param {Atlas} uiAtlas
 * @param {Vector2} size
 */
export function makeBox(uiAtlas, size, name, { margin=8, color=new Color("white"), } = {}) {
    const geometry = new BufferGeometry();
    const mesh = new Mesh(geometry, uiAtlas.material);

    const vertLimit = 4 * 4;
    const indexLimit = 9 * 2 * 3;

    const attrPosition = new BufferAttribute(new Float32Array(vertLimit * 3), 3);
    const attrUV       = new BufferAttribute(new Float32Array(vertLimit * 2), 2);
    const attrColor    = new BufferAttribute(new Float32Array(vertLimit * 3), 3);
    const attrIndex    = new BufferAttribute(new Uint16Array(indexLimit), 1);

    const origin = new Vector2();
    const border = new Vector2(margin, margin);

    const uiImage = uiAtlas.subImages.get(name);

    const coords = [
        origin,
        origin.clone().add(border),
        size.clone().sub(border),
        size,
    ];

    for (let cy = 0; cy < 4; ++cy) {
        for (let cx = 0; cx < 4; ++cx) {
            const vertIndex = cy * 4 + cx;
            attrPosition.setXYZ(vertIndex, coords[cx].x, coords[cy].y, 0);
            attrUV.setXY(vertIndex, 
                MathUtils.lerp(uiImage.uvCoords.min.x, uiImage.uvCoords.max.x, cx / 3),
                1 - MathUtils.lerp(uiImage.uvCoords.min.y, uiImage.uvCoords.max.y, cy / 3),
            );
            attrColor.setXYZ(vertIndex, color.r, color.g, color.b);
        }
    }

    for (let cy = 0; cy < 3; ++cy) {
        for (let cx = 0; cx < 3; ++cx) {
            const quadIndex = cy * 3 + cx;
            const vertOffset = cy * 4 + cx;
            attrIndex.setX(quadIndex * 6 + 0, vertOffset + 0);
            attrIndex.setX(quadIndex * 6 + 1, vertOffset + 1);
            attrIndex.setX(quadIndex * 6 + 2, vertOffset + 4);
            attrIndex.setX(quadIndex * 6 + 3, vertOffset + 1);
            attrIndex.setX(quadIndex * 6 + 4, vertOffset + 5);
            attrIndex.setX(quadIndex * 6 + 5, vertOffset + 4);
        }
    }

    geometry.setAttribute("position", attrPosition);
    geometry.setAttribute("uv", attrUV);
    geometry.setAttribute("color", attrColor);
    geometry.setIndex(attrIndex);

    return mesh;
}

/**
 * @param {BipsiDataFont} data
 */
export async function loadBipsiFont(data) {
    const font = new BitmapFont(await new ImageLoader().loadAsync(data.atlas));

    const { charWidth, charHeight } = data;
    const charSize = new Vector2(charWidth, charHeight);
    const charsPerRow = font.imgSize.width / charWidth;

    font.lineHeight = charHeight;

    function addNext(codepoint) {
        const index = font.glyphs.size;
        const col = index % charsPerRow;
        const row = Math.floor(index / charsPerRow);

        const pxCoords = new Box2();
        pxCoords.min.set(col+0, row+0).multiply(charSize);
        pxCoords.max.set(col+1, row+1).multiply(charSize);

        font.addGlyph(codepoint, pxCoords);
    }

    data.runs.forEach(([min, max]) => {
        for (let codepoint = min; codepoint <= (max ?? min); ++codepoint) {
            addNext(codepoint);
        }
    });

    return font;
}

export class BitmapFont {
    /**
     * @param {HTMLImageElement | HTMLCanvasElement} image
     */
    constructor(image) {
        this.image = image;
        this.imgSize = new Vector2(image.width, image.height);

        this.texture = new Texture(image);
        this.texture.minFilter = NearestFilter;
        this.texture.magFilter = NearestFilter;
        this.texture.needsUpdate = true;

        this.material = new MeshBasicMaterial({
            side: DoubleSide,
            map: this.texture, 
            vertexColors: true, 
            alphaTest: .5,
            depthWrite: false,
            depthTest: false,
        });

        /** @type {Map<number, Glyph>} */
        this.glyphs = new Map();

        this.lineHeight = 0;
    }

    /**
     * @param {Box2} pxCoords
     */
    addGlyph(codepoint, pxCoords) {
        const size = pxCoords.getSize(new Vector2());

        const uvCoords = pxCoords.clone();
        uvCoords.min.divide(this.imgSize);
        uvCoords.max.divide(this.imgSize);
        uvCoords.min.y = 1 - uvCoords.min.y;
        uvCoords.max.y = 1 - uvCoords.max.y;

        this.glyphs.set(codepoint, { pxCoords, uvCoords, size });
    }
}

export class Atlas {
    /**
     * @param {HTMLImageElement | HTMLCanvasElement} image
     */
    constructor(image) {
        this.image = image;
        this.imgSize = new Vector2(image.width, image.height);

        this.texture = new Texture(image);
        this.texture.minFilter = NearestFilter;
        this.texture.magFilter = NearestFilter;
        this.texture.needsUpdate = true;

        this.material = new MeshBasicMaterial({
            side: DoubleSide,
            map: this.texture, 
            vertexColors: true, 
            alphaTest: .5,
            depthWrite: false,
            depthTest: false,
        });

        /** @type {Map<string, Glyph>} */
        this.subImages = new Map();
    }

    /**
     * @param {string} name
     * @param {Box2} pxCoords
     */
    addSubImage(name, pxCoords) {
        const size = pxCoords.getSize(new Vector2());

        const uvCoords = pxCoords.clone();
        uvCoords.min.divide(this.imgSize);
        uvCoords.max.divide(this.imgSize);
        uvCoords.min.y = 1 - uvCoords.min.y;
        uvCoords.max.y = 1 - uvCoords.max.y;

        this.subImages.set(name, { pxCoords, uvCoords, size });
    }
}

export class TextMesh extends Mesh {
    /**
     * @param {BitmapFont} font
     * @param {number} glyphLimit
     */
    constructor(font, glyphLimit) {
        const geometry = new BufferGeometry();
        super(geometry, font.material);

        this.font = font;

        this.glyphCount = 0;
        this.glyphLimit = glyphLimit;

        const vertLimit = glyphLimit * 4;
        const indexLimit = glyphLimit * 6;

        this.attrPosition = new BufferAttribute(new Float32Array(vertLimit * 3), 3);
        this.attrUV       = new BufferAttribute(new Float32Array(vertLimit * 2), 2);
        this.attrColor    = new BufferAttribute(new Float32Array(vertLimit * 4), 4);
        this.attrIndex    = new BufferAttribute(new Uint16Array(indexLimit), 1);

        const vec3 = new Vector3();
        for (let i = 0; i < glyphLimit; ++i) {
            const vertOffset = i * 4;
            const triOffset = i * 6;

            vec3.set(vertOffset + 2, vertOffset + 1, vertOffset + 0);
            vec3.toArray(this.attrIndex.array, triOffset + 0);

            vec3.set(vertOffset + 1, vertOffset + 2, vertOffset + 3);
            vec3.toArray(this.attrIndex.array, triOffset + 3);
        }

        this.geometry.setAttribute("position", this.attrPosition);
        this.geometry.setAttribute("uv", this.attrUV);
        this.geometry.setAttribute("color", this.attrColor);
        this.geometry.setIndex(this.attrIndex);
        this.geometry.setDrawRange(0, 0);
    }

    clearChars() {
        this.glyphCount = 0;
        this.refresh();
    }

    /**
     * @param {Element} element
     */
    addElement(element) {
        const glyphIndex = this.glyphCount;
        const vertOffset = glyphIndex * 4;
        this.glyphCount += 1;

        const { glyph, position, color } = element;
        const { x: x, y: y } = position;
        const { x: w, y: h } = glyph.size;
        const range = [glyph.uvCoords.min, glyph.uvCoords.max];

        for (let cy = 0; cy <= 1; ++cy) {
            for (let cx = 0; cx <= 1; ++cx) {
                const vertIndex = vertOffset + cy * 2 + cx;
                this.attrPosition.setXYZ(vertIndex, x + cx*w, y + cy*h, 0);
                this.attrUV.setXY(vertIndex, range[cx].x, range[1-cy].y);
                this.attrColor.setXYZW(vertIndex, color.r, color.g, color.b, element.visible ? 1 : 0);
            }
        }

        this.refresh();
    }

    refresh() {
        this.geometry.setDrawRange(0, this.glyphCount * 6);
        this.attrPosition.needsUpdate = true;
        this.attrUV.needsUpdate = true;
        this.attrColor.needsUpdate = true;
    }
}
