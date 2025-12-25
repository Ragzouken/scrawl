import * as THREE from "three";
import Stats from "stats";

/**
 * Create an html element with the given attributes and children.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tagName 
 * @param {*} attributes 
 * @param  {...(Node | string)} children 
 * @returns {HTMLElementTagNameMap[K]}
 */
 function html(tagName, attributes = {}, ...children) {
    const element = /** @type {HTMLElementTagNameMap[K]} */ (document.createElement(tagName)); 
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    children.forEach((child) => element.append(child));
    return element;
}

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
        element.style.setProperty("scale", `${scale}`);
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

function ADD_DIRS(a, b) {
    return (a + b + 40) % 4;
}

function OPPOSITE(dir) {
    return ADD_DIRS(dir, 2);
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
    button.addEventListener("pointerdown", (event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
        event.stopPropagation();

        down(key, "");
        button.classList.toggle("active2", true);

        window.addEventListener("pointerup", () => {
            up(key, "");
            button.classList.toggle("active2", false);
        }, { once: true });
        window.addEventListener("pointercancel", () => {
            up(key, "");
            button.classList.toggle("active2", false);
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
    return coords.map((coord) => Math.floor(coord)).join(",");
}

let activeControls = html("fieldset");

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

function setup_dialogue_ui() {
    const dialogueBlockerElement = html("div", { id: "dialogue-blocker", hidden: "" });
    const dialogueContentElement = html("div");
    dialogueContentElement.style.whiteSpace = "pre-wrap";
    const dialoguePromptElement = html("div", {}, "🔽");
    dialoguePromptElement.style = `
        position: absolute;
        left: 50%;
        transform: translate(-50%, .125rem);
        animation: 1s ease-in-out infinite alternate flash;`
    const dialogueElement = html("div", { id: "dialogue", class: "ui-border ui-dialogue", hidden: "" }, dialogueContentElement, dialoguePromptElement);

    return {
        dialogueElement,
        dialogueBlockerElement,
        dialogueContentElement,
        dialoguePromptElement,
    }
}

function setup_ui(canvas) {
    Object.assign(canvas.style, {
        "position": "absolute",
        "z-index": "-1",
        "border-radius": "1rem",
        "pointer-events": "all",
    });
    document.body.append(canvas);

    const viewport = html("div", { id: "viewport" }); 
    viewport.style.gridArea = "viewport";

    const border = html("div", { class: "ui-border" }); 
    border.style.gridArea = "viewport";

    const {
        dialogueElement,
        dialogueBlockerElement,
        dialogueContentElement,
        dialoguePromptElement,
    } = setup_dialogue_ui();

    const main = html(
        "main", 
        { class: "centered" },
        viewport,
        border,

        dialogueElement,
        dialogueBlockerElement,
    );
    Object.assign(main.style, {
        "width": "480px",
        "height": "768px",
    });
    Object.assign(main.style, {
        "display": "grid",
        "grid-template": `"viewport" 1fr "controls" min-content`,
    });
    document.body.append(main);

    return {
        main,
        viewport,

        dialogueElement,
        dialogueBlockerElement,
        dialogueContentElement,
        dialoguePromptElement,
    }
}

let savedWall = 0;
let savedRoom = [0, 0];

export default async function start() {
    const renderer = new THREE.WebGLRenderer({ alpha: true });
    const { main, viewport,
        dialogueElement,
        dialogueBlockerElement,
        dialogueContentElement,
        dialoguePromptElement,
    } = setup_ui(renderer.domElement);

    function resize2() {
        if (resizeOn) {
            scaleElementToParent(main, false);
        }
        requestAnimationFrame(resize2);
    }
    resize2();

    const texArrayManager = new TextureArrayManager(64, 64, 1024);

    const loader = new THREE.TextureLoader();
    const wallsTex = await loader.loadAsync("assets/walls.webp");
    const floorsTex = await loader.loadAsync("assets/floors.webp");
    const charsTex = await loader.loadAsync("assets/chars.webp");
    texArrayManager.addImage(wallsTex.image, "walls");
    texArrayManager.addImage(floorsTex.image, "floors");
    texArrayManager.addImage(charsTex.image, "chars");
    const texArray = texArrayManager.array;

    savedWall = nextTile("walls", -1);
    savedRoom = nextRoom(-1);
    
    function randomTile(group) {
        return randElement(texArrayManager.groups.get(group));
    }

    function nextTile(group, tile) {
        const tiles = texArrayManager.groups.get(group);
        let i = tiles.indexOf(tile) + 1;
        return tiles[i % tiles.length];
    }

    function randomRoom() {
        const walls = texArrayManager.groups.get("walls");
        const floors = texArrayManager.groups.get("floors");
        const i = THREE.MathUtils.randInt(0, walls.length-1);

        return [walls[i], floors[i]];
    }

    function nextRoom(tile) {
        const walls = texArrayManager.groups.get("walls");
        const floors = texArrayManager.groups.get("floors");
        let i = Math.max(walls.indexOf(tile), floors.indexOf(tile)) + 1;
        return [walls[i % walls.length], floors[i % floors.length]];
    }

    const tilesMaterial = new THREE.MeshBasicMaterial({ 
        map: wallsTex, 
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

    /**
     * @param {Position} position 
     * @param {number[]} room
     * @returns {SMTCellData}
     */
    function make_blank_cell(position, room) {
        const [wall, floor] = room;
        
        const faceTiles = new Array(6).fill(wall);
        faceTiles[4] = floor;
        faceTiles[5] = floor;

        const faceWalls = new Array(6).fill(1);

        /** @type {SMTCellData} */
        const cell = {
            position,
            faceTiles,
            faceWalls,
        }

        return cell;
    }

    /**
     * @param {THREE.Vector3} position 
     * @param {number} direction 
     * @param {number} tile 
     * @returns {SMTCharData}
     */
    function make_blank_char(position, direction, tile) {
        const { x, z } = position;
        
        /** @type {SMTCharData} */
        const char = {
            position: [x, z],
            direction: direction,
            dialogue: [randElement(DIALOGUES)],
            faceTile: tile,
        }

        return char;
    }

    /**
     * @returns {SMTSceneData}
     */
    function generate_scene() {
        const cells = generate_cells();
        const chars = generate_chars(cells);

        return {
            cells,
            chars,
        };
    }

    function generate_cells() {
        /** @type {Map<unknown, SMTCellData>} */
        const cells = new Map();

        const cursor = new THREE.Vector3(0, 0, 0);
        let di = 0;

        const runs = THREE.MathUtils.randInt(6, 12);

        for (let j = 0; j < runs; ++j) {
            const length = THREE.MathUtils.randInt(8, 16);

            for (let i = 0; i < length; ++i) {
                const cell = force_cell(cells, cursor);
                
                if (i > 0)
                    cell.faceWalls[OPPOSITE(di)] = 0;

                if (Math.random() < .5) {
                    di = ADD_DIRS(di, randElement([1, 3]));
                }
                
                if (i < length - 1)
                    cell.faceWalls[di] = 0;

                cursor.add(DIRECTIONS[di]);
                cursor.round();
            }

            const root = randElement(Array.from(cells.values()));
            cursor.set(root.position[0], 0, root.position[1]);
        }

        return Array.from(cells.values());
    }

    function generate_chars(cells) {
        const chars = [];
        const available = [...cells];
        
        for (let i = 0; i < 8; ++i) {
            const cell = available.splice(THREE.MathUtils.randInt(0, available.length-1), 1)[0];

            for (let d = 0; d < 4; ++d) {
                if (cell.faceWalls[d] == 0 || Math.random() < .5)
                    continue;

                const char = make_blank_char(new THREE.Vector3(cell.position[0], 0, cell.position[1]), d, randomTile("chars"));
                chars.push(char);
            }
        }

        return chars;
    }

    let NEXT_DIALOGUE_INDEX = 0;
    const DIALOGUES = [
        `Welcome to the Cathedral of Shadows! Gather demons and come again!`,
        `Back in the beginning, it was being built to turn the dream of the Thousand Year Kingdom into a reality.`,
        `Hello noob.`,
    ];

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

        DIALOGUE_CHAR = char;
        NEXT_DIALOGUE_INDEX = 0;
        NEXT_DIALOGUE();
    }

    function IS_IN_TEXT_INPUT() {
        return document.activeElement.tagName == "INPUT"
            || document.activeElement.tagName == "TEXTAREA";
    }

    function IS_IN_DIALOGUE() {
        return !dialogueElement.hidden || IS_IN_TEXT_INPUT();
    }

    let DIALOGUE_CHAR = {dialogue: []}

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
        const text = DIALOGUE_CHAR.dialogue[NEXT_DIALOGUE_INDEX];
        NEXT_DIALOGUE_INDEX += 1;

        dialoguePromptElement.textContent = NEXT_DIALOGUE_INDEX < DIALOGUE_CHAR.dialogue.length ? "🔽" : "⏹️";

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

    const floorPlane = new THREE.Plane();
    floorPlane.setFromNormalAndCoplanarPoint(
        new THREE.Vector3(0, -1, 0),
        new THREE.Vector3(0.5, -.75/2, 0.5),
    )

    scene.fog = new THREE.Fog(0, 1, 7);

    const camFixture = new THREE.Object3D();
    camFixture.add(camera);

    camera.position.z -= .5;
    camera.lookAt(0, 0, 1);

    const roomObjects = new THREE.Object3D();
    scene.add(roomObjects);

    const charObjects = new THREE.Object3D();
    scene.add(charObjects);

    function make_char(position, direction, tile) {
        const char = make_blank_char(position, direction, tile);
        const { x, z } = position;
        chars.set(coords(x, z, direction), char);

        return char;
    }

    function makeCharObject(char) {
        const object = new THREE.Mesh(
            generateCharGeometry(char.faceTile),
            charsMaterial,
        );
        object.scale.multiplyScalar(.75);
        // object.scale.set(.8, .8, .8);
        charObjects.add(object);

        object.lookAt(DIRECTIONS[char.direction]);
        object.position.set(char.position[0], 0, char.position[1]);
        object.position.addScaledVector(DIRECTIONS[char.direction], .4);

        return object;
    }

    const sceneData = generate_scene();

    /** @type {Map<string, SMTCellData>} */
    const cells = new Map();
    /** @type {Map<string, SMTCharData>} */
    const chars = new Map();

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
            if (cell.faceWalls[i] != 0)
                continue;

            const next = DIRECTIONS[i].clone().add(position);
            do_distances(next, distance);
        }
    }

    /** @type {Map<string, THREE.Color>} */
    const cellColors = new Map();
    
    function calculate_lights() {
        distances.clear();
        for (const char of chars.values()) {
            const x = char.position[0];
            const z = char.position[1];
            do_distances(new THREE.Vector3(x, 0, z), 0);
        }

        cellColors.clear();
        const dlimit = 7;
        for (const cell of cells.values()) {
            const d = distances.get(cell);
            const u = Math.min(d, dlimit) / (dlimit+1);
            const v = Math.max((1-u)*(1-u), 0.01);
            const color = new THREE.Color(v, v, v);
            
            // const h = (d / dlimit) % 1;
            // const h = ((cell.position[0] + cell.position[1]) / 8) % 1;
            const h = Math.random();

            color.setHSL(h, 1.0, v * .5);
            cellColors.set(coords(...cell.position), color);
        }
    }

    regenerate();

    function regenerate() {
        cells.clear();
        for (const cell of sceneData.cells) {
            cells.set(coords(...cell.position), cell);
        }

        chars.clear();
        for (const char of sceneData.chars) {
            chars.set(coords(...char.position, char.direction), char);
        }

        calculate_lights();
        
        regenerate_cells();
        regenerate_chars();
    }

    function regenerate_cells() {
        roomObjects.children = [];

        for (const [coord, cell] of cells) {
            const [x, z] = cell.position;

            const geometry = generateCellGeometry(cell, cellColors.get(coord) ?? new THREE.Color(1, 1, 1));
            const object = new THREE.Mesh(geometry, tilesMaterial);
            object.position.set(x, 0, z);
            roomObjects.add(object);
        }
    }

    function regenerate_chars() {
        charObjects.children = [];

        for (const char of chars.values()) {
            makeCharObject(char);
        }
    }

    function IS_OVERHEAD() {
        return cam == 1;
    }

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

    renderer.domElement.addEventListener("pointerdown", (event) => {
        const drag = new PointerDrag(event);
        const delta = new THREE.Vector3();
        drag.addEventListener("move", (event) => {
            delta.x -= event.detail.movementX;
            delta.z += event.detail.movementY;
        });

        drag.addEventListener("click", (event) => {
            const bounds = renderer.domElement.getBoundingClientRect();

            const x = event.detail.clientX - bounds.left;
            const y = event.detail.clientY - bounds.top;

            pointer.x = x / bounds.width * 2 - 1;
            pointer.y = -y / bounds.height * 2 + 1;

            raycaster.setFromCamera(pointer, camera);
            const point = new THREE.Vector3();
            raycaster.ray.intersectPlane(floorPlane, point);

            point.x += .5;
            point.z += .5;
            point.y = 0;

            point.floor();

            if (activeControls === fillControls) {
                toggle_cell(point);
            } else if (IS_OVERHEAD()) {
                SET_POS(point);
            }
        });

        drag.addEventListener("up", (event) => {
            if (drag.totalMovement < 25) return;

            delta.normalize();

            for (const [dir, vector] of DIRECTIONS.entries()) {
                const d = delta.dot(vector);

                if (d > 0.85) {
                    if (dir == 0 || dir == 2) {
                        move(ADD_DIRS(DIRECTION, dir));
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

    /**
     * @param {SMTCellData} cell 
     * @param {number[]} room 
     */
    function set_room(cell, room) {
        const [wall, floor] = room;

        cell.faceTiles.fill(wall);
        cell.faceTiles[4] = floor;
        cell.faceTiles[5] = floor;
    }

    function get_room(cell) {
        const floor = cell.faceTiles[4];
        return nextRoom(floor-1);
    }

    function cycle_room() {
        const cell = FORCE_CELL(GET_POS());

        console.log("CYCLE ROOM", cell)

        const current = cell.faceTiles[4];
        savedRoom = nextRoom(current);
        set_room(cell, savedRoom);

        regenerate_cells();
    }

    function copy_room() {
        savedRoom = get_room(GET_CELL(GET_POS()));
    }

    function paste_room() {
        set_room(GET_CELL(GET_POS()), savedRoom);

        regenerate_cells();
    }

    function cycle_wall() {
        const cell = FORCE_CELL(GET_POS());

        cell.faceTiles[DIRECTION] = nextTile("walls", cell.faceTiles[DIRECTION]);
        savedWall = cell.faceTiles[DIRECTION];

        regenerate_cells();
    }

    function paste_wall() {
        const cell = GET_CELL(GET_POS());
        cell.faceTiles[DIRECTION] = savedWall;
        regenerate_cells();
    }

    function toggle_char() {
        const char = GET_CHAR(GET_POS(), DIRECTION);

        if (char) {
            chars.delete(coords(char.position[0], char.position[1], char.direction));
        } else {
            make_char(GET_POS(), DIRECTION, randomTile("chars"));
        }

        sceneData.chars = [...chars.values()];

        regenerate();
    }

    function cycle_char() {
        const char = GET_CHAR(GET_POS(), DIRECTION);

        if (char) {
            char.faceTile = nextTile("chars", char.faceTile);
        }

        regenerate();
    }

    function GET_CELL(position) {
        return cells.get(coords(position.x, position.z));
    }

    /**
     * @param {THREE.Vector3} position 
     * @returns {SMTCellData}
     */
    function force_cell(cells, position) {
        const { x, z } = position;
        const co = coords(x, z);

        if (cells.has(co))
            return cells.get(co);

        const cell = make_blank_cell([x, z], savedRoom);

        cells.set(co, cell);

        return cell;
    }

    /**
     * @param {THREE.Vector3} position 
     * @returns {SMTCellData}
     */
    function FORCE_CELL(position) {
        const cell = force_cell(cells, position); 
        sceneData.cells.push(cell);
        return cell;
    }

    function CARVE_PATH(position, direction) {
        const a = FORCE_CELL(position);
        const b = FORCE_CELL(position.clone().add(DIRECTIONS[direction]));

        a.faceWalls[direction] = 0;
        b.faceWalls[OPPOSITE(direction)] = 0;
    }

    function toggle_wall() {
        const pos = GET_POS();
        const { x, z } = pos;
        const { x: nx, z: nz } = pos.add(DIRECTIONS[DIRECTION]);

        const cell = cells.get(coords(x, z));
        const cell2 = cells.get(coords(nx, nz));

        const wall = 1 - cell.faceWalls[DIRECTION];

        cell.faceWalls[DIRECTION] = wall;
        if (cell2) cell2.faceWalls[OPPOSITE(DIRECTION)] = wall;
            
        regenerate();
    }

    function toggle_cell(position) {
        const { x, z } = position;
        const cell = cells.get(coords(x, z));

        if (cell) {
            const index = sceneData.cells.indexOf(cell);
            sceneData.cells.splice(index, 1);

            cells.delete(coords(x, z));
            for (let d = 0; d < 4; ++d) {
                const nex = position.clone().add(DIRECTIONS[d]);
                const nei = cells.get(coords(nex.x, nex.z));
                if (nei) nei.faceWalls[OPPOSITE(d)] = 1;
            }
        } else {
            const cell = force_cell(cells, new THREE.Vector3(x, z));
            set_room(cell, savedRoom);
            for (let d = 0; d < 4; ++d) {
                const nex = position.clone().add(DIRECTIONS[d]);
                const nei = cells.get(coords(nex.x, nex.z));
                if (nei) {
                    cell.faceWalls[d] = 0;
                    nei.faceWalls[OPPOSITE(d)] = 0;
                }
            }
        }

        regenerate();
    }

    function make_grid_controls(cols, rows) {
        const controls = html("fieldset", { class: "editor" });
        Object.assign(controls.style, {
            "grid-template-columns": `repeat(${cols}, 1fr)`,
            "grid-template-rows": `repeat(${rows}, 1fr)`,
        });
        return controls;
    }

    const moveControls = make_grid_controls();
    const editControls = make_grid_controls();
    const carveControls = make_grid_controls();
    const fillControls = make_grid_controls();
    const wallControls = make_grid_controls();
    const charControls = make_grid_controls();
    const dialogueControls = make_grid_controls();
    const fileControls = make_grid_controls();
    const fastControls = make_grid_controls();

    let prevControls;

    SET_CONTROLS(moveControls);

    function SET_CONTROLS(controls) {
        prevControls = activeControls;
        activeControls.remove();
        activeControls = controls;
        main.append(activeControls);
    }

    function switch_to_move() {
        SET_CONTROLS(moveControls);

        if (IS_OVERHEAD())
            toggle_camera();
    }

    function switch_to_edit() {
        SET_CONTROLS(editControls);
    }

    function switch_to_carve() {
        SET_CONTROLS(carveControls);
    }

    function switch_to_fill() {
        SET_CONTROLS(fillControls);
    }

    function switch_to_wall() {
        SET_CONTROLS(wallControls);
    }

    function switch_to_char() {
        SET_CONTROLS(charControls);
    }

    function switch_to_file() {
        SET_CONTROLS(fileControls);
    }

    function switch_to_fast_controls() {
        SET_CONTROLS(fastControls);
    }

    function switch_to_dialogue() {
        const char = GET_CHAR(GET_POS(), DIRECTION);
        if (char) { 
            SET_CONTROLS(dialogueControls);
            textEdit.value = char.dialogue.join("\n\n");
        }
    }

    function add_button(controls, label, callback=()=>{}) {
        const button = document.createElement("button");
        button.textContent = label;
        button.addEventListener("click", callback);
        button.classList.add("ui-border");
        controls.append(button);
        return button;
    }

    function add_quick_button(controls) {
        const button = add_button(controls, "💡", switch_to_fast_controls);
        button.style.gridColumn = "2 / 3";
        button.style.gridRow = "2 / 3";
        return button;
    }

    add_button(fastControls, "💾");
    add_button(fastControls, "↩️");
    add_button(fastControls, "↪️");
    add_button(fastControls, "👁️", toggle_camera);
    add_button(fastControls, "🔙", () => SET_CONTROLS(prevControls));

    add_quick_button(editControls);
    add_button(editControls, "🧭🔙", switch_to_move);
    add_button(editControls, "➡️⛏️", switch_to_carve);
    add_button(editControls, "➡️💣", switch_to_fill);
    add_button(editControls, "➡️🧱", switch_to_wall);
    add_button(editControls, "➡️👻", switch_to_char);
    add_button(editControls, "➡️🗄️", switch_to_file);

    function add_basic_movement(controls) {
        const tleft  = add_button(controls, "↪️");
        const mahead = add_button(controls, "⬆️");
        const tright = add_button(controls, "↩️");

        bindButtonToKey(tleft, "TURN_LEFT");
        bindButtonToKey(mahead, "MOVE_AHEAD");
        bindButtonToKey(tright, "TURN_RIGHT");

        return [tleft, mahead, tright];
    }

    function IS_CARVING() {
        return activeControls === carveControls;
    }

    add_basic_movement(carveControls);
    add_quick_button(carveControls);
    add_button(carveControls, "🧭🔙", switch_to_move);
    add_button(carveControls, "🖼️🔁", cycle_room);
    add_button(carveControls, "➡️📋", copy_room)
    add_button(carveControls, "📋➡️", paste_room);

    add_quick_button(fillControls);
    add_button(fillControls, "🧭🔙", switch_to_move);

    add_basic_movement(wallControls); 
    add_quick_button(wallControls);
    add_button(wallControls, "🧭🔙", switch_to_move);
    add_button(wallControls, "🧱⁉️", toggle_wall);
    add_button(wallControls, "🖼️🔁", cycle_wall);
    add_button(wallControls, "📋", paste_wall);

    add_basic_movement(charControls); 
    add_quick_button(charControls);
    add_button(charControls, "🧭🔙", switch_to_move);
    add_button(charControls, "👻⁉️", toggle_char);
    add_button(charControls, "🖼️🔁", cycle_char);
    add_button(charControls, "➡️💬", switch_to_dialogue);

    add_button(fileControls, "🧭🔙", switch_to_move);
    add_button(fileControls, "📥🧱");
    add_button(fileControls, "📥👻");
    add_button(fileControls, "📤📦");


    add_button(dialogueControls, "👻🔙", switch_to_char);
    const textEdit = html("textarea", { class: "ui-dialogue ui-border", id: "dialogue-edit" }, "test");
    textEdit.style.gridColumn = "1 / 4";
    textEdit.style.gridRow = "2 / 4";
    dialogueControls.append(textEdit);

    textEdit.addEventListener("input", () => {
        const char = GET_CHAR(GET_POS(), DIRECTION);
        if (!char) {
            switch_to_edit();
        } else {
            char.dialogue = textEdit.value.split("\n\n");
        }
    });

    const [tleft, mahead, tright] = add_basic_movement(moveControls);
    const mleft = add_button(moveControls, "⬅️");
    add_button(moveControls, "🛠️", switch_to_edit);
    const mright = add_button(moveControls, "➡️");
    add_button(moveControls, "").style.visibility = "hidden";
    const mback = add_button(moveControls, "⬇️");

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

    function resize() {
        // const parent = renderer.domElement.parentElement;
        const rect = viewport.getBoundingClientRect();
        let { left, top, width, height } = rect;

        left = Math.ceil(left)+2;
        top = Math.ceil(top)+2;
        width = Math.floor(width)-2;
        height = Math.floor(height)-2;

        renderer.setSize(width, height, true);
        renderer.setPixelRatio(1);
        Object.assign(renderer.domElement.style, {
            "left": `${left}px`,
            "top": `${top}px`,
        });

        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        Object.assign(camera2, {
            left: 0, 
            bottom: 0, 
            top: height,
            right: width,
        });
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
            const dir = ADD_DIRS(d, DIRECTION);
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

        UPDATE_CAMERA();

        renderer.render(scene, camera);
    }

    function IS_MOVING() {
        return CURRENT_MOVE.u < 1;
    }

    function CAN_MOVE() {
        return !IS_IN_DIALOGUE() && !IS_MOVING(); 
    }

    function UPDATE_CAMERA() {
        const u = easeInOutSine(CURRENT_MOVE.u);

        delta.subVectors(CURRENT_MOVE.b, CURRENT_MOVE.a);

        camFixture.position.copy(CURRENT_MOVE.a);
        camFixture.position.addScaledVector(delta, u);

        quata.slerpQuaternions(CURRENT_MOVE.ar, CURRENT_MOVE.br, u);
        camFixture.rotation.setFromQuaternion(quata);

        camFixture.updateMatrixWorld();
        camera.updateMatrixWorld();
    }

    function SKIP_MOVE() {
        CURRENT_MOVE.a.copy(CURRENT_MOVE.b);
        CURRENT_MOVE.ar.copy(CURRENT_MOVE.br);
        CURRENT_MOVE.u = 1;
    }

    function START_MOVE() {
        CURRENT_MOVE.u = 0;
    }

    function SET_SRC(position, d=undefined) {
        d = d ?? DIRECTION;
        CURRENT_MOVE.a.copy(position).round();
        CURRENT_MOVE.ar.copy(ROTATIONS[d]);
    }

    function SET_DST(position, d=undefined) {
        d = d ?? DIRECTION;
        CURRENT_MOVE.b.copy(position).round();
        CURRENT_MOVE.br.copy(ROTATIONS[d]);

        DIRECTION = d;
    }

    function GET_POS() {
        return CURRENT_MOVE.b.clone().round();
    }

    function SET_POS(position, d=undefined) {
        SET_DST(position, d);
        SKIP_MOVE();
    }

    function rotate(sign) {
        if (!CAN_MOVE())
            return;

        SKIP_MOVE();
        SET_DST(GET_POS(), ADD_DIRS(DIRECTION, sign));
        START_MOVE();
    }

    function is_passable(x, z, direction) {
        const cell = cells.get(coords(x, z));
        return IS_CARVING() 
            || cell == undefined 
            || cell.faceWalls[direction] == 0;
    }

    function GET_CHAR(position, direction) {
        return chars.get(coords(position.x, position.z, direction));
    }

    function get_char(x, z, direction) {
        return chars.get(coords(x, z, direction));
    }

    function move(direction) {
        if (!CAN_MOVE())
            return;

        const { x, z } = GET_POS();

        if (!is_passable(x, z, direction) && direction !== DIRECTION) {
            if (ADD_DIRS(DIRECTION, 1) == direction)
                rotate(1)
            else if (ADD_DIRS(DIRECTION, -1) == direction)
                rotate(-1)
            else
                rotate(2)

            MOVE_QUEUED = true;

            return;
        }

        const char = get_char(x, z, direction);
        if (char && !IS_CARVING()) {
            INTERACT_CHAR(char);
        } else if (is_passable(x, z, direction)) {
            SKIP_MOVE();

            if (IS_CARVING()) {
                CARVE_PATH(GET_POS(), direction);
                regenerate();
            }

            SET_DST(GET_POS().add(DIRECTIONS[direction]).round());
            START_MOVE();
        }
    }

    heldActions.set("ArrowLeft",  () => rotate( 1));
    heldActions.set("ArrowRight", () => rotate(-1));
    heldActions.set("ArrowUp",    () => move(DIRECTION));
    heldActions.set("ArrowDown",  () => move(OPPOSITE(DIRECTION)));

    heldActions.set("q", () => rotate( 1));
    heldActions.set("e", () => rotate(-1));
    heldActions.set("w", () => move(ADD_DIRS(DIRECTION, 0)));
    heldActions.set("d", () => move(ADD_DIRS(DIRECTION, 3)));
    heldActions.set("s", () => move(ADD_DIRS(DIRECTION, 2)));
    heldActions.set("a", () => move(ADD_DIRS(DIRECTION, 1)));

    heldActions.set("TURN_LEFT",  () => rotate( 1));
    heldActions.set("TURN_RIGHT", () => rotate(-1));
    heldActions.set("MOVE_AHEAD", () => move(ADD_DIRS(DIRECTION, 0)));
    heldActions.set("MOVE_RIGHT", () => move(ADD_DIRS(DIRECTION, 3)));
    heldActions.set("MOVE_BACK",  () => move(ADD_DIRS(DIRECTION, 2)));
    heldActions.set("MOVE_LEFT",  () => move(ADD_DIRS(DIRECTION, 1)));

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

/**
 * @param {SMTCellData} cell 
 * @returns {THREE.BufferGeometry}
 */
function generateCellGeometry(cell, color) {
    const geometry = new THREE.BufferGeometry();

    const positions = [];
    const colors = [];
    const uvs = [];
    const tiles = [];
    const normals = [];
    const indexes = [];

    for (let i = 0; i < 4; ++i) {
        addFace(ROTATIONS[i], color, cell.faceTiles[i] * cell.faceWalls[i]);
    }

    const quat = new THREE.Quaternion();
    quat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI *  .5);
    addFace(quat, color, cell.faceTiles[4] * cell.faceWalls[4]);
    quat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI * -.5);
    addFace(quat, color, cell.faceTiles[5] * cell.faceWalls[5]);

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

class TextureArrayManager {
    /**
     * @param {number} width 
     * @param {number} height
     * @param {number} limit 
     */
    constructor(width, height, limit) {
        this.width = width;
        this.height = height;

        this.next = 1;
        this.limit = limit;
        
        const stride = 4 * width * height;

        /** @type {Map<unknown, number[]>} */
        this.groups = new Map();

        this.data = new Uint8Array(stride * limit);

        this.array = new THREE.DataArrayTexture(this.data, width, height, limit);
        this.array.colorSpace = THREE.SRGBColorSpace;
        this.array.format = THREE.RGBAFormat;
        this.array.type = THREE.UnsignedByteType;
        this.array.minFilter = THREE.NearestFilter;
        this.array.magFilter = THREE.NearestFilter;
        this.array.wrapS = THREE.ClampToEdgeWrapping;
        this.array.wrapT = THREE.ClampToEdgeWrapping;
        this.array.unpackAlignment = 4; //more efficient for RGBAFormat
        this.array.generateMipmaps = false;
    }

    /**
     * @param {HTMLImageElement} image 
     * @param {unknown} group 
     */
    addImage(image, group) {
        const indexes = this.groups.get(group) ?? [];
        this.groups.set(group, indexes);

        const xcount = Math.floor(image.width / this.width);
        const ycount = Math.floor(image.height / this.height);

        const canvas = new OffscreenCanvas(image.width, image.height);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.scale(1, -1);
        context.drawImage(image, 0, -image.height);

        const stride = 4 * this.width * this.height;

        for (let y = 0; y < ycount; ++y) {
            for (let x = 0; x < xcount; ++x) {
                const imagedata = context.getImageData(
                    x * this.width, 
                    y * this.height, 
                    this.width, 
                    this.height
                );

                const index = this.next;
                this.data.set(imagedata.data, index * stride);
                this.next += 1;

                indexes.push(index);
            }
        }

        this.array.needsUpdate = true;
    }
}
