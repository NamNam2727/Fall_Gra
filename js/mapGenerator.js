// ==========================================
// mapGenerator.js
// 地形データの解析とBufferGeometryメッシュの生成
// ==========================================

window.MapGenerator = {
    // ----------------------------------------------------
    // 1. テスト用マップデータ (collisionMap)
    // "4" = 高さ2.0の実体
    // "224" = 高さ1.0実体, 高さ1.0空間, 高さ2.0実体 (トンネル)
    // "3" = 高さ1.5の坂道（周囲によって傾く）
    // ----------------------------------------------------
    rawMapData: [
        ["4","4","4","4","4","4","4","4","4","4","4"],
        ["4","2","2","2","2","2","2","2","2","2","4"],
        ["4","2","224","224","224","224","224","2","2","2","4"], // トンネル
        ["4","2","2","2","3","2","2","2","2","2","4"], // 坂道
        ["4","2","2","3","4","3","2","2","2","2","4"], // 坂道に囲まれた高台
        ["4","2","2","2","3","2","2","3","3","3","4"], // 坂道テスト用
        ["4","2","2","2","2","2","2","3","2","3","4"], // 窪み(すり鉢)テスト用
        ["4","2","2","2","2","2","2","3","3","3","4"],
        ["4","4","4","4","4","4","4","4","4","4","4"]
    ],

    // 文字列マップを3D空間のレイヤー構造（実体と空間）にパースする
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
                let isSolid = true; // 右（1桁目）から常に 実体→空間→実体 と切り替わる
                
                // 1桁目から順に解析
                for (let i = str.length - 1; i >= 0; i--) {
                    let val = parseInt(str[i], 10);
                    let height = val * 0.5; // 1につき0.5ブロックの高さ
                    
                    if (isSolid && val > 0) {
                        layers.push({
                            bottom: currentY,
                            top: currentY + height,
                            val: val,
                            isOdd: val % 2 !== 0 // 奇数なら坂道フラグON
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

    // 坂道（奇数）の場合の「四隅の高さ」と「中心の高さ」を周囲の地形から計算する
    getCornerHeights: function(parsedMap, mapW, mapD, cx, cz, myTop) {
        // 特定の座標のレイヤーから、自分の高さに最も近い上面のY座標を取得
        const getHeight = (nx, nz) => {
            if (nx < 0 || nx >= mapW || nz < 0 || nz >= mapD) return myTop;
            let layers = parsedMap[nx][nz];
            let closestTop = myTop;
            let minDiff = Infinity;
            for(let l of layers) {
                let diff = Math.abs(l.top - myTop);
                // 段差が1.0以内のレイヤーを「地続き」とみなして参照する
                if (diff < minDiff && diff <= 1.0) {
                    minDiff = diff;
                    closestTop = l.top;
                }
            }
            return closestTop;
        };

        // 上下左右の高さ
        let h_pX = getHeight(cx + 1, cz);
        let h_mX = getHeight(cx - 1, cz);
        let h_pZ = getHeight(cx, cz + 1);
        let h_mZ = getHeight(cx, cz - 1);
        
        // 対角の高さ
        let h_pXpZ = getHeight(cx + 1, cz + 1);
        let h_mXpZ = getHeight(cx - 1, cz + 1);
        let h_pXmZ = getHeight(cx + 1, cz - 1);
        let h_mXmZ = getHeight(cx - 1, cz - 1);

        // 各方向に対して「自分より高ければそちらを上げる(0.5)」「低ければ下げる(-0.5)」
        let pull_pX = (h_pX > myTop) ? 0.5 : ((h_pX < myTop) ? -0.5 : 0);
        let pull_mX = (h_mX > myTop) ? 0.5 : ((h_mX < myTop) ? -0.5 : 0);
        let pull_pZ = (h_pZ > myTop) ? 0.5 : ((h_pZ < myTop) ? -0.5 : 0);
        let pull_mZ = (h_mZ > myTop) ? 0.5 : ((h_mZ < myTop) ? -0.5 : 0);

        // 「高い」しかない場合は反対側を下げて斜面を作る
        if (pull_pX > 0 && pull_mX === 0) pull_mX = -0.5;
        if (pull_mX > 0 && pull_pX === 0) pull_pX = -0.5;
        if (pull_pZ > 0 && pull_mZ === 0) pull_mZ = -0.5;
        if (pull_mZ > 0 && pull_pZ === 0) pull_pZ = -0.5;

        // 「低い」しかない場合は反対側を上げて斜面を作る
        if (pull_pX < 0 && pull_mX === 0) pull_mX = 0.5;
        if (pull_mX < 0 && pull_pX === 0) pull_pX = 0.5;
        if (pull_pZ < 0 && pull_mZ === 0) pull_mZ = 0.5;
        if (pull_mZ < 0 && pull_pZ === 0) pull_pZ = 0.5;

        const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

        // 四隅の最終的な高さを決定（最大で自分±0.5に収める）
        let c_pXpZ = myTop + clamp(pull_pX + pull_pZ, -0.5, 0.5);
        let c_mXpZ = myTop + clamp(pull_mX + pull_pZ, -0.5, 0.5);
        let c_pXmZ = myTop + clamp(pull_pX + pull_mZ, -0.5, 0.5);
        let c_mXmZ = myTop + clamp(pull_mX + pull_mZ, -0.5, 0.5);

        // 対角線方向の極端な段差を自然に補正する（すり鉢やピラミッドの角用）
        if (h_pXpZ > myTop && c_pXpZ === myTop) c_pXpZ = myTop + 0.5;
        if (h_pXpZ < myTop && c_pXpZ === myTop) c_pXpZ = myTop - 0.5;
        if (h_mXpZ > myTop && c_mXpZ === myTop) c_mXpZ = myTop + 0.5;
        if (h_mXpZ < myTop && c_mXpZ === myTop) c_mXpZ = myTop - 0.5;
        if (h_pXmZ > myTop && c_pXmZ === myTop) c_pXmZ = myTop + 0.5;
        if (h_pXmZ < myTop && c_pXmZ === myTop) c_pXmZ = myTop - 0.5;
        if (h_mXmZ > myTop && c_mXmZ === myTop) c_mXmZ = myTop + 0.5;
        if (h_mXmZ < myTop && c_mXmZ === myTop) c_mXmZ = myTop - 0.5;

        // すべて平坦な場合や、窪み・出っ張りの場合は中心を維持
        return { pXpZ: c_pXpZ, mXpZ: c_mXpZ, pXmZ: c_pXmZ, mXmZ: c_mXmZ, center: myTop };
    },

    // 巨大な1つの3Dメッシュとして地形を構築する
    createMesh: function() {
        const { parsedMap, mapW, mapD } = this.parseMap();
        
        const vertices = [];
        const normals = [];
        const colors = [];

        const colorOdd = new THREE.Color(0x81C784);  // 坂道の色（少し明るい緑）
        const colorEven1 = new THREE.Color(0x4CAF50); // 平地の色1
        const colorEven2 = new THREE.Color(0x388E3C); // 平地の色2

        // 三角形の面と法線、色を追加するヘルパー関数
        const addFace = (v0, v1, v2, color) => {
            vertices.push(...v0, ...v1, ...v2);
            
            // 外積を用いて面の向き（法線ベクトル）を計算
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

        // 全マス・全レイヤーのポリゴンを生成
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

                    // 頂点座標の定義（中心0,0 からスケール1.0で計算）
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
                        // 坂道は中心頂点を含む4つの三角形で構成（すり鉢やピラミッドにも対応）
                        addFace(v_mXmZ, v_center, v_pXmZ, col);
                        addFace(v_pXmZ, v_center, v_pXpZ, col);
                        addFace(v_pXpZ, v_center, v_mXpZ, col);
                        addFace(v_mXpZ, v_center, v_mXmZ, col);
                    } else {
                        // 偶数は完全な平面（四角形）
                        addQuad(v_mXmZ, v_mXpZ, v_pXpZ, v_pXmZ, col);
                    }

                    // 【底面】(トンネルの下から見上げた時用)
                    addQuad(b_mXmZ, b_pXmZ, b_pXpZ, b_mXpZ, col);

                    // 【側面】
                    // 隣のマスに遮られているかチェック（無駄なポリゴンを削減）
                    const checkHidden = (nx, nz, myTopCorner1, myTopCorner2) => {
                        if (nx < 0 || nx >= mapW || nz < 0 || nz >= mapD) return false;
                        for(let nl of parsedMap[nx][nz]) {
                            if (!nl.isOdd && nl.bottom <= yB && nl.top >= Math.max(myTopCorner1, myTopCorner2)) {
                                return true;
                            }
                        }
                        return false;
                    };

                    if (!checkHidden(x, z+1, c_mXpZ, c_pXpZ)) addQuad(b_pXpZ, b_mXpZ, v_mXpZ, v_pXpZ, col); // +Z
                    if (!checkHidden(x, z-1, c_mXmZ, c_pXmZ)) addQuad(b_mXmZ, b_pXmZ, v_pXmZ, v_mXmZ, col); // -Z
                    if (!checkHidden(x+1, z, c_pXmZ, c_pXpZ)) addQuad(b_pXmZ, b_pXpZ, v_pXpZ, v_pXmZ, col); // +X
                    if (!checkHidden(x-1, z, c_mXmZ, c_mXpZ)) addQuad(b_mXpZ, b_mXmZ, v_mXmZ, v_mXpZ, col); // -X
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
        
        // メイン処理の blockSize に合わせて全体のスケールを拡大する
        const bs = typeof blockSize !== 'undefined' ? blockSize : 10;
        mesh.scale.set(bs, bs, bs);
        
        // Raycaster等の判定用に独自データを付与しておく
        mesh.userData.isTerrain = true;
        
        return mesh;
    }
};
