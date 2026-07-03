// =====================================
// minigames/survival.js
// 崩壊サバイバル プラグイン
// ★生存時間を記録し、ランキング表示用にソートする機能を追加
// =====================================

window.MinigamePlugins = window.MinigamePlugins || {};

window.MinigamePlugins['survival'] = {
    blocks: {}, 
    survivalGroup: null,
    originalMapMesh: null,
    isPlaying: false,
    timeLimit: 3,     
    remainTime: 0,    
    startTime: 0,     // ★追加: 開始時刻の記録用

    // カラー定義
    colorNormal: new THREE.Color(0xaaaaaa),
    colorBlue: new THREE.Color(0x4488ff),
    colorYellow: new THREE.Color(0xffff44),
    colorRed: new THREE.Color(0xff4444),

    init: function(settings) {
        console.log("[Survival] Initializing...");
        this.isPlaying = false;
        this.blocks = {};
        this.timeLimit = settings && settings.time ? parseInt(settings.time, 10) : 3;

        if (typeof scene !== 'undefined') {
            scene.children.forEach(child => {
                if (child.userData && child.userData.isTerrain && !child.userData.isSurvivalBlock) {
                    this.originalMapMesh = child;
                    child.visible = false;
                }
            });
        }

        this.survivalGroup = new THREE.Group();

        if (window.MapGenerator) {
            const { parsedMap, mapW, mapD } = window.MapGenerator.parseMap();
            const bs = typeof blockSize !== 'undefined' ? blockSize : 10;

            for (let x = 0; x < mapW; x++) {
                for (let z = 0; z < mapD; z++) {
                    let layers = parsedMap[x][z];
                    let px = x - mapW / 2 + 0.5;
                    let pz = z - mapD / 2 + 0.5;

                    layers.forEach((l, layerIndex) => {
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
                        const blockId = `${x}_${z}_${layerIndex}`; 
                        
                        blockMesh.userData = {
                            isTerrain: true, 
                            isSurvivalBlock: true,
                            id: blockId,
                            topY: yT * bs 
                        };

                        this.blocks[blockId] = {
                            mesh: blockMesh,
                            stepTime: null,
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

    start: function() {
        console.log("[Survival] Game Started!");
        this.isPlaying = true;
        this.remainTime = this.timeLimit * 60; 
        this.startTime = Date.now(); // ★開始時刻を記録
    },

    update: function(delta) {
        if (!this.isPlaying) return;

        this.remainTime -= delta;
        if (this.remainTime <= 0) {
            this.remainTime = 0;
            this.isPlaying = false;
            
            // ★時間切れ＝生存クリアのスコア登録
            if (window.MinigameManager && window.MinigameManager.resultData) {
                const limitSec = this.timeLimit * 60;
                let m = Math.floor(limitSec / 60);
                let s = Math.floor(limitSec % 60);
                let timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

                window.MinigameManager.resultData.forEach(data => {
                    if (!data.isRetired) {
                        data.scoreValue = limitSec; 
                        data.scoreText = `生存クリア! (${timeStr})`;
                    }
                });
                window.MinigameManager.endGame();
            }
            return;
        }

        let m = Math.floor(this.remainTime / 60);
        let s = Math.floor(this.remainTime % 60);
        let timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        if (window.MinigameUI) window.MinigameUI.updateTimer(timeStr);

        const now = Date.now();

        if (!window.isSpectatorMode && typeof player !== 'undefined' && player) {
            this.checkPlayerStep(now);
        }

        for (let id in this.blocks) {
            let b = this.blocks[id];
            if (b.stepTime !== null && b.mesh.visible) {
                let elapsed = (now - b.stepTime) / 1000;

                if (elapsed >= 3.0) {
                    b.mesh.visible = false;
                    b.mesh.userData.isTerrain = false; 
                } else if (elapsed >= 2.0) {
                    b.mesh.material.color.lerpColors(this.colorYellow, this.colorRed, (elapsed - 2.0));
                } else if (elapsed >= 1.0) {
                    b.mesh.material.color.lerpColors(this.colorBlue, this.colorYellow, (elapsed - 1.0));
                } else {
                    b.mesh.material.color.lerpColors(b.originalColor, this.colorBlue, elapsed);
                }
            }
        }
    },

    checkPlayerStep: function(nowTime) {
        if (typeof isJumping !== 'undefined' && isJumping) return;

        let pRadius = typeof playerRadius !== 'undefined' ? playerRadius : 1.2;

        const raycaster = new THREE.Raycaster();
        const origin = new THREE.Vector3(player.position.x, player.position.y + pRadius * 3.0, player.position.z);
        raycaster.set(origin, new THREE.Vector3(0, -1, 0));

        const intersects = raycaster.intersectObjects(this.survivalGroup.children, false);

        if (intersects.length > 0) {
            let hit = intersects[0];
            
            if (Math.abs(hit.point.y - player.position.y) < 0.1) {
                let blockId = hit.object.userData.id;
                let b = this.blocks[blockId];
                
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

    handleNetwork: function(data) {
        if (data.action === 'step') {
            let b = this.blocks[data.id];
            if (b) {
                if (b.stepTime === null || data.timestamp < b.stepTime) {
                    b.stepTime = data.timestamp;
                }
            }
        }
    },

    // ★追加: 落下（リタイア）した瞬間に生存時間を記録する
    onRetire: function(userId) {
        if (window.MinigameManager && window.MinigameManager.resultData) {
            const data = window.MinigameManager.resultData.find(d => d.id === userId);
            if (data) {
                let survivedSeconds = 0;
                if (this.startTime) {
                    survivedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
                }
                
                const limitSec = this.timeLimit * 60;
                if (survivedSeconds > limitSec) survivedSeconds = limitSec;

                let m = Math.floor(survivedSeconds / 60);
                let s = Math.floor(survivedSeconds % 60);
                let timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

                data.isRetired = true;
                data.scoreValue = survivedSeconds; // 生存秒数をスコア(ソート用)にする
                data.scoreText = timeStr;
            }
        }
    },

    // ★追加: 全員終了後にスコア（生存時間）をもとにランキングを計算してソートする
    end: function() {
        console.log("[Survival] Game Ended. Calculating ranks and restoring map...");
        this.isPlaying = false;

        if (window.MinigameManager && window.MinigameManager.resultData) {
            let rd = window.MinigameManager.resultData;
            // scoreValue(生存秒数)が大きい順に降順ソート
            rd.sort((a, b) => b.scoreValue - a.scoreValue);
            
            // 上から順番にランク付け（同点対応）
            let currentRank = 1;
            for (let i = 0; i < rd.length; i++) {
                if (i > 0 && rd[i].scoreValue < rd[i-1].scoreValue) {
                    currentRank = i + 1;
                }
                rd[i].rank = currentRank;
            }
        }

        // マップの復元
        if (this.survivalGroup && typeof scene !== 'undefined') {
            scene.remove(this.survivalGroup);
            this.survivalGroup.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            this.survivalGroup = null;
        }
        this.blocks = {};

        if (this.originalMapMesh) {
            this.originalMapMesh.visible = true;
            this.originalMapMesh = null;
        }
    },

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

        if (isOdd) {
            addFace(v_mXmZ, v_center, v_pXmZ);
            addFace(v_pXmZ, v_center, v_pXpZ);
            addFace(v_pXpZ, v_center, v_mXpZ);
            addFace(v_mXpZ, v_center, v_mXmZ);
        } else {
            addQuad(v_mXmZ, v_mXpZ, v_pXpZ, v_pXmZ);
        }

        addQuad(b_mXmZ, b_pXmZ, b_pXpZ, b_mXpZ);

        addQuad(b_pXpZ, v_pXpZ, v_mXpZ, b_mXpZ); 
        addQuad(b_mXmZ, v_mXmZ, v_pXmZ, b_pXmZ); 
        addQuad(b_pXmZ, v_pXmZ, v_pXpZ, b_pXpZ); 
        addQuad(b_mXpZ, v_mXpZ, v_mXmZ, b_mXmZ); 

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

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
