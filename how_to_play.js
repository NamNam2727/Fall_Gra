// =====================================
// how_to_play.js
// 「あそびかた」ウィンドウの生成とページ遷移、
// 3Dデモ画面のレンダリング管理
// ★ main.js の制御ロジックを流用する構造へリファクタリング
// =====================================

window.HowToPlay = {
    demo: {
        scene: null, camera: null, renderer: null,
        player: null, floorTexture: null, floorMesh: null,
        clock: null, reqId: null, isRunning: false,
        container: null, stick: null, arrow: null, finger: null,
        // Context用のダミーデータ群
        context: null
    },

    initUI: function() {
        const style = document.createElement('style');
        style.innerHTML = `
            #how-to-play-btn { 
                position: absolute; right: 10px; 
                padding: 8px 16px; background: rgba(50, 150, 255, 0.85); 
                border: 2px solid rgba(255, 255, 255, 0.9); border-radius: 8px; 
                color: #fff; font-weight: bold; font-family: sans-serif; font-size: 14px; 
                box-shadow: 0 4px 10px rgba(0,0,0,0.4); pointer-events: auto; cursor: pointer; 
                text-shadow: 1px 1px 2px rgba(0,0,0,0.5); z-index: 100; 
                display: flex; justify-content: center; align-items: center; transition: all 0.2s; 
            }
            #how-to-play-btn:active { background: rgba(50, 150, 255, 1.0); transform: scale(0.95); }

            #htp-window {
                position: absolute; left: 50%; transform: translateX(-50%);
                width: 90%; max-width: 450px;
                background: rgba(15, 15, 25, 0.95); border: 3px solid #3296ff; border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.8); display: none; flex-direction: column;
                z-index: 2000; pointer-events: auto; font-family: sans-serif; color: white;
            }
            
            .htp-header {
                display: flex; justify-content: space-between; align-items: center;
                padding: 10px 15px; border-bottom: 2px solid rgba(255,255,255,0.2);
                font-size: 16px; font-weight: bold;
            }
            .htp-header-btn {
                background: none; border: none; color: white; font-size: 20px; cursor: pointer; padding: 0 5px; font-weight: bold;
            }
            
            .htp-content {
                flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px;
            }

            .htp-menu-btn {
                background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.3);
                padding: 15px; border-radius: 8px; color: white; font-size: 16px; font-weight: bold;
                text-align: left; cursor: pointer; transition: 0.2s; display: flex; align-items: center;
            }
            .htp-menu-btn::after {
                content: "▶"; margin-left: auto; color: #3296ff; font-size: 14px;
            }
            .htp-menu-btn:active {
                background: rgba(255,255,255,0.2); border-color: #3296ff; transform: scale(0.98);
            }
            
            .htp-page {
                display: none; flex-direction: column; gap: 10px; height: 100%;
            }
            .htp-page.active {
                display: flex;
            }

            /* --- 映像エリア（デモ）のCSS --- */
            .htp-demo-area {
                width: 100%; height: 200px;
                background: #87CEEB; 
                position: relative; border-radius: 8px; overflow: hidden;
                border: 2px solid #555; box-sizing: border-box; flex-shrink: 0;
            }
            #htp-demo-canvas-container {
                position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            }
            
            /* UI模倣 */
            .htp-demo-jump {
                position: absolute; bottom: 10px; right: 15px; width: 50px; height: 50px;
                background: rgba(255, 255, 255, 0.5); border: 2px solid rgba(255, 255, 255, 0.8); 
                border-radius: 50%; color: #333; font-weight: bold; font-family: sans-serif; font-size: 11px;
                display: flex; justify-content: center; align-items: center;
                box-shadow: 0 2px 5px rgba(0,0,0,0.3); z-index: 10;
            }
            
            .htp-demo-joystick-base {
                position: absolute; bottom: 10px; left: 15px; width: 70px; height: 70px;
                border: 2px solid rgba(255, 255, 255, 0.6); border-radius: 50%; 
                background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, rgba(0,0,0,0.3) 100%);
                z-index: 10;
            }
            .htp-demo-joystick-stick {
                position: absolute; top: 50%; left: 50%; width: 34px; height: 34px; 
                background: rgba(255, 255, 255, 0.9); border-radius: 50%; 
                box-shadow: 0 4px 8px rgba(0,0,0,0.4);
                transform: translate(-50%, -50%);
                transition: transform 0.1s linear;
            }
            .htp-demo-arrow {
                position: absolute; top: 50%; left: 50%; width: 0; height: 0;
                border-left: 10px solid transparent; border-right: 10px solid transparent;
                border-bottom: 16px solid #ffaa00; margin-left: -10px; margin-top: -16px;
                transform-origin: 50% 100%; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.5));
                opacity: 0; transition: opacity 0.1s, transform 0.1s linear;
            }
            .htp-demo-finger {
                position: absolute; top: 15px; left: 10px; font-size: 30px;
                filter: drop-shadow(2px 4px 2px rgba(0,0,0,0.5));
                transform: scale(1.1) translateY(5px);
                transition: transform 0.1s;
            }

            /* 説明テキストとナビゲーション */
            .htp-desc-area {
                flex: 1; overflow-y: auto; background: rgba(0,0,0,0.5);
                border-radius: 8px; padding: 12px; font-size: 14px; line-height: 1.6;
            }
            .htp-desc-title {
                color: #3296ff; font-weight: bold; font-size: 16px; margin-bottom: 8px;
                border-bottom: 1px solid #3296ff; padding-bottom: 5px;
            }
            .htp-page-footer {
                display: flex; justify-content: flex-end; margin-top: auto; padding-top: 10px;
            }
            .htp-nav-btn {
                background: #3296ff; color: white; border: none; padding: 8px 15px;
                border-radius: 6px; font-weight: bold; cursor: pointer; transition: 0.2s;
            }
            .htp-nav-btn:active { transform: scale(0.95); }
            .htp-temp-text { color: #aaa; text-align: center; margin-top: 20px; font-size: 14px; line-height: 1.5; }
        `;
        document.head.appendChild(style);

        const uiLayer = document.getElementById('ui-layer');
        if (!uiLayer) return;

        const screenHeight = window.innerHeight;
        const topExclusionHeight = screenHeight >= 812 ? 98 : 74; 
        
        const htpBtn = document.createElement('div');
        htpBtn.id = 'how-to-play-btn';
        htpBtn.innerText = 'あそびかた';
        htpBtn.style.top = (topExclusionHeight + 15 + 60) + 'px'; 
        uiLayer.appendChild(htpBtn);

        const htpWindow = document.createElement('div');
        htpWindow.id = 'htp-window';
        htpWindow.style.top = (topExclusionHeight + 15) + 'px';
        htpWindow.style.height = `calc(100% - ${topExclusionHeight + 15 + 20}px)`;
        
        htpWindow.innerHTML = `
            <div class="htp-header">
                <button class="htp-header-btn" id="htp-back-btn" style="visibility: hidden;">←</button>
                <span id="htp-title">あそびかた</span>
                <button class="htp-header-btn" id="htp-close-btn">❌</button>
            </div>
            <div class="htp-content" id="htp-content-area">
                
                <!-- ＝＝＝ 目次画面 ＝＝＝ -->
                <div id="htp-index" class="htp-page active">
                    <button class="htp-menu-btn" data-target="htp-page-basic">1. 基本操作</button>
                    <button class="htp-menu-btn" data-target="htp-page-item">2. アイテム</button>
                    <button class="htp-menu-btn" data-target="htp-page-minigame">3. ミニゲーム</button>
                    <button class="htp-menu-btn" data-target="htp-page-comm">4. コミュニケーション</button>
                </div>

                <!-- ＝＝＝ 1. 基本操作 (移動) ＝＝＝ -->
                <div id="htp-page-basic" class="htp-page">
                    <div class="htp-demo-area">
                        <div id="htp-demo-canvas-container"></div>
                        <div class="htp-demo-joystick-base">
                            <div class="htp-demo-arrow" id="htp-demo-arrow"></div>
                            <div class="htp-demo-joystick-stick" id="htp-demo-stick">
                                <div class="htp-demo-finger" id="htp-demo-finger">👆</div>
                            </div>
                        </div>
                        <div class="htp-demo-jump">JUMP</div>
                    </div>
                    
                    <div class="htp-desc-area">
                        <div class="htp-desc-title">移動とカメラ</div>
                        <div>
                            画面の左側をドラッグ（指でなぞる）すると、ジョイスティックが現れます。<br>
                            動かしたい方向へ指をスライドさせると、キャラクターがその方向へ進みます。<br><br>
                            <span style="color:#ffcc00; font-weight:bold;">※カメラは自動で背後を追いかけるため、手動での視点操作は不要です！</span>
                        </div>
                    </div>
                    
                    <div class="htp-page-footer">
                        <button class="htp-nav-btn" data-target="htp-page-jump">つぎへ ▶</button>
                    </div>
                </div>

                <!-- ＝＝＝ 1. 基本操作 (ジャンプ) - 枠のみ ＝＝＝ -->
                <div id="htp-page-jump" class="htp-page">
                    <div class="htp-temp-text">ここにジャンプのデモと説明が入ります。<br>※次回実装</div>
                    <div class="htp-page-footer" style="justify-content: space-between;">
                        <button class="htp-nav-btn" data-target="htp-page-basic" style="background:#555;">◀ まえへ</button>
                    </div>
                </div>

                <!-- ＝＝＝ 他のページ（仮枠） ＝＝＝ -->
                <div id="htp-page-item" class="htp-page">
                    <div class="htp-temp-text">ここに「2. アイテム」<br>（ボム・羽・ネットの効果など）<br>の画像や説明が入ります。<br><br>※次回実装</div>
                </div>
                <div id="htp-page-minigame" class="htp-page">
                    <div class="htp-temp-text">ここに「3. ミニゲーム」<br>（開始方法・観戦モードなど）<br>の画像や説明が入ります。<br><br>※次回実装</div>
                </div>
                <div id="htp-page-comm" class="htp-page">
                    <div class="htp-temp-text">ここに「4. コミュニケーション」<br>（チャット・ルームIDコピーなど）<br>の画像や説明が入ります。<br><br>※次回実装</div>
                </div>

            </div>
        `;
        uiLayer.appendChild(htpWindow);

        // イベント設定
        const preventTouch = (e) => e.stopPropagation();
        
        htpBtn.addEventListener('mousedown', preventTouch);
        htpBtn.addEventListener('touchstart', preventTouch, {passive: false});
        htpBtn.addEventListener('click', () => {
            htpWindow.style.display = 'flex';
            this.showIndex();
        });

        htpWindow.addEventListener('mousedown', preventTouch);
        htpWindow.addEventListener('touchstart', preventTouch, {passive: false});
        
        document.getElementById('htp-close-btn').addEventListener('click', () => {
            htpWindow.style.display = 'none';
            this.stopDemo(); 
        });
        
        document.getElementById('htp-back-btn').addEventListener('click', () => {
            this.showIndex();
        });
        
        // 目次ボタンを押したときのページ遷移処理
        const menuBtns = htpWindow.querySelectorAll('.htp-menu-btn');
        menuBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.showPage(btn.getAttribute('data-target'), btn.innerText);
            });
        });
        
        // 「つぎへ」「まえへ」ボタンの処理
        const navBtns = htpWindow.querySelectorAll('.htp-nav-btn');
        navBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.showPage(btn.getAttribute('data-target'), "1. 基本操作");
            });
        });

        // デモ環境の初期化
        setTimeout(() => {
            this.initDemo3D();
        }, 1000);
    },
    
    // 目次に戻る
    showIndex: function() {
        document.getElementById('htp-title').innerText = 'あそびかた';
        document.getElementById('htp-back-btn').style.visibility = 'hidden';
        
        const pages = document.querySelectorAll('.htp-page');
        pages.forEach(p => p.classList.remove('active'));
        document.getElementById('htp-index').classList.add('active');
        
        this.stopDemo(); 
    },
    
    // 指定したページを表示する
    showPage: function(pageId, title) {
        document.getElementById('htp-title').innerText = title;
        document.getElementById('htp-back-btn').style.visibility = 'visible';
        
        const pages = document.querySelectorAll('.htp-page');
        pages.forEach(p => p.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');

        // 移動のページならデモ開始、それ以外は停止
        if (pageId === 'htp-page-basic') {
            this.startDemo();
        } else {
            this.stopDemo();
        }
    },

    // ==========================================
    // 3Dデモ映像の管理
    // ==========================================
    initDemo3D: function() {
        this.demo.container = document.getElementById('htp-demo-canvas-container');
        this.demo.stick = document.getElementById('htp-demo-stick');
        this.demo.arrow = document.getElementById('htp-demo-arrow');
        this.demo.finger = document.getElementById('htp-demo-finger');
        if (!this.demo.container || typeof THREE === 'undefined') return;

        const width = this.demo.container.clientWidth;
        const height = this.demo.container.clientHeight;

        this.demo.scene = new THREE.Scene();
        this.demo.scene.background = new THREE.Color(0x87CEEB);
        this.demo.scene.fog = new THREE.Fog(0x87CEEB, 5, 40);

        this.demo.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);

        this.demo.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.demo.renderer.setSize(width, height);
        this.demo.renderer.shadowMap.enabled = true;
        this.demo.container.appendChild(this.demo.renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.demo.scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(20, 40, 20);
        dirLight.castShadow = true;
        this.demo.scene.add(dirLight);

        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#81C784'; ctx.fillRect(0, 0, 512, 512);
        ctx.fillStyle = '#4CAF50'; 
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillRect(256, 256, 256, 256);
        
        this.demo.floorTexture = new THREE.CanvasTexture(canvas);
        this.demo.floorTexture.wrapS = THREE.RepeatWrapping;
        this.demo.floorTexture.wrapT = THREE.RepeatWrapping;
        this.demo.floorTexture.repeat.set(250, 250); 

        const floorGeo = new THREE.PlaneGeometry(1000, 1000);
        const floorMat = new THREE.MeshStandardMaterial({ map: this.demo.floorTexture, roughness: 0.8 });
        this.demo.floorMesh = new THREE.Mesh(floorGeo, floorMat);
        this.demo.floorMesh.rotation.x = -Math.PI / 2;
        this.demo.floorMesh.receiveShadow = true;
        this.demo.floorMesh.userData.isTerrain = true; // ★ 本編の地形判定ロジックに認識させるためのタグ
        this.demo.scene.add(this.demo.floorMesh);

        // プレイヤーキャラクター生成
        const pRadius = 1.2;
        this.demo.player = new THREE.Group();
        
        const baseGeo = new THREE.CylinderGeometry(pRadius, pRadius, 0.2, 32);
        const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
        const baseMesh = new THREE.Mesh(baseGeo, blackMat);
        baseMesh.position.y = 0.1; baseMesh.castShadow = true;
        this.demo.player.add(baseMesh);

        // 本編のプレイヤーからアイコン画像を直接コピー
        let iconTexture = null;
        if (typeof player !== 'undefined' && player) {
            player.children.forEach(child => {
                if (child.isMesh && Array.isArray(child.material) && child.material.length === 3) {
                    if (child.material[1].map && child.material[1].map.image) {
                        const img = child.material[1].map.image;
                        iconTexture = new THREE.Texture(img);
                        iconTexture.center.set(0.5, 0.5);
                        iconTexture.rotation = -Math.PI / 2;
                        iconTexture.minFilter = THREE.LinearMipmapLinearFilter;
                        iconTexture.magFilter = THREE.LinearFilter;
                        iconTexture.needsUpdate = true;
                    }
                }
            });
        }
        if (!iconTexture && typeof window.createIconTexture === 'function') {
            iconTexture = window.createIconTexture();
        }

        const topGeo = new THREE.CylinderGeometry(pRadius, pRadius, 0.2, 32);
        const sideMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.7 });
        const topMat = new THREE.MeshStandardMaterial({ map: iconTexture, roughness: 0.7 });
        const bottomMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.7 });
        const topMesh = new THREE.Mesh(topGeo, [sideMat, topMat, bottomMat]);
        topMesh.position.y = 0.3; topMesh.castShadow = true;
        this.demo.player.add(topMesh);

        let userName = "Player";
        if (window.GameState && window.GameState.userInfo) {
            userName = window.GameState.userInfo.name || window.GameState.userInfo.user_name || "Player";
        }

        if (typeof window.createNameSprite === 'function') {
            const nameSprite = window.createNameSprite(userName);
            this.demo.player.add(nameSprite);
        }
        
        this.demo.scene.add(this.demo.player);

        // ★ 本編の制御ロジックに渡すための、デモ専用コンテキストオブジェクトを作成
        this.demo.context = {
            player: this.demo.player,
            scene: this.demo.scene,
            camera: this.demo.camera,
            moveVector: new THREE.Vector2(0, 0),
            isJumping: false,
            verticalVelocity: 0,
            cameraAngle: 0,
            currentFacingAngle: Math.PI,
            cameraSliderValue: 0.5,
            isCameraAuto: true,
            isSpectatorMode: false,
            isDemo: true,        // マルチプレイ通信やエラー終了などを防ぐフラグ
            cameraDistance: 8,   // デモ用の接近カメラ距離（本編設定を上書き）
            cameraHeight: 5      // デモ用の接近カメラ高さ（本編設定を上書き）
        };

        // デモ開始前にプレイヤーを安全な位置(空中の中心)へ配置（本編ロジックが着地させてくれる）
        this.demo.player.position.set(0, 20, 0);

        this.demo.clock = new THREE.Clock();

        window.addEventListener('resize', () => {
            if (this.demo.container && this.demo.camera && this.demo.renderer) {
                const w = this.demo.container.clientWidth;
                const h = this.demo.container.clientHeight;
                if (w > 0 && h > 0) {
                    this.demo.camera.aspect = w / h;
                    this.demo.camera.updateProjectionMatrix();
                    this.demo.renderer.setSize(w, h);
                }
            }
        });
    },

    startDemo: function() {
        if (!this.demo.scene || this.demo.isRunning) return;
        this.demo.isRunning = true;
        this.demo.clock.start();
        this.animateDemo();
        window.dispatchEvent(new Event('resize'));
    },

    stopDemo: function() {
        this.demo.isRunning = false;
        if (this.demo.reqId) {
            cancelAnimationFrame(this.demo.reqId);
            this.demo.reqId = null;
        }
    },

    animateDemo: function() {
        if (!this.demo.isRunning) return;
        this.demo.reqId = requestAnimationFrame(() => this.animateDemo());

        const delta = this.demo.clock.getDelta();
        const time = this.demo.clock.getElapsedTime();

        const cycle = time % 10.0;
        let inputX = 0, inputY = 0; // X:右(1), Y:前(1)
        let isMoving = false;
        let isTouching = false;

        if (cycle > 0.5 && cycle <= 2.0) {
            inputX = 0; inputY = 1.0; 
            isMoving = true; isTouching = true;
        } else if (cycle > 2.5 && cycle <= 4.0) {
            inputX = 0; inputY = -1.0; 
            isMoving = true; isTouching = true;
        } else if (cycle > 4.5 && cycle <= 6.5) {
            inputX = 0.707; inputY = 0.707; 
            isMoving = true; isTouching = true;
        } else if (cycle > 7.0 && cycle <= 9.0) {
            inputX = -0.707; inputY = 0.707; 
            isMoving = true; isTouching = true;
        } else {
            if ((cycle > 0.3 && cycle <= 0.5) || 
                (cycle > 2.3 && cycle <= 2.5) || 
                (cycle > 4.3 && cycle <= 4.5) ||
                (cycle > 6.8 && cycle <= 7.0)) {
                isTouching = true;
            }
        }

        // --- UI（ジョイスティックと指）の更新 ---
        const maxStickDist = 20; 
        const stickX = inputX * maxStickDist;
        const stickY = -inputY * maxStickDist; 
        
        this.demo.stick.style.transform = `translate(calc(-50% + ${stickX}px), calc(-50% + ${stickY}px))`;
        
        if (isMoving) {
            this.demo.arrow.style.opacity = '1';
            const arrowAngle = Math.atan2(stickY, stickX) * (180 / Math.PI) + 90;
            this.demo.arrow.style.transform = `rotate(${arrowAngle}deg) translateY(-22px)`;
        } else {
            this.demo.arrow.style.opacity = '0';
        }

        if (isTouching) {
            this.demo.finger.style.transform = 'scale(1.0) translateY(0)';
        } else {
            this.demo.finger.style.transform = 'scale(1.1) translateY(5px)';
        }

        // --- 3Dロジックの更新（★本編ロジックへの入力委譲） ---
        if (isMoving) {
            // 本編のジョイスティック入力仕様は「画面の上(前進)がマイナスY」のため、-inputY を渡す
            this.demo.context.moveVector.set(inputX, -inputY);
        } else {
            this.demo.context.moveVector.set(0, 0);
            
            // 止まっている時は、正面（奥）を向くようにリセット
            const targetAngle = Math.PI; 
            const rotQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle);
            this.demo.player.quaternion.slerp(rotQuat, 6 * delta);
            this.demo.context.currentFacingAngle = targetAngle; // Context側の状態も揃える
        }

        // ★★★ ここで本編(main.js)のコアロジックを呼び出し、計算をすべて任せる ★★★
        if (typeof window.updatePlayer === 'function') {
            window.updatePlayer(delta, this.demo.context);
        }
        if (typeof window.updateCamera === 'function') {
            window.updateCamera(false, delta, this.demo.context);
        }

        // 無限ループ対策（キャラクターの座標を定期的に中心付近へ巻き戻す）
        while (this.demo.player.position.x > 20) { this.demo.player.position.x -= 20; this.demo.floorTexture.offset.x += (20/200)*20; }
        while (this.demo.player.position.x < -20) { this.demo.player.position.x += 20; this.demo.floorTexture.offset.x -= (20/200)*20; }
        while (this.demo.player.position.z > 20) { this.demo.player.position.z -= 20; this.demo.floorTexture.offset.y += (20/200)*20; }
        while (this.demo.player.position.z < -20) { this.demo.player.position.z += 20; this.demo.floorTexture.offset.y -= (20/200)*20; }

        this.demo.renderer.render(this.demo.scene, this.demo.camera);
    }
};
