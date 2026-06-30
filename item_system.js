// =====================================
// item_system.js
// ミニゲーム用アイテムの出現、取得、効果、および同期を管理
// ★地形の10倍スケール(blockSize)に完全対応し、タイル中央への配置と爆発サイズを修正
// =====================================

window.ItemSystem = {
    enabled: true, 
    currentFieldItem: null,
    currentItemPosInfo: null, 
    mySlotItem: null,
    isFlyMode: false,
    isCoolingDown: false,
    
    activeBombs: [],
    activeNets: [],
    explosions: [],
    lastPlayerPos: null,
    isOnNet: false,
    
    lastTime: performance.now(),

    init: function() {
        this.slotUI = document.getElementById('item-slot');
        if (this.slotUI) {
            this.slotUI.addEventListener('mousedown', (e) => this.useItem());
            this.slotUI.addEventListener('touchstart', (e) => { e.preventDefault(); this.useItem(); }, {passive: false});
        }
        
        if (typeof THREE !== 'undefined') {
            this.lastPlayerPos = new THREE.Vector3();
        }
        
        const loop = () => {
            this.update();
            requestAnimationFrame(loop);
        };
        loop();

        // 3秒待機。他プレイヤーからアイテム位置が送られてこなければ自分で生成
        setTimeout(() => {
            if (this.enabled && !this.currentItemPosInfo) {
                this.spawnNewItem(true);
            }
        }, 3000); 
    },
    
    spawnNewItem: function(isOriginator) {
        if (!window.MapGenerator || typeof scene === 'undefined') return;
        
        const mapInfo = window.MapGenerator.parseMap();
        const parsedMap = mapInfo.parsedMap;
        const mapW = mapInfo.mapW;
        const mapD = mapInfo.mapD;
        const rawMap = window.MapGenerator.rawMapData;

        // ★修正: 地形の巨大化スケールを取得（デフォルト10）
        const bs = typeof blockSize !== 'undefined' ? blockSize : 10;

        const validSpawns = [];
        
        // 外周の壁を避ける
        for (let x = 1; x < mapW - 1; x++) {
            for (let z = 1; z < mapD - 1; z++) {
                let str = rawMap[x][z] || "0";
                let currentY = 0;
                let isSolid = true;
                
                for (let i = str.length - 1; i >= 0; i--) {
                    let val = parseInt(str[i], 10);
                    let height = val * 0.5;
                    
                    if (isSolid && val > 0) {
                        let py = currentY + height;
                        let isOdd = (val % 2 !== 0);
                        
                        let spaceVal = (i - 1 >= 0) ? parseInt(str[i - 1], 10) : -1;
                        
                        // トンネル内部、または平地/屋根の上を許可
                        if (spaceVal > 0 || spaceVal === -1) {
                            if (isOdd) {
                                let corners = window.MapGenerator.getCornerHeights(parsedMap, mapW, mapD, x, z, py);
                                py = corners.center;
                            }
                            
                            // 高すぎる壁（ローカルで高さ3.0以上）には置かない
                            if (py < 3.0) {
                                let px = x - mapW / 2 + 0.5;
                                let pz = z - mapD / 2 + 0.5;
                                
                                // ★最大の修正: 座標を blockSize 倍して巨大なワールド座標に合わせる
                                validSpawns.push({
                                    x: px * bs, 
                                    y: py * bs, 
                                    z: pz * bs
                                });
                            }
                        }
                    }
                    currentY += height;
                    isSolid = !isSolid;
                }
            }
        }
        
        // 安全策
        if (validSpawns.length === 0) validSpawns.push({ x: 0, y: 2.0 * bs, z: 0 });
        
        const spawn = validSpawns[Math.floor(Math.random() * validSpawns.length)];
        
        // ワールド座標に合わせた適切な高さ(約1.5)に浮かせて地面埋まりを解消
        const itemYOffset = 1.5; 
        const pos = { x: spawn.x, y: spawn.y + itemYOffset, z: spawn.z };
        const timestamp = Date.now();
        
        this.placeFieldItem(pos, timestamp);
        
        if (isOriginator && window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
            window.MultiplayerManager.sendData({
                type: 'item_spawn', pos: pos, timestamp: timestamp
            });
        }
    },
    
    placeFieldItem: function(pos, timestamp) {
        if (typeof scene === 'undefined' || !scene) return;

        if (this.currentItemPosInfo && this.currentItemPosInfo.timestamp >= timestamp) return;
        this.currentItemPosInfo = { pos: pos, timestamp: timestamp };
        
        if (this.currentFieldItem) {
            scene.remove(this.currentFieldItem);
            this.currentFieldItem = null;
        }
        
        const group = new THREE.Group();
        
        // アイテム本体（見やすいサイズ）
        const sphereGeo = new THREE.SphereGeometry(1.2, 16, 16);
        const glassMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, 
            transparent: true, 
            opacity: 0.3, 
            roughness: 0.1,
            metalness: 0.2,
            emissive: 0x333333,
            depthWrite: false 
        });
        const sphere = new THREE.Mesh(sphereGeo, glassMat);
        group.add(sphere);

        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.font = 'bold 80px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = '#ffcc00'; 
        ctx.fillText('❓', 64, 64);
        
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        
        const spriteMat = new THREE.SpriteMaterial({ 
            map: tex, 
            depthTest: true, 
            depthWrite: false, 
            transparent: true 
        }); 
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(1.8, 1.8, 1); 
        group.add(sprite);
        
        group.position.set(pos.x, pos.y, pos.z);
        group.userData = { baseY: pos.y, time: 0 }; 
        
        scene.add(group);
        this.currentFieldItem = group;
    },
    
    pickupItem: function() {
        if (typeof scene === 'undefined' || !scene) return;
        
        if (this.currentFieldItem) {
            scene.remove(this.currentFieldItem);
            this.currentFieldItem = null;
        }
        
        const items = ['fly', 'bomb', 'net'];
        this.mySlotItem = items[Math.floor(Math.random() * items.length)];
        this.updateSlotUI();
        
        this.spawnNewItem(true);
    },
    
    updateSlotUI: function() {
        if (!this.slotUI) return;
        if (this.mySlotItem && !this.isCoolingDown) {
            this.slotUI.classList.add('active');
            if (this.mySlotItem === 'fly') this.slotUI.innerHTML = '🪽';
            else if (this.mySlotItem === 'bomb') this.slotUI.innerHTML = '💣';
            else if (this.mySlotItem === 'net') this.slotUI.innerHTML = '🕸️';
        } else if (!this.isCoolingDown) {
            this.slotUI.classList.remove('active');
            this.slotUI.innerHTML = '';
        }
    },
    
    useItem: function() {
        if (!this.mySlotItem || this.isCoolingDown) return;
        const item = this.mySlotItem;
        this.mySlotItem = null;
        this.updateSlotUI();
        
        if (typeof player === 'undefined' || !player) return;
        
        if (item === 'fly') {
            this.startFly();
        } else if (item === 'bomb') {
            this.placeBomb(player.position, true);
        } else if (item === 'net') {
            this.placeNet(player.position, true);
        }
    },
    
    startFly: function() {
        this.isFlyMode = true;
        this.isCoolingDown = true;
        this.slotUI.innerHTML = '<span style="filter: grayscale(100%); opacity: 0.5;">🪽</span><div class="item-timer">10</div>';
        this.slotUI.classList.add('cooling');
        
        let time = 10;
        const interval = setInterval(() => {
            time--;
            if (time <= 0) {
                clearInterval(interval);
                this.isFlyMode = false;
                this.isCoolingDown = false;
                this.updateSlotUI(); 
            } else {
                const timerEl = this.slotUI.querySelector('.item-timer');
                if (timerEl) timerEl.innerText = time;
            }
        }, 1000);
    },
    
    placeBomb: function(pos, isOriginator) {
        if (typeof scene === 'undefined' || !scene) return;
        const bombGroup = new THREE.Group();
        const geo = new THREE.SphereGeometry(0.8, 16, 16);
        const mat = new THREE.MeshStandardMaterial({color: 0x111111, roughness: 0.8});
        const mesh = new THREE.Mesh(geo, mat);
        bombGroup.add(mesh);
        bombGroup.position.set(pos.x, pos.y + 0.8, pos.z);
        scene.add(bombGroup);
        
        this.activeBombs.push({ mesh: bombGroup, timer: 3.0 });
        
        if (isOriginator && window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
            window.MultiplayerManager.sendData({
                type: 'item_bomb', pos: {x: pos.x, y: pos.y, z: pos.z}
            });
        }
    },
    
    explodeBomb: function(bomb) {
        if (typeof scene === 'undefined' || !scene) return;
        
        // ★修正: blockSizeを掛け合わせて、直径3マス分の巨大な爆発にする
        const bs = typeof blockSize !== 'undefined' ? blockSize : 10;
        const maxRadius = 1.5 * bs; // 半径1.5マス分
        
        const expGroup = new THREE.Group();
        
        // 初期状態は小さく作って一気に拡大させる
        const expGeo = new THREE.SphereGeometry(maxRadius * 0.3, 16, 16); 
        const expMat = new THREE.MeshBasicMaterial({color: 0xff4400, transparent: true, opacity: 0.8});
        const expMesh = new THREE.Mesh(expGeo, expMat);
        expGroup.add(expMesh);
        
        const ringGeo = new THREE.RingGeometry(maxRadius * 0.3, maxRadius * 0.4, 32);
        const ringMat = new THREE.MeshBasicMaterial({color: 0xffff00, transparent: true, opacity: 1.0, side: THREE.DoubleSide});
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = -Math.PI / 2;
        expGroup.add(ringMesh);

        expGroup.position.copy(bomb.mesh.position);
        scene.add(expGroup);
        
        this.explosions.push({ mesh: expMesh, ring: ringMesh, group: expGroup, timer: 0.5, maxRadius: maxRadius });
        
        if (typeof player !== 'undefined' && player) {
            const dist = player.position.distanceTo(bomb.mesh.position);
            // 吹き飛ぶ判定も巨大なスケールに合わせる
            if (dist <= maxRadius) {
                if(typeof verticalVelocity !== 'undefined') verticalVelocity = 20; // 吹き飛ぶ高さも強化
                if(typeof isJumping !== 'undefined') isJumping = true;
                const dir = player.position.clone().sub(bomb.mesh.position).normalize();
                player.position.add(dir.multiplyScalar(bs * 0.4)); // 外側へ強く押し出す
                if (typeof window.addLog === 'function') window.addLog('<span style="color:#ff3300;">💣 爆発に吹き飛ばされた！</span>', 'sys');
            }
        }
    },
    
    placeNet: function(pos, isOriginator) {
        if (typeof scene === 'undefined' || !scene) return;
        const bs = typeof blockSize !== 'undefined' ? blockSize : 10;
        
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.font = '200px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🕸️', 128, 128);
        const tex = new THREE.CanvasTexture(canvas);
        
        // ★修正: ネットの大きさも 1マス分 (blockSize) に合わせる
        const geo = new THREE.PlaneGeometry(bs, bs);
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
        const mesh = new THREE.Mesh(geo, mat);
        
        const raycaster = new THREE.Raycaster(new THREE.Vector3(pos.x, pos.y + bs, pos.z), new THREE.Vector3(0, -1, 0));
        let terrainMesh = scene.children.find(c => c.userData && c.userData.isTerrain);
        if (terrainMesh) {
            const intersects = raycaster.intersectObject(terrainMesh);
            if (intersects.length > 0) {
                const hit = intersects[0];
                mesh.position.copy(hit.point);
                mesh.position.y += 0.05; 
                mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), hit.face.normal);
            } else {
                mesh.position.set(pos.x, pos.y + 0.05, pos.z);
                mesh.rotation.x = -Math.PI / 2;
            }
        } else {
            mesh.position.set(pos.x, pos.y + 0.05, pos.z);
            mesh.rotation.x = -Math.PI / 2;
        }
        
        scene.add(mesh);
        
        this.activeNets.push({ mesh: mesh, timer: 5.0, isMine: isOriginator });
        
        if (isOriginator && window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
            window.MultiplayerManager.sendData({
                type: 'item_net', pos: {x: pos.x, y: pos.y, z: pos.z}
            });
        }
    },
    
    handleNetworkMessage: function(msgData) {
        if (msgData.type === 'item_spawn') {
            this.placeFieldItem(msgData.pos, msgData.timestamp);
        } else if (msgData.type === 'item_bomb') {
            this.placeBomb(msgData.pos, false);
        } else if (msgData.type === 'item_net') {
            this.placeNet(msgData.pos, false);
        }
    },
    
    update: function() {
        const now = performance.now();
        const delta = (now - this.lastTime) / 1000;
        this.lastTime = now;
        
        if (typeof scene === 'undefined' || !scene) return;

        if (this.currentFieldItem) {
            const ud = this.currentFieldItem.userData;
            ud.time += delta * 2.5;
            this.currentFieldItem.position.y = ud.baseY + Math.sin(ud.time) * 0.4;
            this.currentFieldItem.rotation.y += delta;
            
            if (typeof player !== 'undefined' && player && !this.mySlotItem && !this.isCoolingDown) {
                const dist = player.position.distanceTo(this.currentFieldItem.position);
                // アイテムの取得距離を適切に設定
                const pickupRadius = typeof playerRadius !== 'undefined' ? playerRadius * 3.0 : 3.0;
                if (dist < pickupRadius) { 
                    this.pickupItem();
                }
            }
        }
        
        for (let i = this.activeBombs.length - 1; i >= 0; i--) {
            let b = this.activeBombs[i];
            b.timer -= delta;
            const scale = 1.0 + Math.sin(b.timer * 15) * 0.2;
            b.mesh.scale.set(scale, scale, scale);
            
            if (b.timer <= 0) {
                this.explodeBomb(b);
                scene.remove(b.mesh);
                this.activeBombs.splice(i, 1);
            }
        }
        
        // 爆発アニメーションの更新
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            let exp = this.explosions[i];
            exp.timer -= delta;
            
            let progress = 1.0 - (exp.timer / 0.5); 
            
            // 約3.3倍まで巨大化させる
            let ballScale = 1.0 + progress * 2.3; 
            exp.mesh.scale.set(ballScale, ballScale, ballScale);
            exp.mesh.material.opacity = (1.0 - progress) * 0.8;
            
            // リングはさらに大きく広がる
            let ringScale = 1.0 + progress * 3.0;
            exp.ring.scale.set(ringScale, ringScale, ringScale);
            exp.ring.material.opacity = (1.0 - progress);
            
            if (exp.timer <= 0) {
                scene.remove(exp.group);
                this.explosions.splice(i, 1);
            }
        }
        
        this.isOnNet = false;
        const bs = typeof blockSize !== 'undefined' ? blockSize : 10;
        for (let i = this.activeNets.length - 1; i >= 0; i--) {
            let n = this.activeNets[i];
            n.timer -= delta;
            if (n.timer <= 0) {
                scene.remove(n.mesh);
                this.activeNets.splice(i, 1);
                continue;
            }
            
            if (!n.isMine && typeof player !== 'undefined' && player) {
                const dist = Math.hypot(player.position.x - n.mesh.position.x, player.position.z - n.mesh.position.z);
                const yDist = Math.abs(player.position.y - n.mesh.position.y);
                // ネットを踏む判定もワールドスケールに合わせる
                if (dist < (bs * 0.6) && yDist < (bs * 0.5)) {
                    this.isOnNet = true;
                }
            }
        }
        
        if (typeof player !== 'undefined' && player && this.lastPlayerPos) {
            if (this.isOnNet) {
                const deltaPos = player.position.clone().sub(this.lastPlayerPos);
                deltaPos.y = 0; 
                if (deltaPos.lengthSq() > 0) {
                    const rollback = deltaPos.multiplyScalar(0.9);
                    player.position.x -= rollback.x;
                    player.position.z -= rollback.z;
                }
            }
            this.lastPlayerPos.copy(player.position);
        }
    }
};

setTimeout(() => {
    if (window.ItemSystem) window.ItemSystem.init();
}, 2000);
