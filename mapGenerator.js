// ==========================================
// mapGenerator.js
// 地形データの解析とBufferGeometryメッシュの生成
// ★ 連続する坂道(奇数ブロック)を検出し、なだらかに延長・接続するロジックを実装
// ★ 幅広の坂道の両端が欠けるバグを完全に修正（主斜面判定の導入）
// ★ Zファイティング（縞々模様）の原因だった DoubleSide を削除し綺麗な描画に復元
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

    // 連続するスロープをたどり、終端の偶数ブロック（平地・壁）の高さと距離を取得
    getSlopeEnd: function(map, mapW, mapD, startX, startZ, dx, dz, currentY) {
        let dist = 1;
        let cx = startX + dx;
        let cz = startZ + dz;
        let trackY = currentY;
        
        while (cx >= 0 && cx < mapW && cz >= 0 && cz < mapD) {
            let layers = map[cx][cz];
            if (!layers || layers.length === 0) {
                return { y: trackY, dist: dist }; // 穴（落下地点）
            }
            
            // 現在のYに最も近いレイヤーを探す（多層構造対応）
            let closestLayer = layers[0];
            let minDiff = 9999;
            for (let l of layers) {
                let diff = Math.abs(l.top - trackY);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestLayer = l;
                }
            }
            
            if (!closestLayer.isOdd) {
                // 偶数ブロック（平地・壁）に到達
                return { y: closestLayer.top, dist: dist };
            }
            
            // 極端な段差(2.0以上)がある場合はスロープが切れているとみなす
            if (minDiff > 2.0) {
                return { y: trackY, dist: dist }; 
            }
            
            trackY = closestLayer.top;
            dist++;
            cx += dx;
            cz += dz;
        }
        return { y: trackY, dist: dist }; // マップ端
    },

    getCornerHeights: function(map, mapW, mapD, x, z, y) {
        // X軸方向の探索
        let end_pX = this.getSlopeEnd(map, mapW, mapD, x, z, 1, 0, y);
        let end_mX = this.getSlopeEnd(map, mapW, mapD, x, z, -1, 0, y);
        
        // Z軸方向の探索
        let end_pZ = this.getSlopeEnd(map, mapW, mapD, x, z, 0, 1, y);
        let end_mZ = this.getSlopeEnd(map, mapW, mapD, x, z, 0, -1, y);
        
        // 勾配を計算 (L = 距離の合計 - 1)
        let lenX = end_pX.dist + end_mX.dist - 1;
        let diffX = Math.abs(end_pX.y - end_mX.y);
        let gradX = lenX > 0 ? diffX / lenX : 0;
        
        let lenZ = end_pZ.dist + end_mZ.dist - 1;
        let diffZ = Math.abs(end_pZ.y - end_mZ.y);
        let gradZ = lenZ > 0 ? diffZ / lenZ : 0;
        
        let c_mXmZ = y, c_pXmZ = y, c_mXpZ = y, c_pXpZ = y, c_center = y;
        
        // なだらかな線形補間（Lerp）
        const calcLerp = (H_m, H_p, dist_mX, L, offset) => {
            if (L <= 0) return H_m;
            return H_m + (H_p - H_m) * (dist_mX - 0.5 + offset) / L;
        };

        // 主斜面判定 (XとZで勾配の急な方を優先し、斜めの歪みを防ぐ)
        if (gradX > 0.001 || gradZ > 0.001) {
            if (gradX >= gradZ) {
                let H_m = end_mX.y;
                let H_p = end_pX.y;
                let d_m = end_mX.dist;
                let L = lenX;
                c_mXmZ = calcLerp(H_m, H_p, d_m, L, -0.5);
                c_mXpZ = c_mXmZ;
                c_pXmZ = calcLerp(H_m, H_p, d_m, L, 0.5);
                c_pXpZ = c_pXmZ;
                c_center = calcLerp(H_m, H_p, d_m, L, 0);
            } else {
                let H_m = end_mZ.y;
                let H_p = end_pZ.y;
                let d_m = end_mZ.dist;
                let L = lenZ;
                c_mXmZ = calcLerp(H_m, H_p, d_m, L, -0.5);
                c_pXmZ = c_mXmZ;
                c_mXpZ = calcLerp(H_m, H_p, d_m, L, 0.5);
                c_pXpZ = c_mXpZ;
                c_center = calcLerp(H_m, H_p, d_m, L, 0);
            }
        }
        
        return {
            mXmZ: c_mXmZ, pXmZ: c_pXmZ, mXpZ: c_mXpZ, pXpZ: c_pXpZ, center: c_center
        };
    },

    createMesh: function() {
        const { parsedMap, mapW, mapD } = this.parseMap();
        
        const vertices = [];
        const normals = [];
        const colors = [];
        const bs = typeof blockSize !== 'undefined' ? blockSize : 4.0;

        const addFace = (v1, v2, v3, col) => {
            vertices.push(...v1, ...v2, ...v3);
            const cb = new THREE.Vector3().subVectors(new THREE.Vector3(...v3), new THREE.Vector3(...v2));
            const ab = new THREE.Vector3().subVectors(new THREE.Vector3(...v1), new THREE.Vector3(...v2));
            cb.cross(ab).normalize();
            normals.push(cb.x, cb.y, cb.z, cb.x, cb.y, cb.z, cb.x, cb.y, cb.z);
            colors.push(...col, ...col, ...col);
        };

        const addQuad = (v1, v2, v3, v4, col) => {
            addFace(v1, v2, v4, col);
            addFace(v2, v3, v4, col);
        };

        // 基本カラーパレット
        const colorPalette = {
            1: [0.2, 0.7, 0.2], 
            2: [0.4, 0.8, 0.3], // 草
            3: [0.4, 0.8, 0.3], // 坂道(草)
            4: [0.6, 0.6, 0.6], // 石/コンクリート
            5: [0.5, 0.5, 0.5], // 壁
            6: [0.4, 0.4, 0.4], // 高い壁
            7: [0.8, 0.7, 0.4], // 土/砂
            8: [0.9, 0.9, 0.9], // 雪/白
            9: [0.2, 0.2, 0.2], // 黒
            0: [0.3, 0.8, 0.9]  // 氷/水色
        };

        const getColor = (val) => {
            let baseCol = colorPalette[val % 10] || [0.7, 0.7, 0.7];
            let noise = (Math.random() - 0.5) * 0.04;
            return [
                Math.max(0, Math.min(1, baseCol[0] + noise)),
                Math.max(0, Math.min(1, baseCol[1] + noise)),
                Math.max(0, Math.min(1, baseCol[2] + noise))
            ];
        };

        for (let x = 0; x < mapW; x++) {
            for (let z = 0; z < mapD; z++) {
                let layers = parsedMap[x][z];
                for (let l of layers) {
                    if (l.val === 0) continue;
                    
                    let yT = l.top;
                    let yB = l.bottom;
                    let px = (x - mapW / 2 + 0.5) * bs;
                    let pz = (z - mapD / 2 + 0.5) * bs;
                    let col = getColor(l.val);
                    
                    let c_mXmZ = yT, c_pXmZ = yT, c_mXpZ = yT, c_pXpZ = yT, c_center = yT;

                    if (l.isOdd) {
                        let corners = this.getCornerHeights(parsedMap, mapW, mapD, x, z, yT);
                        c_mXmZ = corners.mXmZ;
                        c_pXmZ = corners.pXmZ;
                        c_mXpZ = corners.mXpZ;
                        c_pXpZ = corners.pXpZ;
                        c_center = corners.center;
                    }

                    c_mXmZ *= bs; c_pXmZ *= bs; c_mXpZ *= bs; c_pXpZ *= bs; c_center *= bs;
                    let bY = yB * bs;

                    const v_mXmZ = [px - bs/2, c_mXmZ, pz - bs/2];
                    const v_pXmZ = [px + bs/2, c_pXmZ, pz - bs/2];
                    const v_pXpZ = [px + bs/2, c_pXpZ, pz + bs/2];
                    const v_mXpZ = [px - bs/2, c_mXpZ, pz + bs/2];
                    const v_center = [px, c_center, pz];

                    const b_mXmZ = [px - bs/2, bY, pz - bs/2];
                    const b_pXmZ = [px + bs/2, bY, pz - bs/2];
                    const b_pXpZ = [px + bs/2, bY, pz + bs/2];
                    const b_mXpZ = [px - bs/2, bY, pz + bs/2];

                    // 【上面】
                    if (l.isOdd) {
                        // 坂道は中心点を設けて4つの三角面で構成し、滑らかに曲がるようにする
                        addFace(v_mXmZ, v_center, v_pXmZ, col);
                        addFace(v_pXmZ, v_center, v_pXpZ, col);
                        addFace(v_pXpZ, v_center, v_mXpZ, col);
                        addFace(v_mXpZ, v_center, v_mXmZ, col);
                    } else {
                        // 平地は四角形（2つの三角面）
                        addQuad(v_mXmZ, v_mXpZ, v_pXpZ, v_pXmZ, col);
                    }

                    // 【側面】(隠面消去つき)
                    const checkHidden = (nx, nz, myTopCorner1, myTopCorner2) => {
                        if (nx < 0 || nx >= mapW || nz < 0 || nz >= mapD) return false;
                        let nLayers = parsedMap[nx][nz];
                        for (let nl of nLayers) {
                            if (nl.bottom <= yB && nl.top * bs >= Math.max(myTopCorner1, myTopCorner2)) {
                                return true;
                            }
                        }
                        return false;
                    };

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
            roughness: 0.8,
            metalness: 0.2
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.isTerrain = true;
        
        return mesh;
    }
};

