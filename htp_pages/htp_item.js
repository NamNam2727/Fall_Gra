// =====================================
// htp_item.js
// あそびかた：2. アイテム (取得デモと説明)
// =====================================

window.HTP_Item = {
    currentMode: 'pickup', // 今後 'effects' (アイテムの効果) などのページを追加可能
    stick: null, arrow: null, fingerMove: null,
    slotUI: null, dummyItem: null,
    itemTime: 0, itemCount: 0,
    lastPlayerZ: undefined,

    init: function(container, htpManager) {
        // --- デモ空間専用のアイテムスロットのCSSを追加 ---
        const style = document.createElement('style');
        style.innerHTML = `
            .htp-demo-item-slot {
                position: absolute; bottom: 75px; right: 15px; width: 50px; height: 50px;
                background: rgba(0, 0, 0, 0.5); border: 2px solid rgba(255, 255, 255, 0.8); border-radius: 8px;
                display: flex; justify-content: center; align-items: center; font-size: 26px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.3); z-index: 10; transition: transform 0.1s, background 0.1s;
            }
            .htp-demo-item-slot.active { background: rgba(255, 255, 255, 0.9); }
        `;
        container.appendChild(style);

        container.innerHTML += `
            <div class="htp-demo-area">
                <div id="htp-demo-canvas-container"></div>
                <div class="htp-demo-joystick-base">
                    <div class="htp-demo-arrow" id="htp-demo-arrow"></div>
                    <div class="htp-demo-joystick-stick" id="htp-demo-stick">
                        <div class="htp-demo-finger" id="htp-demo-finger-move">👆</div>
                    </div>
                </div>
                <!-- アイテムスロットとジャンプボタン -->
                <div class="htp-demo-item-slot" id="htp-demo-item-slot"></div>
                <div class="htp-demo-jump">JUMP</div>
            </div>
            
            <!-- アイテムの取得パネル -->
            <div id="htp-panel-pickup" style="display: flex; flex-direction: column; flex: 1;">
                <div class="htp-desc-area">
                    <div class="htp-desc-title">アイテムの獲得</div>
                    <div>
                        フィールド上に浮いている「❓」マークに近づくと、ランダムなアイテムを獲得し、右下のスロットに入ります。<br><br>
                        誰かがアイテムを獲得すると、「❓」はマップ上の別の場所にふたたび出現します。<br>
                        積極的に探しに行きましょう！
                    </div>
                </div>
                <div class="htp-page-footer">
                    <div></div> <!-- 左寄せ用ダミー -->
                    <button class="htp-nav-btn" id="htp-btn-to-effects">アイテムの効果 ▶</button>
                </div>
            </div>

            <!-- アイテムの効果パネル（枠のみ） -->
            <div id="htp-panel-effects" style="display: none; flex-direction: column; flex: 1;">
                <div class="htp-desc-area">
                    <div class="htp-desc-title">アイテムの効果</div>
                    <div class="htp-temp-text">ここに各種アイテム（💣 🪽 🕸️）の<br>効果説明が入ります。<br><br>※次回実装</div>
                </div>
                <div class="htp-page-footer">
                    <button class="htp-nav-btn back" id="htp-btn-to-pickup">◀ まえへ</button>
                    <div></div>
                </div>
            </div>
        `;

        this.stick = document.getElementById('htp-demo-stick');
        this.arrow = document.getElementById('htp-demo-arrow');
        this.fingerMove = document.getElementById('htp-demo-finger-move');
        this.slotUI = document.getElementById('htp-demo-item-slot');

        document.getElementById('htp-btn-to-effects').addEventListener('click', () => {
            this.currentMode = 'effects';
            document.getElementById('htp-panel-pickup').style.display = 'none';
            document.getElementById('htp-panel-effects').style.display = 'flex';
        });

        document.getElementById('htp-btn-to-pickup').addEventListener('click', () => {
            this.currentMode = 'pickup';
            document.getElementById('htp-panel-pickup').style.display = 'flex';
            document.getElementById('htp-panel-effects').style.display = 'none';
        });

        // --- ダミーの❓メッシュを生成 ---
        this.dummyItem = this.createDummyItem();
        htpManager.demo.scene.add(this.dummyItem);

        this.resetScenarioState(htpManager);
        htpManager.startDemo();
    },

    // デモ空間専用の「❓」メッシュを作る関数
    createDummyItem: function() {
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
        
        return group;
    },

    resetScenarioState: function(htpManager) {
        htpManager.demo.context.moveVector.set(0, 0);
        htpManager.demo.context.cameraAngle = 0;
        htpManager.demo.context.currentFacingAngle = Math.PI;
        
        this.itemCount = 0;
        if (this.slotUI) {
            this.slotUI.classList.remove('active');
            this.slotUI.innerHTML = '';
        }
        
        // アイテムを初期位置（プレイヤーの少し前）に配置
        if (this.dummyItem) {
            this.dummyItem.position.set(0, 1.5, htpManager.demo.player.position.z - 8);
            this.dummyItem.visible = true;
        }
        this.lastPlayerZ = htpManager.demo.player.position.z;
    },

    updateScenario: function(time, delta, demo) {
        // プレイヤーは常にまっすぐ前進し続ける
        const inputX = 0, inputY = 1.0; 
        
        // スティックUIを上に倒しっぱなしにする
        if (this.stick) this.stick.style.transform = `translate(-50%, calc(-50% - 20px))`;
        if (this.arrow) {
            this.arrow.style.opacity = '1';
            this.arrow.style.transform = `rotate(0deg) translateY(-22px)`;
        }
        if (this.fingerMove) this.fingerMove.style.transform = 'scale(1.0) translateY(0)';
        
        // プレイヤーを前進させる
        demo.context.moveVector.set(inputX, -inputY);

        // ★ 無限ループ(ワープ)対策：プレイヤーが境界を越えてワープした場合、アイテムも同じだけワープさせる
        if (this.lastPlayerZ !== undefined) {
            const diff = demo.player.position.z - this.lastPlayerZ;
            // Z座標が突然大きく変動したらワープしたとみなす
            if (diff > 10) this.dummyItem.position.z += 20;
            else if (diff < -10) this.dummyItem.position.z -= 20;
        }
        this.lastPlayerZ = demo.player.position.z;

        // --- ダミーアイテムのアニメーションと取得判定 ---
        if (this.dummyItem && this.dummyItem.visible) {
            // フワフワ上下運動と回転
            this.itemTime += delta * 2.5;
            this.dummyItem.position.y = 1.5 + Math.sin(this.itemTime) * 0.4;
            this.dummyItem.rotation.y += delta;
            
            // プレイヤーとアイテムの距離をチェック
            const dist = demo.player.position.distanceTo(this.dummyItem.position);
            if (dist < 2.5) {
                // 取得！
                this.dummyItem.visible = false;
                
                // スロットをピカッと光らせて中身を切り替える
                if (this.slotUI) {
                    this.slotUI.classList.add('active');
                    this.slotUI.style.transform = 'scale(1.3)';
                    setTimeout(() => { if (this.slotUI) this.slotUI.style.transform = 'scale(1.0)'; }, 150);
                    
                    const itemIcons = ['💣', '🪽', '🕸️'];
                    this.slotUI.innerHTML = itemIcons[this.itemCount % 3];
                    this.itemCount++;
                }
                
                // 次のアイテムをマップの前方に再出現させる
                setTimeout(() => {
                    if (this.dummyItem && this.currentMode === 'pickup') {
                        // プレイヤーの進路上の少し先にワープさせる
                        this.dummyItem.position.set(0, 1.5, demo.player.position.z - 12);
                        this.dummyItem.visible = true;
                    }
                }, 1000); // 1秒後に再出現
            }
        }
    },

    cleanup: function(htpManager) {
        // デモ空間からダミーアイテムを消去（メモリリーク防止）
        if (this.dummyItem) {
            htpManager.demo.scene.remove(this.dummyItem);
        }
        this.stick = null; 
        this.arrow = null; 
        this.fingerMove = null;
        this.slotUI = null;
        this.dummyItem = null;
    }
};
