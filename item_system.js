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

        // ゲーム初期化完了からさらに2秒後に、確実に見える位置へアイテムを置く
        setTimeout(() => {
            if (this.enabled && !this.currentItemPosInfo) {
                let spawnPos = { x: 0, y: 3, z: 0 };
                if (typeof player !== 'undefined' && player) {
                    let cAngle = typeof cameraAngle !== 'undefined' && !isNaN(cameraAngle) ? cameraAngle : 0;
                    const forwardX = -Math.sin(cAngle + Math.PI);
                    const forwardZ = -Math.cos(cAngle + Math.PI);
                    spawnPos = {
                        x: player.position.x + forwardX * 3, // 3マス前
                        y: player.position.y + 0.5,          // 床から少し浮かす
                        z: player.position.z + forwardZ * 3
                    };
                }
                
                const timestamp = Date.now();
                this.placeFieldItem(spawnPos, timestamp);
                
                if (window.MultiplayerManager) {
                    window.MultiplayerManager.sendData({
                        type: 'item_spawn', pos: spawnPos, timestamp: timestamp
                    });
                }
            }
        }, 2000); 
    },
    
    spawnNewItem: function(isOriginator) {
        if (!window.MapGenerator || typeof scene === 'undefined') return;
        const mapInfo = window.MapGenerator.parseMap();
        const mapW = mapInfo.mapW;
        const mapD = mapInfo.mapD;
        const parsedMap = mapInfo.parsedMap;

        const validSpawns = [];
        
        for (let x = 0; x < mapW; x++) {
            for (let z = 0; z < mapD; z++) {
                let layers = parsedMap[x][z];
                if (layers.length > 0) {
                    let topLayer = layers[layers.length - 1]; 
                    if (topLayer.val > 0) {
                        let px = x - mapW / 2 + 0.5;
                        let pz = z - mapD / 2 + 0.5;
                        let py = topLayer.top;
                        
                        if (topLayer.isOdd) {
                            let corners = window.MapGenerator.getCornerHeights(parsedMap, mapW, mapD, x, z, topLayer.top);
                            py = corners.center;
                        }
                        validSpawns.push({x: px, y: py, z: pz});
                    }
                }
            }
        }
        
        if (validSpawns.length === 0) return;
        
        const spawn = validSpawns[Math.floor(Math.random() * validSpawns.length)];
        const pos = { x: spawn.x, y: spawn.y + 0.5, z: spawn.z };
        const timestamp = Date.now();
        
        this.placeFieldItem(pos, timestamp);
        
        if (isOriginator && window.MultiplayerManager) {
            window.MultiplayerManager.sendData({
                type: 'item_spawn', pos: pos, timestamp: timestamp
            });
        }
    },
    
    placeFieldItem: function(pos, timestamp) {
        // ★エラー防止: sceneがまだ生成されていない場合は処理を中断
        if (typeof scene === 'undefined' || !scene) return;

        if (this.currentItemPosInfo && this.currentItemPosInfo.timestamp > timestamp) return;
        this.currentItemPosInfo = { pos: pos, timestamp: timestamp };
        
        if (this.currentFieldItem) {
            scene.remove(this.currentFieldItem);
            this.currentFieldItem = null;
        }
        
        const group = new THREE.Group();
        const sphereGeo = new THREE.SphereGeometry(0.6, 16, 16);
        const glassMat = new THREE.MeshPhysicalMaterial({
            color: 0xffffaa, transmission: 0.8, opacity: 1, transparent: true, roughness: 0.1, ior: 1.5, emissive: 0x332200
        });
        const sphere = new THREE.Mesh(sphereGeo, glassMat);
        group.add(sphere);

        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.font = 'bold 80px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffaa00'; ctx.fillText('❓', 64, 64);
        const tex = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: false }); 
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(1.0, 1.0, 1); 
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
        
        if (isOriginator && window.MultiplayerManager) {
            window.MultiplayerManager.sendData({
                type: 'item_bomb', pos: {x: pos.x, y: pos.y, z: pos.z}
            });
        }
    },
    
    explodeBomb: function(bomb) {
        if (typeof scene === 'undefined' || !scene) return;
        const expGeo = new THREE.SphereGeometry(3.0, 16, 16); 
        const expMat = new THREE.MeshBasicMaterial({color: 0xff3300, transparent: true, opacity: 0.6});
        const expMesh = new THREE.Mesh(expGeo, expMat);
        expMesh.position.copy(bomb.mesh.position);
        scene.add(expMesh);
        
        this.explosions.push({ mesh: expMesh, timer: 0.3 });
        
        if (typeof player !== 'undefined' && player) {
            const dist = player.position.distanceTo(bomb.mesh.position);
            if (dist <= 3.5) {
                window.verticalVelocity = 15; 
                window.isJumping = true;
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
        
        if (isOriginator && window.MultiplayerManager) {
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
            ud.time += delta * 3;
            this.currentFieldItem.position.y = ud.baseY + Math.sin(ud.time) * 0.3;
            this.currentFieldItem.rotation.y += delta;
            
            if (typeof player !== 'undefined' && player && !this.mySlotItem && !this.isCoolingDown) {
                const dist = player.position.distanceTo(this.currentFieldItem.position);
                if (dist < 1.2) { 
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
        
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            let exp = this.explosions[i];
            exp.timer -= delta;
            exp.mesh.material.opacity = exp.timer / 0.3 * 0.6;
            if (exp.timer <= 0) {
                scene.remove(exp.mesh);
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

// ★削除: setTimeoutでの自動初期化処理を消し、loader.js から呼ばれるように変更しました。
