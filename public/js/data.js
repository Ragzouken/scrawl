/** @typedef {number[]} Position */

/**
 * @typedef {Object} SMTCellData
 * @property {Position} position
 * @property {number[]} faceTiles
 * @property {number[]} faceWalls
 */

/**
 * @typedef {Object} SMTCharData
 * @property {Position} position
 * @property {number} direction
 * @property {number} faceTile
 * @property {string[]} dialogue
 */

/**
 * @typedef {Object} SMTSceneData
 * @property {SMTCellData[]} cells
 * @property {SMTCharData[]} chars
 */
