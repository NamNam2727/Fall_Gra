// =====================================
// minigames/survival.js
// 崩壊サバイバル プラグイン
// 独自の床メッシュを生成し、タイムスタンプベースで崩壊を同期する
// =====================================

window.MinigamePlugins = window.MinigamePlugins || {};

window.MinigamePlugins['survival'] = {
    blocks: {}, // id -> { mesh, originalColor, stepTime, isOdd }
    survivalGroup: null,
    originalMapMesh: null,
    isPlaying: false,

    // カラー定義
    colorNormal: new THREE.Color(0xaaaaaa),
    colorBlue: new THREE.Color(0x4488ff),
    colorYellow: new THREE.Color(0xffff44),
    colorRed: new THREE.Color(0xff4444),

    // 10秒カウントダウン開始時に呼ばれる（マップ構築など重い処理を行う）
    init: function(settings) {
        console.log("[Survival] Initializing...");
        this.isPlaying = false;
        this.blocks = {};

        // 元の地形を非表示にする
        if (typeof scene !== 'undefined') {
            scene.children.forEach(child => {
                if (child.userData && child.userData.isTerrain && !child.userData.isSurvivalBlock) {
                    this.originalMapMesh = child;
                    child.visible = false;
                }
            });
        }

        this.survivalGroup = new THREE.Group();

        // MapGenerator のデータから個別ブロックを生成
        if (window.MapGenerator) {
            const { parsedMap, mapW, mapD } = window.MapGenerator.parseMap();
            const bs = typeof blockSize !== 'undefined' ? blockSize : 10;

            for (let x = 0; x < mapW; x++) {
                for (let z = 0; z < mapD; z++) {
                    let layers = parsedMap[x][z];
                    let px = x - mapW / 2 + 0.5;
                    let pz = z - mapD / 2 + 0.5;

                    layers.forEach((l, layerIndex) => {
                        // 高さ0の空間（奈落）は生成しない
                        if (l.val === 0) return;

                        let yB = l.bottom;
                        let yT = l.top;
                        
                        let c_pXpZ = yT, c_mXpZ = yT, c_pXmZ = yT, c_mXmZ = yT, c_center = yT;

                        if (l.isOdd) {
                            let corners = window.MapGenerator.getCornerHeights(parsedMap, mapW, mapD, x, z, yT);
                            c_pXpZ = corners.pXpZ; c_mXpZ = corners.mXpZ; 
                            c_pXmZ = corners.pXmZ; c_mXmZ = corners.mXmZ; 
                            c_center = corners.center;
                        }

                        const blockMesh = this.createBlockMesh(px, pz, yB, c_center, c_pXpZ, c_mXpZ, c_pXmZ, c_mXmZ, l.isOdd, bs);
                        const blockId = `${x}_${z}_${layerIndex}`; // 座標と階層で一意のID
                        
                        blockMesh.userData = {
                            isTerrain: true, // main.jsの当たり判定に認識させる
                            isSurvivalBlock: true,
                            id: blockId,
                            topY: yT * bs // 踏み判定用
                        };

                        this.blocks[blockId] = {
                            mesh: blockMesh,
                            stepTime: null, // 踏まれたタイムスタンプ
                            isOdd: l.isOdd,
                            originalColor: blockMesh.material.color.clone()
                        };

                        this.survivalGroup.add(blockMesh);
                    });
                }
            }
        }

        if (typeof scene !== 'undefined') {
            scene.add(this.survivalGroup);
        }
    },

    // 「START!!」表示後に呼ばれる（タイマー作動やアクション開始）
    start: function() {
        console.log("[Survival] Game Started!");
        this.isPlaying = true;
    },

    // 毎フレーム呼ばれる更新処理
    update: function(delta) {
        if (!this.isPlaying) return;

        const now = Date.now();

        // 1. 自分がどのブロックの上にいるか判定する
        if (!window.isSpectatorMode && typeof player !== 'undefined' && player) {
            this.checkPlayerStep(now);
        }

        // 2. ブロックの色と消失の更新
        for (let id in this.blocks) {
            let b = this.blocks[id];
            if (b.stepTime !== null && b.mesh.visible) {
                let elapsed = (now - b.stepTime) / 1000; // 経過秒数

                if (elapsed >= 3.0) {
                    // 3秒経過：消失
                    b.mesh.visible = false;
                    b.mesh.userData.isTerrain = false; // 当たり判定から除外
                } else if (elapsed >= 2.0) {
                    // 2秒経過：赤
                    b.mesh.material.color.lerpColors(this.colorYellow, this.colorRed, (elapsed - 2.0));
                } else if (elapsed >= 1.0) {
                    // 1秒経過：黄色
                    b.mesh.material.color.lerpColors(this.colorBlue, this.colorYellow, (elapsed - 1.0));
                } else {
                    // 0〜1秒：青
                    b.mesh.material.color.lerpColors(b.originalColor, this.colorBlue, elapsed);
                }
            }
        }
    },

    // 足元のブロックを判定し、踏んでいれば同期を送信する
    checkPlayerStep: function(nowTime) {
        const bs = typeof blockSize !== 'undefined' ? blockSize : 10;
        let pRadius = typeof playerRadius !== 'undefined' ? playerRadius : 1.2;

        // キャラクターの真下に向かってレイを飛ばし、足元の survivalBlock を探す
        const raycaster = new THREE.Raycaster();
        const origin = new THREE.Vector3(player.position.x, player.position.y + pRadius * 3.0, player.position.z);
        raycaster.set(origin, new THREE.Vector3(0, -1, 0));

        const intersects = raycaster.intersectObjects(this.survivalGroup.children, false);

        if (intersects.length > 0) {
            let hit = intersects[0];
            // 足元(stepHeight + 0.5以内の距離)にあるかチェック
            let myStepHeight = typeof stepHeight !== 'undefined' ? stepHeight : 1.5;
            if (hit.point.y <= player.position.y + myStepHeight + 0.5) {
                let blockId = hit.object.userData.id;
                let b = this.blocks[blockId];
                
                // まだ踏まれていないブロックなら、タイムスタンプをセットして通信送信
                if (b && b.stepTime === null) {
                    b.stepTime = nowTime;
                    
                    if (window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
                        window.MultiplayerManager.sendData({
                            type: 'mg_plugin_sync',
                            data: { action: 'step', id: blockId, timestamp: nowTime }
                        });
                    }
                }
            }
        }
    },

    // 通信の受信
    handleNetwork: function(data) {
        if (data.action === 'step') {
            let b = this.blocks[data.id];
            if (b) {
                // 既にタイムスタンプがあっても、受信したものがより古ければ上書き（同時踏みのラグ解決）
                if (b.stepTime === null || data.timestamp < b.stepTime) {
                    b.stepTime = data.timestamp;
                }
            }
        }
    },

    // リタイア時の処理
    onRetire: function(userId) {
        // サバイバルでは、リタイア＝奈落落ちと同等の扱い。
        // リザルトデータ側は manager で処理されるため特に処理なし
    },

    // ゲーム終了時（マップの復元など）
    end: function() {
        console.log("[Survival] Game Ended. Restoring map...");
        this.isPlaying = false;

        // サバイバル専用マップの破棄
        if (this.survivalGroup && typeof scene !== 'undefined') {
            scene.remove(this.survivalGroup);
            // ジオメトリとマテリアルのメモリ解放
            this.survivalGroup.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            this.survivalGroup = null;
        }
        this.blocks = {};

        // 元の地形を再表示
        if (this.originalMapMesh) {
            this.originalMapMesh.visible = true;
            this.originalMapMesh = null;
        }
    },

    // ---------------------------------
    // ブロック生成ユーティリティ
    // ---------------------------------
    createBlockMesh: function(px, pz, yB, c_center, c_pXpZ, c_mXpZ, c_pXmZ, c_mXmZ, isOdd, bs) {
        const vertices = [];
        const normals = [];

        const addFace = (v0, v1, v2) => {
            vertices.push(...v0, ...v1, ...v2);
            const vec1 = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
            const vec2 = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
            const nx = vec1[1]*vec2[2] - vec1[2]*vec2[1];
            const ny = vec1[2]*vec2[0] - vec1[0]*vec2[2];
            const nz = vec1[0]*vec2[1] - vec1[1]*vec2[0];
            const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
            const n = len > 0 ? [nx/len, ny/len, nz/len] : [0,1,0];
            normals.push(...n, ...n, ...n);
        };
        const addQuad = (v0, v1, v2, v3) => {
            addFace(v0, v1, v2);
            addFace(v0, v2, v3);
        };

        const v_mXmZ = [px - 0.5, c_mXmZ, pz - 0.5];
        const v_pXmZ = [px + 0.5, c_pXmZ, pz - 0.5];
        const v_pXpZ = [px + 0.5, c_pXpZ, pz + 0.5];
        const v_mXpZ = [px - 0.5, c_mXpZ, pz + 0.5];
        const v_center = [px, c_center, pz];
        
        const b_mXmZ = [px - 0.5, yB, pz - 0.5];
        const b_pXmZ = [px + 0.5, yB, pz - 0.5];
        const b_pXpZ = [px + 0.5, yB, pz + 0.5];
        const b_mXpZ = [px - 0.5, yB, pz + 0.5];

        // 上面
        if (isOdd) {
            addFace(v_mXmZ, v_center, v_pXmZ);
            addFace(v_pXmZ, v_center, v_pXpZ);
            addFace(v_pXpZ, v_center, v_mXpZ);
            addFace(v_mXpZ, v_center, v_mXmZ);
        } else {
            addQuad(v_mXmZ, v_mXpZ, v_pXpZ, v_pXmZ);
        }

        // 底面
        addQuad(b_mXmZ, b_pXmZ, b_pXpZ, b_mXpZ);

        // 側面
        addQuad(b_pXpZ, v_pXpZ, v_mXpZ, b_mXpZ); 
        addQuad(b_mXmZ, v_mXmZ, v_pXmZ, b_pXmZ); 
        addQuad(b_pXmZ, v_pXmZ, v_pXpZ, b_pXpZ); 
        addQuad(b_mXpZ, v_mXpZ, v_mXmZ, b_mXmZ); 

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

        // 色はチェッカーボード風の少し明るい色をベースにする
        const isChecker = (Math.abs(px) + Math.abs(pz)) % 2 === 0;
        const colorHex = isOdd ? 0x81C784 : (isChecker ? 0x66BB6A : 0x4CAF50);
        
        const mat = new THREE.MeshStandardMaterial({ 
            color: colorHex, 
            roughness: 0.8
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.scale.set(bs, bs, bs);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        return mesh;
    }
};
