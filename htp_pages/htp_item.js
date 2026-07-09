// =====================================
// htp_item.js
// あそびかた：2. アイテム (取得, 🪽, 💣, 🕸️)
// サブフォルダ (htp_pages) から動的に読み込まれます
// =====================================

window.HTP_Item = {
    modeIdx: 0,
    modes: ['pickup', 'fly', 'bomb', 'net'],
    scenarioTime: 0,
    lastPlayerZ: undefined,
    jumpedThisCycle: false,
    bombPlaced: false,
    netPlaced: false,

    // UI要素
    stick: null, arrow: null, fingerMove: null,
    slotUI: null, slotIcon: null, slotTimer: null, fingerSlot: null,
    jumpBtn: null, fingerJump: null,

    // ダミー3Dオブジェクト
    dummyItem: null, enemy: null, bombGroup: null, netMesh: null,
    expGroup: null, expSphere: null, expRing: null, expTimer: 0,

    init: function(container, htpManager) {
        // --- デモ空間専用のアイテムスロットCSS ---
        const style = document.createElement('style');
        style.innerHTML = `
            .htp-demo-item-slot {
                position: absolute; bottom: 75px; right: 15px; width: 60px; height: 60px;
                background: rgba(0, 0, 0, 0.5); border: 2px solid rgba(255, 255, 255, 0.8); border-radius: 10px;
                display: flex; justify-content: center; align-items: center; font-size: 30px;
                box-shadow: 0 4px 10px rgba(0,0,0,0.3); z-index: 10; transition: transform 0.1s, background 0.1s;
            }
            .htp-demo-item-slot.active { background: rgba(255, 255, 255, 0.9); }
            .htp-demo-item-slot.cooling { background: rgba(0, 0, 0, 0.8); }
            .htp-demo-item-timer { position: absolute; bottom: -5px; right: -5px; font-size: 16px; font-weight: bold; color: white; text-shadow: 1px 1px 2px black; font-family: sans-serif; display: none; }
            .htp-sub-panel { display: none; flex-direction: column; flex: 1; }
            .htp-sub-panel.active { display: flex; }
        `;
        container.appendChild(style);

        container.innerHTML += `
            <div class="htp-demo-area">
                <div id="htp-demo-canvas-container"></div>
                <div class="htp-demo-joystick-base">
                    <div class="htp-demo-arrow" id="htp-demo-arrow"></div>
                    <div class="htp-demo-joystick-stick" id="htp-demo-stick">
                        <div class="htp-demo-finger" id="htp-demo-finger-move" style="top:15px; left:10px;">👆</div>
                    </div>
                </div>
                
                <div class="htp-demo-item-slot" id="htp-demo-item-slot">
                    <span id="htp-demo-slot-icon"></span>
                    <div class="htp-demo-item-timer" id="htp-demo-slot-timer"></div>
                </div>
                <div class="htp-demo-finger" id="htp-demo-finger-slot" style="top:5px; left:20px; display:none;">👆</div>

                <div class="htp-demo-jump" id="htp-demo-jump-btn">JUMP</div>
                <div class="htp-demo-finger" id="htp-demo-finger-jump" style="bottom:10px; right:15px; display:none;">👆</div>
            </div>
            
            <!-- 1. 取得パネル -->
            <div id="htp-panel-pickup" class="htp-sub-panel active">
                <div class="htp-desc-area">
                    <div class="htp-desc-title">アイテムの獲得</div>
                    <div>
                        フィールド上に浮いている「❓」マークに近づくと、ランダムなアイテムを獲得し、右下のスロットに入ります。<br><br>
                        誰かが獲得すると、マップ上の別の場所にふたたび「❓」が出現します。<br>
                        <span style="color:#ffcc00; font-weight:bold;">※通常はスロットが空の状態でないと、次のアイテムは獲得できません。</span>
                    </div>
                </div>
                <div class="htp-page-footer">
                    <div></div>
                    <button class="htp-nav-btn" onclick="HTP_Item.changeMode(1)">🪽 フライの効果 ▶</button>
                </div>
            </div>

            <!-- 2. フライパネル -->
            <div id="htp-panel-fly" class="htp-sub-panel">
                <div class="htp-desc-area">
                    <div class="htp-desc-title">🪽 フライ (羽)</div>
                    <div>
                        アイテムスロットをタップすると使用します。<br><br>
                        <span style="color:#00ffff; font-weight:bold;">5秒間、空中で連続ジャンプが可能になります！</span><br>
                        高い壁を越えたり、穴を飛び越えるのに役立ちます。<br>
                        使用中はスロットに残り時間が表示されます。
                    </div>
                </div>
                <div class="htp-page-footer">
                    <button class="htp-nav-btn back" onclick="HTP_Item.changeMode(-1)">◀ まえへ</button>
                    <button class="htp-nav-btn" onclick="HTP_Item.changeMode(1)">💣 ボムの効果 ▶</button>
                </div>
            </div>

            <!-- 3. ボムパネル -->
            <div id="htp-panel-bomb" class="htp-sub-panel">
                <div class="htp-desc-area">
                    <div class="htp-desc-title">💣 ボム (爆弾)</div>
                    <div>
                        使用すると、自分がいる場所に爆弾を設置します。<br><br>
                        <span style="color:#ff4444; font-weight:bold;">設置から3秒後に大爆発し、近くにいるライバルを遠くへ吹き飛ばします！</span><br>
                        自分も巻き込まれると吹き飛ぶので、置いたら急いで逃げましょう。
                    </div>
                </div>
                <div class="htp-page-footer">
                    <button class="htp-nav-btn back" onclick="HTP_Item.changeMode(-1)">◀ まえへ</button>
                    <button class="htp-nav-btn" onclick="HTP_Item.changeMode(1)">🕸️ ネットの効果 ▶</button>
                </div>
            </div>

            <!-- 4. ネットパネル -->
            <div id="htp-panel-net" class="htp-sub-panel">
                <div class="htp-desc-area">
                    <div class="htp-desc-title">🕸️ ネット (罠)</div>
                    <div>
                        使用すると、自分がいる地面に透明な罠（ネット）を設置します。<br><br>
                        <span style="color:#ffaa00; font-weight:bold;">ライバルが罠を踏むと捕まり、5秒間だけ移動やジャンプができなくなります！</span><br>
                        設置後1秒間は自分にも引っかかるので、置き逃げ推奨です。
                    </div>
                </div>
                <div class="htp-page-footer">
                    <button class="htp-nav-btn back" onclick="HTP_Item.changeMode(-1)">◀ まえへ</button>
                    <div></div>
                </div>
            </div>
        `;

        this.stick = document.getElementById('htp-demo-stick');
        this.arrow = document.getElementById('htp-demo-arrow');
        this.fingerMove = document.getElementById('htp-demo-finger-move');
        this.slotUI = document.getElementById('htp-demo-item-slot');
        this.slotIcon = document.getElementById('htp-demo-slot-icon');
        this.slotTimer = document.getElementById('htp-demo-slot-timer');
        this.fingerSlot = document.getElementById('htp-demo-finger-slot');
        this.jumpBtn = document.getElementById('htp-demo-jump-btn');
        this.fingerJump = document.getElementById('htp-demo-finger-jump');

        this.create3DObjects(htpManager);
        this.switchMode(0, htpManager);
        htpManager.startDemo();
    },

    changeMode: function(dir) {
        let newIdx = this.modeIdx + dir;
        if (newIdx >= 0 && newIdx < this.modes.length) {
            this.switchMode(newIdx, window.HowToPlay);
        }
    },

    switchMode: function(idx, htpManager) {
        this.modeIdx = idx;
        const mode = this.modes[idx];

        // パネル切り替え
        document.querySelectorAll('.htp-sub-panel').forEach(p => p.classList.remove('active'));
        document.getElementById(`htp-panel-${mode}`).classList.add('active');

        // シナリオ・UIの初期化
        this.scenarioTime = 0;
        htpManager.demo.context.moveVector.set(0, 0);
        htpManager.demo.context.cameraAngle = 0;
        htpManager.demo.context.currentFacingAngle = Math.PI;
        this.lastPlayerZ = htpManager.demo.player.position.z;

        this.dummyItem.visible = false;
        this.enemy.visible = false;
        this.bombGroup.visible = false;
        this.netMesh.visible = false;
        this.expGroup.visible = false;
        
        this.slotUI.classList.remove('active', 'cooling');
        this.slotIcon.innerText = '';
        this.slotIcon.style.filter = 'none';
        this.slotIcon.style.opacity = '1';
        this.slotTimer.style.display = 'none';
        this.fingerSlot.style.display = 'none';
        this.fingerJump.style.display = 'none';
        this.jumpBtn.style.transform = 'scale(1.0)';
        this.jumpedThisCycle = false;
        this.bombPlaced = false;
        this.netPlaced = false;

        // モード別初期配置
        if (mode === 'pickup') {
            this.dummyItem.visible = true;
            this.dummyItem.position.set(0, 1.5, htpManager.demo.player.position.z - 12);
        } else if (mode === 'bomb' || mode === 'net') {
            this.enemy.visible = true;
            this.enemy.position.set(0, 1.2, htpManager.demo.player.position.z + 12);
            this.enemy.isFlying = false;
            this.enemy.speed = 16.0;
        }
    },

    // ------------------------------------------
    // ダミー3Dオブジェクト群の生成
    // ------------------------------------------
    create3DObjects: function(htpManager) {
        const scene = htpManager.demo.scene;

        // ❓アイテム
        this.dummyItem = new THREE.Group();
        const sphereGeo = new THREE.SphereGeometry(1.2, 16, 16);
        const glassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, roughness: 0.1, metalness: 0.2, depthWrite: false });
        this.dummyItem.add(new THREE.Mesh(sphereGeo, glassMat));
        const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.font = 'bold 80px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
        ctx.fillStyle = '#ffcc00'; ctx.fillText('❓', 64, 64);
        const tex = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }); 
        const sprite = new THREE.Sprite(spriteMat); sprite.scale.set(1.8, 1.8, 1); 
        this.dummyItem.add(sprite);
        scene.add(this.dummyItem);

        // 敵キャラクター (赤色ベース)
        this.enemy = new THREE.Group();
        const pRadius = 1.2;
        const eBaseMesh = new THREE.Mesh(new THREE.CylinderGeometry(pRadius, pRadius, 0.2, 32), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 }));
        eBaseMesh.position.y = 0.1; eBaseMesh.castShadow = true;
        this.enemy.add(eBaseMesh);
        const eCanvas = document.createElement('canvas'); eCanvas.width = 512; eCanvas.height = 512;
        const eCtx = eCanvas.getContext('2d');
        eCtx.fillStyle = '#ffffff'; eCtx.fillRect(0, 0, 512, 512);
        eCtx.beginPath(); eCtx.arc(256, 256, 240, 0, Math.PI * 2); eCtx.fillStyle = '#ff8888'; eCtx.fill();
        eCtx.lineWidth = 12; eCtx.strokeStyle = '#ff0000'; eCtx.stroke();
        eCtx.fillStyle = '#333333';
        eCtx.beginPath(); eCtx.arc(180, 320, 30, 0, Math.PI * 2); eCtx.fill(); 
        eCtx.beginPath(); eCtx.arc(332, 320, 30, 0, Math.PI * 2); eCtx.fill(); 
        eCtx.beginPath(); eCtx.arc(256, 320, 80, 0.2 * Math.PI, 0.8 * Math.PI); eCtx.lineWidth = 16; eCtx.stroke();
        const eTex = new THREE.CanvasTexture(eCanvas); eTex.center.set(0.5, 0.5); eTex.rotation = -Math.PI / 2;
        const eTopMesh = new THREE.Mesh(new THREE.CylinderGeometry(pRadius, pRadius, 0.2, 32), [
            new THREE.MeshStandardMaterial({ color: 0xeeeeee }), new THREE.MeshStandardMaterial({ map: eTex }), new THREE.MeshStandardMaterial({ color: 0xeeeeee })
        ]);
        eTopMesh.position.y = 0.3; eTopMesh.castShadow = true;
        this.enemy.add(eTopMesh);
        scene.add(this.enemy);

        // ボム
        this.bombGroup = new THREE.Group();
        this.bombGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 16), new THREE.MeshStandardMaterial({color: 0x111111, roughness: 0.8})));
        scene.add(this.bombGroup);

        // 爆発エフェクト
        this.expGroup = new THREE.Group();
        this.expSphere = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 16), new THREE.MeshBasicMaterial({color: 0xff4400, transparent: true, opacity: 0.8}));
        this.expRing = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.5, 32), new THREE.MeshBasicMaterial({color: 0xffff00, transparent: true, side: THREE.DoubleSide}));
        this.expRing.rotation.x = -Math.PI / 2;
        this.expGroup.add(this.expSphere); this.expGroup.add(this.expRing);
        scene.add(this.expGroup);

        // ネット
        const nCanvas = document.createElement('canvas'); nCanvas.width = 256; nCanvas.height = 256;
        const nCtx = nCanvas.getContext('2d');
        nCtx.font = '200px sans-serif'; nCtx.textAlign = 'center'; nCtx.textBaseline = 'middle'; nCtx.fillText('🕸️', 128, 128);
        const nTex = new THREE.CanvasTexture(nCanvas);
        this.netMesh = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshBasicMaterial({ map: nTex, transparent: true, depthWrite: false }));
        this.netMesh.rotation.x = -Math.PI / 2;
        scene.add(this.netMesh);
    },

    // ------------------------------------------
    // 毎フレームのシナリオ更新
    // ------------------------------------------
    updateScenario: function(time, delta, demo) {
        this.scenarioTime += delta;

        // --- ワープ対策 (本編ロジックが20単位で巻き戻った時の追従) ---
        if (this.lastPlayerZ !== undefined) {
            const diff = demo.player.position.z - this.lastPlayerZ;
            if (diff > 10) {
                // プレイヤーのZ座標が急に増えた（+20巻き戻った）
                this.dummyItem.position.z += 20;
                this.enemy.position.z += 20;
                this.bombGroup.position.z += 20;
                this.netMesh.position.z += 20;
                this.expGroup.position.z += 20;
            }
        }
        this.lastPlayerZ = demo.player.position.z;

        // 常に前進させる
        demo.context.moveVector.set(0, -1.0);
        if (this.stick) this.stick.style.transform = `translate(-50%, calc(-50% - 20px))`;
        if (this.arrow) { this.arrow.style.opacity = '1'; this.arrow.style.transform = `rotate(0deg) translateY(-22px)`; }
        if (this.fingerMove) this.fingerMove.style.transform = 'scale(1.0) translateY(0)';

        // モード別分岐
        const mode = this.modes[this.modeIdx];
        if (mode === 'pickup') this.updatePickup(delta, demo);
        else if (mode === 'fly') this.updateFly(delta, demo);
        else if (mode === 'bomb') this.updateBomb(delta, demo);
        else if (mode === 'net') this.updateNet(delta, demo);

        // 敵の共通更新
        if (this.enemy.visible) {
            if (this.enemy.isFlying) {
                this.enemy.verticalVelocity -= 60 * delta; 
                this.enemy.position.y += this.enemy.verticalVelocity * delta;
                this.enemy.position.z += this.enemy.vz * delta;
                this.enemy.rotation.x -= 10 * delta; 
            } else {
                this.enemy.position.z -= this.enemy.speed * delta;
                this.enemy.position.y = 1.2; 
                this.enemy.rotation.x = 0;
                
                // ネットでもがく
                if (this.enemy.speed === 0) {
                    this.enemy.position.x = Math.sin(time * 30) * 0.2;
                    this.enemy.rotation.y = Math.sin(time * 20) * 0.2;
                } else {
                    this.enemy.position.x = 0;
                    this.enemy.rotation.y = 0;
                }
            }
        }
    },

    // 1. 取得
    updatePickup: function(delta, demo) {
        if (this.scenarioTime > 10) {
            this.scenarioTime = 0;
            this.dummyItem.visible = true;
            this.dummyItem.position.set(0, 1.5, demo.player.position.z - 15);
            this.slotIcon.innerText = '';
            this.slotUI.classList.remove('active');
        }
        
        if (this.dummyItem.visible) {
            this.dummyItem.rotation.y += delta;
            this.dummyItem.position.y = 1.5 + Math.sin(this.scenarioTime * 2) * 0.3;
            
            if (demo.player.position.distanceTo(this.dummyItem.position) < 3.0) {
                this.dummyItem.visible = false;
                this.slotIcon.innerText = '❓';
                this.slotUI.classList.add('active');
                this.slotUI.style.transform = 'scale(1.3)';
                setTimeout(() => { if (this.slotUI) this.slotUI.style.transform = 'scale(1.0)'; }, 150);
            }
        }
    },

    // 2. 🪽 フライ
    updateFly: function(delta, demo) {
        if (this.scenarioTime > 10) this.scenarioTime = 0;
        
        if (this.scenarioTime < 1.0) {
            this.slotIcon.innerText = '🪽';
            this.slotIcon.style.filter = 'none';
            this.slotUI.classList.add('active');
            this.slotUI.classList.remove('cooling');
            this.slotTimer.style.display = 'none';
            this.fingerSlot.style.display = 'block';
            this.fingerSlot.style.transform = 'scale(1.1) translateY(5px)';
            this.fingerJump.style.display = 'none';
        } else if (this.scenarioTime < 1.2) {
            this.fingerSlot.style.transform = 'scale(1.0) translateY(0)';
            this.slotUI.style.transform = 'scale(0.9)';
        } else if (this.scenarioTime < 6.2) {
            this.fingerSlot.style.display = 'none';
            this.slotUI.style.transform = 'scale(1.0)';
            this.slotIcon.style.filter = 'grayscale(100%)';
            this.slotIcon.style.opacity = '0.5';
            this.slotUI.classList.add('cooling');
            this.slotTimer.style.display = 'block';
            this.slotTimer.innerText = Math.ceil(6.2 - this.scenarioTime);
            
            this.fingerJump.style.display = 'block';
            
            // 連続ジャンプ
            const t = this.scenarioTime;
            if ((t > 1.5 && t < 1.6) || (t > 2.5 && t < 2.6) || (t > 3.5 && t < 3.6) || (t > 4.5 && t < 4.6)) {
                if (!this.jumpedThisCycle) {
                    demo.context.isJumping = true;
                    demo.context.verticalVelocity = 35; // 高めのジャンプ力
                    this.jumpedThisCycle = true;
                    
                    this.jumpBtn.style.transform = 'scale(0.9)';
                    this.jumpBtn.style.background = 'rgba(255, 255, 255, 0.9)';
                    this.fingerJump.style.transform = 'scale(1.0) translateY(0)';
                }
            } else {
                this.jumpedThisCycle = false;
                this.jumpBtn.style.transform = 'scale(1.0)';
                this.jumpBtn.style.background = 'rgba(255, 255, 255, 0.5)';
                this.fingerJump.style.transform = 'scale(1.1) translateY(5px)';
            }
        } else {
            this.slotIcon.innerText = '';
            this.slotUI.classList.remove('active', 'cooling');
            this.slotTimer.style.display = 'none';
            this.fingerJump.style.display = 'none';
        }
    },

    // 3. 💣 ボム
    updateBomb: function(delta, demo) {
        if (this.scenarioTime > 10) {
            this.scenarioTime = 0;
            this.enemy.visible = true;
            this.enemy.position.set(0, 1.2, demo.player.position.z + 12);
            this.enemy.isFlying = false;
            this.enemy.speed = 16.0;
            this.bombPlaced = false;
        }
        
        if (this.scenarioTime < 2.0) {
            this.slotIcon.innerText = '💣';
            this.slotUI.classList.add('active');
            this.fingerSlot.style.display = 'block';
            this.fingerSlot.style.transform = 'scale(1.1) translateY(5px)';
        } else if (this.scenarioTime < 2.2) {
            this.fingerSlot.style.transform = 'scale(1.0) translateY(0)';
            this.slotUI.style.transform = 'scale(0.9)';
            if (!this.bombPlaced) {
                this.bombGroup.visible = true;
                this.bombGroup.position.copy(demo.player.position);
                this.bombGroup.position.y += 0.8;
                this.bombPlaced = true;
            }
        } else if (this.scenarioTime < 5.0) {
            this.fingerSlot.style.display = 'none';
            this.slotIcon.innerText = '';
            this.slotUI.classList.remove('active');
            this.slotUI.style.transform = 'scale(1.0)';
            
            // ボム膨張
            const s = 1.0 + Math.sin(this.scenarioTime * 15) * 0.2;
            this.bombGroup.scale.set(s, s, s);
        } else if (this.scenarioTime < 5.2) {
            if (this.bombPlaced) {
                this.bombPlaced = false;
                this.bombGroup.visible = false;
                // 爆発エフェクト
                this.expGroup.visible = true;
                this.expGroup.position.copy(this.bombGroup.position);
                this.expTimer = 0.5;
                // 敵を吹き飛ばす
                this.enemy.isFlying = true;
                this.enemy.verticalVelocity = 40;
                this.enemy.vz = 20; 
            }
        }
        
        // エフェクト更新
        if (this.expGroup.visible) {
            this.expTimer -= delta;
            if (this.expTimer > 0) {
                let progress = 1.0 - (this.expTimer / 0.5);
                let s1 = 1.0 + progress * 20.0;
                this.expSphere.scale.set(s1, s1, s1);
                this.expSphere.material.opacity = (1.0 - progress) * 0.8;
                
                let s2 = 1.0 + progress * 30.0;
                this.expRing.scale.set(s2, s2, s2);
                this.expRing.material.opacity = (1.0 - progress);
            } else {
                this.expGroup.visible = false;
            }
        }
    },

    // 4. 🕸️ ネット
    updateNet: function(delta, demo) {
        if (this.scenarioTime > 10) {
            this.scenarioTime = 0;
            this.enemy.visible = true;
            this.enemy.position.set(0, 1.2, demo.player.position.z + 18);
            this.enemy.isFlying = false;
            this.enemy.speed = 22.0; // プレイヤーより速く
            this.netPlaced = false;
        }
        
        if (this.scenarioTime < 2.0) {
            this.slotIcon.innerText = '🕸️';
            this.slotUI.classList.add('active');
            this.fingerSlot.style.display = 'block';
            this.fingerSlot.style.transform = 'scale(1.1) translateY(5px)';
        } else if (this.scenarioTime < 2.2) {
            this.fingerSlot.style.transform = 'scale(1.0) translateY(0)';
            this.slotUI.style.transform = 'scale(0.9)';
            if (!this.netPlaced) {
                this.netMesh.visible = true;
                this.netMesh.position.set(demo.player.position.x, 1.05, demo.player.position.z);
                this.netMesh.material.opacity = 1.0;
                this.netPlaced = true;
            }
        } else if (this.scenarioTime < 9.0) {
            this.fingerSlot.style.display = 'none';
            this.slotIcon.innerText = '';
            this.slotUI.classList.remove('active');
            this.slotUI.style.transform = 'scale(1.0)';
            
            // 敵がネットに乗る
            if (this.netPlaced && this.enemy.visible && !this.enemy.isFlying) {
                const dist = Math.hypot(this.enemy.position.x - this.netMesh.position.x, this.enemy.position.z - this.netMesh.position.z);
                if (dist < 2.0 && this.enemy.speed > 0) {
                    this.enemy.speed = 0; 
                    this.enemy.position.x = this.netMesh.position.x;
                    this.enemy.position.z = this.netMesh.position.z;
                }
            }
            
            // 消滅前の点滅
            if (this.scenarioTime > 7.0) {
                this.netMesh.material.opacity = (Math.sin(this.scenarioTime * 15) * 0.5 + 0.5);
            }
        } else {
            if (this.netPlaced) {
                this.netPlaced = false;
                this.netMesh.visible = false;
                this.enemy.speed = 22.0; // 再び走り出す
            }
        }
    },

    cleanup: function(htpManager) {
        if (this.dummyItem) htpManager.demo.scene.remove(this.dummyItem);
        if (this.enemy) htpManager.demo.scene.remove(this.enemy);
        if (this.bombGroup) htpManager.demo.scene.remove(this.bombGroup);
        if (this.expGroup) htpManager.demo.scene.remove(this.expGroup);
        if (this.netMesh) htpManager.demo.scene.remove(this.netMesh);
        
        this.stick = null; this.arrow = null; this.fingerMove = null;
        this.slotUI = null; this.slotIcon = null; this.slotTimer = null; this.fingerSlot = null;
        this.jumpBtn = null; this.fingerJump = null;
    }
};
