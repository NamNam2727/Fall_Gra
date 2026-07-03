// ==========================================
// mapGenerator.js
// 地形データの解析とBufferGeometryメッシュの生成
// ★まっすぐな坂道が三角に削られるバグを修正
// ★Zファイティング（縞々模様）の原因だった DoubleSide を削除し、綺麗な描画に復元
// ==========================================

window.MapGenerator = {
    rawMapData: [
        ["4","4","4","4","4","4","4","4","4","4","4"],
        ["4","2","2","2","2","2","2","2","2","2","4"],
        ["4","2","224","224","224","224","224","2","2","2","4"],
        ["4","2","2","2","3","2","2","2","2","2","4"],
        ["4","2","2","3","4","3","2","2","2","2","4"],
        ["4","2","2","2","3","2","2","3","3","3","4"],
        ["4","2","2","2","2","2","2","3","2","3","4"],
        ["4","2","2","2","2","2","2","3","3","3","4"],
        ["4","4","4","4","4","4","4","4","4","4","4"]
    ],

    parseMap: function() {
        const mapW = this.rawMapData.length;
        const mapD = this.rawMapData[0].length;
        const parsedMap = [];

        for (let x = 0; x < mapW; x++) {
            parsedMap[x] = [];
            for (let z = 0; z < mapD; z++) {
                let str = this.rawMapData[x][z] || "0";
                let layers = [];
                let currentY = 0;
                let isSolid = true; 
                
                for (let i = str.length - 1; i >= 0; i--) {
                    let val = parseInt(str[i], 10);
                    let height = val * 0.5; 
                    
                    if (isSolid && val > 0) {
                        layers.push({
                            bottom: currentY,
                            top: currentY + height,
                            val: val,
                            isOdd: val % 2 !== 0 
                        });
                    }
                    currentY += height;
                    isSolid = !isSolid;
                }
                parsedMap[x][z] = layers;
            }
        }
        return { parsedMap, mapW, mapD };
    },

    getCornerHeights: function(parsedMap, mapW, mapD, cx, cz, myTop) {
        const getHeight = (nx, nz) => {
            if (nx < 0 || nx >= mapW || nz < 0 || nz >= mapD) return myTop;
            let layers = parsedMap[nx][nz];
            let closestTop = myTop;
            let minDiff = Infinity;
            for(let l of layers) {
                let diff = Math.abs(l.top - myTop);
                if (diff < minDiff && diff <= 1.0) {
                    minDiff = diff;
                    closestTop = l.top;
                }
            }
            return closestTop;
        };

        let h_pX = getHeight(cx + 1, cz);
        let h_mX = getHeight(cx - 1, cz);
        let h_pZ = getHeight(cx, cz + 1);
        let h_mZ = getHeight(cx, cz - 1);
        
        let h_pXpZ = getHeight(cx + 1, cz + 1);
        let h_mXpZ = getHeight(cx - 1, cz + 1);
        let h_pXmZ = getHeight(cx + 1, cz - 1);
        let h_mXmZ = getHeight(cx - 1, cz - 1);

        let pull_pX = (h_pX > myTop) ? 0.5 : ((h_pX < myTop) ? -0.5 : 0);
        let pull_mX = (h_mX > myTop) ? 0.5 : ((h_mX < myTop) ? -0.5 : 0);
        let pull_pZ = (h_pZ > myTop) ? 0.5 : ((h_pZ < myTop) ? -0.5 : 0);
        let pull_mZ = (h_mZ > myTop) ? 0.5 : ((h_mZ < myTop) ? -0.5 : 0);

        // 階段の開始・終了をなめらかにする補完
        if (pull_pX > 0 && pull_mX === 0) pull_mX = -0.5;
        if (pull_mX > 0 && pull_pX === 0) pull_pX = -0.5;
        if (pull_pZ > 0 && pull_mZ === 0) pull_mZ = -0.5;
        if (pull_mZ > 0 && pull_pZ === 0) pull_pZ = -0.5;

        if (pull_pX < 0 && pull_mX === 0) pull_mX = 0.5;
        if (pull_mX < 0 && pull_pX === 0) pull_pX = 0.5;
        if (pull_pZ < 0 && pull_mZ === 0) pull_mZ = 0.5;
        if (pull_mZ < 0 && pull_pZ === 0) pull_pZ = 0.5;

        // まっすぐなスロープの判定と横からの干渉無効化
        let isSlopeX = (pull_pX === 0.5 && pull_mX === -0.5) || (pull_pX === -0.5 && pull_mX === 0.5);
        let isSlopeZ = (pull_pZ === 0.5 && pull_mZ === -0.5) || (pull_pZ === -0.5 && pull_mZ === 0.5);

        if (isSlopeX && !isSlopeZ) {
            pull_pZ = 0;
            pull_mZ = 0;
        } else if (isSlopeZ && !isSlopeX) {
            pull_pX = 0;
            pull_mX = 0;
        }

        const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

        let c_pXpZ = myTop + clamp(pull_pX + pull_pZ, -0.5, 0.5);
        let c_mXpZ = myTop + clamp(pull_mX + pull_pZ, -0.5, 0.5);
        let c_pXmZ = myTop + clamp(pull_pX + pull_mZ, -0.5, 0.5);
        let c_mXmZ = myTop + clamp(pull_mX + pull_mZ, -0.5, 0.5);

        // まだ傾斜がついていない角のみ、斜め方向のマスを参照して角を落とす/上げる
        if (h_pXpZ > myTop && c_pXpZ === myTop) c_pXpZ = myTop + 0.5;
        if (h_pXpZ < myTop && c_pXpZ === myTop) c_pXpZ = myTop - 0.5;
        if (h_mXpZ > myTop && c_mXpZ === myTop) c_mXpZ = myTop + 0.5;
        if (h_mXpZ < myTop && c_mXpZ === myTop) c_mXpZ = myTop - 0.5;
        if (h_pXmZ > myTop && c_pXmZ === myTop) c_pXmZ = myTop + 0.5;
        if (h_pXmZ < myTop && c_pXmZ === myTop) c_pXmZ = myTop - 0.5;
        if (h_mXmZ > myTop && c_mXmZ === myTop) c_mXmZ = myTop + 0.5;
        if (h_mXmZ < myTop && c_mXmZ === myTop) c_mXmZ = myTop - 0.5;

        return { pXpZ: c_pXpZ, mXpZ: c_mXpZ, pXmZ: c_pXmZ, mXmZ: c_mXmZ, center: myTop };
    },

    createMesh: function() {
        const { parsedMap, mapW, mapD } = this.parseMap();
        
        const vertices = [];
        const normals = [];
        const colors = [];

        const colorOdd = new THREE.Color(0x81C784); 
        const colorEven1 = new THREE.Color(0x4CAF50);
        const colorEven2 = new THREE.Color(0x388E3C);

        const addFace = (v0, v1, v2, color) => {
            vertices.push(...v0, ...v1, ...v2);
            const vec1 = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
            const vec2 = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
            const nx = vec1[1]*vec2[2] - vec1[2]*vec2[1];
            const ny = vec1[2]*vec2[0] - vec1[0]*vec2[2];
            const nz = vec1[0]*vec2[1] - vec1[1]*vec2[0];
            const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
            const n = [nx/len, ny/len, nz/len];
            normals.push(...n, ...n, ...n);
            colors.push(color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b);
        };

        const addQuad = (v0, v1, v2, v3, color) => {
            addFace(v0, v1, v2, color);
            addFace(v0, v2, v3, color);
        };

        for (let x = 0; x < mapW; x++) {
            for (let z = 0; z < mapD; z++) {
                let layers = parsedMap[x][z];
                let px = x - mapW / 2 + 0.5;
                let pz = z - mapD / 2 + 0.5;
                let isChecker = (x + z) % 2 === 0;

                for (let l of layers) {
                    let col = l.isOdd ? colorOdd : (isChecker ? colorEven1 : colorEven2);
                    let yB = l.bottom;
                    let yT = l.top;
                    
                    let c_pXpZ = yT, c_mXpZ = yT, c_pXmZ = yT, c_mXmZ = yT, c_center = yT;

                    if (l.isOdd) {
                        let corners = this.getCornerHeights(parsedMap, mapW, mapD, x, z, yT);
                        c_pXpZ = corners.pXpZ; c_mXpZ = corners.mXpZ; 
                        c_pXmZ = corners.pXmZ; c_mXmZ = corners.mXmZ; 
                        c_center = corners.center;
                    }

                    const v_mXmZ = [px - 0.5, c_mXmZ, pz - 0.5];
                    const v_pXmZ = [px + 0.5, c_pXmZ, pz - 0.5];
                    const v_pXpZ = [px + 0.5, c_pXpZ, pz + 0.5];
                    const v_mXpZ = [px - 0.5, c_mXpZ, pz + 0.5];
                    const v_center = [px, c_center, pz];
                    
                    const b_mXmZ = [px - 0.5, yB, pz - 0.5];
                    const b_pXmZ = [px + 0.5, yB, pz - 0.5];
                    const b_pXpZ = [px + 0.5, yB, pz + 0.5];
                    const b_mXpZ = [px - 0.5, yB, pz + 0.5];

                    // 【上面】
                    if (l.isOdd) {
                        addFace(v_mXmZ, v_center, v_pXmZ, col);
                        addFace(v_pXmZ, v_center, v_pXpZ, col);
                        addFace(v_pXpZ, v_center, v_mXpZ, col);
                        addFace(v_mXpZ, v_center, v_mXmZ, col);
                    } else {
                        addQuad(v_mXmZ, v_mXpZ, v_pXpZ, v_pXmZ, col);
                    }

                    // 【底面】
                    addQuad(b_mXmZ, b_pXmZ, b_pXpZ, b_mXpZ, col);

                    const checkHidden = (nx, nz, myTopCorner1, myTopCorner2) => {
                        if (nx < 0 || nx >= mapW || nz < 0 || nz >= mapD) return false;
                        for(let nl of parsedMap[nx][nz]) {
                            if (!nl.isOdd && nl.bottom <= yB && nl.top >= Math.max(myTopCorner1, myTopCorner2)) {
                                return true;
                            }
                        }
                        return false;
                    };

                    // 【側面】
                    if (!checkHidden(x, z+1, c_mXpZ, c_pXpZ)) addQuad(b_pXpZ, v_pXpZ, v_mXpZ, b_mXpZ, col); 
                    if (!checkHidden(x, z-1, c_mXmZ, c_pXmZ)) addQuad(b_mXmZ, v_mXmZ, v_pXmZ, b_pXmZ, col); 
                    if (!checkHidden(x+1, z, c_pXmZ, c_pXpZ)) addQuad(b_pXmZ, v_pXmZ, v_pXpZ, b_pXpZ, col); 
                    if (!checkHidden(x-1, z, c_mXmZ, c_mXpZ)) addQuad(b_mXpZ, v_mXpZ, v_mXmZ, b_mXmZ, col); 
                }
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        // ★Zファイティングの元凶であった side: THREE.DoubleSide を削除し、元の綺麗な描画に戻します
        const material = new THREE.MeshStandardMaterial({ 
            vertexColors: true, 
            roughness: 0.8
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        const bs = typeof blockSize !== 'undefined' ? blockSize : 10;
        mesh.scale.set(bs, bs, bs);
        
        mesh.userData.isTerrain = true;
        
        return mesh;
    }
};

