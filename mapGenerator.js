// ==========================================
// mapGenerator.js
// 地形データの解析とBufferGeometryメッシュの生成
// ★幅広の坂道の両端が欠けるバグを完全に修正（主斜面判定の導入）
// ★Zファイティング（縞々模様）の原因だった DoubleSide を削除し綺麗な描画に復元
// ★連続した同高さを1本の坂として扱う長距離補間機能の追加
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

    // 追加：連続した坂道情報を取得し、距離に応じた高さ補間を行う関数
    getSlopeInfo: function(parsedMap, mapW, mapD, cx, cz, myTop, getHeight, getPull) {
        const getDirInfo = (dx, dz) => {
            // マイナス方向の探索
            let d_m = 0, h_m = myTop;
            while(true) {
                let nx = cx - dx * (1 + d_m);
                let nz = cz - dz * (1 + d_m);
                if (nx < 0 || nx >= mapW || nz < 0 || nz >= mapD) {
                    h_m = myTop; 
                    break;
                }
                
                let same = false;
                for(let l of parsedMap[nx][nz]) {
                    if (l.top === myTop) { same = true; break; }
                }
                
                if (same) {
                    d_m++;
                } else {
                    h_m = getHeight(nx, nz);
                    break;
                }
            }
            let target_m = getPull(h_m);

            // プラス方向の探索
            let d_p = 0, h_p = myTop;
            while(true) {
                let nx = cx + dx * (1 + d_p);
                let nz = cz + dz * (1 + d_p);
                if (nx < 0 || nx >= mapW || nz < 0 || nz >= mapD) {
                    h_p = myTop;
                    break;
                }
                
                let same = false;
                for(let l of parsedMap[nx][nz]) {
                    if (l.top === myTop) { same = true; break; }
                }
                
                if (same) {
                    d_p++;
                } else {
                    h_p = getHeight(nx, nz);
                    break;
                }
            }
            let target_p = getPull(h_p);
            
            // 全体として貫通している（一方が上がり、一方が下がる）かを判定
            let isThrough = (target_m > 0 && target_p < 0) || (target_m < 0 && target_p > 0);
            
            // 貫通していない場合のデフォルト値（隣のマスだけを見た既存の挙動）
            let pull_m = getPull(getHeight(cx - dx, cz - dz));
            let pull_p = getPull(getHeight(cx + dx, cz + dz));
            
            // 貫通している場合のみ、距離に応じて勾配を滑らかに線形補間する
            if (isThrough) {
                let totalLen = d_m + d_p + 1;
                let step = (target_p - target_m) / totalLen;
                pull_m = target_m + step * d_m;
                pull_p = target_m + step * (d_m + 1);
            }
            
            return { isThrough, pull_m, pull_p };
        };

        let infoX = getDirInfo(1, 0);
        let infoZ = getDirInfo(0, 1);

        return {
            isThroughX: infoX.isThrough,
            pull_mX: infoX.pull_m,
            pull_pX: infoX.pull_p,
            isThroughZ: infoZ.isThrough,
            pull_mZ: infoZ.pull_m,
            pull_pZ: infoZ.pull_p
        };
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

        let h_pX = getHeight(cx + 1, cz);
        let h_mX = getHeight(cx - 1, cz);
        let h_pZ = getHeight(cx, cz + 1);
        let h_mZ = getHeight(cx, cz - 1);
        
        let h_pXpZ = getHeight(cx + 1, cz + 1);
        let h_mXpZ = getHeight(cx - 1, cz + 1);
        let h_pXmZ = getHeight(cx + 1, cz - 1);
        let h_mXmZ = getHeight(cx - 1, cz - 1);

        // 高低差が 0.5（1段）の場合のみ引っ張られる
        // 1.0以上（崖）の場合は 0 にして干渉を絶つ
        const getPull = (h) => {
            let diff = h - myTop;
            if (diff >= 0.25 && diff <= 0.75) return 0.5;
            if (diff <= -0.25 && diff >= -0.75) return -0.5;
            return 0;
        };

        let pull_pX = getPull(h_pX);
        let pull_mX = getPull(h_mX);
        let pull_pZ = getPull(h_pZ);
        let pull_mZ = getPull(h_mZ);

        // 新規追加：長距離の坂道情報を取得し、補間された値で上書きする
        let slopeInfo = this.getSlopeInfo(parsedMap, mapW, mapD, cx, cz, myTop, getHeight, getPull);
        pull_pX = slopeInfo.pull_pX;
        pull_mX = slopeInfo.pull_mX;
        pull_pZ = slopeInfo.pull_pZ;
        pull_mZ = slopeInfo.pull_mZ;

        // まっすぐなスロープ（貫通している）の判定
        // 長距離補間で貫通とみなされた場合も加味する
        let isThroughX = slopeInfo.isThroughX || (pull_pX > 0 && pull_mX < 0) || (pull_pX < 0 && pull_mX > 0);
        let isThroughZ = slopeInfo.isThroughZ || (pull_pZ > 0 && pull_mZ < 0) || (pull_pZ < 0 && pull_mZ > 0);

        // ★主斜面判定: 貫通スロープが一方にだけ存在する場合は、もう一方の崖干渉を無効化する
        if (isThroughX && !isThroughZ) {
            pull_pZ = 0;
            pull_mZ = 0;
        } else if (isThroughZ && !isThroughX) {
            pull_pX = 0;
            pull_mX = 0;
        } else if (!isThroughX && !isThroughZ) {
            // どちらも貫通していない（階段の登り始め、または角）場合
            // X方向に道幅（同じ高さ）があり、Z方向にはない場合はZ方向の坂道とみなす
            let isFlatX = (h_pX === myTop || h_mX === myTop);
            let isFlatZ = (h_pZ === myTop || h_mZ === myTop);
            
            if (isFlatX && !isFlatZ) {
                pull_pX = 0;
                pull_mX = 0;
            } else if (isFlatZ && !isFlatX) {
                pull_pZ = 0;
                pull_mZ = 0;
            }
        }

        const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

        let c_pXpZ = myTop + clamp(pull_pX + pull_pZ, -0.5, 0.5);
        let c_mXpZ = myTop + clamp(pull_mX + pull_pZ, -0.5, 0.5);
        let c_pXmZ = myTop + clamp(pull_pX + pull_mZ, -0.5, 0.5);
        let c_mXmZ = myTop + clamp(pull_mX + pull_mZ, -0.5, 0.5);

        // まだ傾斜がついていない角のみ、斜め方向のマスを参照して角を落とす/上げる
        if (getPull(h_pXpZ) > 0 && c_pXpZ === myTop) c_pXpZ = myTop + 0.5;
        if (getPull(h_pXpZ) < 0 && c_pXpZ === myTop) c_pXpZ = myTop - 0.5;
        if (getPull(h_mXpZ) > 0 && c_mXpZ === myTop) c_mXpZ = myTop + 0.5;
        if (getPull(h_mXpZ) < 0 && c_mXpZ === myTop) c_mXpZ = myTop - 0.5;
        if (getPull(h_pXmZ) > 0 && c_pXmZ === myTop) c_pXmZ = myTop + 0.5;
        if (getPull(h_pXmZ) < 0 && c_pXmZ === myTop) c_pXmZ = myTop - 0.5;
        if (getPull(h_mXmZ) > 0 && c_mXmZ === myTop) c_mXmZ = myTop + 0.5;
        if (getPull(h_mXmZ) < 0 && c_mXmZ === myTop) c_mXmZ = myTop - 0.5;

        // 中心点の高さを計算（長距離坂などの貫通スロープでは平面を維持するために四隅の平均を取る）
        let c_center = myTop;
        if (isThroughX || isThroughZ) {
            c_center = (c_pXpZ + c_mXpZ + c_pXmZ + c_mXmZ) / 4;
        }

        return { pXpZ: c_pXpZ, mXpZ: c_mXpZ, pXmZ: c_pXmZ, mXmZ: c_mXmZ, center: c_center };
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

