// =====================================
// map_manager.js
// マップ変更UI、3Dプレビュー、同期と暗転演出を管理
// =====================================

window.MapManager = {
    currentMapId: 'default',
    state: 'IDLE', // IDLE, PROPOSING
    currentProposal: null,
    
    // プレビュー用3D
    preview: {
        scene: null, camera: null, renderer: null,
        mesh: null, reqId: null, isRunning: false,
        angle: Math.PI / 4, isDragging: false, lastX: 0
    },

    listIndex: 0,

    initUI: function() {
        const style = document.createElement('style');
        style.innerHTML = `
            #map-change-btn {
                position: absolute; left: 10px; padding: 6px 12px;
                background: rgba(40, 40, 60, 0.85); border: 2px solid rgba(100, 200, 255, 0.9);
                border-radius: 8px; color: #fff; font-weight: bold; font-family: sans-serif;
                font-size: 13px; box-shadow: 0 4px 10px rgba(0,0,0,0.4); pointer-events: auto;
                cursor: pointer; text-shadow: 1px 1px 2px rgba(0,0,0,0.5); z-index: 90;
                display: flex; justify-content: center; align-items: center; transition: 0.2s;
            }
            #map-change-btn:active { background: rgba(40, 40, 60, 1.0); transform: scale(0.95); }
            #map-change-btn.proposing { background: rgba(255, 100, 0, 0.85); border-color: #ffaa00; }

            #map-window {
                position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                width: 90%; max-width: 450px; height: 75%; max-height: 550px;
                background: rgba(15, 15, 25, 0.95); border: 3px solid #64c8ff; border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.8); display: none; flex-direction: column;
                z-index: 2000; pointer-events: auto; font-family: sans-serif; color: white;
            }
            
            .map-header {
                display: flex; justify-content: space-between; align-items: center;
                padding: 10px 15px; border-bottom: 2px solid rgba(255,255,255,0.2); font-size: 16px; font-weight: bold;
            }
            .map-header-btn { background: none; border: none; color: white; font-size: 20px; cursor: pointer; padding: 0 5px; font-weight: bold; }

            .map-preview-area {
                width: 100%; height: 220px; background: #87CEEB; position: relative;
                border-bottom: 2px solid #555; overflow: hidden; flex-shrink: 0;
            }
            #map-preview-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; cursor: grab; }
            #map-preview-canvas:active { cursor: grabbing; }
            .map-preview-hint { position: absolute; bottom: 5px; right: 5px; background: rgba(0,0,0,0.5); color: white; font-size: 11px; padding: 3px 6px; border-radius: 4px; pointer-events: none; }

            .map-info-area { flex: 1; padding: 15px; display: flex; flex-direction: column; overflow-y: auto; }
            .map-nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
            .map-nav-btn { background: #444; border: 2px solid #666; color: white; width: 40px; height: 40px; border-radius: 50%; font-size: 20px; cursor: pointer; font-weight: bold; }
            .map-nav-btn:active { background: #666; transform: scale(0.95); }
            #map-title-display { font-size: 20px; font-weight: bold; color: #64c8ff; text-align: center; flex: 1; text-shadow: 0 2px 4px rgba(0,0,0,0.5); }
            #map-desc-display { font-size: 13px; line-height: 1.5; color: #ddd; background: rgba(0,0,0,0.4); padding: 10px; border-radius: 8px; flex: 1; }

            #map-start-btn { width: 100%; padding: 15px; background: #4CAF50; color: white; font-size: 18px; font-weight: bold; border: none; border-radius: 8px; cursor: pointer; margin-top: 15px; box-shadow: 0 4px 10px rgba(0,0,0,0.4); }
            #map-start-btn:active { transform: scale(0.98); background: #45a049; }
            #map-start-btn:disabled { background: #555; color: #888; cursor: not-allowed; transform: none; }

            #map-fade-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: black; opacity: 0; pointer-events: none;
                transition: opacity 0.5s ease; z-index: 99999;
            }
        `;
        document.head.appendChild(style);

        const uiLayer = document.getElementById('ui-layer');
        if (!uiLayer) return;

        const screenHeight = window.innerHeight;
        const topExclusionHeight = screenHeight >= 812 ? 98 : 74; 

        // 1. 左上のマップ変更ボタン
        const mapBtn = document.createElement('div');
        mapBtn.id = 'map-change-btn';
        mapBtn.innerText = 'マップ変更';
        mapBtn.style.top = (topExclusionHeight + 15) + 'px';
        uiLayer.appendChild(mapBtn);

        // 2. マップ選択ウィンドウ
        const mapWindow = document.createElement('div');
        mapWindow.id = 'map-window';
        mapWindow.innerHTML = `
            <div class="map-header">
                <span>マップ選択</span>
                <button class="map-header-btn" id="map-close-btn">❌</button>
            </div>
            <div class="map-preview-area">
                <div id="map-preview-canvas"></div>
                <div class="map-preview-hint">↔ ドラッグで回転</div>
            </div>
            <div class="map-info-area">
                <div class="map-nav">
                    <button class="map-nav-btn" id="map-prev-btn">⬅</button>
                    <div id="map-title-display">マップ名</div>
                    <button class="map-nav-btn" id="map-next-btn">➡</button>
                </div>
                <div id="map-desc-display">説明文</div>
                <button id="map-start-btn">このマップに変更する</button>
            </div>
        `;
        uiLayer.appendChild(mapWindow);

        // 3. 暗転オーバーレイ
        const fadeOverlay = document.createElement('div');
        fadeOverlay.id = 'map-fade-overlay';
        document.body.appendChild(fadeOverlay);

        // イベント設定
        const preventTouch = (e) => e.stopPropagation();
        
        mapBtn.addEventListener('mousedown', preventTouch);
        mapBtn.addEventListener('touchstart', preventTouch, {passive: false});
        mapBtn.addEventListener('click', () => {
            if (window.MinigameManager && window.MinigameManager.state !== 'IDLE') return; // ミニゲーム中は不可
            if (this.state === 'PROPOSING') {
                if (window.MinigameManager && typeof window.MinigameManager.showProposalPopup === 'function') {
                    // ミニゲームのポップアップUIを使い回す
                    window.MinigameManager.showProposalPopup();
                }
            } else {
                this.openSelector();
            }
        });

        mapWindow.addEventListener('mousedown', preventTouch);
        mapWindow.addEventListener('touchstart', preventTouch, {passive: false});
        mapWindow.querySelector('#map-close-btn').addEventListener('click', () => { this.closeSelector(); });
        
        mapWindow.querySelector('#map-prev-btn').addEventListener('click', () => {
            this.listIndex = (this.listIndex - 1 + window.MapList.length) % window.MapList.length;
            this.renderCurrentMap();
        });
        mapWindow.querySelector('#map-next-btn').addEventListener('click', () => {
            this.listIndex = (this.listIndex + 1) % window.MapList.length;
            this.renderCurrentMap();
        });

        mapWindow.querySelector('#map-start-btn').addEventListener('click', () => {
            this.proposeMapChange();
        });

        this.initPreview3D();

        // 毎フレームのボタン表示チェック
        setInterval(() => {
            if (window.MinigameManager && window.MinigameManager.state !== 'IDLE') {
                mapBtn.style.display = 'none';
            } else {
                mapBtn.style.display = 'flex';
            }
        }, 500);
    },

    initPreview3D: function() {
        if (typeof THREE === 'undefined') return;

        this.preview.scene = new THREE.Scene();
        this.preview.scene.background = new THREE.Color(0x87CEEB);
        this.preview.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
        this.preview.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.preview.renderer.setPixelRatio(window.devicePixelRatio);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.preview.scene.add(ambientLight);
        
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(20, 40, 20);
        this.preview.scene.add(dirLight);

        // ドラッグ操作の実装
        const container = document.getElementById('map-preview-canvas');
        if (!container) return;

        const onStart = (x) => { this.preview.isDragging = true; this.preview.lastX = x; };
        const onMove = (x) => {
            if (!this.preview.isDragging) return;
            const dx = x - this.preview.lastX;
            this.preview.angle -= dx * 0.01;
            this.preview.lastX = x;
        };
        const onEnd = () => { this.preview.isDragging = false; };

        container.addEventListener('mousedown', (e) => onStart(e.clientX));
        document.addEventListener('mousemove', (e) => onMove(e.clientX));
        document.addEventListener('mouseup', onEnd);
        
        container.addEventListener('touchstart', (e) => { e.stopPropagation(); onStart(e.touches[0].clientX); }, {passive: false});
        container.addEventListener('touchmove', (e) => { e.stopPropagation(); onMove(e.touches[0].clientX); }, {passive: false});
        container.addEventListener('touchend', onEnd);
    },

    openSelector: function() {
        document.getElementById('map-window').style.display = 'flex';
        // 現在のマップを選択した状態にする
        this.listIndex = window.MapList.findIndex(m => m.id === this.currentMapId);
        if (this.listIndex === -1) this.listIndex = 0;
        
        const container = document.getElementById('map-preview-canvas');
        container.innerHTML = '';
        container.appendChild(this.preview.renderer.domElement);
        
        const w = container.clientWidth;
        const h = container.clientHeight;
        this.preview.camera.aspect = w / h;
        this.preview.camera.updateProjectionMatrix();
        this.preview.renderer.setSize(w, h);

        this.preview.isRunning = true;
        this.renderCurrentMap();
        this.animatePreview();
    },

    closeSelector: function() {
        document.getElementById('map-window').style.display = 'none';
        this.preview.isRunning = false;
        if (this.preview.reqId) cancelAnimationFrame(this.preview.reqId);
        const container = document.getElementById('map-preview-canvas');
        if (container) container.innerHTML = '';
    },

    renderCurrentMap: function() {
        const mapData = window.MapList[this.listIndex];
        document.getElementById('map-title-display').innerText = mapData.title;
        document.getElementById('map-desc-display').innerText = mapData.description;

        const startBtn = document.getElementById('map-start-btn');
        if (mapData.id === this.currentMapId) {
            startBtn.disabled = true;
            startBtn.innerText = '現在このマップにいます';
        } else {
            startBtn.disabled = false;
            startBtn.innerText = 'このマップに変更する';
        }

        // 3Dプレビューの生成
        if (this.preview.mesh) {
            this.preview.scene.remove(this.preview.mesh);
            this.preview.mesh.geometry.dispose();
            this.preview.mesh.material.dispose();
            this.preview.mesh = null;
        }

        // 動的ロード
        if (!window['MapData_' + mapData.id]) {
            if (window.loadGameScript) {
                window.loadGameScript(mapData.script, () => {
                    this.buildPreviewMesh(mapData.id);
                });
            }
        } else {
            this.buildPreviewMesh(mapData.id);
        }
    },

    buildPreviewMesh: function(mapId) {
        if (!window['MapData_' + mapId] || !window.MapGenerator) return;
        
        // 元のデータを退避して生成
        const backupData = window.MapGenerator.rawMapData;
        window.MapGenerator.rawMapData = window['MapData_' + mapId];
        
        this.preview.mesh = window.MapGenerator.createMesh();
        // プレビュー用に少し暗くする
        this.preview.mesh.material.roughness = 1.0;
        
        this.preview.scene.add(this.preview.mesh);
        
        // データを戻す
        window.MapGenerator.rawMapData = backupData;
    },

    animatePreview: function() {
        if (!this.preview.isRunning) return;
        this.preview.reqId = requestAnimationFrame(() => this.animatePreview());

        // 全体を俯瞰するカメラ計算
        const dist = 160;
        const height = 100;
        this.preview.camera.position.x = Math.sin(this.preview.angle) * dist;
        this.preview.camera.position.z = Math.cos(this.preview.angle) * dist;
        this.preview.camera.position.y = height;
        this.preview.camera.lookAt(0, 0, 0);

        this.preview.renderer.render(this.preview.scene, this.preview.camera);
    },

    // ==========================================
    // 申請と同期のシステム
    // ==========================================
    proposeMapChange: function() {
        const mapData = window.MapList[this.listIndex];
        this.closeSelector();

        const timestamp = Date.now();
        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');

        // ミニゲームのプロポーザル形式を模倣して、UIを使い回す
        this.currentProposal = {
            isMapChange: true, // フラグ
            mapId: mapData.id,
            title: mapData.title + ' (マップ変更)',
            icon: 'https://namnam2727.github.io/Fall_Gra/title.PNG', // 仮アイコン
            proposerId: myId,
            timestamp: timestamp,
            votes: { [myId]: true }
        };

        this.state = 'PROPOSING';
        
        const mapBtn = document.getElementById('map-change-btn');
        if (mapBtn) {
            mapBtn.innerText = 'マップ変更申請中';
            mapBtn.classList.add('proposing');
        }

        let totalUsers = 1;
        if (window.MultiplayerManager && window.MultiplayerManager.otherPlayers) {
            totalUsers = Object.keys(window.MultiplayerManager.otherPlayers).length + 1;
        }

        if (totalUsers === 1) {
            if (typeof window.addLog === 'function') window.addLog('<span style="color:#00ff00;">マップを変更します！</span>', 'sys');
            this.executeMapChange(this.currentProposal.mapId);
        } else {
            if (typeof window.addLog === 'function') window.addLog('<span style="color:#00ff00;">マップ変更を申請しました。他プレイヤーの承諾を待っています...</span>', 'sys');
            if (window.MultiplayerManager) {
                window.MultiplayerManager.sendData({ type: 'map_propose', proposal: this.currentProposal });
            }
            
            // 申請受付時間のタイマー(60秒)
            this.proposeEndTime = timestamp + 60000;
            const updateTimer = () => {
                if (this.state !== 'PROPOSING') return;
                const remain = Math.ceil((this.proposeEndTime - Date.now()) / 1000);
                if (remain > 0) {
                    requestAnimationFrame(updateTimer);
                } else {
                    this.checkVotes(true); // 時間切れで実行
                }
            };
            updateTimer();
        }
    },

    receiveProposal: function(proposal) {
        if (window.MinigameManager && window.MinigameManager.state !== 'IDLE') return;

        this.state = 'PROPOSING';
        this.currentProposal = proposal;
        
        const mapBtn = document.getElementById('map-change-btn');
        if (mapBtn) {
            mapBtn.innerText = 'マップ変更申請中';
            mapBtn.classList.add('proposing');
        }

        // ミニゲームのポップアップUIを借りる
        if (window.MinigameManager) {
            const originalProp = window.MinigameManager.currentProposal;
            window.MinigameManager.currentProposal = proposal;
            
            // ポップアップ内のボタン処理をフック
            const originalShowPopup = window.MinigameManager.showProposalPopup;
            
            window.MinigameManager.showProposalPopup = function() {
                originalShowPopup.call(window.MinigameManager);
                
                document.getElementById('mg-popup-rules').innerText = "全員が承諾するか、60秒経過でマップが切り替わります。(1人でも拒否でキャンセル)";
                document.getElementById('mg-popup-desc').innerText = "マップが変更されると、全員が初期位置に戻り、アイテムはリセットされます。";
                
                const btnContainer = document.getElementById('mg-popup-btns-container');
                btnContainer.innerHTML = '';
                
                const joinBtn = document.createElement('button');
                joinBtn.className = 'mg-popup-btn join';
                joinBtn.innerText = '承諾する';
                joinBtn.onclick = () => {
                    document.getElementById('mg-proposal-popup').style.display = 'none';
                    if (typeof window.addLog === 'function') window.addLog('マップ変更を承諾しました。', 'sys');
                    window.MapManager.sendVote(true);
                };
                
                const declineBtn = document.createElement('button');
                declineBtn.className = 'mg-popup-btn decline';
                declineBtn.innerText = '拒否する';
                declineBtn.onclick = () => {
                    document.getElementById('mg-proposal-popup').style.display = 'none';
                    window.MapManager.sendVote(false);
                };
                
                btnContainer.appendChild(joinBtn);
                btnContainer.appendChild(declineBtn);
            };
            
            window.MinigameManager.showProposalPopup();
            
            // 元に戻す
            window.MinigameManager.showProposalPopup = originalShowPopup;
            window.MinigameManager.currentProposal = originalProp;
        }
    },

    sendVote: function(isAgree) {
        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
        if (this.currentProposal) {
            this.currentProposal.votes[myId] = isAgree;
        }
        if (window.MultiplayerManager) {
            window.MultiplayerManager.sendData({ type: 'map_vote', userId: myId, vote: isAgree });
        }
        
        // 拒否した瞬間にキャンセル処理を走らせる
        if (!isAgree) {
            this.cancelProposal("あなたがマップ変更を拒否したため、キャンセルされました。");
            if (window.MultiplayerManager) window.MultiplayerManager.sendData({ type: 'map_cancel', reason: "メンバーがマップ変更を拒否したため、キャンセルされました。" });
        } else {
            this.checkVotes();
        }
    },

    checkVotes: function(isTimeUp = false) {
        if (this.state !== 'PROPOSING' || !this.currentProposal) return;

        let totalUsers = 1;
        if (window.MultiplayerManager && window.MultiplayerManager.otherPlayers) {
            totalUsers = Object.keys(window.MultiplayerManager.otherPlayers).length + 1;
        }
        
        let agreeCount = 0;
        let hasDecline = false;
        
        for (let uid in this.currentProposal.votes) {
            if (this.currentProposal.votes[uid] === true) agreeCount++;
            if (this.currentProposal.votes[uid] === false) hasDecline = true;
        }

        if (hasDecline) {
            // 誰かが拒否した
            this.cancelProposal("メンバーがマップ変更を拒否したため、キャンセルされました。");
            return;
        }

        if (agreeCount >= totalUsers || isTimeUp) {
            // 全員賛成 or 時間切れで実行
            this.executeMapChange(this.currentProposal.mapId);
        }
    },

    cancelProposal: function(reason) {
        if (this.state === 'IDLE') return;
        this.state = 'IDLE';
        this.currentProposal = null;
        
        const popup = document.getElementById('mg-proposal-popup');
        if (popup) popup.style.display = 'none';
        
        const mapBtn = document.getElementById('map-change-btn');
        if (mapBtn) {
            mapBtn.classList.remove('proposing');
            mapBtn.innerText = 'マップ変更';
        }
        
        if (typeof window.addLog === 'function') window.addLog(`<span style="color:#ff3300;">${reason}</span>`, 'sys');
    },

    executeMapChange: function(mapId) {
        this.state = 'IDLE';
        this.currentMapId = mapId;
        this.currentProposal = null;
        
        const popup = document.getElementById('mg-proposal-popup');
        if (popup) popup.style.display = 'none';
        
        const mapBtn = document.getElementById('map-change-btn');
        if (mapBtn) {
            mapBtn.classList.remove('proposing');
            mapBtn.innerText = 'マップ変更';
        }

        // 1. 暗転フェードアウト
        const overlay = document.getElementById('map-fade-overlay');
        overlay.style.opacity = '1';
        
        if (typeof window.addLog === 'function') window.addLog('<span style="color:#00ffff;">マップを切り替えています...</span>', 'sys');

        setTimeout(() => {
            // 2. マップ再生成
            if (!window['MapData_' + mapId]) {
                const scriptPath = window.MapList.find(m => m.id === mapId).script;
                if (window.loadGameScript) {
                    window.loadGameScript(scriptPath, () => { this.rebuildMapMesh(mapId); });
                }
            } else {
                this.rebuildMapMesh(mapId);
            }
        }, 600); // 0.6秒待つ
    },

    rebuildMapMesh: function(mapId) {
        if (!window.MapGenerator || typeof scene === 'undefined') return;

        // 古いマップを消去
        if (window.mapMesh) {
            scene.remove(window.mapMesh);
            window.mapMesh.geometry.dispose();
            window.mapMesh.material.dispose();
            window.mapMesh = null;
        }

        // 新しいマップ生成
        window.MapGenerator.rawMapData = window['MapData_' + mapId];
        window.mapMesh = window.MapGenerator.createMesh();
        scene.add(window.mapMesh);

        // アイテムのリセット
        if (window.ItemSystem && typeof window.ItemSystem.clearAllItems === 'function') {
            window.ItemSystem.clearAllItems();
        }

        // プレイヤーの初期化
        if (typeof player !== 'undefined' && player) {
            player.position.set(0, 20, 0);
            window.verticalVelocity = 0;
            window.isJumping = true;
        }
        
        if (window.MultiplayerManager && typeof window.MultiplayerManager.forceSendPos === 'function') {
            window.MultiplayerManager.forceSendPos();
        }

        // 3. 暗転フェードイン
        setTimeout(() => {
            const overlay = document.getElementById('map-fade-overlay');
            overlay.style.opacity = '0';
        }, 100);
    },

    handleNetworkMessage: function(msg) {
        if (msg.type === 'map_propose') {
            this.receiveProposal(msg.proposal);
        } else if (msg.type === 'map_vote') {
            if (this.currentProposal && this.currentProposal.votes) {
                this.currentProposal.votes[String(msg.userId)] = msg.vote;
                if (msg.vote === false) {
                    this.cancelProposal("メンバーがマップ変更を拒否したため、キャンセルされました。");
                } else {
                    this.checkVotes();
                }
            }
        } else if (msg.type === 'map_cancel') {
            this.cancelProposal(msg.reason);
        } else if (msg.type === 'map_sync_current') {
            // 後入りユーザーが現在のマップ情報を受け取った時
            if (this.currentMapId !== msg.mapId) {
                this.executeMapChange(msg.mapId);
            }
        }
    }
};

// Three.jsロード完了後にUI初期化を行うため、少し遅延させる
setTimeout(() => {
    if (window.MapManager && typeof window.MapManager.initUI === 'function') {
        window.MapManager.initUI();
    }
}, 3000);

