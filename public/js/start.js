import * as THREE from "three";
import Stats from "stats";

import tilesetToTextureArray from "atlas";

/**
 * @param {HTMLElement} element 
 * @param {boolean} integer
 */
function scaleElementToParent(element, integer = true) {
    const parent = element.parentElement;

    const [tw, th] = [parent.clientWidth, parent.clientHeight];
    const [sw, sh] = [tw / element.clientWidth, th / element.clientHeight];
    let scale = Math.min(sw, sh);
    scale = scale > 1 && integer ? Math.floor(scale) : scale;

    if (element.dataset.scale !== scale.toString()) {
        element.dataset.scale = scale.toString();
        element.style.setProperty("transform", `translate(-50%, -50%) scale(${scale})`);
        // element.style.setProperty("transform", `scale(${scale})`);
    }

    return scale;
}

class PointerDrag extends EventTarget {
    /** 
     * @param {MouseEvent} event
     */
    constructor(event, { clickMovementLimit = 5 } = {}) {
        super();
        this.pointerId = event["pointerId"];
        this.clickMovementLimit = 5;
        this.totalMovement = 0;

        this.downEvent = event;
        this.lastEvent = event;

        this.listeners = {
            "pointerup": (event) => {
                if (event.pointerId !== this.pointerId) return;

                this.lastEvent = event;
                this.unlisten();
                this.dispatchEvent(new CustomEvent("up", { detail: event }));
                if (this.totalMovement <= clickMovementLimit) {
                    this.dispatchEvent(new CustomEvent("click", { detail: event }));
                }
            },

            "pointermove": (event) => {
                if (event.pointerId !== this.pointerId) return;

                this.lastEvent = event;
                this.totalMovement += Math.abs(event.movementX);
                this.totalMovement += Math.abs(event.movementY);
                this.dispatchEvent(new CustomEvent("move", { detail: event }));
            }
        }

        document.addEventListener("pointerup", this.listeners.pointerup);
        document.addEventListener("pointermove", this.listeners.pointermove);
    }

    unlisten() {
        document.removeEventListener("pointerup", this.listeners.pointerup);
        document.removeEventListener("pointermove", this.listeners.pointermove);
    }
}

function easeInOutSine(x){
    return -(Math.cos(Math.PI * x) - 1) / 2;
}

const HELD_KEYS = new Set();
const DOWN_KEYS = new Set();

const heldActions = new Map();
const downActions = new Map();
/** @type {Map<HTMLButtonElement, Set<string>>} */
const buttonActions = new Map();

function linkButtonAction(button, name) {
    const set = buttonActions.get(button) ?? new Set();
    set.add(name);
    buttonActions.set(button, set);
}

const keyToCode = new Map();
keyToCode.set("ArrowUp", "KeyW");
keyToCode.set("ArrowLeft", "KeyA");
keyToCode.set("ArrowDown", "KeyS");
keyToCode.set("ArrowRight", "KeyD");

const keyToButton = new Map();

function down(key, code) {
    HELD_KEYS.add(key);
    HELD_KEYS.add(code);

    DOWN_KEYS.add(key);
    DOWN_KEYS.add(code);
}

function up(key, code) {
    HELD_KEYS.delete(key);
    HELD_KEYS.delete(code);
}

function bindButtonToKey(button, key) {
    button.addEventListener("pointerdown", () => {
        down(key, "");

        window.addEventListener("pointerup", () => {
            up(key, "");
        }, { once: true });
        window.addEventListener("pointercancel", () => {
            up(key, "");
        }, { once: true });
    });
}

document.addEventListener("keydown", (event) => {
    if (!event.repeat) down(event.key, event.code);
    
    const button = keyToButton.get(event.key);
    if (button) {
        button.dispatchEvent(new PointerEvent("pointerdown"));
    }
    
    if (downActions.has(event.key)) {
        event.stopPropagation();
        event.preventDefault();
        downActions.get(event.key)();
    }
}, { capture: true });
document.addEventListener("keyup", (event) => {
    up(event.key, event.code);
    
    const button = keyToButton.get(event.key);
    if (button) {
        button.dispatchEvent(new PointerEvent("pointerup"));
    }
});

/**
 * @typedef {Object} SMTCell
 * @property {number[]} position
 * @property {number[]} faceTiles
 * @property {THREE.Color} color
 */

const ROTATIONS = [];

for (let i = 0; i < 4; ++i) {
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * .5 * i);
    ROTATIONS.push(rotation);
}

/** @type {THREE.Vector3[]} */
const DIRECTIONS = [];

for (let i = 0; i < 4; ++i) {
    const direction = new THREE.Vector3(0, 0, 1);
    direction.applyQuaternion(ROTATIONS[i]);
    direction.round();
    DIRECTIONS.push(direction);
}

const FACE_NORMALS = [...DIRECTIONS];
FACE_NORMALS.push(new THREE.Vector3(0, -1, 0));
FACE_NORMALS.push(new THREE.Vector3(0,  1, 0));

function coords(...coords) {
    return coords.map((coord) => coord|0).join(",");
}

function generate_world() {
    /** @type {Map<string, SMTCell>} */
    const grid = new Map();

    function make_cell(x, z) {
        const co = coords(x, z);
        
        if (grid.has(co))
            return grid.get(co);

        const faceTiles = [];

        const tile = THREE.MathUtils.randInt(3, 64);

        for (let i = 0; i < 4; ++i) {
            faceTiles.push(tile);
        }
    
        faceTiles.push(THREE.MathUtils.randInt(3, 64));
        faceTiles.push(THREE.MathUtils.randInt(3, 64));

        // faceTiles.push(2);
        // faceTiles.push(1);

        const cell = {
            position: [x, z],
            faceTiles,
            color: new THREE.Color(),
        }
    
        grid.set(co, cell);

        return cell;
    }

    const cursor = new THREE.Vector3(0, 0, 0);
    let di = 0;

    const runs = THREE.MathUtils.randInt(6, 12);

    for (let j = 0; j < runs; ++j) {
        const length = THREE.MathUtils.randInt(8, 16);

        for (let i = 0; i < length; ++i) {
            const cell = make_cell(cursor.x, cursor.z);
            
            const hue = j/runs;
            const darken = (i+1)/length*.5;

            if (i > 0)
                cell.faceTiles[(di+2) % 4] = 0;
            
            // cell.color.setHSL(hue, .75, .5);
            cell.color.setHSL(0, 0, .5);

            if (Math.random() < .5) {
                di = (di + randElement([1, 3])) % 4;
            }
            
            if (i < length - 1)
                cell.faceTiles[di] = 0;

            cursor.add(DIRECTIONS[di]);
            cursor.round();
        }

        const root = randElement(Array.from(grid.values()));
        cursor.set(root.position[0], 0, root.position[1]);
    }

    return grid;
}


const CURRENT_MOVE = {
    a: new THREE.Vector3(),
    b: new THREE.Vector3(),

    ar: new THREE.Quaternion(),
    br: new THREE.Quaternion(),

    u: 1,
}


const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

addEventListener("wheel", (event) => resizeOn = false);
let resizeOn = true;

export default async function start() {
    const main = document.querySelector("main");

    function resize2() {
        if (resizeOn) {
            scaleElementToParent(main, false);
        }
        requestAnimationFrame(resize2);
    }
    resize2();

    const loader = new THREE.TextureLoader();
    const tilesTex = await loader.loadAsync("assets/tiles.webp");
    const texArray = await tilesetToTextureArray(tilesTex.image, 24, 24);
    
    const tilesMaterial = new THREE.MeshBasicMaterial({ 
        map: tilesTex, 
        vertexColors: true, 
        alphaTest: .5,
    });

    tilesMaterial.onBeforeCompile = function(shader) {
        const vertexExtra = `
attribute int tile;
flat varying int tile2;       
`

        shader.vertexShader = shader.vertexShader.replace("#include <uv_pars_vertex>", "#include <uv_pars_vertex>\n" + vertexExtra);
        
        shader.vertexShader = shader.vertexShader.replace(
            "#include <color_vertex>", 
            `#include <color_vertex>
            tile2 = tile;
        `);

        shader.fragmentShader = shader.fragmentShader.replace(
            "#include <uv_pars_fragment>", 
            `#include <uv_pars_fragment>
            flat varying int tile2;
            uniform mediump sampler2DArray tileset;
        `);

        shader.fragmentShader = shader.fragmentShader.replace(
            "#include <map_fragment>", 
            `vec4 sampledDiffuseColor = texture(tileset, vec3(vMapUv, tile2));
            diffuseColor *= sampledDiffuseColor;
        `);

        shader.uniforms.tileset = { value: texArray };
    }

    const charsMaterial = tilesMaterial.clone();
    // charsMaterial.side = THREE.DoubleSide;
    charsMaterial.onBeforeCompile = tilesMaterial.onBeforeCompile;

    let NEXT_DIALOGUE_INDEX = 0;
    const DIALOGUES = [
        `Welcome to the Cathedral of Shadows! Gather demons and come again!`,
        `Back in the beginning, it was being built to turn the dream of the Thousand Year Kingdom into a reality.`,
    ];

    /** @type {HTMLElement} */
    const dialogueElement = document.querySelector("#dialogue");
    const dialogueBlockerElement = document.querySelector("#dialogue-blocker");
    const dialogueContentElement = document.querySelector("#dialogue-content");
    const dialoguePromptElement = document.querySelector("#dialogue-prompt");

    dialogueElement.addEventListener("pointerdown", () => NEXT_DIALOGUE());
    dialogueBlockerElement.addEventListener("pointerdown", () => NEXT_DIALOGUE());

    let MOVE_QUEUED = false;

    function INTERACT() {
        if (IS_IN_DIALOGUE())
            return NEXT_DIALOGUE();
    }

    function INTERACT_CHAR(char) {
        if (!CAN_MOVE() || IS_IN_DIALOGUE())
            return;

        // char
        NEXT_DIALOGUE_INDEX = 0;
        NEXT_DIALOGUE();
    }

    function IS_IN_DIALOGUE() {
        return !dialogueElement.hidden;
    }

    function SHOW_DIALOGUE(text) {
        dialogueElement.hidden = false;
        dialogueContentElement.textContent = text;
        dialogueBlockerElement.hidden = false;
    }

    function HIDE_DIALOGUE() {
        dialogueElement.hidden = true;
        dialogueBlockerElement.hidden = true;
    }

    function NEXT_DIALOGUE() {
        const text = DIALOGUES[NEXT_DIALOGUE_INDEX];
        NEXT_DIALOGUE_INDEX += 1;

        dialoguePromptElement.textContent = NEXT_DIALOGUE_INDEX < DIALOGUES.length ? "🔽" : "⏹️";

        if (text) {
            SHOW_DIALOGUE(text);
        } else {
            HIDE_DIALOGUE();
        }
    }

    const clock = new THREE.Clock();
    const stats = Stats();
    //document.body.appendChild(stats.dom);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    const camera2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1000);

    scene.fog = new THREE.Fog(0, 1, 7);

    const camFixture = new THREE.Object3D();
    camFixture.add(camera);

    camera.position.z -= .5;
    camera.lookAt(0, 0, 1);

    const roomObjects = new THREE.Object3D();
    scene.add(roomObjects);

    const charObjects = new THREE.Object3D();
    scene.add(charObjects);

    function makeChar(tile) {
        const charTest = new THREE.Mesh(
            //new THREE.BoxGeometry(1, 1, 1),
            generateCharGeometry(tile),
            charsMaterial,
        );
        charTest.position.set(0, 0, 0);
        charTest.scale.set(.8, .8, .8);
        charObjects.add(charTest);
        return charTest;
    }

    const cells = generate_world();

    const distances = new Map();
    
    function do_distances(position, distance) {
        const cell = cells.get(coords(position.x, position.z));

        if (cell === undefined)
            return;

        const prev = distances.get(cell);

        if (prev <= distance)
            return;

        distances.set(cell, distance);

        distance += 1;

        for (let i = 0; i < 4; ++i) {
            if (cell.faceTiles[i] != 0)
                continue;

            const next = DIRECTIONS[i].clone().add(position);
            do_distances(next, distance);
        }
    }

    const CHARMAP = new Map();

    const elements = Array.from(cells.values());
    for (let i = 0; i < 8; ++i) {
        const cell = elements.splice(THREE.MathUtils.randInt(0, elements.length-1), 1)[0];
        // const cell = elements[THREE.MathUtils.randInt(0, elements.length-1)];

        let success = false;

        for (let d = 0; d < 4; ++d) {
            if (cell.faceTiles[d] == 0 || Math.random() < .5)
                continue;

            success = true;

            const char = makeChar(4);
            char.lookAt(DIRECTIONS[d]);
            char.position.set(cell.position[0], 0, cell.position[1]);
            char.position.addScaledVector(DIRECTIONS[d], .4);

            CHARMAP.set(coords(cell.position[0], cell.position[1], d), char);
        }

        if (success)
            do_distances(new THREE.Vector3(cell.position[0], 0, cell.position[1]), 0);
    }

    function redo_distances() {
        distances.clear();
        for (const [coord, char] of CHARMAP.entries()) {
            const x = char.position.x|0;
            const z = char.position.z|0;
            do_distances(new THREE.Vector3(x, 0, z), 0);
        }
    }

    function do_lights() {
        const dlimit = 7;
        for (const cell of cells.values()) {
            const d = distances.get(cell);
            const u = Math.min(d, dlimit) / (dlimit+1);
            const hsl = cell.color.getHSL({h:0,s:0,l:0});
            hsl.l = Math.max((1-u)*.5, 0.025);
            // hsl.s = 1 - (u*u);
            // cell.color.setHSL(hsl.h, hsl.s*.85, hsl.l);
            //cell.color.setHSL((d/16)%1, .75, Math.max(.5-u*.5, 0.05));
            cell.color.setRGB(1, 1, 1).multiplyScalar(Math.max((1-u)*(1-u), 0.01));
        }
    }
    do_lights();

    function regenerate() {
        roomObjects.children = [];

        for (const [coord, cell] of cells) {
            const [x, z] = cell.position;

            const colors = new Array(6).fill(cell.color);

            const tile = new THREE.Mesh(generateCellGeometry(cell.faceTiles, colors), tilesMaterial);
            tile.position.set(x, 0, z);
            roomObjects.add(tile);
        }
    }

    regenerate();

    let cam = 0;
    function toggle_camera() {
        cam = 1 - cam;
        if (cam == 1) {
            camera.position.set(0, 3.5, -.5);
            camera.lookAt(camFixture.position);

            document.body.appendChild(stats.dom);
        } else {
            camera.position.set(0, 0, -.5);
            camera.rotation.set(-Math.PI, 0, -Math.PI);
            stats.dom.remove();
        }
    }

    const renderer = new THREE.WebGLRenderer({ alpha: true });
    renderer.autoClear = false;

    function onPointerMove(event) {
        // calculate pointer position in normalized device coordinates
        // (-1 to +1) for both components

        if (event.target != renderer.domElement)
            return;

        const bounds = renderer.domElement.getBoundingClientRect();

        const x = event.clientX - bounds.left;
        const y = event.clientY - bounds.top;

        pointer.x = x / bounds.width * 2 - 1;
        pointer.y = -y / bounds.height * 2 + 1;

        raycaster.setFromCamera(pointer, camera);
        const intersects = raycaster.intersectObjects(roomObjects.children);

        for (const intersection of intersects) {
            const room = intersection.object;

            const c = coords(room.position.x, room.position.z);
            const cell = cells.get(c);
            const face = (intersection.faceIndex / 2)|0;

            if (!cell || cell.faceTiles[face] == 0)
                continue;

            const normal = FACE_NORMALS[face].clone();
            normal.multiply({ x: 1, y: .75, z: 1 }).multiplyScalar(.5);

            cell.faceTiles[face] = Math.max(1, (cell.faceTiles[face] + 1) % 4);
            regenerate();

            break;
        }
    }
    //window.addEventListener("pointermove", onPointerMove);
    //window.addEventListener("pointerdown", onPointerMove);

    document.querySelector("#display").appendChild(renderer.domElement);
    const controls = document.querySelector("#controls");

    renderer.domElement.addEventListener("pointerdown", (event) => {
        const drag = new PointerDrag(event);
        const delta = new THREE.Vector3();
        drag.addEventListener("move", (event) => {
            delta.x -= event.detail.movementX;
            delta.z += event.detail.movementY;
        });

        drag.addEventListener("up", (event) => {
            if (drag.totalMovement < 25) return;

            delta.normalize();

            for (const [dir, vector] of DIRECTIONS.entries()) {
                const d = delta.dot(vector);

                if (d > 0.85) {
                    if (dir == 0 || dir == 2) {
                        move((DIRECTION + dir) % 4);
                    } else if (dir == 1) {
                        rotate(-1);
                    } else if (dir == 3) {
                        rotate(1);
                    }

                    return;
                }
            }
        });
    });

    function cycle_tiles() {
        const { x, z } = GET_POS();
        const c = coords(x, z);
        const cell = cells.get(c);

        const floor = THREE.MathUtils.randInt(3, 64);
        const ceil = THREE.MathUtils.randInt(3, 64);
        const wall = THREE.MathUtils.randInt(3, 64);

        for (let i = 0; i < 4; ++i) {
            cell.faceTiles[i] = cell.faceTiles[i] > 0 ? wall : 0;
        }
        cell.faceTiles[4] = floor;
        cell.faceTiles[5] = ceil;
            
        regenerate();
    }
    
    function toggle_wall() {
        const pos = GET_POS();
        const { x, z } = pos;
        const { x: nx, z: nz } = pos.add(DIRECTIONS[DIRECTION]);

        const inv = (DIRECTION + 2) % 4;

        const cell = cells.get(coords(x, z));
        const cell2 = cells.get(coords(nx, nz));

        const wall = THREE.MathUtils.randInt(3, 64);

        cell.faceTiles[DIRECTION] = cell.faceTiles[DIRECTION] > 0 ? 0 : wall;
        
        if (cell2) {
            cell2.faceTiles[inv] = cell2.faceTiles[inv] > 0 ? 0 : wall;
        }
            
        redo_distances();
        do_lights();
        regenerate();
    }

    function add_button(label, callback=()=>{}) {
        const button = document.createElement("button");
        button.textContent = label;
        button.addEventListener("click", callback);
        button.classList.add("ui-border");
        controls.appendChild(button);
        return button;
    }

    const tleft = add_button("↪️");
    const mahead = add_button("⬆️");
    const tright = add_button("↩️");
    const mleft = add_button("⬅️");
    add_button("👁️", toggle_camera);
    const mright = add_button("➡️");
    add_button("🖼️", cycle_tiles);
    const mback = add_button("⬇️");
    add_button("🚪", toggle_wall);

    const DIR_BUTTONS = [
        mahead,
        mleft,
        mback,
        mright,
    ];

    const DIR_EMOJIS = [
        "⬆️",
        "⬅️",
        "⬇️",
        "➡️",
    ]

    bindButtonToKey(tleft, "TURN_LEFT");
    bindButtonToKey(mahead, "MOVE_AHEAD");
    bindButtonToKey(tright, "TURN_RIGHT");
    bindButtonToKey(mright, "MOVE_RIGHT");
    bindButtonToKey(mleft, "MOVE_LEFT");
    bindButtonToKey(mback, "MOVE_BACK");

    linkButtonAction(tleft, "ArrowLeft");
    linkButtonAction(mahead, "ArrowUp");
    linkButtonAction(tright, "ArrowRight");
    linkButtonAction(mback, "ArrowDown");

    linkButtonAction(tleft, "q");
    linkButtonAction(mahead, "w");
    linkButtonAction(tright, "e");
    linkButtonAction(mback, "s");
    linkButtonAction(mleft, "a");
    linkButtonAction(mright, "d");

    /** @type {HTMLElement} */
    const display = document.querySelector("#display");
    /** @type {HTMLElement} */
    const viewport = document.querySelector("#viewport");

    function resize() {
        // const parent = renderer.domElement.parentElement;
        const rect = viewport.getBoundingClientRect();
        let { left, top, width, height } = rect;
        
        left = Math.ceil(left)+2;
        top = Math.ceil(top)+2;
        width = Math.floor(width)-2;
        height = Math.floor(height)-2;

        display.style.left = `${left}px`;
        display.style.top = `${top}px`;
        display.style.width = `${width}px`;
        display.style.height = `${height}px`;

        const scale = 1;

        renderer.setSize(width, height, true);
        renderer.setPixelRatio(1/scale);

        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        camera2.left   = 0;
        camera2.right  = width / scale;
        camera2.top    = height / scale;
        camera2.bottom = 0;
        camera2.updateProjectionMatrix(); 
    }

    let DIRECTION = 0;

    const delta = new THREE.Vector3();
    const quata = new THREE.Quaternion();

    function update() {
        resize();
        animate(Math.min(1/15, clock.getDelta()));
        stats.update();

        requestAnimationFrame(update);
    }
    update();

    function GET_POS() {
        return new THREE.Vector3(CURRENT_MOVE.b.x|0, 0, CURRENT_MOVE.b.z|0);
    }

    function animate(dt) {
        for (const [key, func] of heldActions) {
            if (HELD_KEYS.has(key) || DOWN_KEYS.has(key)) {
                func();
            }
        }

        for (const key of HELD_KEYS) {
            const func = heldActions.get(key);
            if (func) func();
        }

        for (const [button, actions] of buttonActions) {
            const held = Array.from(actions.values()).map((name) => HELD_KEYS.has(name) || DOWN_KEYS.has(name)).reduce((p, n) => p || n);
            button.classList.toggle("active", held);
        }

        for (const [d, button] of DIR_BUTTONS.entries()) {
            const dir = (d + DIRECTION) % 4;
            const { x, z } = GET_POS();
            
            const char = get_char(x, z, dir);
            const pass = is_passable(x, z, dir);

            if (char)
                button.textContent = "💬";
            else if (pass)
                button.textContent = DIR_EMOJIS[d];
            else
                button.textContent = "❌";
        }

        if (DOWN_KEYS.has(" ") || DOWN_KEYS.has("Enter"))
            INTERACT();

        DOWN_KEYS.clear();

        if (MOVE_QUEUED && CAN_MOVE()) {
            MOVE_QUEUED = false;
            move(DIRECTION);
        }

        CURRENT_MOVE.u += dt * 3;
        CURRENT_MOVE.u = Math.min(1, CURRENT_MOVE.u);

        const u = easeInOutSine(CURRENT_MOVE.u);

        delta.subVectors(CURRENT_MOVE.b, CURRENT_MOVE.a);

        camFixture.position.copy(CURRENT_MOVE.a);
        camFixture.position.addScaledVector(delta, u);

        quata.slerpQuaternions(CURRENT_MOVE.ar, CURRENT_MOVE.br, u);
        camFixture.rotation.setFromQuaternion(quata);

        camFixture.updateMatrixWorld();
        camera.updateMatrixWorld();

        renderer.render(scene, camera);
    }

    function IS_MOVING() {
        return CURRENT_MOVE.u < 1;
    }

    function CAN_MOVE() {
        return !IS_IN_DIALOGUE() && !IS_MOVING(); 
    }

    function rotate(sign) {
        if (!CAN_MOVE())
            return;

        CURRENT_MOVE.ar.copy(ROTATIONS[DIRECTION]);
        DIRECTION = (DIRECTION + 4 + sign) % 4;
        CURRENT_MOVE.br.copy(ROTATIONS[DIRECTION]);

        CURRENT_MOVE.u = 0;

        CURRENT_MOVE.a.copy(camFixture.position).round();
        CURRENT_MOVE.b.copy(camFixture.position).round();
    }

    function is_passable(x, z, direction) {
        const cell = cells.get(coords(x, z));
        return cell == undefined || cell.faceTiles[direction] == 0;
    }

    function get_char(x, z, direction) {
        const char = CHARMAP.get(coords(x, z, direction));
        return char;
    }

    function move(direction) {
        if (!CAN_MOVE())
            return;

        camFixture.position.round();
        const x = camFixture.position.x;
        const z = camFixture.position.z;

        if (!is_passable(x, z, direction) && direction !== DIRECTION) {
            if ((DIRECTION + 1) % 4 == direction)
                rotate(1)
            else if ((DIRECTION + 4 - 1) % 4 == direction)
                rotate(-1)
            else
                rotate(2)

            MOVE_QUEUED = true;

            return;
        }

        const char = get_char(x, z, direction);
        if (char) {
            INTERACT_CHAR(char);
        } else if (is_passable(x, z, direction)) {
            CURRENT_MOVE.u = 0;

            CURRENT_MOVE.a.set(x, 0, z).round();
            CURRENT_MOVE.b.addVectors(CURRENT_MOVE.a, DIRECTIONS[direction]).round();

            CURRENT_MOVE.ar.copy(ROTATIONS[DIRECTION]);
            CURRENT_MOVE.br.copy(ROTATIONS[DIRECTION]);
        }
    }

    heldActions.set("ArrowLeft",  () => rotate( 1));
    heldActions.set("ArrowRight", () => rotate(-1));
    heldActions.set("ArrowUp",    () => move(DIRECTION));
    heldActions.set("ArrowDown",  () => move((DIRECTION+2)%4));

    heldActions.set("q", () => rotate( 1));
    heldActions.set("e", () => rotate(-1));
    heldActions.set("w", () => move((DIRECTION+0)%4));
    heldActions.set("d", () => move((DIRECTION+3)%4));
    heldActions.set("s", () => move((DIRECTION+2)%4));
    heldActions.set("a", () => move((DIRECTION+1)%4));

    heldActions.set("TURN_LEFT",  () => rotate( 1));
    heldActions.set("TURN_RIGHT", () => rotate(-1));
    heldActions.set("MOVE_AHEAD", () => move((DIRECTION+0)%4));
    heldActions.set("MOVE_RIGHT", () => move((DIRECTION+3)%4));
    heldActions.set("MOVE_BACK",  () => move((DIRECTION+2)%4));
    heldActions.set("MOVE_LEFT",  () => move((DIRECTION+1)%4));

    document.querySelector("#loading").close();
}

/**
 * @template T
 * @param {T[]} list
 */
function randElement(list) {
    return list[THREE.MathUtils.randInt(0, list.length-1)];
}

function generateCharGeometry(tile) {
    const geometry = new THREE.BufferGeometry();

    const positions = [];
    const uvs = [];
    const colors = [];
    const tiles = [];
    const indexes = [];

    const vec3 = new THREE.Vector3();
    const vec2 = new THREE.Vector2();

    const b = positions.length/3;
    indexes.push(b+2, b+1, b+0);
    indexes.push(b+1, b+2, b+3);
    
    const xrange = [0, 1];
    const yrange = [0, 1];

    const color = new THREE.Color();

    for (let y = 0; y < 2; ++y) {
        for (let x = 0; x < 2; ++x) {
            vec3.set(x-.5, y-.5, 0);
            vec3.toArray(positions, positions.length);

            vec2.set(xrange[x], yrange[y]);
            vec2.toArray(uvs, uvs.length);

            color.toArray(colors, colors.length);

            tiles.push(tile);
        }
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));
    geometry.setAttribute("tile", new THREE.BufferAttribute(new Int32Array(tiles), 1));
    geometry.setIndex(indexes);

    return geometry;
}

function generateCellGeometry(faceTiles, colors2) {
    const geometry = new THREE.BufferGeometry();

    const positions = [];
    const colors = [];
    const uvs = [];
    const tiles = [];
    const normals = [];
    const indexes = [];

    const quat = new THREE.Quaternion();

    

    for (let i = 0; i < 4; ++i) {
        const tile = faceTiles[i];
        addFace(ROTATIONS[i], colors2[i], tile);
    }

    quat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI *  .5);
    addFace(quat, colors2[4], faceTiles[4]);
    quat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI * -.5);
    addFace(quat, colors2[5], faceTiles[5]);

    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));
    geometry.setAttribute("tile", new THREE.BufferAttribute(new Int32Array(tiles), 1));
    //geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(normals), 3));
    geometry.setIndex(indexes);

    geometry.scale(1, .75, 1);
    // geometry.scale(.75, .75, .75)
    // geometry.scale(1, 1, 1);

    return geometry;

    /** 
     * @param {THREE.Quaternion} rotation
     * @param {THREE.Color} color
     * @param {number} tile
     */
    function addFace(rotation, color, tile) {
        const vec3 = new THREE.Vector3();
        const vec2 = new THREE.Vector2();
        const norm = new THREE.Vector3(0, 0, 1);

        const b = positions.length/3;
        indexes.push(b+2, b+1, b+0);
        indexes.push(b+1, b+2, b+3);
        
        const xrange = [0, 1];
        const yrange = [0, 1];

        for (let y = 0; y < 2; ++y) {
            for (let x = 0; x < 2; ++x) {
                vec3.set(x-.5, y-.5, .5);
                vec3.applyQuaternion(rotation);
                vec3.toArray(positions, positions.length);

                vec2.set(xrange[x], yrange[y]);
                vec2.toArray(uvs, uvs.length);

                vec3.copy(norm).applyQuaternion(rotation);
                vec3.toArray(normals, normals.length);

                color.toArray(colors, colors.length);
                tiles.push(tile);
            }
        }
    }
}
