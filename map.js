// =====================================
// map.js
// マップの生成と当たり判定
// =====================================

function generateMap() {
    for (let i = 0; i < gridW; i++) {
        mapData[i] = [];
        for (let j = 0; j < gridD; j++) {
            let x = i - gridW/2, z = j - gridD/2, h = 0;
            if (Math.abs(x) < 3 && Math.abs(z) < 3) h = 0;
            else if (x >= 4 && x <= 12 && z >= 4 && z <= 12) h = Math.min(x - 4, 12 - x, z - 4, 12 - z);
            else if (x <= -4 && x >= -12 && z >= 4 && z <= 12) {
                h = (Math.sin(x*5) + Math.cos(z*5)) > 0 ? 1 : 0;
                if(Math.abs(x)===8 && Math.abs(z)===8) h = 2;
            } else if (z <= -6 && z >= -8 && Math.abs(x) < 10) h = 2;
            else if (Math.random() < 0.1) h = 1;
            mapData[i][j] = h * blockSize;
        }
    }
}

// プレイヤーの円形とブロックの交差判定
function getIntersectingCells(px, pz, radius) {
    const cells = [];
    const r = radius * 0.85; 
    
    const minCol = Math.floor((px - r + (gridW * blockSize) / 2) / blockSize);
    const maxCol = Math.floor((px + r + (gridW * blockSize) / 2) / blockSize);
    const minRow = Math.floor((pz - r + (gridD * blockSize) / 2) / blockSize);
    const maxRow = Math.floor((pz + r + (gridD * blockSize) / 2) / blockSize);

    for (let col = minCol; col <= maxCol; col++) {
        for (let row = minRow; row <= maxRow; row++) {
            if (col < 0 || col >= gridW || row < 0 || row >= gridD) {
                cells.push({ h: -100, isWall: true }); 
                continue;
            }
            const cellMinX = (col - gridW/2) * blockSize;
            const cellMaxX = cellMinX + blockSize;
            const cellMinZ = (row - gridD/2) * blockSize;
            const cellMaxZ = cellMinZ + blockSize;

            const closestX = Math.max(cellMinX, Math.min(px, cellMaxX));
            const closestZ = Math.max(cellMinZ, Math.min(pz, cellMaxZ));

            const dx = px - closestX;
            const dz = pz - closestZ;
            if ((dx * dx + dz * dz) < (r * r)) {
                cells.push({ h: mapData[col][row], col: col, row: row });
            }
        }
    }
    return cells;
}
