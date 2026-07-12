// =====================================
// minigames/dead_zone.js
// デッドゾーン プラグイン
// ★シード付き疑似乱数とスケジュール事前生成を用いた完全ローカル同期
// ★青→黄→赤への色変化と、徐々に短縮される出現間隔
// ★落下時のペナルティを削除し、落下＝即リタイアに変更
// =====================================

window.MinigamePlugins = window.MinigamePlugins || {};

window.MinigamePlugins['dead_zone'] = {
    isPlaying: false,
    isPrepared: false,
    settings: null,
    timeLimit: 3,
    remainTime: 0,
    
    myScore: 0, // 生存時間（秒）
    scoreUI: null,
    
    validFloors: [],      
    zoneSchedules: [], // { spawnTime, explodeTime, pos, lifetime, exploded, meshGroup, mats }
    explosions: [],    // 爆発エフェクト管理
    
    zoneRadius: 10.0,
    intervalDecrement: 0.03, // (6 - 制限時間) * 0.01

    init: function(settings) {
        console.log("[Dead Zone] Initializing...");
        this.isPlaying = false;
        this.isPrepared = false;
        this.settings = settings;
        this.timeLimit = settings && settings.time ? parseInt(settings.time, 10) : 3;
        
        // 短縮量の計算 (例：3分なら 0.03秒ずつ短縮)
        this.intervalDecrement = (6.0 - this.timeLimit) * 0.01;
        
        this.myScore = 0;
        
        this.validFloors = [];
        this.zoneSchedules = [];
        this.explosions = [];
    },

    // ==========================================
    // 1. シード付き疑似乱数とスケジュール生成
    // ==========================================
    createPRNG: function(seed) {
        return function() {
            var t = seed += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        }
    },

    collectValidFloors: function() {
        if (!window.MapGenerator) return;
        const { parsedMap, mapW, mapD } = window.MapGenerator.parseMap();
        const bs = typeof blockSize !== 'undefined' ? blockSize : 4.0;

        for (let x = 0; x < mapW; x++) {
            for (let z = 0; z < mapD; z++) {
                let layers = parsedMap[x][z];
                if (!layers || layers.length === 0) continue;
                
                let topLayer = layers[layers.length - 1];
                if (topLayer.val === 6) continue; // 外壁除外

                let yT = topLayer.top;
                if (topLayer.isOdd) {
                    let corners = window.MapGenerator.getCornerHeights(parsedMap, mapW, mapD, x, z, yT);
                    yT = corners.center;
                }

                let px = (x - mapW / 2 + 0.5) * bs;
                let pz = (z - mapD / 2 + 0.5) * bs;
                let py = yT * bs;

                this.validFloors.push({ x: px, y: py, z: pz });
            }
        }
    },

    generateSchedules: function(seed) {
        const prng = this.createPRNG(seed);
        this.zoneSchedules = [];
        
        let t = 0;
        let currentInterval = 2.5; // 初期出現間隔
        
        // 制限時間を少し超えるまでスケジュールを事前構築しておく
        const maxTime = this.timeLimit * 60 + 10; 
        
        for (let i = 0; i < 2000; i++) {
            let idx = Math.floor(prng() * this.validFloors.length);
            let pos = this.validFloors[idx];
            let lifetime = currentInterval;
            
            this.zoneSchedules.push({
                spawnTime: t,
                explodeTime: t + lifetime,
                pos: pos,
                lifetime: lifetime,
                exploded: false,
                meshGroup: null,
                mats: []
            });
            
            t += lifetime;
            currentInterval = Math.max(0.1, currentInterval - this.intervalDecrement);
            
            if (t > maxTime) break; 
        }
    },

    // ==========================================
    // 2. メッシュ・エフェクトの生成
    // ==========================================
    createZoneMeshForSchedule: function(sch) {
        let cylGeo = new THREE.CylinderGeometry(this.zoneRadius, this.zoneRadius, 20.0, 32, 1, true);
        let cylMat = new THREE.MeshBasicMaterial({ color: 0x0000ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
        let cylMesh = new THREE.Mesh(cylGeo, cylMat);
        cylMesh.position.set(sch.pos.x, sch.pos.y + 10.0, sch.pos.z);

        let ringGeo = new THREE.RingGeometry(this.zoneRadius - 1.0, this.zoneRadius, 32);
        let ringMat = new THREE.MeshBasicMaterial({ color: 0x0000ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
        let ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = -Math.PI / 2;
        ringMesh.position.set(sch.pos.x, sch.pos.y + 0.5, sch.pos.z);

        let group = new THREE.Group();
        group.add(cylMesh);
        group.add(ringMesh);
        scene.add(group);
        
        sch.meshGroup = group;
        sch.mats = [cylMat, ringMat];
    },

    createExplosion: function(pos) {
        const geo = new THREE.SphereGeometry(this.zoneRadius, 16, 16);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.8 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        mesh.position.y += 2.0;
        scene.add(mesh);
        
        this.explosions.push({ mesh: mesh, age: 0, maxAge: 0.5 });
    },

    updateExplosions: function(delta) {
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            let exp = this.explosions[i];
            exp.age += delta;
            let p = exp.age / exp.maxAge;
            if (p >= 1.0) {
                scene.remove(exp.mesh);
                exp.mesh.geometry.dispose();
                exp.mesh.material.dispose();
                this.explosions.splice(i, 1);
            } else {
                exp.mesh.scale.setScalar(1.0 + p * 0.5);
                exp.mesh.material.opacity = 0.8 * (1.0 - p);
            }
        }
    },

    // ==========================================
    // 3. ゲームループと判定
    // ==========================================
    start: function() {
        console.log("[Dead Zone] Game Started!");
        this.isPlaying = true;
        this.remainTime = this.timeLimit * 60;
        
        if (typeof window.addLog === 'function') {
            window.addLog('<span style="color:#ff4444; font-weight:bold;">💥 デッドゾーンの出現が始まった！ 💥</span>', 'sys');
        }
    },

    update: function(delta) {
        if (!this.isPrepared) {
            if (window.MinigameManager && window.MinigameManager.targetStartTime > 0) {
                this.isPrepared = true;
                this.collectValidFloors();
                this.generateSchedules(window.MinigameManager.targetStartTime);
                this.createUI();
            }
            return;
        }

        if (!this.isPlaying) return;

        this.remainTime -= delta;
        if (this.remainTime <= 0) {
            this.remainTime = 0;
            this.finishGame();
            return;
        }

        // 落下チェック (即リタイア)
        if (!window.isSpectatorMode && typeof player !== 'undefined' && player) {
            if (player.position.y < -25) {
                window.MinigameManager.executeRetire();
                return;
            }
        }

        let m = Math.floor(this.remainTime / 60);
        let s = Math.floor(this.remainTime % 60);
        let timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        if (window.MinigameUI) window.MinigameUI.updateTimer(timeStr);

        this.updateExplosions(delta);

        let elapsed = (this.timeLimit * 60) - this.remainTime;

        // ====================================================
        // ★ スケジュールに基づくゾーンの更新と爆発判定
        // ====================================================
        for (let i = 0; i < this.zoneSchedules.length; i++) {
            let sch = this.zoneSchedules[i];
            
            // 出現中
            if (elapsed >= sch.spawnTime && elapsed < sch.explodeTime) {
                if (!sch.meshGroup) {
                    this.createZoneMeshForSchedule(sch);
                }
                
                // 青 → 黄 → 赤 へ色を変化させる
                let age = elapsed - sch.spawnTime;
                let p = age / sch.lifetime;
                if (p > 1.0) p = 1.0;
                
                let r, g, b;
                if (p < 0.5) {
                    let t = p * 2.0; 
                    r = t; g = t; b = 1.0 - t; // 青 to 黄
                } else {
                    let t = (p - 0.5) * 2.0; 
                    r = 1.0; g = 1.0 - t; b = 0.0; // 黄 to 赤
                }
                sch.mats.forEach(mat => mat.color.setRGB(r, g, b));
                
                // 円柱を少し回転させて目立たせる
                if (sch.meshGroup.children[0]) {
                    sch.meshGroup.children[0].rotation.y += delta * 2.0;
                }
            }
            
            // 爆発の瞬間
            if (elapsed >= sch.explodeTime && !sch.exploded) {
                sch.exploded = true;
                
                if (sch.meshGroup) {
                    scene.remove(sch.meshGroup);
                    sch.meshGroup.children.forEach(c => { c.geometry.dispose(); c.material.dispose(); });
                    sch.meshGroup = null;
                }
                
                this.triggerExplosion(sch);
            }
            
            // 処理効率化：まだ出現時間が先のスケジュールに到達したら走査を打ち切る
            if (sch.spawnTime > elapsed + 5.0) break;
        }

        // ====================================================
        // ★ 生存時間スコアの更新（1秒毎に通信同期）
        // ====================================================
        if (!window.isSpectatorMode) {
            let currentSec = Math.floor(elapsed);
            if (currentSec > this.myScore) {
                this.myScore = currentSec;
                this.updateScoreUI();
                this.syncMyScoreToManager();
            }
        }
    },

    triggerExplosion: function(sch) {
        this.createExplosion(sch.pos);
        
        if (window.isSpectatorMode || !player) return;
        
        let dx = player.position.x - sch.pos.x;
        let dz = player.position.z - sch.pos.z;
        let dy = player.position.y - sch.pos.y;
        
        // 爆風の当たり判定
        if (dx * dx + dz * dz <= this.zoneRadius * this.zoneRadius && dy >= -2.0 && dy <= 15.0) {
            window.MinigameManager.executeRetire();
        }
    },

    // ==========================================
    // 4. UI・リザルト管理
    // ==========================================
    syncMyScoreToManager: function(statusText = "") {
        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
        let cText = this.getScoreString();
        
        if (window.MinigameManager && window.MinigameManager.resultData) {
            const myData = window.MinigameManager.resultData.find(d => d.id === myId);
            if (myData && !myData.isRetired) {
                myData.scoreValue = this.myScore;
                myData.scoreText = cText;
                if (statusText) myData.statusText = statusText;
                
                myData.currentScoreValue = this.myScore;
                myData.currentScoreText = cText;
                if (statusText) myData.currentStatusText = statusText;
            }
        }
        
        if (window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
            window.MultiplayerManager.sendData({
                type: 'mg_update_score',
                userId: myId,
                scoreValue: this.myScore,
                scoreText: cText,
                statusText: statusText,
                isRetired: false
            });
            window.MultiplayerManager.sendData({
                type: 'mg_reply_score',
                userId: myId,
                currentScoreText: cText,
                currentScoreValue: this.myScore,
                currentStatusText: statusText || "生存中"
            });
        }
        
        const statusEl = document.getElementById('member-score-' + myId);
        if (statusEl) {
            statusEl.innerText = cText;
            statusEl.style.color = '#ffaa00';
        }
    },

    finishGame: function() {
        if (!this.isPlaying) return;
        this.isPlaying = false;

        this.updateScoreUI();
        this.syncMyScoreToManager("生存クリア"); 

        if (window.MinigameManager) window.MinigameManager.endGame();
    },

    onRetire: function(userId) {
        if (window.MinigameManager && window.MinigameManager.resultData) {
            const data = window.MinigameManager.resultData.find(d => d.id === userId);
            if (data) {
                data.isRetired = true;
                data.scoreValue = this.myScore; 
                data.scoreText = this.getScoreString();
                data.statusText = "リタイア";
            }
        }
    },

    end: function() {
        console.log("[Dead Zone] Game Ended.");
        this.isPlaying = false;
        this.isPrepared = false;
        
        if (window.ItemSystem) window.ItemSystem.isOnNet = false; 
        
        if (typeof player !== 'undefined' && player) {
            player.traverse(child => { if (child.isMesh) child.visible = true; });
        }

        // メッシュのクリーンアップ
        this.zoneSchedules.forEach(sch => {
            if (sch.meshGroup) {
                scene.remove(sch.meshGroup);
                sch.meshGroup.children.forEach(c => { c.geometry.dispose(); c.material.dispose(); });
            }
        });
        
        this.explosions.forEach(exp => {
            scene.remove(exp.mesh);
            exp.mesh.geometry.dispose();
            exp.mesh.material.dispose();
        });

        if (this.scoreUI) {
            this.scoreUI.remove();
            this.scoreUI = null;
        }

        this.validFloors = [];
        this.zoneSchedules = [];
        this.explosions = [];
    },

    createUI: function() {
        this.scoreUI = document.createElement('div');
        this.scoreUI.id = 'dead-zone-ui';
        
        const screenHeight = window.innerHeight;
        const topExclusionHeight = screenHeight >= 812 ? 98 : 74; 
        
        let colorHex = '#ff4444';
        
        this.scoreUI.style.cssText = `position: absolute; left: 10px; top: ${topExclusionHeight + 15}px; background: rgba(0,0,0,0.6); border: 2px solid ${colorHex}; border-radius: 12px; padding: 5px 15px; color: white; font-size: 18px; font-weight: bold; font-family: monospace; z-index: 100; box-shadow: 0 4px 10px rgba(0,0,0,0.5); pointer-events: none; display: flex; align-items: center; gap: 10px;`;
        
        this.scoreUI.innerHTML = `⏳ <span id="deadzone-score-count">00:00</span>`;
        
        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) uiLayer.appendChild(this.scoreUI);
    },

    updateScoreUI: function() {
        const countEl = document.getElementById('deadzone-score-count');
        if (countEl) countEl.innerText = this.getScoreString();
    },

    // コア連携用インターフェース
    getScoreValue: function() { return this.myScore; },
    getScoreString: function() { 
        let m = Math.floor(this.myScore / 60);
        let s = Math.floor(this.myScore % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`; 
    },
    getStatusString: function() { return this.isPlaying ? "生存中" : "終了"; }
};


