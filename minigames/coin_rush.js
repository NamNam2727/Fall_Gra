// =====================================
// minigames/coin_rush.js
// コインラッシュ プラグイン
// フィールドに大量のコインを配置し、獲得数を競う
// ★落下によるリタイアを阻止し、デスペナルティ(コイン半減)に変更
// =====================================

window.MinigamePlugins = window.MinigamePlugins || {};

window.MinigamePlugins['coin_rush'] = {
    coins: {}, 
    effects: [],
    coinGroup: null,
    effectGroup: null,
    isPlaying: false,
    canGet: false,
    timeLimit: 3,     
    remainTime: 0,    
    startTime: 0,
    myScore: 0,
    
    coinTexture: null,
    coinMaterial: null,
    coinGeometry: null,
    
    originalExecuteRetire: null,
    coinUI: null,

    init: function(settings) {
        console.log("[Coin Rush] Initializing...");
        this.isPlaying = false;
        this.canGet = false;
        this.coins = {};
        this.effects = [];
        this.myScore = 0;
        this.timeLimit = settings && settings.time ? parseInt(settings.time, 10) : 3;

        // ★落下によるリタイアを阻止し、独自のペナルティ処理にハイジャックする
        this.originalExecuteRetire = window.MinigameManager.executeRetire;
        window.MinigameManager.executeRetire = () => {
            // Y座標が-20以下の場合は落下判定
            if (typeof player !== 'undefined' && player.position.y < -20) {
                this.handleFallPenalty();
            } else {
                // UIから明示的に「リタイア」を押した場合は本来の処理を実行
                this.originalExecuteRetire.call(window.MinigameManager);
            }
        };

        this.createMaterials();
        
        this.coinGroup = new THREE.Group();
        this.effectGroup = new THREE.Group();
        if (typeof scene !== 'undefined') {
            scene.add(this.coinGroup);
            scene.add(this.effectGroup);
        }

        this.placeCoins();
        this.createUI();
    },

    start: function() {
        console.log("[Coin Rush] Game Started!");
        this.isPlaying = true;
        this.canGet = true;
        this.remainTime = this.timeLimit * 60; 
        this.startTime = Date.now(); 
    },

    update: function(delta) {
        const now = Date.now();
        const elapsedTime = (now - this.startTime) / 1000;

        if (this.isPlaying) {
            this.remainTime -= delta;
            
            // 終了判定（時間切れ or 全コイン取得）
            if (this.remainTime <= 0) {
                this.remainTime = 0;
                this.finishGame();
                return;
            } else if (Object.keys(this.coins).length === 0 && this.effects.length === 0) {
                this.finishGame();
                return;
            }

            // タイマーの更新
            let m = Math.floor(this.remainTime / 60);
            let s = Math.floor(this.remainTime % 60);
            let timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            if (window.MinigameUI) window.MinigameUI.updateTimer(timeStr);
        }

        // コインのプカプカ＆回転アニメーション
        const cycle = elapsedTime % 4.0;
        let rotY = 0;
        if (cycle >= 3.0) {
            // 3秒経過〜4秒の間の1秒間で1回転するイーズアニメーション
            const p = cycle - 3.0; 
            const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
            rotY = ease * Math.PI * 2;
        }

        for (let id in this.coins) {
            let coin = this.coins[id];
            coin.position.y = coin.userData.baseY + Math.sin(elapsedTime * 2 + coin.userData.randomOffset) * 0.5;
            coin.rotation.y = rotY;

            // 取得判定
            if (this.canGet && !window.isSpectatorMode && typeof player !== 'undefined' && player) {
                const dist = player.position.distanceTo(coin.position);
                if (dist < 3.0) { 
                    this.pickupCoin(id);
                }
            }
        }

        // 獲得エフェクトの更新（マリオ風）
        for (let i = this.effects.length - 1; i >= 0; i--) {
            let eff = this.effects[i];
            eff.timer -= delta;
            
            if (eff.timer <= 0) {
                this.effectGroup.remove(eff.mesh);
                this.effects.splice(i, 1);
            } else {
                const progress = 1.0 - eff.timer; // 0.0 -> 1.0
                // 頭上に跳ね上がるイーズアウト
                const currentOffset = eff.startOffset + (eff.endOffset - eff.startOffset) * Math.sin(progress * Math.PI / 2); 
                
                if (eff.target) {
                    eff.mesh.position.x = eff.target.position.x;
                    eff.mesh.position.z = eff.target.position.z;
                    eff.mesh.position.y = eff.target.position.y + currentOffset;
                } else {
                    eff.mesh.position.y += delta * 5.0; 
                }
                
                eff.mesh.rotation.y += delta * 20; // 高速回転
                
                // 透明化
                eff.mesh.material.forEach(m => {
                    m.opacity = eff.timer; 
                });
            }
        }
    },

    // 自分でコインを取った時の処理
    pickupCoin: function(id) {
        if (this.coins[id]) {
            let coin = this.coins[id];
            this.startGetEffect(coin, typeof player !== 'undefined' ? player : null);
            delete this.coins[id];
            
            this.myScore++;
            this.updateScoreUI();
            
            const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';
            
            // スコアとコイン消失の同期
            if (window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
                window.MultiplayerManager.sendData({
                    type: 'mg_plugin_sync',
                    data: { action: 'get_coin', id: id, userId: myId }
                });
                
                window.MultiplayerManager.sendData({
                    type: 'mg_update_score',
                    userId: myId,
                    scoreValue: this.myScore,
                    scoreText: `${this.myScore}枚`,
                    statusText: "",
                    isRetired: false
                });
            }
        }
    },

    // 他人がコインを取った時の通信処理
    handleNetwork: function(data) {
        if (data.action === 'get_coin') {
            if (this.coins[data.id]) {
                let coin = this.coins[data.id];
                let targetMesh = null;
                if (window.MultiplayerManager && window.MultiplayerManager.otherPlayers[data.userId]) {
                    targetMesh = window.MultiplayerManager.otherPlayers[data.userId].mesh;
                }
                this.startGetEffect(coin, targetMesh);
                delete this.coins[data.id];
            }
        }
    },

    // マリオ風の獲得エフェクト開始
    startGetEffect: function(mesh, targetPlayerMesh) {
        this.coinGroup.remove(mesh);
        
        // エフェクト用にマテリアルをクローンして独立して透明化できるようにする
        mesh.material = mesh.material.map(m => m.clone());
        mesh.material.forEach(m => { m.transparent = true; });

        this.effectGroup.add(mesh);
        
        this.effects.push({
            mesh: mesh,
            target: targetPlayerMesh,
            timer: 1.0, 
            startOffset: 2.0, 
            endOffset: 6.0    
        });
    },

    // 落下時のデスペナルティ
    handleFallPenalty: function() {
        if (typeof window.addLog === 'function') {
            window.addLog('<span style="color:#ff3300;">落下ペナルティ！コインが半分になった！</span>', 'sys');
        }
        
        // デスペナルティ: 所持コイン数を半分にして切り上げ (5枚なら3枚になる)
        this.myScore = Math.ceil(this.myScore / 2);
        this.updateScoreUI();

        // 復帰処理
        if (typeof player !== 'undefined' && player) {
            player.position.set(0, 20, 0); 
        }
        window.isJumping = true; 
        window.verticalVelocity = 0;
        
        // 減ったスコアの同期
        const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';
        if (window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
            window.MultiplayerManager.sendData({
                type: 'mg_update_score',
                userId: myId,
                scoreValue: this.myScore,
                scoreText: `${this.myScore}枚`,
                statusText: "",
                isRetired: false
            });
        }
    },

    finishGame: function() {
        if (!this.isPlaying) return;
        this.isPlaying = false;

        // 自身の最終結果を登録
        const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';
        if (window.MinigameManager && window.MinigameManager.resultData) {
            const myData = window.MinigameManager.resultData.find(d => d.id === myId);
            if (myData) {
                myData.scoreValue = this.myScore;
                myData.scoreText = `${this.myScore}枚`;
            }
        }
        
        if (window.MinigameManager) {
            window.MinigameManager.endGame();
        }
    },

    onRetire: function(userId) {
        // 通常のリタイア処理が呼ばれた際のスコア固定
        if (window.MinigameManager && window.MinigameManager.resultData) {
            const data = window.MinigameManager.resultData.find(d => d.id === userId);
            if (data) {
                data.isRetired = true;
                data.scoreValue = -1; // 最下位扱い
                data.scoreText = "";
            }
        }
    },

    end: function() {
        console.log("[Coin Rush] Game Ended.");
        this.isPlaying = false;

        // ランキングの計算
        if (window.MinigameManager && window.MinigameManager.resultData) {
            let rd = window.MinigameManager.resultData;
            rd.sort((a, b) => b.scoreValue - a.scoreValue);
            
            let currentRank = 1;
            for (let i = 0; i < rd.length; i++) {
                if (i > 0 && rd[i].scoreValue < rd[i-1].scoreValue) {
                    currentRank = i + 1;
                }
                rd[i].rank = currentRank;
            }
        }

        // ハイジャックの解除
        if (this.originalExecuteRetire) {
            window.MinigameManager.executeRetire = this.originalExecuteRetire;
            this.originalExecuteRetire = null;
        }

        // オブジェクトの破棄
        if (this.coinGroup && typeof scene !== 'undefined') {
            scene.remove(this.coinGroup);
            this.coinGroup.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.forEach(m => m.dispose());
            });
            this.coinGroup = null;
        }
        if (this.effectGroup && typeof scene !== 'undefined') {
            scene.remove(this.effectGroup);
            this.effectGroup = null;
        }
        if (this.coinTexture) this.coinTexture.dispose();
        
        this.coins = {};
        this.effects = [];

        // UIの破棄
        if (this.coinUI) {
            this.coinUI.remove();
            this.coinUI = null;
        }
    },

    // ---------------------------------
    // 初期生成関連の処理
    // ---------------------------------
    createUI: function() {
        this.coinUI = document.createElement('div');
        this.coinUI.id = 'coin-rush-ui';
        
        const screenHeight = window.innerHeight;
        const topExclusionHeight = screenHeight >= 812 ? 98 : 74; 
        
        this.coinUI.style.cssText = `position: absolute; left: 10px; top: ${topExclusionHeight + 15}px; background: rgba(0,0,0,0.6); border: 2px solid #ffaa00; border-radius: 12px; padding: 5px 15px; color: white; font-size: 20px; font-weight: bold; font-family: monospace; z-index: 100; box-shadow: 0 4px 10px rgba(0,0,0,0.5); pointer-events: none; display: flex; align-items: center; gap: 5px;`;
        this.coinUI.innerHTML = `<span style="color:#FFD700; font-size:24px;">⭐</span> <span id="coin-rush-count">0</span>`;
        
        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) uiLayer.appendChild(this.coinUI);
    },

    updateScoreUI: function() {
        const countEl = document.getElementById('coin-rush-count');
        if (countEl) countEl.innerText = this.myScore;
    },

    createMaterials: function() {
        // Canvasによる黄色いコインと白い星形のテクスチャ生成
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        // ベースの円盤（黄色）
        ctx.fillStyle = '#FFD700'; 
        ctx.beginPath();
        ctx.arc(128, 128, 120, 0, Math.PI * 2);
        ctx.fill();
        
        // 厚みの縁取り
        ctx.lineWidth = 15;
        ctx.strokeStyle = '#DAA520';
        ctx.stroke();

        // 中央の星型（白）
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        const cx = 128, cy = 128, spikes = 5, outerRadius = 60, innerRadius = 30;
        let rot = Math.PI / 2 * 3;
        let x = cx, y = cy - outerRadius;
        const step = Math.PI / spikes;

        ctx.moveTo(cx, cy - outerRadius);
        for (let i = 0; i < spikes; i++) {
            x = cx + Math.cos(rot) * outerRadius;
            y = cy + Math.sin(rot) * outerRadius;
            ctx.lineTo(x, y);
            rot += step;

            x = cx + Math.cos(rot) * innerRadius;
            y = cy + Math.sin(rot) * innerRadius;
            ctx.lineTo(x, y);
            rot += step;
        }
        ctx.lineTo(cx, cy - outerRadius);
        ctx.closePath();
        ctx.fill();
        
        // 星の窪みの影
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#DDDDDD';
        ctx.stroke();

        this.coinTexture = new THREE.CanvasTexture(canvas);
        
        // 側面は単色のゴールド、表裏にテクスチャ
        const sideMat = new THREE.MeshStandardMaterial({ color: 0xDAA520, roughness: 0.5, metalness: 0.5 });
        const faceMat = new THREE.MeshStandardMaterial({ map: this.coinTexture, roughness: 0.5, metalness: 0.5 });
        
        this.coinMaterial = [sideMat, faceMat, faceMat];
        
        // 初期状態から立てておく（ワールドY軸で綺麗に回るようにする）
        this.coinGeometry = new THREE.CylinderGeometry(1.5, 1.5, 0.4, 32);
        this.coinGeometry.rotateX(Math.PI / 2);
    },

    placeCoins: function() {
        if (!window.MapGenerator) return;
        const { parsedMap, mapW, mapD } = window.MapGenerator.parseMap();
        const bs = typeof blockSize !== 'undefined' ? blockSize : 10;

        for (let x = 0; x < mapW; x++) {
            for (let z = 0; z < mapD; z++) {
                let layers = parsedMap[x][z];
                layers.forEach((l, layerIndex) => {
                    if (l.val === 0) return; // 空間はスキップ

                    let yT = l.top;
                    if (l.isOdd) {
                        let corners = window.MapGenerator.getCornerHeights(parsedMap, mapW, mapD, x, z, yT);
                        yT = corners.center;
                    }

                    // ブロックの上面の高さから浮かせる
                    let py = yT * bs + 2.0; 
                    let px = (x - mapW / 2 + 0.5) * bs;
                    let pz = (z - mapD / 2 + 0.5) * bs;
                    
                    const coinId = `coin_${x}_${z}_${layerIndex}`;
                    
                    const coinMesh = new THREE.Mesh(this.coinGeometry, this.coinMaterial);
                    coinMesh.position.set(px, py, pz);
                    coinMesh.castShadow = true;
                    
                    coinMesh.userData = {
                        id: coinId,
                        baseY: py,
                        randomOffset: Math.random() * Math.PI * 2 
                    };
                    
                    this.coinGroup.add(coinMesh);
                    this.coins[coinId] = coinMesh;
                });
            }
        }
    }
};
