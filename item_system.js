// =====================================
// item_system.js
// ミニゲーム用アイテムの出現、取得、効果、および同期を管理
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

        // ゲーム開始3秒後に正規のロジックで最初のアイテムをスポーン
        setTimeout(() => {
            if (this.enabled && !this.currentItemPosInfo) {
                this.spawnNewItem(true);
            }
        }, 3000); 
    },
    
    spawnNewItem: function(isOriginator) {
        if (typeof scene === 'undefined' || !scene) return;

        // ★修正: 地形メッシュ(mapMesh)を直接参照し、上空からレイキャスターを落として正確な高さを測る
        let terrainMesh = null;
        if (typeof mapMesh !== 'undefined' && mapMesh) {
            terrainMesh = mapMesh;
        }

        const validSpawns = [];
        
        if (terrainMesh) {
            const mapW = 21; // マップの幅
            const mapD = 21; // マップの奥行き
            const raycaster = new THREE.Raycaster();
            const downDir = new THREE.Vector3(0, -1, 0);

            // 外周の壁(x=0,20 z=0,20)を避けて探索
            for (let x = 1; x < mapW - 1; x++) {
                for (let z = 1; z < mapD - 1; z++) {
                    // タイルの中央の座標を計算
                    let px = x - mapW / 2 + 0.5;
                    let pz = z - mapD / 2 + 0.5;

                    // はるか上空(y=50)から下に向けて光線を飛ばす
                    raycaster.set(new THREE.Vector3(px, 50, pz), downDir);
                    let intersects = raycaster.intersectObject(terrainMesh, false);

                    if (intersects.length > 0) {
                        let hit = intersects[0];
                        
                        // 地面の傾き（法線ベクトル）を取得
                        let normal = hit.face.normal.clone();
                        let normalMatrix = new THREE.Matrix3().getNormalMatrix(terrainMesh.matrixWorld);
                        normal.applyMatrix3(normalMatrix).normalize();
                        
                        // 真上を向いている（平地や緩やかな坂）かつ、外壁の上(y=3.0)ではない場所を探す
                        if (normal.y > 0.5 && hit.point.y < 3.0) {
                            validSpawns.push({x: px, y: hit.point.y, z: pz});
                        }
                    }
                }
            }
        }
        
        // 万が一見つからなかった場合の安全策
        if (validSpawns.length === 0) {
            validSpawns.push({ x: 0, y: 1.0, z: 0 }); 
        }
        
        // ランダムな候補地を選択
        const spawn = validSpawns[Math.floor(Math.random() * validSpawns.length)];
        
        // アイテム本体が大きくなったので、地面にめり込まないように少し高め(y + 1.2)に浮かせる
        const pos = { x: spawn.x, y: spawn.y + 1.2, z: spawn.z };
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

        if (this.currentItemPosInfo && this.currentItemPosInfo.timestamp > timestamp) return;
        this.currentItemPosInfo = { pos: pos, timestamp: timestamp };
        
        if (this.currentFieldItem) {
            scene.remove(this.currentFieldItem);
            this.currentFieldItem = null;
        }
        
        const group = new THREE.Group();
        
        // ★修正: アイテムの球体を1.5倍(0.6 -> 0.9)にサイズアップ
        const sphereGeo = new THREE.SphereGeometry(0.9, 16, 16);
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
        // ★修正: 中のマークも1.5倍以上に大きく
        sprite.scale.set(1.4, 1.4, 1); 
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
        const geo = new THREE.SphereGeometry(0.5, 16, 16);
        const mat = new THREE.MeshStandardMaterial({color: 0x111111, roughness: 0.8});
        const mesh = new THREE.Mesh(geo, mat);
        bombGroup.add(mesh);
        bombGroup.position.set(pos.x, pos.y + 0.5, pos.z);
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
        
        // ★修正: 爆発エフェクトを大幅に強化・巨大化
        const expGroup = new THREE.Group();
        
        // 中心から広がる火の球体（初期半径1.5 = 直径3タイル）
        const expGeo = new THREE.SphereGeometry(1.5, 16, 16); 
        const expMat = new THREE.MeshBasicMaterial({color: 0xff4400, transparent: true, opacity: 0.8});
        const expMesh = new THREE.Mesh(expGeo, expMat);
        expGroup.add(expMesh);
        
        // 外側に広がる衝撃波リング
        const ringGeo = new THREE.RingGeometry(1.5, 2.0, 32);
        const ringMat = new THREE.MeshBasicMaterial({color: 0xffff00, transparent: true, opacity: 1.0, side: THREE.DoubleSide});
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = -Math.PI / 2;
        expGroup.add(ringMesh);

        expGroup.position.copy(bomb.mesh.position);
        scene.add(expGroup);
        
        // 爆発の持続時間を少し長く(0.5秒)して大きく見せる
        this.explosions.push({ mesh: expMesh, ring: ringMesh, group: expGroup, timer: 0.5 });
        
        if (typeof player !== 'undefined' && player) {
            // 吹き飛ぶ距離も3タイル分以上に拡大
            const dist = player.position.distanceTo(bomb.mesh.position);
            if (dist <= 4.0) {
                if(typeof verticalVelocity !== 'undefined') verticalVelocity = 15; 
                if(typeof isJumping !== 'undefined') isJumping = true;
                const dir = player.position.clone().sub(bomb.mesh.position).normalize();
                player.position.add(dir.multiplyScalar(0.5)); 
                if (typeof window.addLog === 'function') window.addLog('<span style="color:#ff3300;">💣 爆発に吹き飛ばされた！</span>', 'sys');
            }
        }
    },
    
    placeNet: function(pos, isOriginator) {
        if (typeof scene === 'undefined' || !scene) return;
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.font = '100px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🕸️', 64, 64);
        const tex = new THREE.CanvasTexture(canvas);
        
        const geo = new THREE.PlaneGeometry(2, 2);
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
        const mesh = new THREE.Mesh(geo, mat);
        
        const raycaster = new THREE.Raycaster(new THREE.Vector3(pos.x, pos.y + 1, pos.z), new THREE.Vector3(0, -1, 0));
        let terrainMesh = scene.children.find(c => c.userData && c.userData.isTerrain);
        if (terrainMesh) {
            const intersects = raycaster.intersectObject(terrainMesh);
            if (intersects.length > 0) {
                const hit = intersects[0];
                mesh.position.copy(hit.point);
                mesh.position.y += 0.05; 
                mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), hit.face.normal);
            } else {
                mesh.position.set(pos.x, Math.floor(pos.y * 2) / 2 + 0.05, pos.z);
                mesh.rotation.x = -Math.PI / 2;
            }
        } else {
            mesh.position.set(pos.x, 1.05, pos.z);
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
            
            // アイテムの上下に浮くフワフワ感も少し大きく
            this.currentFieldItem.position.y = ud.baseY + Math.sin(ud.time) * 0.4;
            this.currentFieldItem.rotation.y += delta;
            
            if (typeof player !== 'undefined' && player && !this.mySlotItem && !this.isCoolingDown) {
                const dist = player.position.distanceTo(this.currentFieldItem.position);
                // アイテムが大きくなったので、取得判定の距離も拡大(1.2 -> 1.8)
                if (dist < 1.8) { 
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
        
        // ★修正: 爆発アニメーション（スケールで一気に膨張させる）
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            let exp = this.explosions[i];
            exp.timer -= delta;
            
            let progress = 1.0 - (exp.timer / 0.5); // 0.0 から 1.0 へ
            
            // 火球は3倍まで巨大化
            let ballScale = 1.0 + progress * 2.0; 
            exp.mesh.scale.set(ballScale, ballScale, ballScale);
            exp.mesh.material.opacity = (1.0 - progress) * 0.8;
            
            // 衝撃波リングは4倍まで広がる
            let ringScale = 1.0 + progress * 3.0;
            exp.ring.scale.set(ringScale, ringScale, ringScale);
            exp.ring.material.opacity = (1.0 - progress);
            
            if (exp.timer <= 0) {
                scene.remove(exp.group);
                this.explosions.splice(i, 1);
            }
        }
        
        this.isOnNet = false;
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
                if (dist < 1.2 && yDist < 1.0) {
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
