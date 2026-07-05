// =========================================================
// multiplayer.js
// メンバーリストUIの生成とマルチプレイ管理
// ★リストのユーザーをタップした際、Gravity特有のディープリンクを使って
// プロフィール画面へ遷移するよう修正
// =========================================================

window.MultiplayerManager = {
    otherPlayers: {}, 
    lastSentPos: { x: 0, y: 0, z: 0 },
    lastSendTime: 0,
    sendInterval: 100, 

    initUI: function() {
        const style = document.createElement('style');
        style.innerHTML = `
            #member-btn { position: absolute; bottom: 210px; right: -2px; padding: 6px 10px 6px 14px; background-color: #fce4b2; border: 2px solid #000; border-radius: 20px 0 0 20px; display: flex; justify-content: center; align-items: center; color: #000; font-size: 13px; font-weight: bold; font-family: sans-serif; box-shadow: -2px 4px 10px rgba(0,0,0,0.2); pointer-events: auto; cursor: pointer; z-index: 100; }
            #member-btn:active { transform: scale(0.95); transform-origin: right center; }

            #member-window { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 85%; max-width: 350px; height: 60%; max-height: 400px; background: rgba(20, 20, 30, 0.95); border: 3px solid rgba(255, 255, 255, 0.8); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.7); display: none; flex-direction: column; z-index: 1000; pointer-events: auto; }
            .member-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; border-bottom: 2px solid rgba(255,255,255,0.2); font-size: 16px; font-weight: bold; color: white; font-family: sans-serif; }
            .member-close-btn { background: none; border: none; color: white; font-size: 16px; cursor: pointer; padding: 5px; }
            .member-list { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 10px; }
            
            .member-item { display: flex; align-items: center; background: rgba(255,255,255,0.1); padding: 8px; border-radius: 8px; cursor: pointer; transition: background 0.2s; }
            .member-item:active { background: rgba(255,255,255,0.3); }
            
            .member-icon { width: 40px; height: 40px; border-radius: 50%; background: #ccc; margin-right: 15px; background-size: cover; background-position: center; border: 2px solid rgba(255,255,255,0.5); display: flex; justify-content: center; align-items: center; font-size: 20px; }
            .member-name { color: white; font-size: 14px; font-weight: bold; font-family: sans-serif; }
        `;
        document.head.appendChild(style);

        const uiLayer = document.getElementById('ui-layer');
        if (!uiLayer) return;

        const preventTouch = (e) => e.stopPropagation();

        const memberBtn = document.createElement('div');
        memberBtn.id = 'member-btn';
        memberBtn.innerText = 'メンバーリスト';
        uiLayer.appendChild(memberBtn);

        const memberWindow = document.createElement('div');
        memberWindow.id = 'member-window';
        memberWindow.innerHTML = `
            <div class="member-header"><span>ルームメンバー</span><button class="member-close-btn" id="member-close-btn">❌</button></div>
            <div class="member-list" id="member-list-content"></div>
        `;
        uiLayer.appendChild(memberWindow);

        // ★追加: test.htmlのヒントを元にした、Gravity特有の画面遷移ロジック
        const openGravityUserProfile = (userId) => {
            // ① test.htmlの「makefeed(投稿)」を「user(プロフィール)」に置き換えた推測パターン
            const paramObj = {
                s: "web",
                b: "profile", // "user" または "profile" の可能性が高い
                uid: userId // IDの渡し方は "uid" または "id" が一般的
            };
            
            // 暗号のような特殊リンク(ディープリンク)を組み立てる
            const innerUrl = "user?0=" + encodeURIComponent(JSON.stringify(paramObj));
            const deepLink = "slme://internal?type=5&ani=1&url=" + encodeURIComponent(innerUrl);

            // test.htmlと同じく、見えないiframeを使ってリンクを発動させる
            let i = document.createElement('iframe');
            i.style.cssText = 'position:absolute;width:0;height:0;opacity:0';
            i.src = deepLink;
            document.body.appendChild(i);
            
            // 万が一上のディープリンクが外れていた時のための保険（Web版のURLも同時に叩いてみる）
            let i2 = document.createElement('iframe');
            i2.style.cssText = 'position:absolute;width:0;height:0;opacity:0';
            i2.src = `https://www.gravity.place/user/${userId}`;
            document.body.appendChild(i2);

            // 用済みのiframeを掃除
            setTimeout(() => {
                if (i.parentNode) i.remove();
                if (i2.parentNode) i2.remove();
            }, 5000);
        };

        window.updateMemberList = function() {
            const listEl = document.getElementById('member-list-content');
            if (!listEl) return;
            listEl.innerHTML = '';

            let allUsers = [];
            
            if (window.GameState && window.GameState.userInfo) {
                allUsers.push({
                    user_id: window.GameState.userInfo.user_id,
                    user_name: window.GameState.userInfo.user_name || window.GameState.userInfo.name || "Player",
                    portrait: window.GameState.userInfo.portrait || window.GameState.userInfo.portait || ""
                });
            } else {
                allUsers.push({ user_id: 'local', user_name: "テストプレイヤー (あなた)", portrait: "" });
            }

            if (window.MultiplayerManager && window.MultiplayerManager.otherPlayers) {
                for (let id in window.MultiplayerManager.otherPlayers) {
                    let op = window.MultiplayerManager.otherPlayers[id];
                    allUsers.push({
                        user_id: op.id, 
                        user_name: op.name || "Player",
                        portrait: op.icon || ""
                    });
                }
            }

            allUsers.forEach(user => {
                const item = document.createElement('div');
                item.className = 'member-item';
                
                // ★修正: タップ時にディープリンク関数を呼び出す
                item.addEventListener('click', () => {
                    if (user.user_id && user.user_id !== 'local') {
                        openGravityUserProfile(user.user_id);
                    }
                });
                
                const icon = document.createElement('div');
                icon.className = 'member-icon';
                const avatarUrl = user.portrait || user.portait;
                if (avatarUrl) {
                    icon.style.backgroundImage = `url(${avatarUrl})`;
                } else {
                    icon.style.backgroundColor = '#ffaa00';
                    icon.innerText = '👤';
                }
                
                const name = document.createElement('div');
                name.className = 'member-name';
                name.innerText = user.user_name || user.name || "Player";
                
                item.appendChild(icon);
                item.appendChild(name);
                listEl.appendChild(item);
            });
        };

        memberBtn.addEventListener('click', () => { window.updateMemberList(); memberWindow.style.display = 'flex'; });
        memberBtn.addEventListener('mousedown', preventTouch);
        memberBtn.addEventListener('touchstart', preventTouch, {passive: false});

        memberWindow.querySelector('#member-close-btn').addEventListener('click', () => { memberWindow.style.display = 'none'; });
        memberWindow.addEventListener('mousedown', preventTouch);
        memberWindow.addEventListener('touchstart', preventTouch, {passive: false});
    },

    sendData: function(data) {
        if (typeof window.sendMultiplayerMessage === 'function') {
            window.sendMultiplayerMessage(data);
        }
    },
    
    requestPositions: function() {
        this.sendData({ type: 'pos_req' });
    },
    
    forceSendPos: function() {
        if (typeof player === 'undefined' || !player) return;
        if (window.isSpectatorMode) return; 
        
        const nowTime = Date.now();
        player.lastMoveTime = nowTime;
        
        this.sendData({
            type: 'move',
            x: player.position.x,
            y: player.position.y,
            z: player.position.z,
            qx: player.quaternion.x,
            qy: player.quaternion.y,
            qz: player.quaternion.z,
            qw: player.quaternion.w,
            timestamp: nowTime
        });
        
        this.lastSentPos.x = player.position.x;
        this.lastSentPos.y = player.position.y;
        this.lastSentPos.z = player.position.z;
        this.lastSendTime = performance.now();
    },

    update: function(delta) {
        if (typeof player === 'undefined' || !player) return;

        if (!window.isSpectatorMode) {
            const now = performance.now();
            const dist = Math.hypot(player.position.x - this.lastSentPos.x, player.position.z - this.lastSentPos.z);
            const yDiff = Math.abs(player.position.y - this.lastSentPos.y);
            
            if (dist > 0.05 || yDiff > 0.05) {
                if (now - this.lastSendTime > this.sendInterval) {
                    this.forceSendPos();
                }
            }
        }

        for (const id in this.otherPlayers) {
            const p = this.otherPlayers[id];
            if (p.mesh && p.targetPos && p.hasReceivedFirstPos !== false) {
                p.mesh.position.lerp(p.targetPos, 15 * delta);
                if (p.targetQuat) {
                    p.mesh.quaternion.slerp(p.targetQuat, 12 * delta);
                }
                
                if (p.mesh.chatTimer > 0) {
                    p.mesh.chatTimer -= delta;
                    if (p.mesh.chatTimer <= 0 && p.mesh.chatSprite) {
                        p.mesh.remove(p.mesh.chatSprite);
                        if (p.mesh.chatSprite.material.map) p.mesh.chatSprite.material.map.dispose();
                        p.mesh.chatSprite.material.dispose();
                        p.mesh.chatSprite = null;
                    }
                }
            }
        }
    },
    
    handleMessage: function(payload) {
        const { type, data } = payload;
        
        if (type === 'aitools_game_joinroom') {
            this.addPlayer(data);
            const userName = data.user_name || data.name || '誰か';
            if (typeof window.addLog === 'function') {
                window.addLog(`<span style="color:#aaffaa;">[入室] ${userName} が参加しました。</span>`, 'sys');
            }
            this.forceSendPos();
            
        } else if (type === 'aitools_game_exitroom') {
            const userName = data.user_name || data.name || '誰か';
            if (typeof window.addLog === 'function') {
                window.addLog(`<span style="color:#ffaaaa;">[退室] ${userName} が退出しました。</span>`, 'sys');
            }
            this.removePlayer(data);
            
        } else if (type === 'aitools_game_sendmsg') {
            try {
                const msgData = JSON.parse(data.msg_data);
                
                if (msgData.type === 'move') {
                    this.updatePlayerPos(data.user_id, msgData);
                } else if (msgData.type === 'pos_req') {
                    this.forceSendPos();
                    
                    if (window.ItemSystem && window.ItemSystem.fieldItems) {
                        for (let id in window.ItemSystem.fieldItems) {
                            let itemMesh = window.ItemSystem.fieldItems[id];
                            this.sendData({
                                type: 'item_spawn',
                                id: id,
                                pos: { x: itemMesh.position.x, y: itemMesh.userData.baseY, z: itemMesh.position.z }
                            });
                        }
                    }

                    if (window.isSpectatorMode) {
                        this.sendData({ type: 'mg_spectator', isSpectator: true });
                    }

                    if (window.MinigameManager && window.MinigameManager.state !== 'IDLE' && window.MinigameManager.currentProposal) {
                        const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'host_123';
                        if (window.MinigameManager.currentProposal.proposerId === myId) {
                            this.sendData({
                                type: 'mg_sync_state',
                                state: window.MinigameManager.state,
                                targetStartTime: window.MinigameManager.targetStartTime,
                                proposal: window.MinigameManager.currentProposal
                            });
                        }
                    }
                } else if (msgData.type === 'mg_spectator') {
                    const p = this.otherPlayers[data.user_id];
                    if (p) {
                        p.isSpectator = msgData.isSpectator;
                        if (p.mesh) p.mesh.visible = !msgData.isSpectator; 
                    }
                    if (window.MinigameManager && typeof window.MinigameManager.checkAllSpectators === 'function') {
                        window.MinigameManager.checkAllSpectators();
                    }
                } else if (msgData.type === 'chat') {
                    if (typeof window.addLog === 'function') {
                        window.addLog(`<span style="color:#ffaa00;">${msgData.senderName}:</span> ${msgData.text}`, 'chat');
                    }
                    const p = this.otherPlayers[data.user_id];
                    if (p && p.mesh && typeof window.showChatBubble === 'function') {
                        window.showChatBubble(p.mesh, msgData.text);
                    }
                } else if (msgData.type.startsWith('item_')) {
                    if (window.ItemSystem) {
                        window.ItemSystem.handleNetworkMessage(msgData);
                    }
                } else if (msgData.type.startsWith('mg_')) {
                    if (window.MinigameManager) {
                        window.MinigameManager.handleNetworkMessage(msgData);
                    }
                }
            } catch(e) {}
        }
    },

    addPlayer: function(user) {
        if (window.GameState && window.GameState.userInfo && user.user_id === window.GameState.userInfo.user_id) return;
        if (this.otherPlayers[user.user_id]) return; 

        const mesh = this.createPlayerMesh(user);
        scene.add(mesh);

        this.otherPlayers[user.user_id] = {
            id: user.user_id,
            name: user.user_name || user.name || "Player",
            icon: user.portrait || user.portait || "",
            mesh: mesh,
            targetPos: new THREE.Vector3(0, 20, 0),
            targetQuat: new THREE.Quaternion(),
            lastMoveTime: 0,
            hasReceivedFirstPos: false, 
            isSpectator: false
        };
    },

    removePlayer: function(user) {
        const p = this.otherPlayers[user.user_id];
        if (p && p.mesh) {
            scene.remove(p.mesh);
            delete this.otherPlayers[user.user_id];
        }
    },

    updatePlayerPos: function(userId, data) {
        const p = this.otherPlayers[userId];
        if (p) {
            if (!p.lastMoveTime || data.timestamp >= p.lastMoveTime) {
                p.targetPos.set(data.x, data.y, data.z);
                if (data.qw !== undefined) {
                    p.targetQuat.set(data.qx, data.qy, data.qz, data.qw);
                }
                
                if (!p.hasReceivedFirstPos) {
                    p.mesh.position.copy(p.targetPos);
                    if (data.qw !== undefined) p.mesh.quaternion.copy(p.targetQuat);
                    p.hasReceivedFirstPos = true;
                }

                p.lastMoveTime = data.timestamp;
            }
        }
    },

    createPlayerMesh: function(user) {
        const group = new THREE.Group();
        const baseGeo = new THREE.CylinderGeometry(playerRadius, playerRadius, 0.2, 32);
        const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
        const baseMesh = new THREE.Mesh(baseGeo, blackMat);
        baseMesh.position.y = 0.1; 
        baseMesh.castShadow = true; 
        group.add(baseMesh);

        const topGeo = new THREE.CylinderGeometry(playerRadius, playerRadius, 0.2, 32);
        let iconTexture = null;
        if (typeof window.createIconTexture === 'function') iconTexture = window.createIconTexture();
        const sideMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.7 });
        const topMat = new THREE.MeshStandardMaterial({ map: iconTexture, roughness: 0.7 });
        const bottomMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.7 });
        const topMesh = new THREE.Mesh(topGeo, [sideMat, topMat, bottomMat]);
        topMesh.position.y = 0.3; 
        topMesh.castShadow = true; 
        group.add(topMesh);

        const avatarUrl = user.portrait || user.portait;
        if (avatarUrl) {
            const loader = new THREE.TextureLoader();
            loader.setCrossOrigin('anonymous');
            loader.load(avatarUrl, (loadedTexture) => {
                loadedTexture.center.set(0.5, 0.5);
                loadedTexture.rotation = -Math.PI / 2;
                if (typeof renderer !== 'undefined' && renderer) loadedTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
                loadedTexture.minFilter = THREE.LinearMipmapLinearFilter;
                loadedTexture.magFilter = THREE.LinearFilter;
                topMesh.material[1].map = loadedTexture;
                topMesh.material[1].needsUpdate = true;
            });
        }

        if (typeof window.createNameSprite === 'function') {
            const nameStr = user.user_name || user.name || "Player";
            const nameSprite = window.createNameSprite(nameStr);
            group.add(nameSprite);
        }

        group.position.set(0, 20, 0);
        return group;
    },

    initExistingPlayers: function() {
        if (window.GameState && window.GameState.roomUsers) {
            window.GameState.roomUsers.forEach(user => {
                this.addPlayer(user);
            });
        }
    }
};

window.onMultiplayerMessage = function(payload) {
    if (window.MultiplayerManager) {
        window.MultiplayerManager.handleMessage(payload);
    }
};
