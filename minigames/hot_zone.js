// =====================================
// minigames/hot_zone.js
// ホットゾーン プラグイン
// ★シード付き疑似乱数(PRNG)を用いた完全ローカル同期
// ★通信を使わずに全員の画面で全く同じ場所にホットゾーンが出現・移動する
// =====================================

window.MinigamePlugins = window.MinigamePlugins || {};

window.MinigamePlugins['hot_zone'] = {
    isPlaying: false,
    isPrepared: false,
    settings: null,
    timeLimit: 3,
    remainTime: 0,
    
    myScore: 0,
    scoreUI: null,
    
    // ホットゾーン関連
    validFloors: [],      // 出現可能な床の座標リスト
    zonePositions: [],    // PRNGで生成された移動先の座標リスト
    currentZoneIndex: -1, // 現在のフェーズ
    zoneGroup: null,      // 光る円のメッシュ
    cylMesh: null,        // 円柱エフェクト
    zoneRadius: 10.0,     // ゾーンの半径
    zoneChangeInterval: 15.0, // 何秒ごとにゾーンが移動するか
    scoreTimer: 0,        // スコア加算用タイマー
    
    respawnTimer: 0,
    isRespawning: false,

    originalExecuteRetire: null,

    init: function(settings) {
        console.log("[Hot Zone] Initializing...");
        this.isPlaying = false;
        this.isPrepared = false;
        this.settings = settings;
        this.timeLimit = settings && settings.time ? parseInt(settings.time, 10) : 3;
        
        this.myScore = 0;
        this.scoreTimer = 0;
        this.respawnTimer = 0;
        this.isRespawning = false;
        
        this.validFloors = [];
        this.zonePositions = [];
        this.currentZoneIndex = -1;

        // 落下フック
        this.originalExecuteRetire = window.MinigameManager.executeRetire;
        window.MinigameManager.executeRetire = () => {
            if (typeof player !== 'undefined' && player.position.y < -20) {
                this.handleFallPenalty();
            } else {
                this.originalExecuteRetire.call(window.MinigameManager);
            }
        };
    },

    // ==========================================
    // 1. シード付き疑似乱数と床リストの生成
    // ==========================================
    // Mulberry32アルゴリズム（軽量で質の良いPRNG）
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
                
                // 一番上のレイヤーを取得
                let topLayer = layers[layers.length - 1];
                if (topLayer.val === 6) continue; // 外壁(6)には出現させない

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

    generateZonePositions: function(seed) {
        const prng = this.createPRNG(seed);
        this.zonePositions = [];
        
        // 制限時間(分) * 60 / 15秒 = 最大フェーズ数。余裕をもって100個生成しておく
        for (let i = 0; i < 100; i++) {
            let idx = Math.floor(prng() * this.validFloors.length);
            this.zonePositions.push(this.validFloors[idx]);
        }
    },

    // ==========================================
    // 2. ホットゾーンのエフェクト生成
    // ==========================================
    createZoneMesh: function() {
        this.zoneGroup = new THREE.Group();
        
        // バリアのような円柱
        const cylGeo = new THREE.CylinderGeometry(this.zoneRadius, this.zoneRadius, 20.0, 32, 1, true);
        const cylMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
        this.cylMesh = new THREE.Mesh(cylGeo, cylMat);
        this.cylMesh.position.y = 10.0; // 床から上へ伸ばす
        this.zoneGroup.add(this.cylMesh);

        // 床に表示する光るリング
        const ringGeo = new THREE.RingGeometry(this.zoneRadius - 1.0, this.zoneRadius, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = -Math.PI / 2;
        ringMesh.position.y = 0.5; // Zファイティング防止で少し浮かせる
        this.zoneGroup.add(ringMesh);

        // 最初は画面外(地下)に隠しておく
        this.zoneGroup.position.set(0, -100, 0);

        if (typeof scene !== 'undefined') {
            scene.add(this.zoneGroup);
        }
    },

    // ==========================================
    // 3. ゲームループと判定
    // ==========================================
    start: function() {
        console.log("[Hot Zone] Game Started!");
        this.isPlaying = true;
        this.remainTime = this.timeLimit * 60;
        
        // ゲーム開始時に強制的に0番目のフェーズに更新
        this.updateZonePosition(0);
    },

    update: function(delta) {
        // ★準備処理：targetStartTime(全クライアント共通)が決まってから乱数シードを展開する
        if (!this.isPrepared) {
            if (window.MinigameManager && window.MinigameManager.targetStartTime > 0) {
                this.isPrepared = true;
                this.collectValidFloors();
                this.generateZonePositions(window.MinigameManager.targetStartTime);
                this.createZoneMesh();
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

        // 落下チェック
        if (!window.isSpectatorMode && typeof player !== 'undefined' && player) {
            if (player.position.y < -25) {
                this.handleFallPenalty();
            }
        }

        let m = Math.floor(this.remainTime / 60);
        let s = Math.floor(this.remainTime % 60);
        let timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        if (window.MinigameUI) window.MinigameUI.updateTimer(timeStr);

        // デスペナルティ（リスポーン待機中）
        if (this.isRespawning) {
            this.respawnTimer -= delta;
            
            if (typeof player !== 'undefined' && player) {
                if (window.moveVector) window.moveVector.set(0, 0);   
                player.position.x = 0;
                player.position.z = 0;
                
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

        // ====================================================
        // ★ ホットゾーンの移動管理（通信不要のローカル同期）
        // ====================================================
        let elapsed = (this.timeLimit * 60) - this.remainTime;
        let phase = Math.floor(elapsed / this.zoneChangeInterval);
        
        if (phase !== this.currentZoneIndex && phase < this.zonePositions.length) {
            this.updateZonePosition(phase);
        }

        // 円柱アニメーション
        if (this.cylMesh) {
            this.cylMesh.rotation.y += delta * 0.5;
            this.cylMesh.material.opacity = 0.2 + 0.1 * Math.sin(performance.now() * 0.005);
        }

        // ====================================================
        // ★ スコア加算判定（ホットゾーンの中にいるか）
        // ====================================================
        if (!window.isSpectatorMode && typeof player !== 'undefined' && player) {
            let pos = this.zonePositions[this.currentZoneIndex];
            if (pos) {
                let dx = player.position.x - pos.x;
                let dz = player.position.z - pos.z;
                let dy = player.position.y - pos.y;
                
                // 円柱内判定：距離が半径以内、かつ高さが床から+15.0以内
                if (dx * dx + dz * dz <= this.zoneRadius * this.zoneRadius && dy >= -2.0 && dy <= 15.0) {
                    this.scoreTimer += delta;
                    // 0.5秒ごとに1ポイント加算
                    if (this.scoreTimer >= 0.5) {
                        this.myScore += 1;
                        this.scoreTimer -= 0.5;
                        this.updateScoreUI();
                        this.syncMyScoreToManager();
                    }
                } else {
                    this.scoreTimer = 0; // 外に出たらタイマーリセット
                }
            }
        }
    },

    updateZonePosition: function(phaseIndex) {
        this.currentZoneIndex = phaseIndex;
        let pos = this.zonePositions[phaseIndex];
        
        if (pos && this.zoneGroup) {
            this.zoneGroup.position.set(pos.x, pos.y, pos.z);
            
            // ゾーンが移動したことをログで通知
            if (phaseIndex > 0 && typeof window.addLog === 'function') {
                window.addLog('<span style="color:#ffaa00; font-weight:bold;">✨ ホットゾーンが移動した！ ✨</span>', 'sys');
            }
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
            statusEl.style.color = '#ffaa00';
        }
    },

    handleFallPenalty: function() {
        if (this.isRespawning) return;
        this.isRespawning = true;
        this.respawnTimer = 3.0; 
        
        if (typeof window.addLog === 'function') {
            window.addLog('<span style="color:#ffaa00;">落下ペナルティ！ 3秒間動けません。</span>', 'sys');
        }
        
        if (typeof player !== 'undefined' && player) {
            player.position.set(0, 20, 0); 
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
        console.log("[Hot Zone] Game Ended.");
        this.isPlaying = false;
        this.isPrepared = false;
        
        if (window.ItemSystem) window.ItemSystem.isOnNet = false; 
        
        if (typeof player !== 'undefined' && player) {
            player.traverse(child => { if (child.isMesh) child.visible = true; });
        }

        if (this.originalExecuteRetire) window.MinigameManager.executeRetire = this.originalExecuteRetire;

        if (this.zoneGroup && typeof scene !== 'undefined') {
            scene.remove(this.zoneGroup);
            this.zoneGroup.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            this.zoneGroup = null;
        }

        if (this.scoreUI) {
            this.scoreUI.remove();
            this.scoreUI = null;
        }

        this.validFloors = [];
        this.zonePositions = [];
    },

    createUI: function() {
        this.scoreUI = document.createElement('div');
        this.scoreUI.id = 'hot-zone-ui';
        
        const screenHeight = window.innerHeight;
        const topExclusionHeight = screenHeight >= 812 ? 98 : 74; 
        
        // ホットゾーンらしいオレンジ色のテーマ
        let colorHex = '#ffaa00';
        
        this.scoreUI.style.cssText = `position: absolute; left: 10px; top: ${topExclusionHeight + 15}px; background: rgba(0,0,0,0.6); border: 2px solid ${colorHex}; border-radius: 12px; padding: 5px 15px; color: white; font-size: 18px; font-weight: bold; font-family: monospace; z-index: 100; box-shadow: 0 4px 10px rgba(0,0,0,0.5); pointer-events: none; display: flex; align-items: center; gap: 10px;`;
        
        this.scoreUI.innerHTML = `<div style="width:20px; height:20px; background-color:${colorHex}; border-radius:50%; border:2px solid white; box-shadow: 0 0 8px ${colorHex};"></div> <span id="hotzone-score-count">0 pt</span>`;
        
        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) uiLayer.appendChild(this.scoreUI);
    },

    updateScoreUI: function() {
        const countEl = document.getElementById('hotzone-score-count');
        if (countEl) countEl.innerText = `${this.myScore} pt`;
    },

    // コア連携用インターフェース
    getScoreValue: function() { return this.myScore; },
    getScoreString: function() { return `${this.myScore} pt`; },
    getStatusString: function() { return ""; }
};

