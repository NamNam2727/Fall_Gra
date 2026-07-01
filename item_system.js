// =====================================
// item_system.js
// ミニゲーム用アイテムの出現、取得、効果、および同期を管理
// ★複数アイテムの出現とIDによる個別管理・同期に対応
// =====================================

window.ItemSystem = {
    enabled: true, 
    fieldItems: {}, // ★複数アイテムをIDキーで管理するオブジェクトに変更
    maxItems: 1,    // ★フィールド上の最大アイテム数（ミニゲーム設定で変更可能）
    mySlotItem: null,
    isFlyMode: false,
    isCoolingDown: false,
    
    activeBombs: [],
    activeNets: [],
    explosions: [],
    knockback: null, 
    isOnNet: false,
    lastPlayerPos: null, 
    
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
    },
    
    // ★設定された最大数(maxItems)までアイテムを自動補充する
    checkAndSpawnItems: function() {
        if (!this.enabled || this.maxItems === 0) return;
        
        const currentCount = Object.keys(this.fieldItems).length;
        if (currentCount < this.maxItems) {
            // 一斉に湧くのを防ぐため、低い確率で徐々に湧かせる（ホスト処理の簡易版）
            if (Math.random() < 0.02) {
                this.spawnNewItem(true);
            }
        }
    },

    // ★ゲーム開始時や終了時にすべてをリセットする
    clearAllItems: function() {
        // フィールドアイテムの消去
        for (let id in this.fieldItems) {
            if (typeof scene !== 'undefined') scene.remove(this.fieldItems[id]);
        }
        this.fieldItems = {};

        // 爆弾の消去
        for (let i = this.activeBombs.length - 1; i >= 0; i--) {
            if (typeof scene !== 'undefined') scene.remove(this.activeBombs[i].mesh);
        }
        this.activeBombs = [];

        // ネットの消去
        for (let i = this.activeNets.length - 1; i >= 0; i--) {
            if (typeof scene !== 'undefined') scene.remove(this.activeNets[i].mesh);
        }
        this.activeNets = [];
        
        // 自分のスロットのリセット
        this.mySlotItem = null;
        this.isCoolingDown = false;
        this.isFlyMode = false;
        if (this.slotUI) this.slotUI.classList.remove('cooling');
        this.updateSlotUI();
    },
    
    spawnNewItem: function(isOriginator) {
        if (!window.MapGenerator || typeof scene === 'undefined') return;
        
        const mapInfo = window.MapGenerator.parseMap();
        const parsedMap = mapInfo.parsedMap;
        const mapW = mapInfo.mapW;
        const mapD = mapInfo.mapD;
        const rawMap = window.MapGenerator.rawMapData;
        const bs = typeof blockSize !== 'undefined' ? blockSize : 10;

        const validSpawns = [];
        
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
                        
                        if (spaceVal > 0 || spaceVal === -1) {
                            if (isOdd) {
                                let corners = window.MapGenerator.getCornerHeights(parsedMap, mapW, mapD, x, z, py);
                                py = corners.center;
                            }
                            let px = x - mapW / 2 + 0.5;
                            let pz = z - mapD / 2 + 0.5;
                            validSpawns.push({ x: px * bs, y: py * bs, z: pz * bs });
                        }
                    }
                    currentY += height;
                    isSolid = !isSolid;
                }
            }
        }
        
        if (validSpawns.length === 0) validSpawns.push({ x: 0, y: 2.0 * bs, z: 0 });
        
        const spawn = validSpawns[Math.floor(Math.random() * validSpawns.length)];
        const itemYOffset = 1.5; 
        const pos = { x: spawn.x, y: spawn.y + itemYOffset, z: spawn.z };
        
        // ★アイテム固有のIDを生成
        const itemId = 'item_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        
        this.placeFieldItem(itemId, pos);
        
        if (isOriginator && window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
            window.MultiplayerManager.sendData({
                type: 'item_spawn', id: itemId, pos: pos
            });
        }
    },
    
    // ★引数にIDを追加
    placeFieldItem: function(id, pos) {
        if (typeof scene === 'undefined' || !scene) return;
        if (this.fieldItems[id]) return; // 既に存在する場合は無視
        
        const group = new THREE.Group();
        const sphereGeo = new THREE.SphereGeometry(1.2, 16, 16);
        const glassMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, transparent: true, opacity: 0.3, 
            roughness: 0.1, metalness: 0.2, emissive: 0x333333, depthWrite: false 
        });
        const sphere = new THREE.Mesh(sphereGeo, glassMat);
        group.add(sphere);

        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.font = 'bold 80px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
        ctx.fillStyle = '#ffcc00'; ctx.fillText('❓', 64, 64);
        
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        const spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: true, depthWrite: false, transparent: true }); 
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(1.8, 1.8, 1); 
        group.add(sprite);
        
        group.position.set(pos.x, pos.y, pos.z);
        group.userData = { baseY: pos.y, time: 0 }; 
        scene.add(group);
        
        // ★オブジェクトに登録
        this.fieldItems[id] = group;
    },
    
    // ★自分が取得した時の処理 (IDを指定して削除・送信)
    pickupItem: function(id) {
        if (typeof scene === 'undefined' || !scene) return;
        
        if (this.fieldItems[id]) {
            scene.remove(this.fieldItems[id]);
            delete this.fieldItems[id];
        }

        const items = ['fly', 'bomb', 'net'];
        this.mySlotItem = items[Math.floor(Math.random() * items.length)];
        this.updateSlotUI();
        
        // ★誰がどのアイテムを取得したか同期する
        if (window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
            window.MultiplayerManager.sendData({
                type: 'item_pickup', id: id
            });
        }
    },

    // ★他人が取得したという通信を受け取った時の処理
    remotePickupItem: function(id) {
        if (this.fieldItems[id]) {
            if (typeof scene !== 'undefined') scene.remove(this.fieldItems[id]);
            delete this.fieldItems[id];
        }
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
        
        if (item === 'fly') this.startFly();
        else if (item === 'bomb') this.placeBomb(player.position, true);
        else if (item === 'net') this.placeNet(player.position, true);
    },
    
    startFly: function() {
        this.isFlyMode = true;
        this.isCoolingDown = true;
        this.slotUI.innerHTML = '<span style="filter: grayscale(100%); opacity: 0.5;">🪽</span><div class="item-timer">5</div>';
        this.slotUI.classList.add('cooling');
        
        let time = 5;
        const interval = setInterval(() => {
            time--;
            if (time <= 0) {
                clearInterval(interval);
                this.isFlyMode = false;
                this.isCoolingDown = false;
                this.slotUI.classList.remove('cooling');
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
        const bs = typeof blockSize !== 'undefined' ? blockSize : 10;
        const maxRadius = 4.5 * bs; 
        
        const expGroup = new THREE.Group();
        const expGeo = new THREE.SphereGeometry(maxRadius * 0.1, 16, 16); 
        const expMat = new THREE.MeshBasicMaterial({color: 0xff4400, transparent: true, opacity: 0.8});
        const expMesh = new THREE.Mesh(expGeo, expMat);
        expGroup.add(expMesh);
        
        const ringGeo = new THREE.RingGeometry(maxRadius * 0.1, maxRadius * 0.15, 32);
        const ringMat = new THREE.MeshBasicMaterial({color: 0xffff00, transparent: true, opacity: 1.0, side: THREE.DoubleSide});
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = -Math.PI / 2;
        expGroup.add(ringMesh);

        expGroup.position.copy(bomb.mesh.position);
        scene.add(expGroup);
        this.explosions.push({ mesh: expMesh, ring: ringMesh, group: expGroup, timer: 0.5, maxRadius: maxRadius });
        
        if (typeof player !== 'undefined' && player) {
            // 観戦モード中は爆風の影響を受けない
            if (window.isSpectatorMode) return;

            const dist = player.position.distanceTo(bomb.mesh.position);
            if (dist <= maxRadius) {
                window.verticalVelocity = 60; 
                window.isJumping = true;
                player.position.y += 2.0; 
                
                const dir = player.position.clone().sub(bomb.mesh.position);
                dir.y = 0; 
                if (dir.lengthSq() === 0) dir.set(1, 0, 0);
                dir.normalize();
                
                this.knockback = {
                    dir: dir,
                    speed: bs * 50.0, 
                    timer: 0.8
                };
                
                if (window.MultiplayerManager && typeof window.MultiplayerManager.forceSendPos === 'function') {
                    window.MultiplayerManager.forceSendPos();
                }
                if (typeof window.addLog === 'function') window.addLog('<span style="color:#ff3300;">💣 大爆発に吹き飛ばされた！</span>', 'sys');
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
        
        const geo = new THREE.PlaneGeometry(bs * 1.2, bs * 1.2);
        geo.rotateX(-Math.PI / 2); 
        
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
        const mesh = new THREE.Mesh(geo, mat);
        
        const raycaster = new THREE.Raycaster(new THREE.Vector3(pos.x, pos.y + bs, pos.z), new THREE.Vector3(0, -1, 0));
        let terrainMesh = typeof mapMesh !== 'undefined' ? mapMesh : (scene.children.find(c => c.userData && c.userData.isTerrain) || null);
        
        if (terrainMesh) {
            const intersects = raycaster.intersectObject(terrainMesh, false);
            if (intersects.length > 0) {
                const hit = intersects[0];
                mesh.position.copy(hit.point);
                
                let normal = hit.face.normal.clone();
                let normalMatrix = new THREE.Matrix3().getNormalMatrix(terrainMesh.matrixWorld);
                normal.applyMatrix3(normalMatrix).normalize();
                
                mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
                mesh.position.add(normal.multiplyScalar(bs * 0.05)); 
            } else {
                mesh.position.set(pos.x, pos.y + 0.5, pos.z);
            }
        } else {
            mesh.position.set(pos.x, pos.y + 0.5, pos.z);
        }
        
        scene.add(mesh);
        
        this.activeNets.push({ 
            mesh: mesh, 
            timer: 5.0, 
            isMine: isOriginator,
            timeSincePlaced: 0.0,
            isTriggered: false
        });
        
        if (isOriginator && window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
            window.MultiplayerManager.sendData({
                type: 'item_net', pos: {x: pos.x, y: pos.y, z: pos.z}
            });
        }
    },
    
    // ★通信を受信したときの処理（IDベースに変更）
    handleNetworkMessage: function(msgData) {
        if (msgData.type === 'item_spawn') this.placeFieldItem(msgData.id, msgData.pos);
        else if (msgData.type === 'item_pickup') this.remotePickupItem(msgData.id);
        else if (msgData.type === 'item_bomb') this.placeBomb(msgData.pos, false);
        else if (msgData.type === 'item_net') this.placeNet(msgData.pos, false);
    },
    
    update: function() {
        const now = performance.now();
        const delta = (now - this.lastTime) / 1000;
        this.lastTime = now;
        
        if (typeof scene === 'undefined' || !scene) return;

        // ★自動補充のチェック
        this.checkAndSpawnItems();

        if (this.knockback && typeof player !== 'undefined' && player) {
            this.knockback.timer -= delta;
            if (this.knockback.timer > 0) {
                let moveDist = this.knockback.speed * delta;
                
                let rayOrigin = new THREE.Vector3(player.position.x, player.position.y + 1.5, player.position.z);
                let ray = new THREE.Raycaster(rayOrigin, this.knockback.dir);
                let terrainMap = typeof mapMesh !== 'undefined' ? mapMesh : null;
                
                let canMove = true;
                if (terrainMap) {
                    let hits = ray.intersectObject(terrainMap, false);
                    let checkDist = moveDist + (typeof playerRadius !== 'undefined' ? playerRadius : 1.0);
                    if (hits.length > 0 && hits[0].distance < checkDist) {
                        canMove = false;
                        this.knockback.speed *= 0.2; 
                    }
                }

                if (canMove) {
                    player.position.x += this.knockback.dir.x * moveDist;
                    player.position.z += this.knockback.dir.z * moveDist;
                }
                this.knockback.speed *= 0.9; 
            } else {
                this.knockback = null;
            }
        }

        // ★複数アイテムのアニメーションと当たり判定
        for (let id in this.fieldItems) {
            let itemMesh = this.fieldItems[id];
            const ud = itemMesh.userData;
            ud.time += delta * 2.5;
            itemMesh.position.y = ud.baseY + Math.sin(ud.time) * 0.4;
            itemMesh.rotation.y += delta;
            
            // 観戦モード中でなく、アイテムを持っていない場合のみ拾える
            if (!window.isSpectatorMode && typeof player !== 'undefined' && player && !this.mySlotItem && !this.isCoolingDown) {
                const dist = player.position.distanceTo(itemMesh.position);
                const pickupRadius = typeof playerRadius !== 'undefined' ? playerRadius * 3.0 : 3.0;
                if (dist < pickupRadius) {
                    this.pickupItem(id);
                    break; // 同時に複数拾わないように抜ける
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
        
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            let exp = this.explosions[i];
            exp.timer -= delta;
            let progress = 1.0 - (exp.timer / 0.5); 
            
            let ballScale = 1.0 + progress * 10.0; 
            exp.mesh.scale.set(ballScale, ballScale, ballScale);
            exp.mesh.material.opacity = (1.0 - progress) * 0.8;
            
            let ringScale = 1.0 + progress * 15.0;
            exp.ring.scale.set(ringScale, ringScale, ringScale);
            exp.ring.material.opacity = (1.0 - progress);
            
            if (exp.timer <= 0) {
                scene.remove(exp.group);
                this.explosions.splice(i, 1);
            }
        }
        
        this.isOnNet = false;
        let captureTargetPos = null; 
        const bs = typeof blockSize !== 'undefined' ? blockSize : 10;
        
        for (let i = this.activeNets.length - 1; i >= 0; i--) {
            let n = this.activeNets[i];
            n.timeSincePlaced += delta;
            
            let canAffectMe = !n.isMine || (n.isMine && n.timeSincePlaced >= 1.0);
            
            // 観戦モード中はネットに引っかからない
            if (!window.isSpectatorMode && typeof player !== 'undefined' && player) {
                const dist = Math.hypot(player.position.x - n.mesh.position.x, player.position.z - n.mesh.position.z);
                const yDist = Math.abs(player.position.y - n.mesh.position.y);
                
                if (dist < (bs * 0.8) && yDist < (bs * 0.15)) {
                    if (canAffectMe) {
                        n.isTriggered = true;
                        this.isOnNet = true;
                        captureTargetPos = n.mesh.position.clone();
                    }
                }
            }
            
            if (window.MultiplayerManager) {
                const others = window.MultiplayerManager.otherPlayers;
                for (let uid in others) {
                    let p = others[uid];
                    if (p.mesh) {
                        const dist = Math.hypot(p.mesh.position.x - n.mesh.position.x, p.mesh.position.z - n.mesh.position.z);
                        const yDist = Math.abs(p.mesh.position.y - n.mesh.position.y);
                        if (dist < (bs * 0.8) && yDist < (bs * 0.15)) {
                            n.isTriggered = true;
                        }
                    }
                }
            }
            
            if (n.isTriggered) {
                n.timer -= delta;
                if (n.timer < 2.0) {
                    n.mesh.material.opacity = (Math.sin(n.timer * 15) * 0.5 + 0.5);
                }
                
                if (n.timer <= 0) {
                    scene.remove(n.mesh);
                    this.activeNets.splice(i, 1);
                }
            }
        }
        
        // 観戦モード中・ネット捕獲時は位置補正を行わない
        if (!window.isSpectatorMode && typeof player !== 'undefined' && player && this.lastPlayerPos) {
            if (this.isOnNet && captureTargetPos) {
                const deltaPos = player.position.clone().sub(this.lastPlayerPos);
                deltaPos.y = 0; 
                if (deltaPos.lengthSq() > 0) {
                    player.position.x -= deltaPos.x;
                    player.position.z -= deltaPos.z;
                }
                
                const dx = captureTargetPos.x - player.position.x;
                const dz = captureTargetPos.z - player.position.z;
                
                player.position.x += dx * 10.0 * delta;
                player.position.z += dz * 10.0 * delta;
                
            }
            this.lastPlayerPos.copy(player.position);
        }
    }
};

setTimeout(() => {
    if (window.ItemSystem) window.ItemSystem.init();
}, 2000);
