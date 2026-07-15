// ==========================================
// mapGenerator.js
// 地形データの解析とBufferGeometryメッシュの生成
// ★幅広の坂道の両端が欠けるバグを完全に修正（主斜面判定の導入）
// ★Zファイティング（縞々模様）の原因だった DoubleSide を削除し綺麗な描画に復元
// ★【追加】奇数ブロックが連続した際、距離に応じてなだらかな坂道を形成する機能
// ==========================================

window.MapGenerator = {
    rawMapData: [],

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
                // 段差が1.0以内のものを繋ぎ先として探す
                if (diff < minDiff && diff <= 1.0) {
                    minDiff = diff;
                    closestTop = l.top;
                }
            }
            return closestTop;
        };

        const getPull = (h) => {
            let diff = h - myTop;
            if (diff >= 0.25 && diff <= 0.75) return 0.5;
            if (diff <= -0.25 && diff >= -0.75) return -0.5;
            return 0;
        };

        // ★追加: 特定の軸（XまたはZ）に対して、連続する奇数ブロックを探索し仮想的な勾配を計算する
        const getAxisData = (dx, dz) => {
            let dist_p = 1;
            let cx_p = cx + dx;
            let cz_p = cz + dz;
            let h_p = myTop;
            
            while (cx_p >= 0 && cx_p < mapW && cz_p >= 0 && cz_p < mapD) {
                let layers = parsedMap[cx_p][cz_p];
                let foundSameOdd = false;
                for (let l of layers) {
                    if (l.top === myTop && l.isOdd) {
                        foundSameOdd = true;
                        break;
                    }
                }
                if (foundSameOdd) {
                    dist_p++;
                    cx_p += dx;
                    cz_p += dz;
                } else {
                    h_p = getHeight(cx_p, cz_p);
                    break;
                }
            }

            let dist_m = 1;
            let cx_m = cx - dx;
            let cz_m = cz - dz;
            let h_m = myTop;
            
            while (cx_m >= 0 && cx_m < mapW && cz_m >= 0 && cz_m < mapD) {
                let layers = parsedMap[cx_m][cz_m];
                let foundSameOdd = false;
                for (let l of layers) {
                    if (l.top === myTop && l.isOdd) {
                        foundSameOdd = true;
                        break;
                    }
                }
                if (foundSameOdd) {
                    dist_m++;
                    cx_m -= dx;
                    cz_m -= dz;
                } else {
                    h_m = getHeight(cx_m, cz_m);
                    break;
                }
            }

            let target_p = myTop + getPull(h_p);
            let target_m = myTop + getPull(h_m);

            let L = dist_p + dist_m - 1;
            let grad = (target_p - target_m) / L;
            let center_offset = (target_m + grad * (dist_m - 0.5)) - myTop;
            let pull_p = grad * 0.5;
            let pull_m = -grad * 0.5;

            let isThrough = (target_p !== myTop && target_m !== myTop && target_p !== target_m);

            return { pull_p, pull_m, center_offset, isThrough, target_p, target_m };
        };

        let axisX = getAxisData(1, 0);
        let axisZ = getAxisData(0, 1);

        let pull_pX = axisX.pull_p;
        let pull_mX = axisX.pull_m;
        let pull_pZ = axisZ.pull_p;
        let pull_mZ = axisZ.pull_m;

        let isThroughX = axisX.isThrough;
        let isThroughZ = axisZ.isThrough;

        // ★主斜面判定: 貫通スロープが一方にだけ存在する場合は、もう一方の崖干渉を無効化する
        if (isThroughX && !isThroughZ) {
            pull_pZ = 0;
            pull_mZ = 0;
            axisZ.center_offset = 0;
        } else if (isThroughZ && !isThroughX) {
            pull_pX = 0;
            pull_mX = 0;
            axisX.center_offset = 0;
        } else if (!isThroughX && !isThroughZ) {
            let isFlatX = (axisX.target_p === myTop || axisX.target_m === myTop);
            let isFlatZ = (axisZ.target_p === myTop || axisZ.target_m === myTop);
            
            if (isFlatX && !isFlatZ) {
                pull_pX = 0;
                pull_mX = 0;
                axisX.center_offset = 0;
            } else if (isFlatZ && !isFlatX) {
                pull_pZ = 0;
                pull_mZ = 0;
                axisZ.center_offset = 0;
            }
        }

        let final_center = myTop + axisX.center_offset + axisZ.center_offset;

        let c_pXpZ = final_center + pull_pX + pull_pZ;
        let c_mXpZ = final_center + pull_mX + pull_pZ;
        let c_pXmZ = final_center + pull_pX + pull_mZ;
        let c_mXmZ = final_center + pull_mX + pull_mZ;

        let h_pXpZ = getHeight(cx + 1, cz + 1);
        let h_mXpZ = getHeight(cx - 1, cz + 1);
        let h_pXmZ = getHeight(cx + 1, cz - 1);
        let h_mXmZ = getHeight(cx - 1, cz - 1);

        // まだ傾斜がついていない角のみ、斜め方向のマスを参照して角を落とす/上げる
        if (getPull(h_pXpZ) > 0 && c_pXpZ === final_center) c_pXpZ += 0.5;
        if (getPull(h_pXpZ) < 0 && c_pXpZ === final_center) c_pXpZ -= 0.5;
        if (getPull(h_mXpZ) > 0 && c_mXpZ === final_center) c_mXpZ += 0.5;
        if (getPull(h_mXpZ) < 0 && c_mXpZ === final_center) c_mXpZ -= 0.5;
        if (getPull(h_pXmZ) > 0 && c_pXmZ === final_center) c_pXmZ += 0.5;
        if (getPull(h_pXmZ) < 0 && c_pXmZ === final_center) c_pXmZ -= 0.5;
        if (getPull(h_mXmZ) > 0 && c_mXmZ === final_center) c_mXmZ += 0.5;
        if (getPull(h_mXmZ) < 0 && c_mXmZ === final_center) c_mXmZ -= 0.5;

        return { pXpZ: c_pXpZ, mXpZ: c_mXpZ, pXmZ: c_pXmZ, mXmZ: c_mXmZ, center: final_center };
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


