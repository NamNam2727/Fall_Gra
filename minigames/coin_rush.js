// =====================================
// minigames/coin_rush.js
// コインラッシュ プラグイン
// ★コインUIの表示タイミングを「3」のタイミングに修正
// ★UIのアイコンを実際のコインと同じ画像(Canvasからの生成)に変更
// =====================================

window.MinigamePlugins = window.MinigamePlugins || {};

window.MinigamePlugins['coin_rush'] = {
    coins: {}, 
    effects: [],
    coinGroup: null,
    effectGroup: null,
    isPlaying: false,
    isPrepared: false, // ★追加: 3のタイミングを検知するフラグ
    canGet: false,
    timeLimit: 3,     
    remainTime: 0,    
    myScore: 0,
    
    coinTexture: null,
    coinMaterial: null,
    coinGeometry: null,
    coinDataUrl: null, // ★追加: UI表示用のコイン画像データ
    
    coinUI: null,

    init: function(settings) {
        console.log("[Coin Rush] Initializing...");
        this.isPlaying = false;
        this.isPrepared = false;
        this.canGet = false;
        this.coins = {};
        this.effects = [];
        this.myScore = 0;
        this.timeLimit = settings && settings.time ? parseInt(settings.time, 10) : 3;

        this.originalExecuteRetire = window.MinigameManager.executeRetire;
        window.MinigameManager.executeRetire = () => {
            if (typeof player !== 'undefined' && player.position.y < -20) {
                this.handleFallPenalty();
            } else {
                this.originalExecuteRetire.call(window.MinigameManager);
            }
        };

        this.createMaterials();
        
        this.coinGroup = new THREE.Group();
        this.coinGroup.visible = false; // 待機中は非表示
        
        this.effectGroup = new THREE.Group();
        if (typeof scene !== 'undefined') {
            scene.add(this.coinGroup);
            scene.add(this.effectGroup);
        }

        this.placeCoins();
        // ★修正: ここではUIを生成せず、prepare時に生成する
    },

    start: function() {
        console.log("[Coin Rush] Game Started!");
        this.isPlaying = true;
        this.canGet = true; 
        this.remainTime = this.timeLimit * 60; 
    },

    update: function(delta) {
        // ★PLAYINGステートに移行しupdateが呼ばれ始めた（3,2,1のカウントダウンが開始）最初のフレームで準備を行う
        if (!this.isPrepared) {
            this.isPrepared = true;
            if (this.coinGroup) this.coinGroup.visible = true; // コインを表示
            this.createUI(); // スコアUIを表示
        }

        const elapsedTime = performance.now() / 1000;

        if (this.isPlaying) {
            this.remainTime -= delta;
            
            if (this.remainTime <= 0) {
                this.remainTime = 0;
                this.finishGame();
                return;
            } else if (Object.keys(this.coins).length === 0 && this.effects.length === 0) {
                this.finishGame();
                return;
            }

            let m = Math.floor(this.remainTime / 60);
            let s = Math.floor(this.remainTime % 60);
            let timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            if (window.MinigameUI) window.MinigameUI.updateTimer(timeStr);

            if (!window.isSpectatorMode && typeof player !== 'undefined' && player) {
                if (player.position.y < -25) {
                    this.handleFallPenalty();
                }
            }
        }

        const cycle = elapsedTime % 4.0;
        let rotY = 0;
        if (cycle >= 3.0) {
            const p = cycle - 3.0; 
            const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
            rotY = ease * Math.PI * 2;
        }

        for (let id in this.coins) {
            let coin = this.coins[id];
            coin.position.y = coin.userData.baseY + Math.sin(elapsedTime * 2 + coin.userData.randomOffset) * 0.5;
            coin.rotation.y = rotY;

            if (this.canGet && !window.isSpectatorMode && typeof player !== 'undefined' && player) {
                const dist = player.position.distanceTo(coin.position);
                if (dist < 3.0) { 
                    this.pickupCoin(id);
                }
            }
        }

        for (let i = this.effects.length - 1; i >= 0; i--) {
            let eff = this.effects[i];
            eff.timer -= delta;
            
            if (eff.timer <= 0) {
                this.effectGroup.remove(eff.mesh);
                this.effects.splice(i, 1);
            } else {
                const progress = 1.0 - eff.timer; 
                const currentOffset = eff.startOffset + (eff.endOffset - eff.startOffset) * Math.sin(progress * Math.PI / 2); 
                
                if (eff.target) {
                    eff.mesh.position.x = eff.target.position.x;
                    eff.mesh.position.z = eff.target.position.z;
                    eff.mesh.position.y = eff.target.position.y + currentOffset;
                } else {
                    eff.mesh.position.y += delta * 5.0; 
                }
                
                eff.mesh.rotation.y += delta * 20; 
                
                eff.mesh.material.forEach(m => {
                    m.opacity = eff.timer; 
                });
            }
        }
    },

    pickupCoin: function(id) {
        if (this.coins[id]) {
            let coin = this.coins[id];
            this.startGetEffect(coin, typeof player !== 'undefined' ? player : null);
            delete this.coins[id];
            
            this.myScore++;
            this.updateScoreUI();
            
            const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';
            
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

    startGetEffect: function(mesh, targetPlayerMesh) {
        this.coinGroup.remove(mesh);
        
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

    handleFallPenalty: function() {
        if (typeof window.addLog === 'function') {
            window.addLog('<span style="color:#ffaa00;">落下ペナルティ！コインが半分になった！</span>', 'sys');
        }
        
        this.myScore = Math.ceil(this.myScore / 2);
        this.updateScoreUI();

        if (typeof player !== 'undefined' && player) {
            player.position.set(0, 20, 0); 
        }
        window.isJumping = true; 
        window.verticalVelocity = 0;
        
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

        const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';
        if (window.MinigameManager && window.MinigameManager.resultData) {
            const myData = window.MinigameManager.resultData.find(d => d.id === myId);
            if (myData && !myData.isRetired) {
                myData.scoreValue = this.myScore;
                myData.scoreText = `${this.myScore}枚`;
            }
        }
        
        if (window.MinigameManager) {
            window.MinigameManager.endGame();
        }
    },

    onRetire: function(userId) {
        if (window.MinigameManager && window.MinigameManager.resultData) {
            const data = window.MinigameManager.resultData.find(d => d.id === userId);
            if (data) {
                data.isRetired = true;
                data.scoreValue = -1; 
                data.scoreText = "";
            }
        }
    },

    end: function() {
        console.log("[Coin Rush] Game Ended.");
        this.isPlaying = false;
        this.isPrepared = false;

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

        if (this.originalExecuteRetire) {
            window.MinigameManager.executeRetire = this.originalExecuteRetire;
            this.originalExecuteRetire = null;
        }

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

        if (this.coinUI) {
            this.coinUI.remove();
            this.coinUI = null;
        }
    },

    createUI: function() {
        this.coinUI = document.createElement('div');
        this.coinUI.id = 'coin-rush-ui';
        
        const screenHeight = window.innerHeight;
        const topExclusionHeight = screenHeight >= 812 ? 98 : 74; 
        
        this.coinUI.style.cssText = `position: absolute; left: 10px; top: ${topExclusionHeight + 15}px; background: rgba(0,0,0,0.6); border: 2px solid #ffaa00; border-radius: 12px; padding: 5px 15px; color: white; font-size: 20px; font-weight: bold; font-family: monospace; z-index: 100; box-shadow: 0 4px 10px rgba(0,0,0,0.5); pointer-events: none; display: flex; align-items: center; gap: 5px;`;
        
        // ★修正: 星の絵文字ではなく、作成したCanvasTextureの画像(base64)を表示する
        this.coinUI.innerHTML = `<img src="${this.coinDataUrl}" style="width:28px; height:28px; filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.8));"> <span id="coin-rush-count">0</span>`;
        
        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) uiLayer.appendChild(this.coinUI);
    },

    updateScoreUI: function() {
        const countEl = document.getElementById('coin-rush-count');
        if (countEl) countEl.innerText = this.myScore;
    },

    createMaterials: function() {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#FFD700'; 
        ctx.beginPath();
        ctx.arc(128, 128, 120, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.lineWidth = 15;
        ctx.strokeStyle = '#DAA520';
        ctx.stroke();

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
        
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#DDDDDD';
        ctx.stroke();

        // ★追加: 描画したCanvasから画像URL（base64）を生成し、UI用に保存
        this.coinDataUrl = canvas.toDataURL('image/png');

        this.coinTexture = new THREE.CanvasTexture(canvas);
        
        const sideMat = new THREE.MeshStandardMaterial({ color: 0xDAA520, roughness: 0.5, metalness: 0.5 });
        const faceMat = new THREE.MeshStandardMaterial({ map: this.coinTexture, roughness: 0.5, metalness: 0.5 });
        
        this.coinMaterial = [sideMat, faceMat, faceMat];
        
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
                    if (l.val === 0) return; 

                    let yT = l.top;
                    if (l.isOdd) {
                        let corners = window.MapGenerator.getCornerHeights(parsedMap, mapW, mapD, x, z, yT);
                        yT = corners.center;
                    }

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
