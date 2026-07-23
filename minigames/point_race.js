// =====================================
// minigames/point_race.js
// ポイントレース プラグイン
// ★シード値による共通チェックポイント生成（ユーザー間で位置の順番は完全一致）
// ★チェックポイントの取得判定はローカルで独立して進行（早い者勝ちではない）
// ★crown_chase.js の矢印ガイドを応用して次のチェックポイントの方向を指示
// ★落下時はリタイアにならず、前回通過したチェックポイントに復帰する
// =====================================

window.MinigamePlugins = window.MinigamePlugins || {};

window.MinigamePlugins['point_race'] = {
    isPlaying: false,
    isPrepared: false,
    settings: null,
    timeLimit: 3,
    remainTime: 0,
    
    myScore: 0, // 通過したチェックポイント数
    scoreUI: null,
    
    validFloors: [],
    checkpointSequence: [],      // 生成されたチェックポイントの座標リスト
    currentCheckpointIndex: 0,   // 現在目指しているチェックポイントのインデックス
    
    checkpointGroup: null,       // チェックポイントのメッシュ
    guideArrow: null,            // 方向指示矢印
    
    respawnTimer: 0,
    isRespawning: false,

    originalExecuteRetire: null,
    originalReplyMyScore: null,

    init: function(settings) {
        console.log("[Point Race] Initializing...");
        this.isPlaying = false;
        this.isPrepared = false;
        this.settings = settings;
        this.timeLimit = settings && settings.time ? parseInt(settings.time, 10) : 3;
        
        this.myScore = 0;
        this.respawnTimer = 0;
        this.isRespawning = false;
        
        this.validFloors = [];
        this.checkpointSequence = [];
        this.currentCheckpointIndex = 0;

        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
        const self = this;

        // 1. 落下フック
        this.originalExecuteRetire = window.MinigameManager.executeRetire;
        window.MinigameManager.executeRetire = () => {
            if (typeof player !== 'undefined' && player.position.y < -20) {
                this.handleFallPenalty();
            } else {
                this.originalExecuteRetire.call(window.MinigameManager);
            }
        };

        // 2. スコア同期のフック
        this.originalReplyMyScore = window.MinigameManager.replyMyScore;
        window.MinigameManager.replyMyScore = function() {
            if (this.currentProposal && this.currentProposal.gameId === 'point_race') {
                if (this.state !== 'PLAYING') return;
                
                const myData = this.resultData.find(d => String(d.id) === myId);
                let cVal = 0, cText = "", cStatus = "";

                if (myData && myData.isRetired) {
                    cVal = myData.scoreValue;
                    cText = myData.scoreText;
                    cStatus = "リタイア";
                } else {
                    cVal = self.myScore;
                    cText = `${self.myScore} pt`;
                    cStatus = "プレイ中";
                }

                if (window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
                    window.MultiplayerManager.sendData({
                        type: 'mg_reply_score',
                        userId: myId,
                        currentScoreText: cText,
                        currentScoreValue: cVal,
                        currentStatusText: cStatus
                    });
                }
                
                if (myData) {
                    myData.currentScoreText = cText;
                    myData.currentScoreValue = cVal;
                    myData.currentStatusText = cStatus;
                }
                
                const statusEl = document.getElementById('member-score-' + myId);
                if (statusEl) {
                    statusEl.innerText = cText;
                    statusEl.style.color = '#00ffcc';
                }
            } else {
                if (self.originalReplyMyScore) self.originalReplyMyScore.call(this);
            }
        };
    },

    // ==========================================
    // 1. シード付き疑似乱数とチェックポイントのリスト生成
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
                
                // アイテム出現ルールに準じ、高すぎる場所を省く
                if (yT <= 10.0) {
                    this.validFloors.push({ x: px, y: py, z: pz });
                }
            }
        }
    },

    generateCheckpoints: function(seed) {
        const prng = this.createPRNG(seed);
        this.checkpointSequence = [];
        
        // 余裕を持って1000個生成しておく
        for (let i = 0; i < 1000; i++) {
            let idx = Math.floor(prng() * this.validFloors.length);
            this.checkpointSequence.push(this.validFloors[idx]);
        }
    },

    // ==========================================
    // 2. メッシュ・エフェクト・ガイドの生成
    // ==========================================
    createCheckpointMesh: function() {
        this.checkpointGroup = new THREE.Group();
        
        // 光る円柱エフェクト
        const cylGeo = new THREE.CylinderGeometry(2.0, 2.0, 15.0, 16, 1, true);
        const cylMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
        const cylMesh = new THREE.Mesh(cylGeo, cylMat);
        cylMesh.position.y = 7.5; 
        this.checkpointGroup.add(cylMesh);

        // 床のリング
        const ringGeo = new THREE.RingGeometry(1.5, 2.5, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = -Math.PI / 2;
        ringMesh.position.y = 0.5; 
        this.checkpointGroup.add(ringMesh);

        // 中心に浮かぶ旗のアイコン
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.font = 'bold 80px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
        ctx.fillStyle = '#ffffff'; ctx.fillText('🚩', 64, 64);
        
        const tex = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(3, 3, 1);
        sprite.position.y = 4.0;
        this.checkpointGroup.add(sprite);

        // 最初は隠しておく
        this.checkpointGroup.position.set(0, -100, 0);

        if (typeof scene !== 'undefined') {
            scene.add(this.checkpointGroup);
        }
    },

    createGuideArrow: function() {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = 'rgba(0, 255, 204, 0.8)'; // チェックポイントと同系統のシアン
        ctx.beginPath();
        ctx.moveTo(64, 118); ctx.lineTo(100, 58); ctx.lineTo(76, 58);
        ctx.lineTo(76, 10); ctx.lineTo(52, 10); ctx.lineTo(52, 58);
        ctx.lineTo(28, 58); ctx.closePath();
        ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; ctx.stroke();

        const tex = new THREE.CanvasTexture(canvas);
        const geo = new THREE.PlaneGeometry(4, 4);
        geo.rotateX(-Math.PI / 2); 
        
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false });
        this.guideArrow = new THREE.Mesh(geo, mat);
        this.guideArrow.visible = false;
        
        if (typeof scene !== 'undefined') {
            scene.add(this.guideArrow);
        }
    },

    // ==========================================
    // 3. ゲームループと判定
    // ==========================================
    start: function() {
        console.log("[Point Race] Game Started!");
        this.isPlaying = true;
        this.remainTime = this.timeLimit * 60;
        
        this.currentCheckpointIndex = 0;
        this.updateCheckpointVisual();
        
        if (typeof window.addLog === 'function') {
            window.addLog('<span style="color:#00ffcc; font-weight:bold;">🚩 ポイントレース開始！ 矢印を追え！ 🚩</span>', 'sys');
        }
    },

    update: function(delta) {
        if (!this.isPrepared) {
            if (window.MinigameManager && window.MinigameManager.targetStartTime > 0) {
                this.isPrepared = true;
                this.collectValidFloors();
                this.generateCheckpoints(window.MinigameManager.targetStartTime);
                this.createCheckpointMesh();
                this.createGuideArrow();
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

        let m = Math.floor(this.remainTime / 60);
        let s = Math.floor(this.remainTime % 60);
        let timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        if (window.MinigameUI) window.MinigameUI.updateTimer(timeStr);

        // ★追加: 落下をコアのリタイア判定（-30）より手前で検知
        if (!window.isSpectatorMode && typeof player !== 'undefined' && player) {
            if (player.position.y < -25) {
                this.handleFallPenalty();
            }
        }

        // 落下ペナルティ (スタン)
        if (this.isRespawning) {
            this.respawnTimer -= delta;
            if (typeof player !== 'undefined' && player) {
                if (window.moveVector) window.moveVector.set(0, 0);  
                
                // ★前回通過したチェックポイントがあれば座標を固定し、なければ初期スポーン地点に固定する
                if (this.currentCheckpointIndex > 0 && this.checkpointSequence[this.currentCheckpointIndex - 1]) {
                    let lastCp = this.checkpointSequence[this.currentCheckpointIndex - 1];
                    player.position.x = lastCp.x;
                    player.position.z = lastCp.z;
                } else if (window.MapManager && typeof window.MapManager.getSpawnPosition === 'function') {
                    const spawnPos = window.MapManager.getSpawnPosition(window.MapManager.currentMapId);
                    player.position.x = spawnPos.x;
                    player.position.z = spawnPos.z;
                }
                
                if (window.ItemSystem) window.ItemSystem.isOnNet = true;
                const isVisible = Math.floor(this.respawnTimer * 10) % 2 === 0;
                player.traverse(child => { if (child.isMesh) child.visible = isVisible; });
            }
            if (this.respawnTimer <= 0) {
                this.isRespawning = false;
                if (window.ItemSystem) window.ItemSystem.isOnNet = false;
                if (typeof window.addLog === 'function') window.addLog('<span style="color:#00ff00;">復帰しました！</span>', 'sys');
                if (typeof player !== 'undefined' && player) {
                    player.traverse(child => { if (child.isMesh) child.visible = true; });
                }
            }
            return; 
        }

        // チェックポイントの回転アニメーション
        if (this.checkpointGroup && this.checkpointGroup.children[0]) {
            this.checkpointGroup.children[0].rotation.y += delta * 2.0;
            this.checkpointGroup.children[2].position.y = 4.0 + Math.sin(performance.now() * 0.005) * 0.5;
        }

        // ====================================================
        // ★ チェックポイントの通過判定と矢印ガイドの更新
        // ====================================================
        if (!window.isSpectatorMode && typeof player !== 'undefined' && player) {
            let targetPos = this.checkpointSequence[this.currentCheckpointIndex];
            
            if (targetPos) {
                // 1. 矢印ガイドの更新
                if (this.guideArrow) {
                    this.guideArrow.visible = true;
                    this.guideArrow.position.set(player.position.x, player.position.y + 0.2, player.position.z);
                    this.guideArrow.lookAt(targetPos.x, this.guideArrow.position.y, targetPos.z);
                }

                // 2. 通過（接触）判定
                let dx = player.position.x - targetPos.x;
                let dz = player.position.z - targetPos.z;
                let dy = player.position.y - targetPos.y;
                
                // 半径3.0の円柱範囲内に入ったか
                if (dx * dx + dz * dz <= 9.0 && dy >= -2.0 && dy <= 10.0) {
                    this.currentCheckpointIndex++;
                    this.myScore = this.currentCheckpointIndex;
                    
                    this.updateScoreUI();
                    this.syncMyScoreToManager();
                    this.updateCheckpointVisual();
                    
                    if (typeof window.addLog === 'function') {
                        window.addLog('<span style="color:#00ffcc;">🚩 チェックポイント通過！ 次へ急げ！</span>', 'sys');
                    }
                }
            }
        } else {
            if (this.guideArrow) this.guideArrow.visible = false;
        }
    },

    updateCheckpointVisual: function() {
        let nextPos = this.checkpointSequence[this.currentCheckpointIndex];
        if (nextPos && this.checkpointGroup) {
            this.checkpointGroup.position.set(nextPos.x, nextPos.y, nextPos.z);
        } else if (this.checkpointGroup) {
            this.checkpointGroup.position.set(0, -100, 0); // 弾切れフェイルセーフ
        }
    },

    // ==========================================
    // 4. UI・スコア・リザルト管理
    // ==========================================
    syncMyScoreToManager: function(statusText = "") {
        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
        let cText = `${this.myScore} pt`;
        
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
                currentStatusText: statusText || "プレイ中"
            });
        }
        
        const statusEl = document.getElementById('member-score-' + myId);
        if (statusEl) {
            statusEl.innerText = cText;
            statusEl.style.color = '#00ffcc';
        }
    },

    handleFallPenalty: function() {
        if (this.isRespawning) return;
        this.isRespawning = true;
        this.respawnTimer = 3.0; 
        
        if (typeof window.addLog === 'function') {
            window.addLog('<span style="color:#ffaa00;">落下ペナルティ！ 前回のチェックポイントから復帰します。(3秒間停止)</span>', 'sys');
        }

        if (typeof player !== 'undefined' && player) {
            // ★前回通過したチェックポイントがある場合はそこへ復帰、なければ初期位置
            if (this.currentCheckpointIndex > 0 && this.checkpointSequence[this.currentCheckpointIndex - 1]) {
                let lastCp = this.checkpointSequence[this.currentCheckpointIndex - 1];
                player.position.set(lastCp.x, lastCp.y + 5.0, lastCp.z);
            } else if (window.MapManager && typeof window.MapManager.respawnPlayer === 'function') {
                window.MapManager.respawnPlayer();
            } else {
                player.position.set(0, 20, 0); 
            }
            window.verticalVelocity = 0;
            window.isJumping = true; 
            if (window.ItemSystem) window.ItemSystem.isOnNet = true;
        }

        if (window.MultiplayerManager && typeof window.MultiplayerManager.forceSendPos === 'function') {
            window.MultiplayerManager.forceSendPos();
        }
    },

    finishGame: function() {
        if (!this.isPlaying) return;
        this.isPlaying = false;

        this.updateScoreUI();
        this.syncMyScoreToManager("タイムアップ"); 

        if (window.MinigameManager) window.MinigameManager.endGame();
    },

    onRetire: function(userId) {
        if (window.MinigameManager && window.MinigameManager.resultData) {
            const data = window.MinigameManager.resultData.find(d => d.id === userId);
            if (data) {
                data.isRetired = true;
                data.scoreValue = -1; 
                data.scoreText = "リタイア";
                data.statusText = "リタイア";
            }
        }
    },

    end: function() {
        console.log("[Point Race] Game Ended.");
        this.isPlaying = false;
        this.isPrepared = false;
        
        if (window.ItemSystem) window.ItemSystem.isOnNet = false; 
        
        if (typeof player !== 'undefined' && player) {
            player.traverse(child => { if (child.isMesh) child.visible = true; });
        }

        if (this.originalExecuteRetire) window.MinigameManager.executeRetire = this.originalExecuteRetire;
        if (this.originalReplyMyScore) window.MinigameManager.replyMyScore = this.originalReplyMyScore;

        if (this.checkpointGroup && typeof scene !== 'undefined') {
            scene.remove(this.checkpointGroup);
            this.checkpointGroup.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            this.checkpointGroup = null;
        }
        
        if (this.guideArrow && typeof scene !== 'undefined') {
            scene.remove(this.guideArrow);
            this.guideArrow.material.map.dispose();
            this.guideArrow.material.dispose();
            this.guideArrow.geometry.dispose();
            this.guideArrow = null;
        }

        if (this.scoreUI) {
            this.scoreUI.remove();
            this.scoreUI = null;
        }

        this.validFloors = [];
        this.checkpointSequence = [];
    },

    createUI: function() {
        this.scoreUI = document.createElement('div');
        this.scoreUI.id = 'point-race-ui';
        
        const screenHeight = window.innerHeight;
        const topExclusionHeight = screenHeight >= 812 ? 98 : 74; 
        
        let colorHex = '#00ffcc';
        
        this.scoreUI.style.cssText = `position: absolute; left: 10px; top: ${topExclusionHeight + 15}px; background: rgba(0,0,0,0.6); border: 2px solid ${colorHex}; border-radius: 12px; padding: 5px 15px; color: white; font-size: 20px; font-weight: bold; font-family: monospace; z-index: 100; box-shadow: 0 4px 10px rgba(0,0,0,0.5); pointer-events: none; display: flex; align-items: center; gap: 8px;`;
        
        this.scoreUI.innerHTML = `<span style="font-size:24px; filter: drop-shadow(0 0 5px ${colorHex}); text-shadow: 0 0 10px ${colorHex};">🚩</span> <span id="point-race-score-count">0 pt</span>`;
        
        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) uiLayer.appendChild(this.scoreUI);
    },

    updateScoreUI: function() {
        const countEl = document.getElementById('point-race-score-count');
        if (countEl) countEl.innerText = `${this.myScore} pt`;
    },

    // コア連携用インターフェース
    getScoreValue: function() { return this.myScore; },
    getScoreString: function() { return `${this.myScore} pt`; },
    getStatusString: function() { return ""; }
};
