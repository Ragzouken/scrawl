"use strict";

import * as THREE from "three";

export default async function tilesetToTextureArray(image, width, height) {
    const xcount = Math.floor(image.width / width);
    const ycount = Math.floor(image.height / height);

    const count = xcount * ycount;
    const size = 4 * width * height;
    const data = new Uint8Array(count * size);
      
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.scale(1, -1);
    context.drawImage(image, 0, -image.height);

    console.log(count)

    for (let y = 0; y < ycount; ++y) {
        for (let x = 0; x < xcount; ++x) {
            const imagedata = context.getImageData(x * width, y * height, width, height);
            const tile = y * xcount + x;
            data.set(imagedata.data, tile * size);
        }
    }

    const array = new THREE.DataArrayTexture(data, width, height, count);
    array.image.data = data;
    array.colorSpace = THREE.SRGBColorSpace;
    array.format = THREE.RGBAFormat;
    array.type = THREE.UnsignedByteType;
    array.minFilter = THREE.NearestFilter;
    array.magFilter = THREE.NearestFilter;
    array.wrapS = THREE.ClampToEdgeWrapping;
    array.wrapT = THREE.ClampToEdgeWrapping;
    array.unpackAlignment = 4; //more efficient for RGBAFormat
    array.generateMipmaps = false;
    array.needsUpdate = true;

    return array;
}
