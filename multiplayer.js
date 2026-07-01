// =========================================================
// multiplayer.js
// 新規入室者へのアイテム位置の同期機能搭載
// ★ミニゲームシステムの通信同期、途中入室時の状態共有を追加
// =========================================================

window.MultiplayerManager = {
    otherPlayers: {}, 
    lastSentPos: { x: 0, y: 0, z: 0 },
    lastSendTime: 0,
    sendInterval: 100, 

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
        
        // 観戦モード中（透明化中）は自身の位置情報を送信しない
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

        // 観戦モード中は送信チェックを行わない
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
            if (p.mesh && p.targetPos) {
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
                    if (window.ItemSystem && window.ItemSystem.currentItemPosInfo) {
                        this.sendData({
                            type: 'item_spawn',
                            pos: window.ItemSystem.currentItemPosInfo.pos,
                            timestamp: window.ItemSystem.currentItemPosInfo.timestamp
                        });
                    }
                    
                    // ★追加: 途中入室者に対して、ゲームの状態を返信する（自分が提案者の場合のみ）
                    if (window.MinigameManager && window.MinigameManager.state !== 'IDLE' && window.MinigameManager.currentProposal) {
                        const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'host_123';
                        if (window.MinigameManager.currentProposal.proposerId === myId) {
                            this.sendData({
                                type: 'mg_sync_state',
                                state: window.MinigameManager.state,
                                proposal: window.MinigameManager.currentProposal
                            });
                        }
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
            mesh: mesh,
            targetPos: new THREE.Vector3(0, 20, 0),
            targetQuat: new THREE.Quaternion(),
            lastMoveTime: 0
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
                if (window.renderer) loadedTexture.anisotropy = window.renderer.capabilities.getMaxAnisotropy();
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
