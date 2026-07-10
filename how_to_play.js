// =====================================
// how_to_play.js
// 「あそびかた」ウィンドウの生成、外部JSの動的ロード、
// および3Dデモ画面のレンダリングエンジン
// =====================================

window.HowToPlay = {
    // ★ サブフォルダのパス（ご自身の環境に合わせて変更可能です）
    baseURL: 'https://namnam2727.github.io/Fall_Gra/htp_pages/',
    
    currentPageObj: null,

    demo: {
        scene: null, camera: null, renderer: null,
        player: null, floorTexture: null, floorMesh: null,
        clock: null, reqId: null, isRunning: false,
        container: null, context: null
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
            .htp-menu-btn::after { content: "▶"; margin-left: auto; color: #3296ff; font-size: 14px; }
            .htp-menu-btn:active { background: rgba(255,255,255,0.2); border-color: #3296ff; transform: scale(0.98); }
            
            .htp-page { display: none; flex-direction: column; gap: 10px; height: 100%; }
            .htp-page.active { display: flex; }

            /* 外部JSからも利用するデモUI共通クラス */
            .htp-demo-area {
                width: 100%; height: 200px; background: #87CEEB; 
                position: relative; border-radius: 8px; overflow: hidden;
                border: 2px solid #555; box-sizing: border-box; flex-shrink: 0;
            }
            #htp-demo-canvas-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
            
            .htp-demo-jump {
                position: absolute; bottom: 10px; right: 15px; width: 60px; height: 60px;
                background: rgba(255, 255, 255, 0.5); border: 2px solid rgba(255, 255, 255, 0.8); 
                border-radius: 50%; color: #333; font-weight: bold; font-family: sans-serif; font-size: 12px;
                display: flex; justify-content: center; align-items: center;
                /* ★ overflow: hidden を削除して指アイコンが切れないように修正 */
                box-shadow: 0 2px 5px rgba(0,0,0,0.3); z-index: 10; transition: transform 0.1s, background 0.1s;
            }
            .htp-demo-joystick-base {
                position: absolute; bottom: 10px; left: 15px; width: 70px; height: 70px;
                border: 2px solid rgba(255, 255, 255, 0.6); border-radius: 50%; 
                background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, rgba(0,0,0,0.3) 100%); z-index: 10;
            }
            .htp-demo-joystick-stick {
                position: absolute; top: 50%; left: 50%; width: 34px; height: 34px; 
                background: rgba(255, 255, 255, 0.9); border-radius: 50%; 
                box-shadow: 0 4px 8px rgba(0,0,0,0.4); transform: translate(-50%, -50%); transition: transform 0.1s linear;
            }
            .htp-demo-arrow {
                position: absolute; top: 50%; left: 50%; width: 0; height: 0;
                border-left: 10px solid transparent; border-right: 10px solid transparent;
                border-bottom: 16px solid #ffaa00; margin-left: -10px; margin-top: -16px;
                transform-origin: 50% 100%; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.5));
                opacity: 0; transition: opacity 0.1s, transform 0.1s linear;
            }
            .htp-demo-finger {
                position: absolute; font-size: 30px; pointer-events: none; z-index: 15;
                filter: drop-shadow(2px 4px 2px rgba(0,0,0,0.5)); transform: scale(1.1) translateY(5px); transition: transform 0.1s, opacity 0.2s;
            }

            .htp-desc-area { flex: 1; overflow-y: auto; background: rgba(0,0,0,0.5); border-radius: 8px; padding: 12px; font-size: 14px; line-height: 1.6; }
            .htp-desc-title { color: #3296ff; font-weight: bold; font-size: 16px; margin-bottom: 8px; border-bottom: 1px solid #3296ff; padding-bottom: 5px; }
            .htp-page-footer { display: flex; justify-content: space-between; margin-top: auto; padding-top: 10px; }
            .htp-nav-btn { background: #3296ff; color: white; border: none; padding: 8px 15px; border-radius: 6px; font-weight: bold; cursor: pointer; transition: 0.2s; }
            .htp-nav-btn:active { transform: scale(0.95); }
            .htp-nav-btn.back { background: #555; }
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
                <!-- 目次画面 -->
                <div id="htp-index" class="htp-page active">
                    <button class="htp-menu-btn" data-script="htp_basic.js" data-obj="HTP_Basic" data-title="1. 基本操作">1. 基本操作</button>
                    <button class="htp-menu-btn" data-script="htp_item.js" data-obj="HTP_Item" data-title="2. アイテム">2. アイテム</button>
                    <button class="htp-menu-btn" data-script="htp_minigame.js" data-obj="HTP_Minigame" data-title="3. ミニゲーム">3. ミニゲーム</button>
                    <button class="htp-menu-btn" data-script="htp_communication.js" data-obj="HTP_Communication" data-title="4. コミュニケーション">4. コミュニケーション</button>
                    <!-- ★ 5のリンクを追加 -->
                    <button class="htp-menu-btn" data-script="htp_about.js" data-obj="HTP_About" data-title="5. このゲームについて">5. このゲームについて</button>
                </div>
                <!-- 外部JSが読み込まれてDOMを展開する専用コンテナ -->
                <div id="htp-dynamic-area" class="htp-page"></div>
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
        
        const menuBtns = htpWindow.querySelectorAll('.htp-menu-btn[data-script]');
        menuBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.openPage(btn.getAttribute('data-script'), btn.getAttribute('data-obj'), btn.getAttribute('data-title'));
            });
        });

        // 裏側で3D空間だけ生成しておく
        setTimeout(() => { this.initDemo3D(); }, 1000);
        
        window.addEventListener('resize', () => { this.resizeDemo(); });
    },
    
    showIndex: function() {
        document.getElementById('htp-title').innerText = 'あそびかた';
        document.getElementById('htp-back-btn').style.visibility = 'hidden';
        
        document.getElementById('htp-dynamic-area').classList.remove('active');
        document.getElementById('htp-index').classList.add('active');
        
        this.stopDemo(); 
        if (this.currentPageObj && typeof this.currentPageObj.cleanup === 'function') {
            this.currentPageObj.cleanup(this);
        }
        this.currentPageObj = null;
    },

    openPage: function(scriptName, objName, title) {
        document.getElementById('htp-title').innerText = title;
        document.getElementById('htp-back-btn').style.visibility = 'visible';
        
        document.getElementById('htp-index').classList.remove('active');
        const contentArea = document.getElementById('htp-dynamic-area');
        contentArea.classList.add('active');
        contentArea.innerHTML = '<div class="htp-temp-text">読み込み中...</div>';

        this.stopDemo();
        if (this.currentPageObj && typeof this.currentPageObj.cleanup === 'function') {
            this.currentPageObj.cleanup(this);
        }
        this.currentPageObj = null;

        const loadAndInit = () => {
            contentArea.innerHTML = '';
            this.currentPageObj = window[objName];
            if (this.currentPageObj && typeof this.currentPageObj.init === 'function') {
                this.currentPageObj.init(contentArea, this);
            } else {
                contentArea.innerHTML = '<div class="htp-temp-text">コンテンツの読み込みに失敗しました。</div>';
            }
        };

        if (window[objName]) {
            loadAndInit(); 
        } else {
            const script = document.createElement('script');
            script.src = this.baseURL + scriptName + '?v=' + Date.now();
            script.onload = loadAndInit;
            script.onerror = () => {
                contentArea.innerHTML = '<div class="htp-temp-text">スクリプトの読み込みに失敗しました。</div>';
            };
            document.head.appendChild(script);
        }
    },

    initDemo3D: function() {
        if (typeof THREE === 'undefined') return;

        this.demo.scene = new THREE.Scene();
        this.demo.scene.background = new THREE.Color(0x87CEEB);
        this.demo.scene.fog = new THREE.Fog(0x87CEEB, 5, 40);

        this.demo.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
        this.demo.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.demo.renderer.shadowMap.enabled = true; 

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.demo.scene.add(ambientLight);
        
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(20, 40, 20);
        dirLight.castShadow = true;
        const d = 40;
        dirLight.shadow.camera.left = -d;
        dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d;
        dirLight.shadow.camera.bottom = -d;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
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
        this.demo.floorMesh.userData.isTerrain = true; 
        this.demo.scene.add(this.demo.floorMesh);

        const pRadius = 1.2;
        this.demo.player = new THREE.Group();
        
        const baseGeo = new THREE.CylinderGeometry(pRadius, pRadius, 0.2, 32);
        const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
        const baseMesh = new THREE.Mesh(baseGeo, blackMat);
        baseMesh.position.y = 0.1; baseMesh.castShadow = true;
        this.demo.player.add(baseMesh);

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

        this.demo.context = {
            player: this.demo.player, scene: this.demo.scene, camera: this.demo.camera,
            moveVector: new THREE.Vector2(0, 0),
            isJumping: false, verticalVelocity: 0,
            cameraAngle: 0, currentFacingAngle: Math.PI, cameraSliderValue: 0.5,
            isCameraAuto: true, isSpectatorMode: false, isDemo: true,
            cameraDistance: 8, cameraHeight: 5
        };

        this.demo.player.position.set(0, 20, 0);
        this.demo.clock = new THREE.Clock();
    },

    resizeDemo: function() {
        if (this.demo.container && this.demo.camera && this.demo.renderer) {
            const w = this.demo.container.clientWidth;
            const h = this.demo.container.clientHeight;
            if (w > 0 && h > 0) {
                this.demo.camera.aspect = w / h;
                this.demo.camera.updateProjectionMatrix();
                this.demo.renderer.setSize(w, h);
            }
        }
    },

    startDemo: function() {
        if (!this.demo.scene || this.demo.isRunning) return;
        
        const container = document.getElementById('htp-demo-canvas-container');
        if (container) {
            this.demo.container = container;
            container.appendChild(this.demo.renderer.domElement);
            this.resizeDemo();
        }

        this.demo.isRunning = true;
        this.demo.clock.start();
        
        if (typeof window.updateCamera === 'function') {
            window.updateCamera(true, 0.016, this.demo.context);
        }
        this.animateDemo();
    },

    stopDemo: function() {
        this.demo.isRunning = false;
        if (this.demo.reqId) {
            cancelAnimationFrame(this.demo.reqId);
            this.demo.reqId = null;
        }
        if (this.demo.container && this.demo.renderer.domElement.parentNode === this.demo.container) {
            this.demo.container.removeChild(this.demo.renderer.domElement);
        }
        this.demo.container = null;
    },

    animateDemo: function() {
        if (!this.demo.isRunning) return;
        this.demo.reqId = requestAnimationFrame(() => this.animateDemo());

        const delta = this.demo.clock.getDelta();
        const time = this.demo.clock.getElapsedTime();

        if (this.currentPageObj && typeof this.currentPageObj.updateScenario === 'function') {
            this.currentPageObj.updateScenario(time, delta, this.demo);
        } else {
            this.demo.context.moveVector.set(0, 0);
        }

        if (typeof window.updatePlayer === 'function') {
            window.updatePlayer(delta, this.demo.context);
        }
        if (typeof window.updateCamera === 'function') {
            window.updateCamera(false, delta, this.demo.context);
        }

        const WARP_UNIT = 20; 
        let warpX = 0, warpZ = 0;
        let px = this.demo.player.position.x;
        let pz = this.demo.player.position.z;
        
        while (px > WARP_UNIT) { px -= WARP_UNIT; warpX -= WARP_UNIT; }
        while (px < -WARP_UNIT) { px += WARP_UNIT; warpX += WARP_UNIT; }
        while (pz > WARP_UNIT) { pz -= WARP_UNIT; warpZ -= WARP_UNIT; }
        while (pz < -WARP_UNIT) { pz += WARP_UNIT; warpZ += WARP_UNIT; }

        if (warpX !== 0 || warpZ !== 0) {
            this.demo.player.position.x += warpX;
            this.demo.player.position.z += warpZ;
            this.demo.camera.position.x += warpX;
            this.demo.camera.position.z += warpZ;
            
            if (this.currentPageObj && typeof this.currentPageObj.onWarp === 'function') {
                this.currentPageObj.onWarp(warpX, warpZ);
            }
        }

        this.demo.renderer.render(this.demo.scene, this.demo.camera);
    }
};


