// =====================================
// map_manager.js
// マップ変更UI、3Dプレビュー、同期と暗転演出を管理
// ★ ❌ボタンの追加、3Dプレビューの確実な描画、タイマー周りのUI調整
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
            .map-preview-hint { position: absolute; bottom: 5px; right: 5px; background: rgba(0,0,0,0.5); color: white; font-size: 11px; padding: 3px 6px; border-radius: 4px; pointer-events: none; z-index: 10; }

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

        // 左上のマップ変更ボタン
        const mapBtn = document.createElement('div');
        mapBtn.id = 'map-change-btn';
        mapBtn.innerText = 'マップ変更';
        mapBtn.style.top = (topExclusionHeight + 15) + 'px';
        uiLayer.appendChild(mapBtn);

        // マップ選択ウィンドウ (自分で選ぶ用)
        const mapWindow = document.createElement('div');
        mapWindow.id = 'map-window';
        mapWindow.innerHTML = `
            <div class="map-header">
                <span>マップ選択</span>
                <button class="map-header-btn" id="map-close-btn">❌</button>
            </div>
            <div class="map-preview-area" id="map-preview-area">
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

        const fadeOverlay = document.createElement('div');
        fadeOverlay.id = 'map-fade-overlay';
        document.body.appendChild(fadeOverlay);

        // イベント設定
        const preventTouch = (e) => e.stopPropagation();
        
        mapBtn.addEventListener('mousedown', preventTouch);
        mapBtn.addEventListener('touchstart', preventTouch, {passive: false});
        mapBtn.addEventListener('click', () => {
            if (window.MinigameManager && window.MinigameManager.state !== 'IDLE') return;
            
            if (this.state === 'PROPOSING') {
                this.showMapProposalPopup();
            } else {
                this.openSelector();
            }
        });

        mapWindow.addEventListener('mousedown', preventTouch);
        mapWindow.addEventListener('touchstart', preventTouch, {passive: false});
        
        // 通常のマップウィンドウの閉じるボタン
        const closeBtn = mapWindow.querySelector('#map-close-btn');
        closeBtn.addEventListener('click', () => { this.closeSelector(); });
        closeBtn.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.closeSelector(); }, {passive: false});
        
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

        const dom = this.preview.renderer.domElement;
        dom.style.position = 'absolute';
        dom.style.top = '0';
        dom.style.left = '0';
        dom.style.width = '100%';
        dom.style.height = '100%';
        dom.style.cursor = 'grab';
        
        dom.addEventListener('mousedown', () => { dom.style.cursor = 'grabbing'; });
        dom.addEventListener('mouseup', () => { dom.style.cursor = 'grab'; });

        const onStart = (x) => { this.preview.isDragging = true; this.preview.lastX = x; };
        const onMove = (x) => {
            if (!this.preview.isDragging) return;
            const dx = x - this.preview.lastX;
            this.preview.angle -= dx * 0.01;
            this.preview.lastX = x;
        };
        const onEnd = () => { this.preview.isDragging = false; dom.style.cursor = 'grab'; };

        dom.addEventListener('mousedown', (e) => { e.stopPropagation(); onStart(e.clientX); });
        document.addEventListener('mousemove', (e) => onMove(e.clientX));
        document.addEventListener('mouseup', onEnd);
        
        dom.addEventListener('touchstart', (e) => { e.stopPropagation(); onStart(e.touches[0].clientX); }, {passive: false});
        dom.addEventListener('touchmove', (e) => { e.stopPropagation(); onMove(e.touches[0].clientX); }, {passive: false});
        dom.addEventListener('touchend', onEnd);
    },

    openSelector: function() {
        document.getElementById('map-window').style.display = 'flex';
        this.listIndex = window.MapList.findIndex(m => m.id === this.currentMapId);
        if (this.listIndex === -1) this.listIndex = 0;
        
        const container = document.getElementById('map-preview-area');
        container.appendChild(this.preview.renderer.domElement);
        
        // UIが展開されてサイズが確定してからリサイズ処理を行う
        setTimeout(() => {
            const w = container.clientWidth;
            const h = container.clientHeight;
            this.preview.camera.aspect = w / h;
            this.preview.camera.updateProjectionMatrix();
            this.preview.renderer.setSize(w, h);
        }, 10);

        this.preview.isRunning = true;
        this.renderCurrentMap();
        this.animatePreview();
    },

    closeSelector: function() {
        document.getElementById('map-window').style.display = 'none';
        this.preview.isRunning = false;
        if (this.preview.reqId) cancelAnimationFrame(this.preview.reqId);
        
        const dom = this.preview.renderer.domElement;
        if (dom.parentNode) dom.parentNode.removeChild(dom);
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

        if (this.preview.mesh) {
            this.preview.scene.remove(this.preview.mesh);
            this.preview.mesh.geometry.dispose();
            this.preview.mesh.material.dispose();
            this.preview.mesh = null;
        }

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
        
        const backupData = window.MapGenerator.rawMapData;
        window.MapGenerator.rawMapData = window['MapData_' + mapId];
        
        this.preview.mesh = window.MapGenerator.createMesh();
        this.preview.mesh.material.roughness = 1.0;
        
        this.preview.scene.add(this.preview.mesh);
        window.MapGenerator.rawMapData = backupData;
    },

    animatePreview: function() {
        if (!this.preview.isRunning) return;
        this.preview.reqId = requestAnimationFrame(() => this.animatePreview());

        const mapDataInfo = window.MapList[this.listIndex];
        let mapW = 21, mapD = 21;
        if (mapDataInfo && window['MapData_' + mapDataInfo.id]) {
            const mData = window['MapData_' + mapDataInfo.id];
            mapW = mData.length;
            mapD = mData[0].length;
        }
        
        const bs = typeof blockSize !== 'undefined' ? blockSize : 4.0;
        const maxDim = Math.max(mapW, mapD);
        const actualSize = maxDim * bs;

        const dist = actualSize * 0.9;
        const height = actualSize * 0.7;

        this.preview.camera.position.x = Math.sin(this.preview.angle) * dist;
        this.preview.camera.position.z = Math.cos(this.preview.angle) * dist;
        this.preview.camera.position.y = height;
        this.preview.camera.lookAt(0, 0, 0);

        this.preview.renderer.render(this.preview.scene, this.preview.camera);
    },

    getSpawnPosition: function(mapId) {
        const mapData = window.MapList.find(m => m.id === mapId);
        let px = 0, py = 20, pz = 0;
        
        if (mapData && mapData.spawnGrid) {
            const bs = typeof blockSize !== 'undefined' ? blockSize : 4.0;
            let mapW = 21, mapD = 21;
            
            if (window['MapData_' + mapId]) {
                mapW = window['MapData_' + mapId].length;
                mapD = window['MapData_' + mapId][0].length;
            } else if (window.MapGenerator && window.MapGenerator.rawMapData.length > 0) {
                mapW = window.MapGenerator.rawMapData.length;
                mapD = window.MapGenerator.rawMapData[0].length;
            }
            
            if (mapData.spawnGrid.row !== undefined && mapData.spawnGrid.col !== undefined) {
                px = (mapData.spawnGrid.row - mapW / 2 + 0.5) * bs;
                pz = (mapData.spawnGrid.col - mapD / 2 + 0.5) * bs;
            }
        }
        return new THREE.Vector3(px, py, pz);
    },

    respawnPlayer: function() {
        if (typeof player === 'undefined' || !player) return;
        const spawnPos = this.getSpawnPosition(this.currentMapId);
        player.position.copy(spawnPos);
        window.verticalVelocity = 0;
        window.isJumping = true;
        
        if (window.MultiplayerManager && typeof window.MultiplayerManager.forceSendPos === 'function') {
            window.MultiplayerManager.forceSendPos();
        }
    },

    // ==========================================
    // 申請と同期のシステム
    // ==========================================
    
    showMapProposalPopup: function() {
        const popup = document.getElementById('mg-proposal-popup');
        if (!popup || !this.currentProposal) return;
        
        // ヘッダーに❌ボタンを追加（ミニゲーム側で既に存在する場合は再利用）
        const headerEl = popup.querySelector('.mg-popup-header');
        if (headerEl) {
            let closeBtn = document.getElementById('mg-popup-close-btn');
            if (!closeBtn) {
                closeBtn = document.createElement('button');
                closeBtn.id = 'mg-popup-close-btn';
                closeBtn.innerText = '❌';
                closeBtn.style.cssText = 'background: none; border: none; color: white; font-size: 20px; cursor: pointer; font-weight: bold; padding: 0 5px;';
                // mg-popup-title の横に配置
                headerEl.style.display = 'flex';
                headerEl.style.justifyContent = 'space-between';
                headerEl.appendChild(closeBtn);
            }
            
            // ❌ボタンのイベント（マップ申請中はUIを閉じるだけで、申請自体はキャンセルしない）
            closeBtn.onclick = () => {
                popup.style.display = 'none';
                this.preview.isRunning = false;
                const dom = this.preview.renderer.domElement;
                if (dom.parentNode) dom.parentNode.removeChild(dom);
            };
        }

        const titleEl = document.getElementById('mg-popup-title');
        if (titleEl) titleEl.innerText = this.currentProposal.title;
        
        // アイコン非表示
        const iconEl = document.getElementById('mg-popup-icon');
        if (iconEl) iconEl.style.display = 'none';
        
        // プレビューコンテナの作成
        let previewContainer = document.getElementById('map-proposal-preview-container');
        if (!previewContainer) {
            previewContainer = document.createElement('div');
            previewContainer.id = 'map-proposal-preview-container';
            previewContainer.style.cssText = 'width: 100%; height: 160px; background-color: #87CEEB; border-radius: 8px; margin: 10px 0; position: relative; overflow: hidden; flex-shrink: 0;';
            
            const hint = document.createElement('div');
            hint.style.cssText = 'position: absolute; bottom: 5px; right: 5px; background: rgba(0,0,0,0.5); color: white; font-size: 11px; padding: 3px 6px; border-radius: 4px; pointer-events: none; z-index: 10;';
            hint.innerText = '↔ ドラッグで回転';
            previewContainer.appendChild(hint);

            const rulesEl = document.getElementById('mg-popup-rules');
            if (rulesEl) rulesEl.parentNode.insertBefore(previewContainer, rulesEl);
        }
        
        previewContainer.appendChild(this.preview.renderer.domElement);
        
        setTimeout(() => {
            const w = previewContainer.clientWidth;
            const h = previewContainer.clientHeight;
            if (w > 0 && h > 0) {
                this.preview.camera.aspect = w / h;
                this.preview.camera.updateProjectionMatrix();
                this.preview.renderer.setSize(w, h);
            }
        }, 10);

        this.listIndex = window.MapList.findIndex(m => m.id === this.currentProposal.mapId);
        if (this.listIndex === -1) this.listIndex = 0;
        this.renderCurrentMap();
        this.preview.isRunning = true;
        this.animatePreview();
        
        const rulesEl = document.getElementById('mg-popup-rules');
        if (rulesEl) rulesEl.innerText = "全員が承諾するか、時間経過でマップが切り替わります。(1人でも拒否でキャンセル)";
        
        const descEl = document.getElementById('mg-popup-desc');
        if (descEl) descEl.innerText = "マップが変更されると、全員が初期位置に戻り、アイテムはリセットされます。";
        
        const btnContainer = document.getElementById('mg-popup-btns-container');
        if (btnContainer) {
            btnContainer.innerHTML = '';
            
            // 残り時間表示と改行（余白）
            const remainEl = document.createElement('div');
            remainEl.id = 'map-proposal-remain';
            remainEl.style.cssText = 'color: #ffaa00; font-weight: bold; margin-bottom: 20px; text-align: center; font-size: 14px;';
            btnContainer.appendChild(remainEl);
            
            const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
            const isProposer = String(this.currentProposal.proposerId) === myId;
            let hasVoted = this.currentProposal.votes[myId] !== undefined;

            if (isProposer) {
                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'mg-popup-btn decline'; 
                cancelBtn.style.width = '100%';
                cancelBtn.innerText = '申請を取り下げる';
                cancelBtn.onclick = () => {
                    this.sendMapCancel("申請者がマップ変更を取り下げました。");
                };
                btnContainer.appendChild(cancelBtn);
            } else if (hasVoted) {
                const waitMsg = document.createElement('div');
                waitMsg.style.color = '#00ffff';
                waitMsg.style.fontWeight = 'bold';
                waitMsg.innerText = '他のプレイヤーの返答を待っています...';
                btnContainer.appendChild(waitMsg);
            } else {
                const joinBtn = document.createElement('button');
                joinBtn.className = 'mg-popup-btn join';
                joinBtn.innerText = '承諾する';
                joinBtn.onclick = () => {
                    if (typeof window.addLog === 'function') window.addLog('マップ変更を承諾しました。', 'sys');
                    this.sendVote(true);
                };
                
                const declineBtn = document.createElement('button');
                declineBtn.className = 'mg-popup-btn decline';
                declineBtn.innerText = '拒否する';
                declineBtn.onclick = () => {
                    this.sendVote(false);
                };
                btnContainer.appendChild(joinBtn);
                btnContainer.appendChild(declineBtn);
            }
        }
        
        popup.style.display = 'flex';
        
        const mgCloseBtn = document.getElementById('mg-popup-close');
        if (mgCloseBtn && !mgCloseBtn.dataset.mapHooked) {
            mgCloseBtn.dataset.mapHooked = 'true';
            mgCloseBtn.addEventListener('click', () => {
                if (iconEl) iconEl.style.display = 'block';
                if (previewContainer && previewContainer.parentNode) {
                    previewContainer.parentNode.removeChild(previewContainer);
                }
                this.preview.isRunning = false;
            });
        }
    },

    proposeMapChange: function() {
        const mapData = window.MapList[this.listIndex];
        this.closeSelector();

        const timestamp = Date.now();
        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');

        this.currentProposal = {
            isMapChange: true,
            mapId: mapData.id,
            title: mapData.title + ' (マップ変更)',
            proposerId: myId,
            timestamp: timestamp,
            votes: { [myId]: true }
        };

        this.state = 'PROPOSING';
        
        const mapBtn = document.getElementById('map-change-btn');
        if (mapBtn) {
            mapBtn.innerText = 'マップ詳細';
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
            
            // 申請者はタイマーのみ開始 (UIは「マップ詳細」を押すまで出さない)
            this.startProposalTimer(timestamp);
        }
    },

    receiveProposal: function(proposal) {
        if (window.MinigameManager && window.MinigameManager.state !== 'IDLE') return;

        this.state = 'PROPOSING';
        this.currentProposal = proposal;
        
        const mapBtn = document.getElementById('map-change-btn');
        if (mapBtn) {
            mapBtn.innerText = 'マップ詳細';
            mapBtn.classList.add('proposing');
        }

        this.showMapProposalPopup();
        this.startProposalTimer(proposal.timestamp);
    },

    startProposalTimer: function(startTimestamp) {
        this.proposeEndTime = startTimestamp + 60000;
        
        const updateTimer = () => {
            if (this.state !== 'PROPOSING') return;
            
            const remain = Math.ceil((this.proposeEndTime - Date.now()) / 1000);
            const remainEl = document.getElementById('map-proposal-remain');
            if (remainEl) {
                remainEl.innerText = `残り時間: ${Math.max(0, remain)}秒`;
            }
            
            if (remain > 0) {
                requestAnimationFrame(updateTimer);
            } else {
                this.checkVotes(true);
            }
        };
        updateTimer();
    },

    sendVote: function(isAgree) {
        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
        if (this.currentProposal) {
            this.currentProposal.votes[myId] = isAgree;
        }
        if (window.MultiplayerManager) {
            window.MultiplayerManager.sendData({ type: 'map_vote', userId: myId, vote: isAgree });
        }
        
        if (!isAgree) {
            this.sendMapCancel("あなたがマップ変更を拒否したため、キャンセルされました。");
        } else {
            this.showMapProposalPopup(); 
            this.checkVotes();
        }
    },
    
    sendMapCancel: function(reason) {
        this.cancelProposal(reason);
        if (window.MultiplayerManager) {
            window.MultiplayerManager.sendData({ type: 'map_cancel', reason: reason });
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
            this.cancelProposal("メンバーがマップ変更を拒否したため、キャンセルされました。");
            return;
        }

        if (agreeCount >= totalUsers || isTimeUp) {
            this.executeMapChange(this.currentProposal.mapId);
        }
    },

    cancelProposal: function(reason) {
        if (this.state === 'IDLE') return;
        this.state = 'IDLE';
        this.currentProposal = null;
        this.preview.isRunning = false;
        
        const popup = document.getElementById('mg-proposal-popup');
        if (popup) popup.style.display = 'none';
        
        const iconEl = document.getElementById('mg-popup-icon');
        if (iconEl) iconEl.style.display = 'block';
        
        const previewContainer = document.getElementById('map-proposal-preview-container');
        if (previewContainer && previewContainer.parentNode) {
            previewContainer.parentNode.removeChild(previewContainer);
        }
        
        const mapBtn = document.getElementById('map-change-btn');
        if (mapBtn) {
            mapBtn.classList.remove('proposing');
            mapBtn.innerText = 'マップ変更';
        }
        
        // ❌ボタンもリセット
        const closeBtn = document.getElementById('mg-popup-close-btn');
        if (closeBtn) closeBtn.remove();
        
        if (typeof window.addLog === 'function') window.addLog(`<span style="color:#ff3300;">${reason}</span>`, 'sys');
    },

    setupInitialMap: function(mapId) {
        this.currentMapId = mapId;
        this.state = 'IDLE';
        this.currentProposal = null;

        if (!window['MapData_' + mapId]) {
            const mapData = window.MapList.find(m => m.id === mapId);
            const scriptPath = mapData ? mapData.script : '';
            if (window.loadGameScript && scriptPath) {
                window.loadGameScript(scriptPath, () => { this.rebuildMapMesh(mapId); });
            } else {
                this.rebuildMapMesh(mapId);
            }
        } else {
            this.rebuildMapMesh(mapId);
        }
    },

    executeMapChange: function(mapId) {
        this.state = 'IDLE';
        this.currentMapId = mapId;
        this.currentProposal = null;
        this.preview.isRunning = false;
        
        const popup = document.getElementById('mg-proposal-popup');
        if (popup) popup.style.display = 'none';
        
        const iconEl = document.getElementById('mg-popup-icon');
        if (iconEl) iconEl.style.display = 'block';
        
        const previewContainer = document.getElementById('map-proposal-preview-container');
        if (previewContainer && previewContainer.parentNode) {
            previewContainer.parentNode.removeChild(previewContainer);
        }
        
        const mapBtn = document.getElementById('map-change-btn');
        if (mapBtn) {
            mapBtn.classList.remove('proposing');
            mapBtn.innerText = 'マップ変更';
        }

        const closeBtn = document.getElementById('mg-popup-close-btn');
        if (closeBtn) closeBtn.remove();

        const overlay = document.getElementById('map-fade-overlay');
        overlay.style.opacity = '1';
        
        if (typeof window.addLog === 'function') window.addLog('<span style="color:#00ffff;">マップを切り替えています...</span>', 'sys');

        setTimeout(() => {
            if (!window['MapData_' + mapId]) {
                const mapData = window.MapList.find(m => m.id === mapId);
                const scriptPath = mapData ? mapData.script : '';
                if (window.loadGameScript && scriptPath) {
                    window.loadGameScript(scriptPath, () => { this.rebuildMapMesh(mapId); });
                } else {
                    this.rebuildMapMesh(mapId);
                }
            } else {
                this.rebuildMapMesh(mapId);
            }
        }, 600);
    },

    rebuildMapMesh: function(mapId) {
        if (!window.MapGenerator || typeof scene === 'undefined') return;

        if (window.mapMesh) {
            scene.remove(window.mapMesh);
            window.mapMesh.geometry.dispose();
            window.mapMesh.material.dispose();
            window.mapMesh = null;
        }

        if (window['MapData_' + mapId]) {
            window.MapGenerator.rawMapData = window['MapData_' + mapId];
            window.mapMesh = window.MapGenerator.createMesh();
            scene.add(window.mapMesh);
        }

        if (window.ItemSystem && typeof window.ItemSystem.clearAllItems === 'function') {
            window.ItemSystem.clearAllItems();
        }

        this.respawnPlayer();

        setTimeout(() => {
            const overlay = document.getElementById('map-fade-overlay');
            if (overlay) overlay.style.opacity = '0';
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
                    if (this.state === 'PROPOSING') this.showMapProposalPopup();
                    this.checkVotes();
                }
            }
        } else if (msg.type === 'map_cancel') {
            this.cancelProposal(msg.reason);
        } else if (msg.type === 'map_sync_current') {
            if (window.MultiplayerManager && window.MultiplayerManager.isSyncing) {
                clearTimeout(window.MultiplayerManager.syncTimeout);
                this.setupInitialMap(msg.mapId);
                window.MultiplayerManager.hideSyncOverlay();
            } else if (this.currentMapId !== msg.mapId && this.state !== 'PROPOSING') {
                this.executeMapChange(msg.mapId);
            }
        }
    }
};

setTimeout(() => {
    if (window.MapManager && typeof window.MapManager.initUI === 'function') {
        window.MapManager.initUI();
    }
}, 3000);


